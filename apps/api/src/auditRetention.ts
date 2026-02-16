import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import prisma from "./db";
import { sendOpsAlert } from "./opsAlerts";

export type AuditRetentionPolicy = {
  enabled: boolean;
  intervalHours: number;
  olderThanDays: number;
  dryRun: boolean;
  archiveDir: string | null;
};

type AuditRetentionRunInput = {
  beforeDate?: string;
  olderThanDays?: number;
  dryRun?: boolean;
  archiveDir?: string | null;
  requestedByUserId?: string | null;
  ipAddress?: string | null;
  sessionId?: string | null;
  source: "MANUAL" | "SCHEDULED";
};

type AuditRetentionRunResult = {
  dryRun: boolean;
  cutoffDate: string;
  matched: number;
  deleted: number;
  archivedFilePath: string | null;
};

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return value.toLowerCase() === "true";
}

function parseNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

export function loadAuditRetentionPolicyFromEnv(): AuditRetentionPolicy {
  return {
    enabled: parseBoolean(process.env.AUDIT_RETENTION_ENABLED, false),
    intervalHours: parseNumber(process.env.AUDIT_RETENTION_INTERVAL_HOURS, 24, 1, 168),
    olderThanDays: parseNumber(process.env.AUDIT_RETENTION_OLDER_THAN_DAYS, 2555, 1, 3650),
    dryRun: parseBoolean(process.env.AUDIT_RETENTION_DRY_RUN, true),
    archiveDir: process.env.AUDIT_RETENTION_ARCHIVE_DIR?.trim() || null
  };
}

function toUtcDateBoundary(day: string, endOfDay: boolean) {
  return new Date(`${day}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
}

function toCsvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function buildArchiveCsv(logs: Array<any>) {
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
  return `${rows.join("\n")}\n`;
}

function resolveCutoffDate(beforeDate?: string, olderThanDays?: number) {
  if (beforeDate) {
    return toUtcDateBoundary(beforeDate, false);
  }
  const days = olderThanDays ?? 2555;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function runAuditRetention(input: AuditRetentionRunInput): Promise<AuditRetentionRunResult> {
  const cutoffDate = resolveCutoffDate(input.beforeDate, input.olderThanDays);
  const dryRun = input.dryRun ?? true;
  const archiveDir = input.archiveDir ?? null;
  const where = { createdAt: { lt: cutoffDate } };

  const matchedLogs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "asc" }
  });
  const matched = matchedLogs.length;
  let deleted = 0;
  let archivedFilePath: string | null = null;

  if (!dryRun && matched > 0) {
    if (archiveDir) {
      await mkdir(archiveDir, { recursive: true });
      const stamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
      archivedFilePath = join(archiveDir, `audit_logs_archive_${stamp}.csv`);
      await writeFile(archivedFilePath, buildArchiveCsv(matchedLogs), "utf-8");
    }
    const result = await prisma.auditLog.deleteMany({ where });
    deleted = result.count;
  }

  await prisma.auditLog.create({
    data: {
      userId: input.requestedByUserId ?? null,
      action: "AUDIT_RETENTION_RUN",
      entityType: "AUDIT_LOG",
      ipAddress: input.ipAddress ?? null,
      sessionId: input.sessionId ?? null,
      metadata: {
        source: input.source,
        dryRun,
        cutoffDate: cutoffDate.toISOString(),
        matched,
        deleted,
        archivedFilePath
      }
    }
  });

  return {
    dryRun,
    cutoffDate: cutoffDate.toISOString(),
    matched,
    deleted,
    archivedFilePath
  };
}

export function startAuditRetentionScheduler() {
  const policy = loadAuditRetentionPolicyFromEnv();
  if (!policy.enabled) {
    return null;
  }

  const intervalMs = policy.intervalHours * 60 * 60 * 1000;
  const run = async () => {
    try {
      const result = await runAuditRetention({
        olderThanDays: policy.olderThanDays,
        dryRun: policy.dryRun,
        archiveDir: policy.archiveDir,
        source: "SCHEDULED",
        requestedByUserId: null
      });
      console.log(
        `audit retention run completed: dryRun=${result.dryRun} matched=${result.matched} deleted=${result.deleted}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      try {
        await prisma.auditLog.create({
          data: {
            userId: null,
            action: "AUDIT_RETENTION_ERROR",
            entityType: "AUDIT_LOG",
            ipAddress: null,
            sessionId: null,
            metadata: {
              source: "SCHEDULED",
              error: message
            }
          }
        });
      } catch {
        // ignore secondary logging failures
      }
      await sendOpsAlert({
        eventType: "AUDIT_RETENTION_ERROR",
        severity: "ERROR",
        message: `Scheduled audit retention run failed: ${message}`,
        source: "apps/api/src/auditRetention.ts",
        details: {
          mode: "SCHEDULED",
          olderThanDays: policy.olderThanDays,
          dryRun: policy.dryRun
        }
      });
      console.error(`audit retention run failed: ${message}`);
    }
  };

  void run();
  const timer = setInterval(() => {
    void run();
  }, intervalMs);
  timer.unref();
  return timer;
}
