import { Router } from "express";
import { requireRole } from "./auth";
import { DayState, Prisma, UserRole } from "@prisma/client";
import { z } from "zod";
import multer from "multer";
import { parseAndValidate, parseValidateAndExtract } from "./bcpValidator";
import prisma from "./db";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const textSchema = z.object({
  csv: z.string().min(1),
  filename: z.string().min(1)
});

router.post("/validate", requireRole([UserRole.ADMIN]), async (req, res) => {
  const parsed = textSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }

  const result = parseAndValidate(parsed.data.csv, parsed.data.filename);
  if ("errors" in result) {
    return res.status(400).json({ error: "INVALID_CSV", errors: result.errors });
  }
  return res.status(200).json(result.summary);
});

router.post(
  "/upload",
  requireRole([UserRole.ADMIN]),
  upload.single("file"),
  async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "MISSING_FILE" });
    }

    const csv = file.buffer.toString("utf-8");
    const result = parseValidateAndExtract(csv, file.originalname);
    if ("errors" in result) {
      return res.status(400).json({ error: "INVALID_CSV", errors: result.errors });
    }

    const loadedDate = new Date();
    loadedDate.setHours(0, 0, 0, 0);

    const branch = await prisma.branch.findUnique({
      where: { branchCode: result.summary.branchCode },
      select: { branchCode: true }
    });
    if (!branch) {
      return res.status(400).json({ error: "INVALID_BRANCH" });
    }

    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const day = await tx.dayCycle.upsert({
          where: { businessDate: loadedDate },
          create: { businessDate: loadedDate },
          update: {}
        });
        if (![DayState.CLOSED, DayState.LOADING].includes(day.state)) {
          throw new Error(`DAY_NOT_LOADABLE:${day.state}`);
        }

        await tx.dayCycle.update({
          where: { businessDate: loadedDate },
          data: { state: DayState.LOADING }
        });

        for (const row of result.rows) {
          await tx.account.upsert({
            where: {
              accountKey_branchCode_loadedDate: {
                accountKey: row.accountKey,
                branchCode: result.summary.branchCode,
                loadedDate
              }
            },
            create: {
              accountKey: row.accountKey,
              fullAccountNumber: row.fullAccountNumber,
              accountName: row.accountName,
              operationRestrictions: row.operationRestrictions,
              currentBalance: row.currentBalance,
              heldBalance: row.heldBalance,
              fxSupplementaryAccounts: row.fxSupplementaryAccounts,
              loans: row.loans,
              deposits: row.deposits,
              savingsPlans: row.savingsPlans,
              securities: row.securities,
              guarantees: row.guarantees,
              liens: row.liens,
              pledges: row.pledges,
              annualDebitTurnover: row.annualDebitTurnover,
              totalCreditLines: row.totalCreditLines,
              nextVisaCharge: row.nextVisaCharge,
              visaDebt: row.visaDebt,
              markers: row.markers,
              openingBalance: row.currentBalance,
              loadedDate,
              branchCode: result.summary.branchCode
            },
            update: {
              fullAccountNumber: row.fullAccountNumber,
              accountName: row.accountName,
              operationRestrictions: row.operationRestrictions,
              currentBalance: row.currentBalance,
              heldBalance: row.heldBalance,
              fxSupplementaryAccounts: row.fxSupplementaryAccounts,
              loans: row.loans,
              deposits: row.deposits,
              savingsPlans: row.savingsPlans,
              securities: row.securities,
              guarantees: row.guarantees,
              liens: row.liens,
              pledges: row.pledges,
              annualDebitTurnover: row.annualDebitTurnover,
              totalCreditLines: row.totalCreditLines,
              nextVisaCharge: row.nextVisaCharge,
              visaDebt: row.visaDebt,
              markers: row.markers,
              openingBalance: row.currentBalance,
              version: 1
            }
          });
        }

        const [distinctBranchesLoaded, totalAccountsLoaded] = await Promise.all([
          tx.account.findMany({
            where: { loadedDate },
            distinct: ["branchCode"],
            select: { branchCode: true }
          }),
          tx.account.count({ where: { loadedDate } })
        ]);

        await tx.dayCycle.update({
          where: { businessDate: loadedDate },
          data: {
            branchesLoaded: distinctBranchesLoaded.length,
            totalAccountsLoaded
          }
        });
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("DAY_NOT_LOADABLE:")) {
        const state = error.message.split(":")[1] ?? "UNKNOWN";
        return res.status(409).json({ error: "DAY_NOT_LOADABLE", state });
      }
      return res.status(500).json({ error: "UPLOAD_FAILED" });
    }

    return res.status(200).json({
      ...result.summary,
      loadedDate: loadedDate.toISOString()
    });
  }
);

export default router;
