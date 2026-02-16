import { Router } from "express";
import prisma from "./db";
import { requireRole } from "./auth";
import { BranchStatus, UserRole } from "@prisma/client";
import { z } from "zod";

const router = Router();

router.get("/", requireRole([UserRole.ADMIN, UserRole.BRANCH_MANAGER]), async (_req, res) => {
  const branches = await prisma.branch.findMany({
    select: {
      branchCode: true,
      branchName: true,
      status: true
    },
    orderBy: { branchCode: "asc" }
  });
  return res.status(200).json(branches);
});

const importSchema = z.object({
  csv: z.string().min(1)
});

type BranchRow = {
  branchCode: string;
  branchName: string;
  status: BranchStatus;
};

function parseCsv(csv: string) {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const errors: { line: number; message: string }[] = [];
  const rows: BranchRow[] = [];

  lines.forEach((line, index) => {
    const cells = line.split(",").map((c) => c.trim());
    if (cells.length < 3) {
      errors.push({ line: index + 1, message: "Expected 3 columns" });
      return;
    }

    let [branchCode, branchName, status] = cells;

    if (index === 0 && branchCode.toLowerCase().includes("branch")) {
      return; // header
    }

    if (!branchCode || !branchName || !status) {
      errors.push({ line: index + 1, message: "Missing required fields" });
      return;
    }

    const normalized = status.toUpperCase();
    if (normalized !== "ACTIVE" && normalized !== "INACTIVE") {
      errors.push({ line: index + 1, message: "Invalid status" });
      return;
    }

    rows.push({
      branchCode,
      branchName,
      status: normalized === "ACTIVE" ? BranchStatus.ACTIVE : BranchStatus.INACTIVE
    });
  });

  return { rows, errors };
}

router.post("/import", requireRole([UserRole.ADMIN]), async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT", details: parsed.error.flatten() });
  }

  const { rows, errors } = parseCsv(parsed.data.csv);
  if (errors.length > 0) {
    return res.status(400).json({ error: "INVALID_CSV", errors });
  }

  await prisma.$transaction(
    rows.map((row) =>
      prisma.branch.upsert({
        where: { branchCode: row.branchCode },
        update: { branchName: row.branchName, status: row.status },
        create: { branchCode: row.branchCode, branchName: row.branchName, status: row.status }
      })
    )
  );

  return res.status(200).json({ imported: rows.length });
});

export default router;
