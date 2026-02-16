import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import session from "express-session";
import bcrypt from "bcrypt";
import { z } from "zod";
import prisma from "./db";
import adminRouter from "./admin";
import branchesRouter from "./branches";
import bcpRouter from "./bcp";
import ledgerRouter from "./ledgerRoutes";
import transactionsRouter from "./transactions";
import { requireAuth, requireRole } from "./auth";
import { UserRole, UserStatus, DayState, TransactionStatus, TransactionType } from "@prisma/client";
import { allowedTransitions } from "./dayState";

dotenv.config();

export function createApp(sessionStore?: session.Store) {
  const app = express();

  app.use(
    cors({
      origin: "http://localhost:3000",
      credentials: true
    })
  );
  app.use(express.json());
  app.use(
    session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET || "dev_secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 1000 * 60 * 15
      }
    })
  );

  app.use("/api/admin", adminRouter);
  app.use("/api/branches", branchesRouter);
  app.use("/api/bcp", bcpRouter);
  app.use("/api/ledger", ledgerRouter);
  app.use("/api", transactionsRouter);

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  function setSessionProbe(store: session.Store, sid: string, ttlMs: number) {
    return new Promise<void>((resolve, reject) => {
      store.set(
        sid,
        {
          cookie: {
            originalMaxAge: ttlMs,
            expires: new Date(Date.now() + ttlMs),
            secure: false,
            httpOnly: true,
            path: "/"
          }
        } as session.SessionData,
        (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        }
      );
    });
  }

  function getSessionProbe(store: session.Store, sid: string) {
    return new Promise<session.SessionData | null>((resolve, reject) => {
      store.get(sid, (err, sess) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(sess ?? null);
      });
    });
  }

  function destroySessionProbe(store: session.Store, sid: string) {
    return new Promise<void>((resolve, reject) => {
      store.destroy(sid, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  async function checkSessionStoreHealth() {
    if (!sessionStore) {
      return { healthy: true, mode: "memory_or_not_configured" as const };
    }
    const sid = `health:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const ttlMs = 60_000;
    await setSessionProbe(sessionStore, sid, ttlMs);
    const probe = await getSessionProbe(sessionStore, sid);
    await destroySessionProbe(sessionStore, sid);
    if (!probe) {
      throw new Error("SESSION_STORE_READBACK_FAILED");
    }
    return { healthy: true, mode: "configured" as const };
  }

  app.get("/health/ready", async (_req, res) => {
    const checks = {
      database: { healthy: false as boolean, error: null as string | null },
      sessionStore: { healthy: false as boolean, mode: null as string | null, error: null as string | null }
    };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database.healthy = true;
    } catch (error) {
      checks.database.error = error instanceof Error ? error.message : "DB_UNAVAILABLE";
    }

    try {
      const sessionStatus = await checkSessionStoreHealth();
      checks.sessionStore.healthy = sessionStatus.healthy;
      checks.sessionStore.mode = sessionStatus.mode;
    } catch (error) {
      checks.sessionStore.error = error instanceof Error ? error.message : "SESSION_STORE_UNAVAILABLE";
    }

    const ready = checks.database.healthy && checks.sessionStore.healthy;
    return res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      checks
    });
  });

  const registerSchema = z.object({
    fullName: z.string().min(2),
    employeeId: z.string().min(2),
    username: z.string().min(3),
    password: z.string().min(8),
    branchCode: z.string().min(1)
  });

  app.post("/api/auth/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    }

    const { fullName, employeeId, username, password, branchCode } = parsed.data;
    const branch = await prisma.branch.findUnique({ where: { branchCode } });
    if (!branch) {
      return res.status(400).json({ error: "INVALID_BRANCH" });
    }
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: "USERNAME_TAKEN" });
    }

    const hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        fullName,
        employeeId,
        username,
        passwordHash: hash,
        role: UserRole.NONE,
        status: UserStatus.PENDING_APPROVAL,
        branchCode
      }
    });

    return res.status(201).json({
      id: user.id,
      status: user.status
    });
  });

  const loginSchema = z.object({
    username: z.string().min(3),
    password: z.string().min(8)
  });

  app.post("/api/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
    }

    const { username, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(403).json({ error: "LOCKED" });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      const failedLoginCount = user.failedLoginCount + 1;
      const lockedUntil = failedLoginCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount, lockedUntil }
      });
      return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    }

    if (user.status !== UserStatus.ACTIVE) {
      return res.status(403).json({ error: "PENDING_APPROVAL" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null }
    });

    req.session.user = {
      id: user.id,
      role: user.role,
      branchCode: user.branchCode ?? null,
      status: user.status
    };
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "AUTH_LOGIN_SUCCESS",
        entityType: "USER",
        entityId: user.id,
        afterState: {
          role: user.role,
          branchCode: user.branchCode ?? null
        },
        ...auditContext(req)
      }
    });

    return res.status(200).json({
      id: user.id,
      role: user.role,
      branchCode: user.branchCode
    });
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    await prisma.auditLog.create({
      data: {
        userId: req.session.user?.id ?? null,
        action: "AUTH_LOGOUT",
        entityType: "USER",
        entityId: req.session.user?.id ?? null,
        ...auditContext(req)
      }
    });
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "LOGOUT_FAILED" });
      }
      return res.status(204).send();
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.session.user!.id } });
    if (!user) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }
    return res.status(200).json({
      id: user.id,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
      branchCode: user.branchCode
    });
  });

  function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function toDayPayload(day: {
    businessDate: Date;
    state: DayState;
    branchesLoaded: number;
    totalAccountsLoaded: number;
    ledgerRecordCount: number;
  }) {
    return {
      businessDate: day.businessDate.toISOString(),
      state: day.state,
      branchesLoaded: day.branchesLoaded,
      totalAccountsLoaded: day.totalAccountsLoaded,
      ledgerRecordCount: day.ledgerRecordCount
    };
  }

  function auditContext(req: express.Request) {
    return {
      ipAddress: req.ip ?? null,
      sessionId: req.sessionID ?? null
    };
  }

  async function getOrCreateTodayDay() {
    const today = startOfToday();
    return prisma.dayCycle.upsert({
      where: { businessDate: today },
      create: { businessDate: today },
      update: {}
    });
  }

  app.get("/api/day/current", requireAuth, async (_req, res) => {
    const day = await getOrCreateTodayDay();
    return res.status(200).json(toDayPayload(day));
  });

  app.get("/api/dashboard/summary", requireAuth, async (req, res) => {
    const today = startOfToday();
    const user = req.session.user!;
    const scopeBranchCode = user.role === UserRole.ADMIN ? null : user.branchCode;
    const parseParam = (value: unknown) => (typeof value === "string" ? value.trim() : "");
    const parsePositiveInt = (value: unknown, fallback: number) => {
      const n = Number.parseInt(parseParam(value), 10);
      if (!Number.isFinite(n) || n <= 0) {
        return fallback;
      }
      return n;
    };
    const q = parseParam(req.query.q);
    const requestedType = parseParam(req.query.type).toUpperCase();
    const requestedStatus = parseParam(req.query.status).toUpperCase();
    const validType =
      requestedType === TransactionType.DEPOSIT || requestedType === TransactionType.WITHDRAWAL
        ? requestedType
        : null;
    const validStatus =
      requestedStatus === TransactionStatus.COMPLETED || requestedStatus === TransactionStatus.VOIDED
        ? requestedStatus
        : null;
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = Math.min(parsePositiveInt(req.query.pageSize, 10), 50);
    const skip = (page - 1) * pageSize;

    const scopedWhere = {
      businessDate: today,
      ...(scopeBranchCode ? { branchCode: scopeBranchCode } : {})
    };

    const allDayTransactions = await prisma.transaction.findMany({
      where: scopedWhere,
      select: {
        type: true,
        amount: true,
        status: true,
        tellerUserId: true,
        createdAt: true
      }
    });

    const recentWhere =
      user.role === UserRole.TELLER
        ? {
            ...scopedWhere,
            tellerUserId: user.id
          }
        : scopedWhere;
    const recentFilteredWhere = {
      ...recentWhere,
      ...(validType ? { type: validType } : {}),
      ...(validStatus ? { status: validStatus } : {}),
      ...(q
        ? {
            OR: [
              { transactionId: { contains: q, mode: "insensitive" as const } },
              { accountKey: { contains: q, mode: "insensitive" as const } }
            ]
          }
        : {})
    };

    const [recent, recentTotal] = await Promise.all([
      prisma.transaction.findMany({
        where: recentFilteredWhere,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          transactionId: true,
          type: true,
          amount: true,
          status: true,
          branchCode: true,
          accountKey: true,
          createdAt: true
        }
      }),
      prisma.transaction.count({
        where: recentFilteredWhere
      })
    ]);

    const totals = allDayTransactions.reduce(
      (acc, tx) => {
        const amount = Number(tx.amount);
        if (tx.type === "DEPOSIT") {
          acc.deposits += amount;
        } else if (tx.type === "WITHDRAWAL") {
          acc.withdrawals += amount;
        }
        acc.txCount += 1;
        return acc;
      },
      {
        txCount: 0,
        deposits: 0,
        withdrawals: 0
      }
    );

    let team:
      | Array<{
          tellerUserId: string;
          fullName: string;
          username: string;
          txCount: number;
          lastActivityAt: string | null;
        }>
      | undefined;

    if (user.role === UserRole.BRANCH_MANAGER && scopeBranchCode) {
      const tellers = await prisma.user.findMany({
        where: {
          role: UserRole.TELLER,
          status: UserStatus.ACTIVE,
          branchCode: scopeBranchCode
        },
        select: {
          id: true,
          fullName: true,
          username: true
        },
        orderBy: { fullName: "asc" }
      });

      const tellerStats = new Map<string, { txCount: number; lastActivityAt: Date | null }>();
      for (const tx of allDayTransactions) {
        const tellerId = tx.tellerUserId;
        const current = tellerStats.get(tellerId) ?? { txCount: 0, lastActivityAt: null };
        current.txCount += 1;
        if (!current.lastActivityAt || tx.createdAt > current.lastActivityAt) {
          current.lastActivityAt = tx.createdAt;
        }
        tellerStats.set(tellerId, current);
      }

      team = tellers.map((teller) => {
        const stats = tellerStats.get(teller.id);
        return {
          tellerUserId: teller.id,
          fullName: teller.fullName,
          username: teller.username,
          txCount: stats?.txCount ?? 0,
          lastActivityAt: stats?.lastActivityAt ? stats.lastActivityAt.toISOString() : null
        };
      });
    }

    return res.status(200).json({
      businessDate: today.toISOString(),
      role: user.role,
      scopeBranchCode,
      totals: {
        txCount: totals.txCount,
        deposits: Number(totals.deposits.toFixed(2)),
        withdrawals: Number(totals.withdrawals.toFixed(2)),
        net: Number((totals.deposits - totals.withdrawals).toFixed(2))
      },
      ...(team ? { team } : {}),
      recentPage: page,
      recentPageSize: pageSize,
      recentTotal,
      recentTotalPages: Math.max(1, Math.ceil(recentTotal / pageSize)),
      recent: recent.map((tx) => ({
        ...tx,
        amount: Number(tx.amount)
      }))
    });
  });

  app.post("/api/day/open", requireRole([UserRole.ADMIN]), async (req, res) => {
    const day = await getOrCreateTodayDay();
    if (day.state !== DayState.LOADING) {
      return res.status(409).json({
        error: "INVALID_DAY_TRANSITION",
        currentState: day.state,
        requestedState: DayState.OPEN,
        allowedNextStates: allowedTransitions[day.state]
      });
    }
    if (day.totalAccountsLoaded <= 0 || day.branchesLoaded <= 0) {
      return res.status(409).json({ error: "NO_BCP_LOADED" });
    }

    const updated = await prisma.dayCycle.update({
      where: { businessDate: day.businessDate },
      data: {
        state: DayState.OPEN,
        openedAt: new Date(),
        openedById: req.session.user?.id ?? null
      }
    });
    await prisma.auditLog.create({
      data: {
        userId: req.session.user?.id ?? null,
        action: "DAY_OPEN",
        entityType: "DAY_CYCLE",
        entityId: day.businessDate.toISOString().slice(0, 10),
        businessDate: day.businessDate,
        beforeState: { state: day.state },
        afterState: { state: DayState.OPEN },
        metadata: {
          fromState: day.state,
          toState: DayState.OPEN
        },
        ...auditContext(req)
      }
    });

    return res.status(200).json(toDayPayload(updated));
  });

  app.post("/api/day/close", requireRole([UserRole.ADMIN]), async (req, res) => {
    const day = await getOrCreateTodayDay();
    if (day.state !== DayState.OPEN) {
      return res.status(409).json({
        error: "INVALID_DAY_TRANSITION",
        currentState: day.state,
        requestedState: DayState.CLOSING,
        allowedNextStates: allowedTransitions[day.state]
      });
    }

    const updated = await prisma.dayCycle.update({
      where: { businessDate: day.businessDate },
      data: { state: DayState.CLOSING }
    });
    await prisma.auditLog.create({
      data: {
        userId: req.session.user?.id ?? null,
        action: "DAY_CLOSE_INIT",
        entityType: "DAY_CYCLE",
        entityId: day.businessDate.toISOString().slice(0, 10),
        businessDate: day.businessDate,
        beforeState: { state: day.state },
        afterState: { state: DayState.CLOSING },
        metadata: {
          fromState: day.state,
          toState: DayState.CLOSING
        },
        ...auditContext(req)
      }
    });

    return res.status(200).json(toDayPayload(updated));
  });

  app.post("/api/day/reconcile", requireRole([UserRole.ADMIN]), async (req, res) => {
    const day = await getOrCreateTodayDay();
    if (day.state !== DayState.CLOSING) {
      return res.status(409).json({
        error: "INVALID_DAY_TRANSITION",
        currentState: day.state,
        requestedState: DayState.RECONCILING,
        allowedNextStates: allowedTransitions[day.state]
      });
    }

    const updated = await prisma.dayCycle.update({
      where: { businessDate: day.businessDate },
      data: { state: DayState.RECONCILING }
    });
    await prisma.auditLog.create({
      data: {
        userId: req.session.user?.id ?? null,
        action: "DAY_RECONCILE_START",
        entityType: "DAY_CYCLE",
        entityId: day.businessDate.toISOString().slice(0, 10),
        businessDate: day.businessDate,
        beforeState: { state: day.state },
        afterState: { state: DayState.RECONCILING },
        metadata: {
          fromState: day.state,
          toState: DayState.RECONCILING
        },
        ...auditContext(req)
      }
    });

    return res.status(200).json(toDayPayload(updated));
  });

  app.post("/api/day/close/confirm", requireRole([UserRole.ADMIN]), async (req, res) => {
    const day = await getOrCreateTodayDay();
    if (day.state !== DayState.RECONCILING) {
      return res.status(409).json({
        error: "INVALID_DAY_TRANSITION",
        currentState: day.state,
        requestedState: DayState.CLOSED,
        allowedNextStates: allowedTransitions[day.state]
      });
    }

    const updated = await prisma.dayCycle.update({
      where: { businessDate: day.businessDate },
      data: {
        state: DayState.CLOSED,
        closedAt: new Date(),
        closedById: req.session.user?.id ?? null
      }
    });
    await prisma.auditLog.create({
      data: {
        userId: req.session.user?.id ?? null,
        action: "DAY_CLOSE_CONFIRM",
        entityType: "DAY_CYCLE",
        entityId: day.businessDate.toISOString().slice(0, 10),
        businessDate: day.businessDate,
        beforeState: { state: day.state },
        afterState: { state: DayState.CLOSED },
        metadata: {
          fromState: day.state,
          toState: DayState.CLOSED
        },
        ...auditContext(req)
      }
    });

    return res.status(200).json(toDayPayload(updated));
  });

  return app;
}
