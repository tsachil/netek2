import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { DayState, TransactionStatus, TransactionType } from "@prisma/client";

type MockAccount = {
  id: string;
  accountKey: string;
  branchCode: string;
  loadedDate: Date;
  currentBalance: number;
  version: number;
  operationRestrictions: string | null;
  liens: number;
};

type MockTransaction = {
  id: string;
  transactionId: string;
  businessDate: Date;
  branchCode: string;
  accountId: string;
  accountKey: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  status: TransactionStatus;
  voidReference: string | null;
  tellerUserId: string;
  referenceNote: string | null;
  createdAt: Date;
};

const accounts = new Map<string, MockAccount>();
const transactions = new Map<string, MockTransaction>();
const audits: Array<{
  action: string;
  entityId: string | null;
  userId: string | null;
  branchCode: string | null;
  businessDate: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}> = [];
let dayState: DayState = DayState.OPEN;
const sessionUser = {
  id: "teller-1",
  role: "TELLER",
  branchCode: "0726",
  status: "ACTIVE"
};

function accountCompositeKey(accountKey: string, branchCode: string, loadedDate: Date) {
  return `${accountKey}|${branchCode}|${loadedDate.getTime()}`;
}

const prismaMock = {
  dayCycle: {
    async findUnique() {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return { businessDate: d, state: dayState };
    }
  },
  account: {
    async findUnique({ where }: any) {
      if (where.id) {
        return [...accounts.values()].find((a) => a.id === where.id) ?? null;
      }
      if (where.accountKey_branchCode_loadedDate) {
        const key = accountCompositeKey(
          where.accountKey_branchCode_loadedDate.accountKey,
          where.accountKey_branchCode_loadedDate.branchCode,
          where.accountKey_branchCode_loadedDate.loadedDate
        );
        return accounts.get(key) ?? null;
      }
      return null;
    },
    async update({ where, data }: any) {
      const account = [...accounts.values()].find((a) => a.id === where.id);
      if (!account) throw new Error("NOT_FOUND");
      account.currentBalance = Number(data.currentBalance ?? account.currentBalance);
      if (data.version?.increment) account.version += Number(data.version.increment);
      return account;
    }
  },
  transaction: {
    async count({ where }: any) {
      return [...transactions.values()].filter(
        (t) =>
          t.branchCode === where.branchCode &&
          t.businessDate.getTime() === where.businessDate.getTime()
      ).length;
    },
    async create({ data }: any) {
      const id = `tx-${transactions.size + 1}`;
      const created: MockTransaction = {
        id,
        transactionId: data.transactionId,
        businessDate: data.businessDate,
        branchCode: data.branchCode,
        accountId: data.accountId,
        accountKey: data.accountKey,
        type: data.type,
        amount: Number(data.amount),
        balanceBefore: Number(data.balanceBefore),
        balanceAfter: Number(data.balanceAfter),
        status: data.status,
        voidReference: data.voidReference ?? null,
        tellerUserId: data.tellerUserId,
        referenceNote: data.referenceNote ?? null,
        createdAt: new Date()
      };
      transactions.set(created.transactionId, created);
      return created;
    },
    async findUnique({ where }: any) {
      if (where.transactionId) return transactions.get(where.transactionId) ?? null;
      if (where.id) return [...transactions.values()].find((t) => t.id === where.id) ?? null;
      return null;
    },
    async update({ where, data }: any) {
      const existing = [...transactions.values()].find((t) => t.id === where.id);
      if (!existing) throw new Error("NOT_FOUND");
      existing.status = data.status ?? existing.status;
      existing.voidReference = data.voidReference ?? existing.voidReference;
      return existing;
    },
    async findMany({ where }: any = {}) {
      const all = [...transactions.values()];
      if (!where) return all;
      return all.filter((t) => {
        if (where.branchCode && t.branchCode !== where.branchCode) return false;
        if (where.tellerUserId && t.tellerUserId !== where.tellerUserId) return false;
        if (where.businessDate && t.businessDate.getTime() !== where.businessDate.getTime()) return false;
        if (where.accountId && t.accountId !== where.accountId) return false;
        return true;
      });
    }
  },
  user: {
    async findMany({ where }: any = {}) {
      const tellers = [
        {
          id: "teller-1",
          fullName: "Teller One",
          username: "teller1",
          branchCode: "0726",
          role: "TELLER",
          status: "ACTIVE"
        },
        {
          id: "teller-2",
          fullName: "Teller Two",
          username: "teller2",
          branchCode: "0726",
          role: "TELLER",
          status: "ACTIVE"
        }
      ];
      return tellers
        .filter((u) => !where?.role || u.role === where.role)
        .filter((u) => !where?.branchCode || u.branchCode === where.branchCode)
        .map(({ id, fullName, username, branchCode }) => ({
          id,
          fullName,
          username,
          branchCode
        }));
    }
  },
  auditLog: {
    async create({ data }: any) {
      audits.push({
        action: data.action,
        entityId: data.entityId ?? null,
        userId: data.userId ?? null,
        branchCode: data.branchCode ?? null,
        businessDate: data.businessDate ?? null,
        metadata: data.metadata ?? null,
        createdAt: new Date()
      });
      return {
        id: `audit-${audits.length}`,
        createdAt: audits[audits.length - 1].createdAt,
        ...data
      };
    },
    async findMany({ where, orderBy, take }: any) {
      let rows = audits.filter((a) => {
        if (where?.action && a.action !== where.action) return false;
        if (where?.userId && a.userId !== where.userId) return false;
        if (where?.branchCode && a.branchCode !== where.branchCode) return false;
        if (where?.businessDate && a.businessDate?.getTime() !== where.businessDate.getTime()) return false;
        return true;
      });
      if (orderBy?.createdAt === "desc") {
        rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      if (typeof take === "number") {
        rows = rows.slice(0, take);
      }
      return rows;
    }
  },
  async $transaction(fn: any) {
    return fn(prismaMock as any);
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
      req.session.user = { ...sessionUser };
      next();
    }
}));

async function createTestApp() {
  const { createApp } = await import("../src/app");
  return createApp();
}

describe("transactions API", () => {
  beforeEach(() => {
    accounts.clear();
    transactions.clear();
    audits.length = 0;
    dayState = DayState.OPEN;
    sessionUser.id = "teller-1";
    sessionUser.role = "TELLER";
    sessionUser.branchCode = "0726";
    sessionUser.status = "ACTIVE";
    const loadedDate = new Date();
    loadedDate.setHours(0, 0, 0, 0);
    const account: MockAccount = {
      id: "acc-1",
      accountKey: "123456",
      branchCode: "0726",
      loadedDate,
      currentBalance: 100,
      version: 1,
      operationRestrictions: null,
      liens: 0
    };
    accounts.set(accountCompositeKey(account.accountKey, account.branchCode, loadedDate), account);
  });

  it("creates deposit transaction and updates balance", async () => {
    const app = await createTestApp();
    const res = await request(app).post("/api/transactions").send({
      accountKey: "123456",
      type: "DEPOSIT",
      amount: 25
    });
    expect(res.status).toBe(201);
    expect(res.body.transaction.type).toBe("DEPOSIT");
    expect(res.body.account.currentBalance).toBe(125);
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe("TRANSACTION_CREATE");
    expect(audits[0].entityId).toBe(res.body.transaction.transactionId);
  });

  it("blocks withdrawal on insufficient funds", async () => {
    const app = await createTestApp();
    const res = await request(app).post("/api/transactions").send({
      accountKey: "123456",
      type: "WITHDRAWAL",
      amount: 1000
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("INSUFFICIENT_FUNDS");
  });

  it("blocks withdrawal when restrictions exist", async () => {
    const loadedDate = new Date();
    loadedDate.setHours(0, 0, 0, 0);
    const key = accountCompositeKey("123456", "0726", loadedDate);
    const account = accounts.get(key)!;
    account.operationRestrictions = "R1";
    const app = await createTestApp();
    const res = await request(app).post("/api/transactions").send({
      accountKey: "123456",
      type: "WITHDRAWAL",
      amount: 10
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe("WITHDRAWAL_BLOCKED");
  });

  it("voids same-day transaction and writes audit entry", async () => {
    const app = await createTestApp();
    const createRes = await request(app).post("/api/transactions").send({
      accountKey: "123456",
      type: "DEPOSIT",
      amount: 15
    });
    expect(createRes.status).toBe(201);

    const voidRes = await request(app)
      .post(`/api/transactions/${createRes.body.transaction.transactionId}/void`)
      .send({});
    expect(voidRes.status).toBe(200);
    expect(voidRes.body.transaction.type).toBe("WITHDRAWAL");
    expect(audits.map((entry) => entry.action)).toEqual([
      "TRANSACTION_CREATE",
      "TRANSACTION_VOID"
    ]);
  });

  it("submits teller handoff during closing", async () => {
    const app = await createTestApp();
    await request(app).post("/api/transactions").send({
      accountKey: "123456",
      type: "DEPOSIT",
      amount: 40
    });
    await request(app).post("/api/transactions").send({
      accountKey: "123456",
      type: "WITHDRAWAL",
      amount: 10
    });

    dayState = DayState.CLOSING;
    const res = await request(app).post("/api/reconciliation/handoff").send({
      declaredNet: 25,
      note: "drawer count mismatch"
    });

    expect(res.status).toBe(200);
    expect(res.body.computedNet).toBe(30);
    expect(res.body.discrepancy).toBe(-5);
    expect(audits.some((entry) => entry.action === "TELLER_HANDOFF_SUBMIT")).toBe(true);
  });

  it("blocks teller handoff submission before day close", async () => {
    const app = await createTestApp();
    const res = await request(app).post("/api/reconciliation/handoff").send({
      declaredNet: 0
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("DAY_NOT_CLOSING");
  });

  it("returns teller reconciliation summary with latest handoff", async () => {
    const app = await createTestApp();
    await request(app).post("/api/transactions").send({
      accountKey: "123456",
      type: "DEPOSIT",
      amount: 20
    });
    dayState = DayState.CLOSING;
    await request(app).post("/api/reconciliation/handoff").send({
      declaredNet: 20
    });

    const res = await request(app).get("/api/reconciliation/summary");
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("TELLER");
    expect(res.body.totals.net).toBe(20);
    expect(res.body.handoff).toMatchObject({
      declaredNet: 20,
      discrepancy: 0
    });
  });

  it("returns branch handoff reconciliation for branch manager", async () => {
    const app = await createTestApp();
    await request(app).post("/api/transactions").send({
      accountKey: "123456",
      type: "DEPOSIT",
      amount: 50
    });
    dayState = DayState.CLOSING;
    await request(app).post("/api/reconciliation/handoff").send({
      declaredNet: 45
    });

    sessionUser.id = "bm-1";
    sessionUser.role = "BRANCH_MANAGER";
    sessionUser.branchCode = "0726";

    const res = await request(app).get("/api/reconciliation/branch-handoff");
    expect(res.status).toBe(200);
    expect(res.body.tellers).toHaveLength(2);
    const tellerOne = res.body.tellers.find((t: any) => t.tellerUserId === "teller-1");
    expect(tellerOne).toBeTruthy();
    expect(tellerOne.totals.net).toBe(50);
    expect(tellerOne.handoff).toMatchObject({
      declaredNet: 45,
      discrepancy: -5
    });
  });
});
