import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import * as XLSX from "xlsx";

type MockUser = {
  id: string;
  fullName: string;
  employeeId: string;
  username: string;
  passwordHash?: string;
  status: "PENDING_APPROVAL" | "ACTIVE" | "INACTIVE";
  role: "NONE" | "ADMIN" | "BRANCH_MANAGER" | "TELLER";
  branchCode: string | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  createdAt: Date;
};

const users = new Map<string, MockUser>();
const branches = new Map<string, { branchCode: string; branchName: string; status: "ACTIVE" | "INACTIVE" }>();
const auditLogs: Array<{
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  businessDate: Date | null;
  branchCode: string | null;
  metadata: unknown;
  createdAt: Date;
}> = [];

const prismaMock = {
  user: {
    async findMany({ where }: any) {
      const all = [...users.values()];
      if (!where) return all;
      return all.filter((user) => {
        if (where.id?.in && !where.id.in.includes(user.id)) return false;
        if (where.status && user.status !== where.status) return false;
        if (where.role && user.role !== where.role) return false;
        if (where.branchCode && user.branchCode !== where.branchCode) return false;
        if (where.OR && Array.isArray(where.OR)) {
          const q = where.OR[0]?.fullName?.contains;
          if (q) {
            const needle = String(q).toLowerCase();
            const matches =
              user.fullName.toLowerCase().includes(needle) ||
              user.employeeId.toLowerCase().includes(needle) ||
              user.username.toLowerCase().includes(needle);
            if (!matches) return false;
          }
        }
        if (where.id?.not && user.id === where.id.not) return false;
        return true;
      });
    },
    async findUnique({ where }: any) {
      if (where.id) return users.get(where.id) ?? null;
      if (where.username) {
        return [...users.values()].find((u) => u.username === where.username) ?? null;
      }
      return null;
    },
    async update({ where, data }: any) {
      const current = users.get(where.id);
      if (!current) throw new Error("NOT_FOUND");
      const updated = { ...current, ...data };
      users.set(where.id, updated);
      return updated;
    },
    async create({ data }: any) {
      const id = `user-${users.size + 1}`;
      const created = {
        id,
        fullName: data.fullName,
        employeeId: data.employeeId,
        username: data.username,
        passwordHash: data.passwordHash,
        role: data.role,
        status: data.status,
        branchCode: data.branchCode ?? null,
        failedLoginCount: 0,
        lockedUntil: null,
        createdAt: new Date()
      } as MockUser;
      users.set(id, created);
      return created;
    },
    async count({ where }: any) {
      return [...users.values()].filter((u) => {
        if (where?.role && u.role !== where.role) return false;
        if (where?.status && u.status !== where.status) return false;
        if (where?.id?.not && u.id === where.id.not) return false;
        return true;
      }).length;
    }
  },
  auditLog: {
    async findMany({ where, orderBy, take }: any) {
      let rows = [...auditLogs];
      if (where?.action) rows = rows.filter((row) => row.action === where.action);
      if (where?.entityType) rows = rows.filter((row) => row.entityType === where.entityType);
      if (where?.userId) rows = rows.filter((row) => row.userId === where.userId);
      if (where?.branchCode) rows = rows.filter((row) => row.branchCode === where.branchCode);
      if (where?.createdAt?.gte) {
        rows = rows.filter((row) => row.createdAt >= where.createdAt.gte);
      }
      if (where?.createdAt?.lte) {
        rows = rows.filter((row) => row.createdAt <= where.createdAt.lte);
      }
      if (where?.createdAt?.lt) {
        rows = rows.filter((row) => row.createdAt < where.createdAt.lt);
      }
      if (orderBy?.createdAt === "desc") {
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return typeof take === "number" ? rows.slice(0, take) : rows;
    },
    async count({ where }: any) {
      const rows = await prismaMock.auditLog.findMany({ where });
      return rows.length;
    },
    async deleteMany({ where }: any) {
      const toDelete = new Set(
        (await prismaMock.auditLog.findMany({ where })).map((row: any) => row.id)
      );
      const before = auditLogs.length;
      for (let i = auditLogs.length - 1; i >= 0; i -= 1) {
        if (toDelete.has(auditLogs[i].id)) {
          auditLogs.splice(i, 1);
        }
      }
      return { count: before - auditLogs.length };
    },
    async create({ data }: any) {
      const created = {
        id: `log-${auditLogs.length + 1}`,
        userId: data.userId ?? null,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId ?? null,
        businessDate: data.businessDate ?? null,
        branchCode: data.branchCode ?? null,
        metadata: data.metadata ?? null,
        createdAt: new Date()
      };
      auditLogs.push(created);
      return created;
    },
    async findFirst({ where, orderBy }: any) {
      const rows = await prismaMock.auditLog.findMany({
        where,
        orderBy,
        take: 1
      });
      return rows[0] ?? null;
    }
  },
  branch: {
    async findUnique({ where }: any) {
      return branches.get(where.branchCode) ?? null;
    },
    async upsert({ where, create, update }: any) {
      const existing = branches.get(where.branchCode);
      if (existing) {
        const next = { ...existing, ...update };
        branches.set(where.branchCode, next);
        return next;
      }
      branches.set(where.branchCode, create);
      return create;
    }
  },
  dayCycle: {
    async upsert() {
      return {
        businessDate: new Date("2026-02-07T00:00:00.000Z"),
        state: "CLOSED",
        branchesLoaded: 0,
        totalAccountsLoaded: 0,
        ledgerRecordCount: 0
      };
    }
  }
};

vi.mock("../src/db", () => ({
  default: prismaMock
}));

vi.mock("../src/auth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireRole:
    () =>
    (req: any, _res: any, next: any) => {
      if (!req.session) req.session = {};
      req.session.user = {
        id: "admin-1",
        role: "ADMIN",
        branchCode: null,
        status: "ACTIVE"
      };
      next();
    }
}));

async function createTestApp() {
  const { createApp } = await import("../src/app");
  return createApp();
}

describe("admin API", () => {
  beforeEach(() => {
    users.clear();
    branches.clear();
    auditLogs.length = 0;
    branches.set("0001", { branchCode: "0001", branchName: "Main", status: "ACTIVE" });
    users.set("admin-1", {
      id: "admin-1",
      fullName: "Admin One",
      employeeId: "100",
      username: "admin1",
      passwordHash: "hash1",
      role: "ADMIN",
      status: "ACTIVE",
      branchCode: null,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: new Date()
    });
    users.set("user-1", {
      id: "user-1",
      fullName: "Teller One",
      employeeId: "200",
      username: "teller1",
      passwordHash: "hash2",
      role: "TELLER",
      status: "ACTIVE",
      branchCode: "0001",
      failedLoginCount: 4,
      lockedUntil: new Date(),
      createdAt: new Date()
    });
    auditLogs.push(
      {
        id: "log-1",
        userId: "admin-1",
        action: "DAY_OPEN",
        entityType: "DAY_CYCLE",
        entityId: "2026-02-07",
        businessDate: new Date("2026-02-07T00:00:00.000Z"),
        branchCode: null,
        metadata: { fromState: "LOADING", toState: "OPEN" },
        createdAt: new Date("2026-02-07T07:00:00.000Z")
      },
      {
        id: "log-2",
        userId: "user-1",
        action: "TRANSACTION_CREATE",
        entityType: "TRANSACTION",
        entityId: "TXN-0726-20260207-000001",
        businessDate: new Date("2026-02-07T00:00:00.000Z"),
        branchCode: "0001",
        metadata: { amount: 10 },
        createdAt: new Date("2026-02-07T08:00:00.000Z")
      }
    );
  });

  it("protects last active admin from demotion", async () => {
    const app = await createTestApp();
    const res = await request(app).patch("/api/admin/users/admin-1").send({
      role: "TELLER",
      branchCode: "0001"
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("LAST_ADMIN_PROTECTED");
  });

  it("unlocks a user account", async () => {
    const app = await createTestApp();
    const res = await request(app).post("/api/admin/users/user-1/unlock").send({});
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("user-1");
    expect(users.get("user-1")?.failedLoginCount).toBe(0);
    expect(users.get("user-1")?.lockedUntil).toBeNull();
  });

  it("filters users by query params", async () => {
    const app = await createTestApp();
    const res = await request(app).get("/api/admin/users?status=ACTIVE&role=TELLER&q=teller");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe("user-1");
  });

  it("requires branch for branch-scoped roles", async () => {
    const app = await createTestApp();
    const res = await request(app).patch("/api/admin/users/user-1").send({
      role: "TELLER",
      clearBranch: true
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("BRANCH_REQUIRED");
  });

  it("resets password and unlocks user", async () => {
    const app = await createTestApp();
    const before = users.get("user-1");
    const res = await request(app).post("/api/admin/users/user-1/reset-password").send({});
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("user-1");
    expect(typeof res.body.temporaryPassword).toBe("string");
    expect(res.body.temporaryPassword.length).toBeGreaterThanOrEqual(8);

    const after = users.get("user-1");
    expect(after?.failedLoginCount).toBe(0);
    expect(after?.lockedUntil).toBeNull();
    expect(after?.passwordHash).not.toBe(before?.passwordHash);
  });

  it("returns filtered audit logs with actor info", async () => {
    const app = await createTestApp();
    const res = await request(app).get(
      "/api/admin/audit-logs?action=TRANSACTION_CREATE&branchCode=0001&from=2026-02-07&to=2026-02-07&limit=10"
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe("log-2");
    expect(res.body[0].actor.username).toBe("teller1");
  });

  it("exports filtered audit logs as CSV", async () => {
    const app = await createTestApp();
    const res = await request(app).get(
      "/api/admin/audit-logs/export?action=TRANSACTION_CREATE&branchCode=0001&limit=10"
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("BT_AUDIT_LOGS_");
    expect(res.text).toContain("metadata_json");
    expect(res.text).toContain("TRANSACTION_CREATE");
    expect(res.text).not.toContain("DAY_OPEN");
  });

  it("runs retention dry-run and execute modes", async () => {
    const app = await createTestApp();

    const dry = await request(app).post("/api/admin/audit-logs/retention/run").send({
      beforeDate: "2026-02-08",
      dryRun: true
    });
    expect(dry.status).toBe(200);
    expect(dry.body.dryRun).toBe(true);
    expect(dry.body.matched).toBeGreaterThanOrEqual(2);
    expect(dry.body.deleted).toBe(0);

    const execute = await request(app).post("/api/admin/audit-logs/retention/run").send({
      beforeDate: "2026-02-08",
      dryRun: false
    });
    expect(execute.status).toBe(200);
    expect(execute.body.dryRun).toBe(false);
    expect(execute.body.deleted).toBeGreaterThanOrEqual(2);
  });

  it("returns retention policy from environment", async () => {
    process.env.AUDIT_RETENTION_ENABLED = "true";
    process.env.AUDIT_RETENTION_INTERVAL_HOURS = "12";
    process.env.AUDIT_RETENTION_OLDER_THAN_DAYS = "2000";
    process.env.AUDIT_RETENTION_DRY_RUN = "false";
    process.env.AUDIT_RETENTION_ARCHIVE_DIR = "/tmp/audit-archive";

    const app = await createTestApp();
    const res = await request(app).get("/api/admin/audit-logs/retention/policy");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      enabled: true,
      intervalHours: 12,
      olderThanDays: 2000,
      dryRun: false,
      archiveDir: "/tmp/audit-archive"
    });
  });

  it("returns retention run history", async () => {
    const app = await createTestApp();
    const runRes = await request(app).post("/api/admin/audit-logs/retention/run").send({
      beforeDate: "2026-02-08",
      dryRun: true
    });
    expect(runRes.status).toBe(200);

    const historyRes = await request(app).get("/api/admin/audit-logs/retention/history?limit=5");
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.length).toBeGreaterThanOrEqual(1);
    expect(historyRes.body[0]).toMatchObject({
      source: "MANUAL",
      dryRun: true
    });
  });

  it("returns retention status with policy and latest run", async () => {
    process.env.AUDIT_RETENTION_ENABLED = "true";
    process.env.AUDIT_RETENTION_INTERVAL_HOURS = "24";
    process.env.AUDIT_RETENTION_OLDER_THAN_DAYS = "2555";
    process.env.AUDIT_RETENTION_DRY_RUN = "true";
    process.env.AUDIT_RETENTION_ARCHIVE_DIR = "";

    const app = await createTestApp();
    await request(app).post("/api/admin/audit-logs/retention/run").send({
      beforeDate: "2026-02-08",
      dryRun: true
    });

    const statusRes = await request(app).get("/api/admin/audit-logs/retention/status");
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.policy.enabled).toBe(true);
    expect(statusRes.body.lastRun).toBeTruthy();
    expect(statusRes.body.lastRun.source).toBe("MANUAL");
    expect(statusRes.body.lastError).toBeNull();
  });

  it("evaluates recovery RPO/RTO targets", async () => {
    const app = await createTestApp();
    const res = await request(app).post("/api/admin/ops/recovery-evaluate").send({
      backupCompletedAt: "2026-02-08T09:00:00.000Z",
      restorePointAt: "2026-02-08T08:40:00.000Z",
      restoreCompletedAt: "2026-02-08T09:20:00.000Z",
      targetRpoMinutes: 60,
      targetRtoMinutes: 30
    });

    expect(res.status).toBe(200);
    expect(res.body.measured.rpoMinutes).toBe(20);
    expect(res.body.measured.rtoMinutes).toBe(20);
    expect(res.body.pass.rpo).toBe(true);
    expect(res.body.pass.rto).toBe(true);
    expect(res.body.overallPass).toBe(true);
  });

  it("imports branch managers from xlsx file", async () => {
    const app = await createTestApp();

    const worksheet = XLSX.utils.aoa_to_sheet([
      ["A", "B", "C", "D", "", "", "", "", "I", "J", "K", "L"],
      ["aa", "11", "Dana", "Levi", "", "", "", "", 72600, "Tel Aviv", "", ""]
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const fileBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const res = await request(app)
      .post("/api/admin/users/import-branch-managers")
      .attach("file", fileBuffer, {
        filename: "branch_managers.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      totalRows: 1,
      created: 1,
      updated: 0
    });
    const imported = [...users.values()].find((u) => u.username === "aa11@dbank.co.il");
    expect(imported).toBeTruthy();
    expect(imported?.role).toBe("BRANCH_MANAGER");
    expect(imported?.branchCode).toBe("0726");
    expect(branches.get("0726")?.branchName).toBe("Tel Aviv");
  });
});
