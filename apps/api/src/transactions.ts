import { Router } from "express";
import { Prisma, TransactionType, TransactionStatus, UserRole, DayState } from "@prisma/client";
import { z } from "zod";
import prisma from "./db";
import { requireAuth, requireRole } from "./auth";

const router = Router();

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function toNumber(value: Prisma.Decimal | number | string) {
  return Number(value);
}

async function nextTransactionId(branchCode: string, businessDate: Date, tx: Prisma.TransactionClient) {
  const seq = await tx.transaction.count({
    where: { branchCode, businessDate }
  });
  const yyyymmdd = businessDate.toISOString().slice(0, 10).replaceAll("-", "");
  const padded = String(seq + 1).padStart(6, "0");
  return `TXN-${branchCode}-${yyyymmdd}-${padded}`;
}

function resolveBranchCode(userRole: UserRole, sessionBranchCode: string | null, requestedBranchCode?: string) {
  if (userRole === UserRole.ADMIN) {
    return requestedBranchCode ?? null;
  }
  if (userRole === UserRole.BRANCH_MANAGER) {
    return requestedBranchCode ?? sessionBranchCode;
  }
  return sessionBranchCode;
}

function auditContext(req: { ip?: string; sessionID?: string }) {
  return {
    ipAddress: req.ip ?? null,
    sessionId: req.sessionID ?? null
  };
}

function summarizeTransactions(
  txs: Array<{
    type: TransactionType;
    amount: Prisma.Decimal | number | string;
    status: TransactionStatus;
    tellerUserId?: string;
    createdAt?: Date;
  }>
) {
  return txs.reduce(
    (acc, tx) => {
      const amount = toNumber(tx.amount);
      if (tx.type === TransactionType.DEPOSIT) {
        acc.deposits += amount;
      } else {
        acc.withdrawals += amount;
      }
      if (tx.status === TransactionStatus.VOIDED) {
        acc.voidedCount += 1;
      }
      acc.txCount += 1;
      if (tx.createdAt && (!acc.lastActivityAt || tx.createdAt > acc.lastActivityAt)) {
        acc.lastActivityAt = tx.createdAt;
      }
      return acc;
    },
    {
      txCount: 0,
      deposits: 0,
      withdrawals: 0,
      voidedCount: 0,
      lastActivityAt: null as Date | null
    }
  );
}

router.get(
  "/accounts/search",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.BRANCH_MANAGER, UserRole.TELLER]),
  async (req, res) => {
    const query = String(req.query.q ?? "").trim();
    if (!query) {
      return res.status(400).json({ error: "MISSING_QUERY" });
    }
    const requestedBranchCode = req.query.branchCode ? String(req.query.branchCode) : undefined;
    const branchCode = resolveBranchCode(req.session.user!.role, req.session.user!.branchCode, requestedBranchCode);

    const loadedDate = startOfToday();
    const accounts = await prisma.account.findMany({
      where: {
        loadedDate,
        ...(branchCode ? { branchCode } : {}),
        OR: [
          { accountName: { contains: query, mode: "insensitive" } },
          { accountKey: { contains: query, mode: "insensitive" } },
          { fullAccountNumber: { contains: query, mode: "insensitive" } }
        ]
      },
      select: {
        id: true,
        accountKey: true,
        fullAccountNumber: true,
        accountName: true,
        currentBalance: true,
        operationRestrictions: true,
        liens: true,
        markers: true,
        version: true,
        branchCode: true
      },
      take: 50
    });

    return res.status(200).json(
      accounts.map((a) => ({
        ...a,
        currentBalance: toNumber(a.currentBalance),
        liens: toNumber(a.liens),
        restricted: Boolean(a.operationRestrictions && a.operationRestrictions.trim().length > 0),
        hasLiens: toNumber(a.liens) > 0
      }))
    );
  }
);

router.get(
  "/accounts/:accountKey",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.BRANCH_MANAGER, UserRole.TELLER]),
  async (req, res) => {
    const requestedBranchCode = req.query.branchCode ? String(req.query.branchCode) : undefined;
    const branchCode = resolveBranchCode(req.session.user!.role, req.session.user!.branchCode, requestedBranchCode);
    if (!branchCode) {
      return res.status(400).json({ error: "BRANCH_REQUIRED" });
    }
    const loadedDate = startOfToday();

    const account = await prisma.account.findUnique({
      where: {
        accountKey_branchCode_loadedDate: {
          accountKey: req.params.accountKey,
          branchCode,
          loadedDate
        }
      }
    });
    if (!account) {
      return res.status(404).json({ error: "ACCOUNT_NOT_FOUND" });
    }

    const transactions = await prisma.transaction.findMany({
      where: { accountId: account.id, businessDate: loadedDate },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    return res.status(200).json({
      account: {
        ...account,
        currentBalance: toNumber(account.currentBalance),
        heldBalance: toNumber(account.heldBalance),
        liens: toNumber(account.liens),
        openingBalance: toNumber(account.openingBalance)
      },
      transactions: transactions.map((t) => ({
        ...t,
        amount: toNumber(t.amount),
        balanceBefore: toNumber(t.balanceBefore),
        balanceAfter: toNumber(t.balanceAfter)
      }))
    });
  }
);

const createTransactionSchema = z.object({
  accountKey: z.string().min(1),
  type: z.nativeEnum(TransactionType),
  amount: z.number().positive(),
  referenceNote: z.string().max(300).optional(),
  expectedVersion: z.number().int().positive().optional(),
  branchCode: z.string().optional()
});

router.post(
  "/transactions",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.BRANCH_MANAGER, UserRole.TELLER]),
  async (req, res) => {
    const parsed = createTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "INVALID_INPUT" });
    }
    const user = req.session.user!;
    const branchCode = resolveBranchCode(user.role, user.branchCode, parsed.data.branchCode);
    if (!branchCode) {
      return res.status(400).json({ error: "BRANCH_REQUIRED" });
    }
    const businessDate = startOfToday();
    const context = auditContext(req);

    const day = await prisma.dayCycle.findUnique({ where: { businessDate } });
    if (!day || day.state !== DayState.OPEN) {
      return res.status(409).json({ error: "DAY_NOT_OPEN" });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const account = await tx.account.findUnique({
          where: {
            accountKey_branchCode_loadedDate: {
              accountKey: parsed.data.accountKey,
              branchCode,
              loadedDate: businessDate
            }
          }
        });
        if (!account) {
          throw new Error("ACCOUNT_NOT_FOUND");
        }
        if (parsed.data.expectedVersion && account.version !== parsed.data.expectedVersion) {
          throw new Error("VERSION_CONFLICT");
        }

        const amount = parsed.data.amount;
        const balanceBefore = toNumber(account.currentBalance);
        const restricted = Boolean(
          account.operationRestrictions && account.operationRestrictions.trim().length > 0
        );
        const hasLiens = toNumber(account.liens) > 0;

        if (parsed.data.type === TransactionType.WITHDRAWAL) {
          if (restricted || hasLiens) {
            throw new Error("WITHDRAWAL_BLOCKED");
          }
          if (amount > balanceBefore) {
            throw new Error("INSUFFICIENT_FUNDS");
          }
        }

        const delta = parsed.data.type === TransactionType.DEPOSIT ? amount : -amount;
        const balanceAfter = balanceBefore + delta;

        const updatedAccount = await tx.account.update({
          where: { id: account.id },
          data: {
            currentBalance: balanceAfter,
            version: { increment: 1 }
          }
        });

        const transactionId = await nextTransactionId(branchCode, businessDate, tx);
        const transaction = await tx.transaction.create({
          data: {
            transactionId,
            businessDate,
            branchCode,
            accountId: account.id,
            accountKey: account.accountKey,
            type: parsed.data.type,
            amount,
            balanceBefore,
            balanceAfter,
            status: TransactionStatus.COMPLETED,
            tellerUserId: user.id,
            referenceNote: parsed.data.referenceNote
          }
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "TRANSACTION_CREATE",
            entityType: "TRANSACTION",
            entityId: transaction.transactionId,
            businessDate,
            branchCode,
            beforeState: {
              accountVersion: account.version,
              balance: balanceBefore
            },
            afterState: {
              accountVersion: account.version + 1,
              balance: balanceAfter
            },
            metadata: {
              accountKey: account.accountKey,
              type: parsed.data.type,
              amount
            },
            ...context
          }
        });

        return { transaction, account: updatedAccount };
      });

      return res.status(201).json({
        transaction: {
          ...result.transaction,
          amount: toNumber(result.transaction.amount),
          balanceBefore: toNumber(result.transaction.balanceBefore),
          balanceAfter: toNumber(result.transaction.balanceAfter)
        },
        account: {
          ...result.account,
          currentBalance: toNumber(result.account.currentBalance)
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "TRANSACTION_FAILED";
      if (
        ["ACCOUNT_NOT_FOUND", "VERSION_CONFLICT", "WITHDRAWAL_BLOCKED", "INSUFFICIENT_FUNDS"].includes(
          message
        )
      ) {
        return res.status(409).json({ error: message });
      }
      return res.status(500).json({ error: "TRANSACTION_FAILED" });
    }
  }
);

router.post(
  "/transactions/:transactionId/void",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.BRANCH_MANAGER, UserRole.TELLER]),
  async (req, res) => {
    const user = req.session.user!;
    const businessDate = startOfToday();
    const context = auditContext(req);
    try {
      const result = await prisma.$transaction(async (tx) => {
        const original = await tx.transaction.findUnique({
          where: { transactionId: req.params.transactionId }
        });
        if (!original) throw new Error("TRANSACTION_NOT_FOUND");
        if (original.businessDate.getTime() !== businessDate.getTime()) {
          throw new Error("VOID_ONLY_SAME_DAY");
        }
        if (original.status === TransactionStatus.VOIDED) {
          throw new Error("ALREADY_VOIDED");
        }

        if (user.role === UserRole.TELLER && original.tellerUserId !== user.id) {
          throw new Error("FORBIDDEN_VOID");
        }
        if (user.role !== UserRole.ADMIN && original.branchCode !== user.branchCode) {
          throw new Error("FORBIDDEN_VOID");
        }

        const account = await tx.account.findUnique({ where: { id: original.accountId } });
        if (!account) throw new Error("ACCOUNT_NOT_FOUND");

        const originalAmount = toNumber(original.amount);
        const currentBalance = toNumber(account.currentBalance);
        const reverseDelta = original.type === TransactionType.DEPOSIT ? -originalAmount : originalAmount;
        const balanceAfter = currentBalance + reverseDelta;
        if (balanceAfter < 0) throw new Error("VOID_INSUFFICIENT_FUNDS");

        const reversalType =
          original.type === TransactionType.DEPOSIT ? TransactionType.WITHDRAWAL : TransactionType.DEPOSIT;
        const reversalId = await nextTransactionId(original.branchCode, businessDate, tx);

        await tx.account.update({
          where: { id: account.id },
          data: {
            currentBalance: balanceAfter,
            version: { increment: 1 }
          }
        });

        await tx.transaction.update({
          where: { id: original.id },
          data: { status: TransactionStatus.VOIDED, voidReference: reversalId }
        });

        const reversal = await tx.transaction.create({
          data: {
            transactionId: reversalId,
            businessDate,
            branchCode: original.branchCode,
            accountId: original.accountId,
            accountKey: original.accountKey,
            type: reversalType,
            amount: original.amount,
            balanceBefore: currentBalance,
            balanceAfter,
            status: TransactionStatus.COMPLETED,
            voidReference: original.transactionId,
            tellerUserId: user.id,
            referenceNote: `VOID_OF:${original.transactionId}`
          }
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "TRANSACTION_VOID",
            entityType: "TRANSACTION",
            entityId: original.transactionId,
            businessDate,
            branchCode: original.branchCode,
            beforeState: {
              originalStatus: original.status,
              accountBalance: currentBalance
            },
            afterState: {
              originalStatus: TransactionStatus.VOIDED,
              accountBalance: balanceAfter
            },
            metadata: {
              reversalTransactionId: reversal.transactionId
            },
            ...context
          }
        });

        return reversal;
      });

      return res.status(200).json({
        transaction: {
          ...result,
          amount: toNumber(result.amount),
          balanceBefore: toNumber(result.balanceBefore),
          balanceAfter: toNumber(result.balanceAfter)
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "VOID_FAILED";
      if (
        [
          "TRANSACTION_NOT_FOUND",
          "VOID_ONLY_SAME_DAY",
          "ALREADY_VOIDED",
          "FORBIDDEN_VOID",
          "ACCOUNT_NOT_FOUND",
          "VOID_INSUFFICIENT_FUNDS"
        ].includes(message)
      ) {
        return res.status(409).json({ error: message });
      }
      return res.status(500).json({ error: "VOID_FAILED" });
    }
  }
);

const tellerHandoffSchema = z.object({
  declaredNet: z.number(),
  note: z.string().max(500).optional()
});

router.get(
  "/reconciliation/summary",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.BRANCH_MANAGER, UserRole.TELLER]),
  async (req, res) => {
    const user = req.session.user!;
    const requestedBranchCode = req.query.branchCode ? String(req.query.branchCode) : undefined;
    const scopeBranchCode = resolveBranchCode(user.role, user.branchCode, requestedBranchCode);
    const businessDate = startOfToday();

    const where = {
      businessDate,
      ...(scopeBranchCode ? { branchCode: scopeBranchCode } : {}),
      ...(user.role === UserRole.TELLER ? { tellerUserId: user.id } : {})
    };

    const txs = await prisma.transaction.findMany({
      where,
      select: {
        tellerUserId: true,
        type: true,
        amount: true,
        status: true,
        createdAt: true
      }
    });

    const totals = summarizeTransactions(txs);
    const computedNet = Number((totals.deposits - totals.withdrawals).toFixed(2));
    const day = await prisma.dayCycle.findUnique({ where: { businessDate } });
    const canSubmit = day?.state === DayState.CLOSING || day?.state === DayState.RECONCILING;

    if (user.role === UserRole.TELLER) {
      const latestSubmission = await prisma.auditLog.findMany({
        where: {
          action: "TELLER_HANDOFF_SUBMIT",
          businessDate,
          userId: user.id,
          ...(scopeBranchCode ? { branchCode: scopeBranchCode } : {})
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          createdAt: true,
          metadata: true
        }
      });
      const handoff = latestSubmission[0];
      const handoffMeta = handoff?.metadata as
        | {
            declaredNet?: number;
            discrepancy?: number;
            note?: string;
          }
        | undefined;

      return res.status(200).json({
        businessDate: businessDate.toISOString(),
        dayState: day?.state ?? DayState.CLOSED,
        role: user.role,
        branchCode: scopeBranchCode,
        totals: {
          txCount: totals.txCount,
          deposits: Number(totals.deposits.toFixed(2)),
          withdrawals: Number(totals.withdrawals.toFixed(2)),
          net: computedNet,
          voidedCount: totals.voidedCount,
          lastActivityAt: totals.lastActivityAt ? totals.lastActivityAt.toISOString() : null
        },
        canSubmit,
        handoff: handoff
          ? {
              declaredNet: Number(handoffMeta?.declaredNet ?? 0),
              discrepancy: Number(handoffMeta?.discrepancy ?? 0),
              note: handoffMeta?.note ?? null,
              submittedAt: handoff.createdAt.toISOString()
            }
          : null
      });
    }

    return res.status(200).json({
      businessDate: businessDate.toISOString(),
      dayState: day?.state ?? DayState.CLOSED,
      role: user.role,
      branchCode: scopeBranchCode,
      totals: {
        txCount: totals.txCount,
        deposits: Number(totals.deposits.toFixed(2)),
        withdrawals: Number(totals.withdrawals.toFixed(2)),
        net: computedNet,
        voidedCount: totals.voidedCount,
        lastActivityAt: totals.lastActivityAt ? totals.lastActivityAt.toISOString() : null
      },
      canSubmit: false
    });
  }
);

router.post(
  "/reconciliation/handoff",
  requireAuth,
  requireRole([UserRole.TELLER]),
  async (req, res) => {
    const parsed = tellerHandoffSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "INVALID_INPUT" });
    }

    const user = req.session.user!;
    const businessDate = startOfToday();
    const day = await prisma.dayCycle.findUnique({ where: { businessDate } });
    if (!day || (day.state !== DayState.CLOSING && day.state !== DayState.RECONCILING)) {
      return res.status(409).json({ error: "DAY_NOT_CLOSING" });
    }

    const txs = await prisma.transaction.findMany({
      where: {
        businessDate,
        branchCode: user.branchCode ?? undefined,
        tellerUserId: user.id
      },
      select: {
        type: true,
        amount: true,
        status: true,
        createdAt: true
      }
    });

    const totals = summarizeTransactions(txs);
    const computedNet = Number((totals.deposits - totals.withdrawals).toFixed(2));
    const declaredNet = Number(parsed.data.declaredNet.toFixed(2));
    const discrepancy = Number((declaredNet - computedNet).toFixed(2));

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "TELLER_HANDOFF_SUBMIT",
        entityType: "DAY_CYCLE",
        entityId: businessDate.toISOString().slice(0, 10),
        businessDate,
        branchCode: user.branchCode ?? null,
        metadata: {
          declaredNet,
          computedNet,
          discrepancy,
          txCount: totals.txCount,
          deposits: Number(totals.deposits.toFixed(2)),
          withdrawals: Number(totals.withdrawals.toFixed(2)),
          voidedCount: totals.voidedCount,
          note: parsed.data.note?.trim() || null
        },
        ...auditContext(req)
      }
    });

    return res.status(200).json({
      businessDate: businessDate.toISOString(),
      dayState: day.state,
      declaredNet,
      computedNet,
      discrepancy
    });
  }
);

router.get(
  "/reconciliation/branch-handoff",
  requireAuth,
  requireRole([UserRole.ADMIN, UserRole.BRANCH_MANAGER]),
  async (req, res) => {
    const user = req.session.user!;
    const requestedBranchCode = req.query.branchCode ? String(req.query.branchCode) : undefined;
    const scopeBranchCode = resolveBranchCode(user.role, user.branchCode, requestedBranchCode);
    if (!scopeBranchCode && user.role !== UserRole.ADMIN) {
      return res.status(400).json({ error: "BRANCH_REQUIRED" });
    }

    const businessDate = startOfToday();
    const tellers = await prisma.user.findMany({
      where: {
        role: UserRole.TELLER,
        ...(scopeBranchCode ? { branchCode: scopeBranchCode } : {})
      },
      select: {
        id: true,
        fullName: true,
        username: true,
        branchCode: true
      },
      orderBy: { fullName: "asc" }
    });

    const txs = await prisma.transaction.findMany({
      where: {
        businessDate,
        ...(scopeBranchCode ? { branchCode: scopeBranchCode } : {})
      },
      select: {
        tellerUserId: true,
        type: true,
        amount: true,
        status: true,
        createdAt: true
      }
    });

    const submissions = await prisma.auditLog.findMany({
      where: {
        action: "TELLER_HANDOFF_SUBMIT",
        businessDate,
        ...(scopeBranchCode ? { branchCode: scopeBranchCode } : {})
      },
      orderBy: { createdAt: "desc" },
      select: {
        userId: true,
        branchCode: true,
        metadata: true,
        createdAt: true
      }
    });

    const byTeller = new Map<
      string,
      {
        declaredNet: number;
        discrepancy: number;
        submittedAt: string;
      }
    >();
    for (const entry of submissions) {
      if (!entry.userId || byTeller.has(entry.userId)) continue;
      const metadata = (entry.metadata ?? {}) as { declaredNet?: number; discrepancy?: number };
      byTeller.set(entry.userId, {
        declaredNet: Number(metadata.declaredNet ?? 0),
        discrepancy: Number(metadata.discrepancy ?? 0),
        submittedAt: entry.createdAt.toISOString()
      });
    }

    const txByTeller = new Map<string, typeof txs>();
    for (const tx of txs) {
      const existing = txByTeller.get(tx.tellerUserId) ?? [];
      existing.push(tx);
      txByTeller.set(tx.tellerUserId, existing);
    }

    return res.status(200).json({
      businessDate: businessDate.toISOString(),
      branchCode: scopeBranchCode,
      tellers: tellers.map((teller) => {
        const tellerTxs = txByTeller.get(teller.id) ?? [];
        const totals = summarizeTransactions(tellerTxs);
        const computedNet = Number((totals.deposits - totals.withdrawals).toFixed(2));
        const handoff = byTeller.get(teller.id) ?? null;
        return {
          tellerUserId: teller.id,
          fullName: teller.fullName,
          username: teller.username,
          branchCode: teller.branchCode,
          totals: {
            txCount: totals.txCount,
            deposits: Number(totals.deposits.toFixed(2)),
            withdrawals: Number(totals.withdrawals.toFixed(2)),
            net: computedNet,
            voidedCount: totals.voidedCount
          },
          handoff: handoff
            ? {
                declaredNet: handoff.declaredNet,
                discrepancy: handoff.discrepancy,
                submittedAt: handoff.submittedAt
              }
            : null
        };
      })
    });
  }
);

export default router;
