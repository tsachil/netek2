import { Router } from "express";
import JSZip from "jszip";
import { z } from "zod";
import prisma from "./db";
import { requireRole } from "./auth";
import { formatBusinessDate, generateLedgerCsv } from "./ledgerCsv";
import { UserRole } from "./prismaEnums";

const router = Router();

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

function startOfDateOrToday(dateParam?: string) {
  if (dateParam) {
    const parsed = new Date(`${dateParam}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getLoadedBranchesForDate(loadedDate: Date) {
  const rows = await prisma.account.findMany({
    where: { loadedDate },
    distinct: ["branchCode"],
    select: { branchCode: true }
  });
  return rows.map((row) => row.branchCode).sort();
}

router.get("/branches", requireRole([UserRole.ADMIN]), async (req, res) => {
  const parsed = dateSchema.safeParse(req.query.date);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_DATE" });
  }
  const loadedDate = startOfDateOrToday(parsed.data);
  if (!loadedDate) {
    return res.status(400).json({ error: "INVALID_DATE" });
  }
  const branches = await getLoadedBranchesForDate(loadedDate);
  return res.status(200).json({
    businessDate: loadedDate.toISOString(),
    branches
  });
});

router.get("/branch/:branchCode", requireRole([UserRole.ADMIN]), async (req, res) => {
  const parsed = dateSchema.safeParse(req.query.date);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_DATE" });
  }

  const loadedDate = startOfDateOrToday(parsed.data);
  if (!loadedDate) {
    return res.status(400).json({ error: "INVALID_DATE" });
  }
  const branchCode = req.params.branchCode;

  const branchLoaded = await prisma.account.findFirst({
    where: { loadedDate, branchCode },
    select: { id: true }
  });
  if (!branchLoaded) {
    return res.status(404).json({ error: "LEDGER_NOT_FOUND" });
  }

  const csv = generateLedgerCsv(branchCode, loadedDate);
  const filename = `BT_LEDGER_SNIF${branchCode}_${formatBusinessDate(loadedDate)}.csv`;
  return res
    .status(200)
    .setHeader("Content-Type", "text/csv; charset=utf-8")
    .setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    .send(csv);
});

router.get("/all", requireRole([UserRole.ADMIN]), async (req, res) => {
  const parsed = dateSchema.safeParse(req.query.date);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_DATE" });
  }
  const loadedDate = startOfDateOrToday(parsed.data);
  if (!loadedDate) {
    return res.status(400).json({ error: "INVALID_DATE" });
  }

  const branches = await getLoadedBranchesForDate(loadedDate);
  if (branches.length === 0) {
    return res.status(404).json({ error: "LEDGER_NOT_FOUND" });
  }

  const zip = new JSZip();
  for (const branchCode of branches) {
    const fileName = `BT_LEDGER_SNIF${branchCode}_${formatBusinessDate(loadedDate)}.csv`;
    zip.file(fileName, generateLedgerCsv(branchCode, loadedDate));
  }

  const data = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const zipName = `BT_LEDGER_ALL_${formatBusinessDate(loadedDate)}.zip`;
  return res
    .status(200)
    .setHeader("Content-Type", "application/zip")
    .setHeader("Content-Disposition", `attachment; filename="${zipName}"`)
    .send(data);
});

export default router;
