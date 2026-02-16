import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import multer from "multer";
import prisma from "./db";
import { requireRole } from "./auth";
import { loadAuditRetentionPolicyFromEnv, runAuditRetention } from "./auditRetention";
import { evaluateRecoverySlo } from "./recoverySlo";
import { UserRole, UserStatus } from "./prismaEnums";
import { parseBranchManagerImportWorkbook } from "./branchManagerImport";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const listUsersQuerySchema = z.object({
  status: z.nativeEnum(UserStatus).optional(),
  role: z.nativeEnum(UserRole).optional(),
  branchCode: z.string().min(1).optional(),
  q: z.string().min(1).optional()
});

const listAuditLogsQuerySchema = z.object({
  action: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  branchCode: z.string().min(1).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional()
});
const retentionHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional()
});

const runRetentionSchema = z
  .object({
    beforeDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    olderThanDays: z.coerce.number().int().min(1).max(3650).optional(),
    dryRun: z.boolean().optional()
  })
  .refine((value) => value.beforeDate !== undefined || value.olderThanDays !== undefined, {
    message: "beforeDate or olderThanDays is required"
  });
const recoverySloSchema = z.object({
  backupCompletedAt: z.string().datetime(),
  restorePointAt: z.string().datetime(),
  restoreCompletedAt: z.string().datetime(),
  targetRpoMinutes: z.coerce.number().positive().default(60),
  targetRtoMinutes: z.coerce.number().positive().default(30)
});

function toCsvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function toUtcDateBoundary(day: string, endOfDay: boolean) {
  return new Date(`${day}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
}

function buildAuditLogFilters(query: z.infer<typeof listAuditLogsQuerySchema>) {
  const { action, entityType, userId, branchCode, from, to } = query;
  let createdAt: { gte?: Date; lte?: Date } | undefined;
  if (from || to) {
    createdAt = {};
    if (from) {
      createdAt.gte = toUtcDateBoundary(from, false);
    }
    if (to) {
      createdAt.lte = toUtcDateBoundary(to, true);
    }
  }

  return {
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(userId ? { userId } : {}),
    ...(branchCode ? { branchCode } : {}),
    ...(createdAt ? { createdAt } : {})
  };
}

function toRetentionRun(log: {
  id: string;
  createdAt: Date;
  userId: string | null;
  metadata: unknown;
}) {
  const meta = (log.metadata && typeof log.metadata === "object" ? log.metadata : {}) as Record<
    string,
    unknown
  >;
  return {
    id: log.id,
    createdAt: log.createdAt,
    userId: log.userId,
    source: typeof meta.source === "string" ? meta.source : null,
    dryRun: typeof meta.dryRun === "boolean" ? meta.dryRun : null,
    cutoffDate: typeof meta.cutoffDate === "string" ? meta.cutoffDate : null,
    matched: typeof meta.matched === "number" ? meta.matched : null,
    deleted: typeof meta.deleted === "number" ? meta.deleted : null,
    archivedFilePath: typeof meta.archivedFilePath === "string" ? meta.archivedFilePath : null
  };
}

function auditContext(req: { ip?: string; sessionID?: string }) {
  return {
    ipAddress: req.ip ?? null,
    sessionId: req.sessionID ?? null
  };
}

router.get("/users", requireRole([UserRole.ADMIN]), async (req, res) => {
  const parsed = listUsersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_QUERY" });
  }
  const { status, role, branchCode, q } = parsed.data;
  const where = {
    ...(status ? { status } : {}),
    ...(role ? { role } : {}),
    ...(branchCode ? { branchCode } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { employeeId: { contains: q, mode: "insensitive" as const } },
            { username: { contains: q, mode: "insensitive" as const } }
          ]
        }
      : {})
  };
  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      employeeId: true,
      username: true,
      status: true,
      role: true,
      branchCode: true,
      createdAt: true
    },
    orderBy: { createdAt: "asc" }
  });
  return res.status(200).json(users);
});

router.get("/audit-logs", requireRole([UserRole.ADMIN]), async (req, res) => {
  const parsed = listAuditLogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_QUERY" });
  }
  const { limit } = parsed.data;

  const logs = await prisma.auditLog.findMany({
    where: buildAuditLogFilters(parsed.data),
    orderBy: { createdAt: "desc" },
    take: limit ?? 100
  });

  const userIds = [...new Set(logs.map((log) => log.userId).filter((id): id is string => Boolean(id)))];
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, username: true }
        })
      : [];
  const userMap = new Map(users.map((user) => [user.id, user]));

  return res.status(200).json(
    logs.map((log) => ({
      ...log,
      actor: log.userId ? userMap.get(log.userId) ?? null : null
    }))
  );
});

router.get("/audit-logs/export", requireRole([UserRole.ADMIN]), async (req, res) => {
  const parsed = listAuditLogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_QUERY" });
  }
  const limit = Math.min(parsed.data.limit ?? 1000, 5000);
  const logs = await prisma.auditLog.findMany({
    where: buildAuditLogFilters(parsed.data),
    orderBy: { createdAt: "desc" },
    take: limit
  });

  const rows = [
    [
      "id",
      "created_at",
      "action",
      "entity_type",
      "entity_id",
      "user_id",
      "business_date",
      "branch_code",
      "metadata_json"
    ].join(",")
  ];

  for (const log of logs) {
    rows.push(
      [
        toCsvCell(log.id),
        toCsvCell(log.createdAt.toISOString()),
        toCsvCell(log.action),
        toCsvCell(log.entityType),
        toCsvCell(log.entityId ?? ""),
        toCsvCell(log.userId ?? ""),
        toCsvCell(log.businessDate ? log.businessDate.toISOString().slice(0, 10) : ""),
        toCsvCell(log.branchCode ?? ""),
        toCsvCell(log.metadata ? JSON.stringify(log.metadata) : "")
      ].join(",")
    );
  }

  const dayStamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  await prisma.auditLog.create({
    data: {
      userId: req.session.user?.id ?? null,
      action: "AUDIT_EXPORT_DOWNLOAD",
      entityType: "AUDIT_LOG",
      metadata: {
        filters: parsed.data,
        rowCount: logs.length
      },
      ...auditContext(req)
    }
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=\"BT_AUDIT_LOGS_${dayStamp}.csv\"`);
  return res.status(200).send(`${rows.join("\n")}\n`);
});

router.post("/audit-logs/retention/run", requireRole([UserRole.ADMIN]), async (req, res) => {
  const parsed = runRetentionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }
  const result = await runAuditRetention({
    beforeDate: parsed.data.beforeDate,
    olderThanDays: parsed.data.olderThanDays,
    dryRun: parsed.data.dryRun,
    requestedByUserId: req.session.user?.id ?? null,
    ipAddress: req.ip ?? null,
    sessionId: req.sessionID ?? null,
    source: "MANUAL"
  });
  return res.status(200).json(result);
});

router.get("/audit-logs/retention/policy", requireRole([UserRole.ADMIN]), (_req, res) => {
  const policy = loadAuditRetentionPolicyFromEnv();
  return res.status(200).json(policy);
});

router.get("/audit-logs/retention/history", requireRole([UserRole.ADMIN]), async (req, res) => {
  const parsed = retentionHistoryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_QUERY" });
  }
  const limit = parsed.data.limit ?? 20;
  const rows = await prisma.auditLog.findMany({
    where: { action: "AUDIT_RETENTION_RUN" },
    orderBy: { createdAt: "desc" },
    take: limit
  });
  return res.status(200).json(rows.map(toRetentionRun));
});

router.get("/audit-logs/retention/status", requireRole([UserRole.ADMIN]), async (_req, res) => {
  const policy = loadAuditRetentionPolicyFromEnv();
  const [lastRun, lastError] = await Promise.all([
    prisma.auditLog.findFirst({
      where: { action: "AUDIT_RETENTION_RUN" },
      orderBy: { createdAt: "desc" }
    }),
    prisma.auditLog.findFirst({
      where: { action: "AUDIT_RETENTION_ERROR" },
      orderBy: { createdAt: "desc" }
    })
  ]);
  return res.status(200).json({
    policy,
    lastRun: lastRun ? toRetentionRun(lastRun) : null,
    lastError: lastError
      ? {
          id: lastError.id,
          createdAt: lastError.createdAt,
          metadata: lastError.metadata
        }
      : null
  });
});

router.post("/ops/recovery-evaluate", requireRole([UserRole.ADMIN]), async (req, res) => {
  const parsed = recoverySloSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  try {
    const evaluation = evaluateRecoverySlo(parsed.data);
    await prisma.auditLog.create({
      data: {
        userId: req.session.user?.id ?? null,
        action: "OPS_RECOVERY_EVALUATE",
        entityType: "OPS",
        metadata: {
          ...parsed.data,
          ...evaluation
        },
        ...auditContext(req)
      }
    });
    return res.status(200).json(evaluation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "RECOVERY_EVALUATION_FAILED";
    return res.status(400).json({ error: message });
  }
});

const approveSchema = z.object({
  role: z.enum(["BRANCH_MANAGER", "TELLER"]),
  branchCode: z.string().min(1)
});

async function ensureBranchExists(branchCode: string) {
  const branch = await prisma.branch.findUnique({
    where: { branchCode },
    select: { branchCode: true, status: true }
  });
  if (!branch || branch.status !== "ACTIVE") {
    return false;
  }
  return true;
}

async function countActiveAdminsExcluding(userId?: string) {
  return prisma.user.count({
    where: {
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      ...(userId ? { id: { not: userId } } : {})
    }
  });
}

function generateTemporaryPassword(length = 12) {
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lowercase = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = `${uppercase}${lowercase}${digits}${symbols}`;
  let password = "";
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += digits[Math.floor(Math.random() * digits.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  for (let i = 4; i < length; i += 1) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

router.post(
  "/users/import-branch-managers",
  requireRole([UserRole.ADMIN]),
  upload.single("file"),
  async (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "MISSING_FILE" });
    }
    const parsed = parseBranchManagerImportWorkbook(file.buffer);
    if (parsed.errors.length > 0) {
      return res.status(400).json({ error: "INVALID_XLSX", errors: parsed.errors });
    }

    const defaultPassword = process.env.BRANCH_MANAGER_IMPORT_DEFAULT_PASSWORD || "ChangeMe123!";
    const defaultPasswordHash = await bcrypt.hash(defaultPassword, 12);

    let created = 0;
    let updated = 0;

    for (const row of parsed.rows) {
      await prisma.branch.upsert({
        where: { branchCode: row.branchCode },
        update: { branchName: row.branchName, status: "ACTIVE" },
        create: {
          branchCode: row.branchCode,
          branchName: row.branchName,
          status: "ACTIVE"
        }
      });

      const existing = await prisma.user.findUnique({ where: { username: row.email } });
      if (existing) {
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            fullName: row.fullName,
            employeeId: row.employeeId,
            role: UserRole.BRANCH_MANAGER,
            status: UserStatus.ACTIVE,
            branchCode: row.branchCode
          }
        });
        updated += 1;
      } else {
        await prisma.user.create({
          data: {
            fullName: row.fullName,
            employeeId: row.employeeId,
            username: row.email,
            passwordHash: defaultPasswordHash,
            role: UserRole.BRANCH_MANAGER,
            status: UserStatus.ACTIVE,
            branchCode: row.branchCode
          }
        });
        created += 1;
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: req.session.user?.id ?? null,
        action: "USER_BRANCH_MANAGER_IMPORT",
        entityType: "USER",
        metadata: {
          filename: file.originalname,
          totalRows: parsed.rows.length,
          created,
          updated
        },
        ...auditContext(req)
      }
    });

    return res.status(200).json({
      totalRows: parsed.rows.length,
      created,
      updated
    });
  }
);

router.post("/users/:id/approve", requireRole([UserRole.ADMIN]), async (req, res) => {
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }
  const { role, branchCode } = parsed.data;
  const branchOk = await ensureBranchExists(branchCode);
  if (!branchOk) {
    return res.status(400).json({ error: "INVALID_BRANCH" });
  }

  const user = await prisma.user
    .update({
      where: { id: req.params.id },
      data: {
        role: role === "BRANCH_MANAGER" ? UserRole.BRANCH_MANAGER : UserRole.TELLER,
        status: UserStatus.ACTIVE,
        branchCode
      }
    })
    .catch(() => null);
  if (!user) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }
  await prisma.auditLog.create({
    data: {
      userId: req.session.user?.id ?? null,
      action: "USER_APPROVE",
      entityType: "USER",
      entityId: user.id,
      beforeState: {
        role: UserRole.NONE,
        status: UserStatus.PENDING_APPROVAL
      },
      afterState: {
        role: user.role,
        status: user.status,
        branchCode: user.branchCode
      },
      ...auditContext(req)
    }
  });

  return res.status(200).json({
    id: user.id,
    role: user.role,
    status: user.status,
    branchCode: user.branchCode
  });
});

const updateUserSchema = z
  .object({
    role: z.nativeEnum(UserRole).optional(),
    status: z.nativeEnum(UserStatus).optional(),
    branchCode: z.string().optional(),
    clearBranch: z.boolean().optional()
  })
  .refine((value) => value.role !== undefined || value.status !== undefined || value.branchCode !== undefined || value.clearBranch !== undefined, {
    message: "At least one field must be provided"
  });

router.patch("/users/:id", requireRole([UserRole.ADMIN]), async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  const current = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!current) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }

  const nextRole = parsed.data.role ?? current.role;
  const nextStatus = parsed.data.status ?? current.status;

  if (nextRole === UserRole.NONE && nextStatus === UserStatus.ACTIVE) {
    return res.status(400).json({ error: "ACTIVE_USER_NEEDS_ROLE" });
  }

  if (current.role === UserRole.ADMIN && (nextRole !== UserRole.ADMIN || nextStatus !== UserStatus.ACTIVE)) {
    const otherActiveAdmins = await countActiveAdminsExcluding(current.id);
    if (otherActiveAdmins <= 0) {
      return res.status(409).json({ error: "LAST_ADMIN_PROTECTED" });
    }
  }

  let nextBranchCode: string | null = parsed.data.clearBranch ? null : current.branchCode;
  if (parsed.data.branchCode !== undefined) {
    const branchOk = await ensureBranchExists(parsed.data.branchCode);
    if (!branchOk) {
      return res.status(400).json({ error: "INVALID_BRANCH" });
    }
    nextBranchCode = parsed.data.branchCode;
  }

  if (nextRole !== UserRole.ADMIN && nextRole !== UserRole.NONE && !nextBranchCode) {
    return res.status(400).json({ error: "BRANCH_REQUIRED" });
  }

  if (nextRole === UserRole.ADMIN && parsed.data.clearBranch) {
    nextBranchCode = null;
  }

  const updated = await prisma.user.update({
    where: { id: current.id },
    data: {
      role: nextRole,
      status: nextStatus,
      branchCode: nextBranchCode
    }
  });
  await prisma.auditLog.create({
    data: {
      userId: req.session.user?.id ?? null,
      action: "USER_UPDATE",
      entityType: "USER",
      entityId: updated.id,
      beforeState: {
        role: current.role,
        status: current.status,
        branchCode: current.branchCode
      },
      afterState: {
        role: updated.role,
        status: updated.status,
        branchCode: updated.branchCode
      },
      ...auditContext(req)
    }
  });

  return res.status(200).json({
    id: updated.id,
    role: updated.role,
    status: updated.status,
    branchCode: updated.branchCode
  });
});

router.post("/users/:id/unlock", requireRole([UserRole.ADMIN]), async (req, res) => {
  const user = await prisma.user
    .update({
      where: { id: req.params.id },
      data: { failedLoginCount: 0, lockedUntil: null }
    })
    .catch(() => null);
  if (!user) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }
  await prisma.auditLog.create({
    data: {
      userId: req.session.user?.id ?? null,
      action: "USER_UNLOCK",
      entityType: "USER",
      entityId: user.id,
      afterState: {
        failedLoginCount: user.failedLoginCount,
        lockedUntil: user.lockedUntil
      },
      ...auditContext(req)
    }
  });
  return res.status(200).json({ id: user.id, failedLoginCount: user.failedLoginCount });
});

router.post("/users/:id/reset-password", requireRole([UserRole.ADMIN]), async (req, res) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    return res.status(404).json({ error: "USER_NOT_FOUND" });
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  await prisma.user.update({
    where: { id: existing.id },
    data: {
      passwordHash,
      failedLoginCount: 0,
      lockedUntil: null
    }
  });
  await prisma.auditLog.create({
    data: {
      userId: req.session.user?.id ?? null,
      action: "USER_RESET_PASSWORD",
      entityType: "USER",
      entityId: existing.id,
      metadata: {
        resetByAdmin: true
      },
      ...auditContext(req)
    }
  });

  return res.status(200).json({
    id: existing.id,
    temporaryPassword
  });
});

export default router;
