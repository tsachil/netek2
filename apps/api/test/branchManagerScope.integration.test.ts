import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

type MockAccount = {
  id: string;
  accountKey: string;
  fullAccountNumber: string;
  accountName: string;
  branchCode: string;
  currentBalance: number;
  heldBalance: number;
  liens: number;
  openingBalance: number;
  operationRestrictions: string | null;
  markers: string | null;
  version: number;
  loadedDate: Date;
};

const accounts = new Map<string, MockAccount>();

function accountCompositeKey(accountKey: string, branchCode: string, loadedDate: Date) {
  return `${accountKey}|${branchCode}|${loadedDate.getTime()}`;
}

const prismaMock = {
  branch: {
    async findMany() {
      return [
        { branchCode: "0726", branchName: "תל אביב", status: "ACTIVE" },
        { branchCode: "0001", branchName: "ראשי", status: "ACTIVE" }
      ];
    }
  },
  account: {
    async findMany({ where }: any) {
      const query = String(where.OR?.[0]?.accountName?.contains ?? "").toLowerCase();
      return [...accounts.values()]
        .filter((account) => {
          if (where.loadedDate && account.loadedDate.getTime() !== where.loadedDate.getTime()) return false;
          if (where.branchCode && account.branchCode !== where.branchCode) return false;
          if (!query) return true;
          return (
            account.accountName.toLowerCase().includes(query) ||
            account.accountKey.toLowerCase().includes(query) ||
            account.fullAccountNumber.toLowerCase().includes(query)
          );
        })
        .map((account) => ({
          id: account.id,
          accountKey: account.accountKey,
          fullAccountNumber: account.fullAccountNumber,
          accountName: account.accountName,
          currentBalance: account.currentBalance,
          operationRestrictions: account.operationRestrictions,
          liens: account.liens,
          markers: account.markers,
          version: account.version,
          branchCode: account.branchCode
        }));
    },
    async findUnique({ where }: any) {
      if (!where.accountKey_branchCode_loadedDate) return null;
      const key = accountCompositeKey(
        where.accountKey_branchCode_loadedDate.accountKey,
        where.accountKey_branchCode_loadedDate.branchCode,
        where.accountKey_branchCode_loadedDate.loadedDate
      );
      return accounts.get(key) ?? null;
    }
  },
  transaction: {
    async findMany() {
      return [];
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
        id: "bm-1",
        role: "BRANCH_MANAGER",
        branchCode: "0726",
        status: "ACTIVE"
      };
      next();
    }
}));

async function createTestApp() {
  const { createApp } = await import("../src/app");
  return createApp();
}

describe("branch manager scope", () => {
  beforeEach(() => {
    accounts.clear();
    const loadedDate = new Date();
    loadedDate.setHours(0, 0, 0, 0);

    const accountA: MockAccount = {
      id: "acc-a",
      accountKey: "123456",
      fullAccountNumber: "0726-000123456",
      accountName: "Account A",
      branchCode: "0726",
      currentBalance: 100,
      heldBalance: 0,
      liens: 0,
      openingBalance: 100,
      operationRestrictions: null,
      markers: null,
      version: 1,
      loadedDate
    };
    const accountB: MockAccount = {
      id: "acc-b",
      accountKey: "654321",
      fullAccountNumber: "0001-000654321",
      accountName: "Account B",
      branchCode: "0001",
      currentBalance: 250,
      heldBalance: 0,
      liens: 0,
      openingBalance: 250,
      operationRestrictions: null,
      markers: null,
      version: 1,
      loadedDate
    };

    accounts.set(accountCompositeKey(accountA.accountKey, accountA.branchCode, loadedDate), accountA);
    accounts.set(accountCompositeKey(accountB.accountKey, accountB.branchCode, loadedDate), accountB);
  });

  it("allows branch manager to list branches", async () => {
    const app = await createTestApp();
    const res = await request(app).get("/api/branches");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((row: any) => row.branchCode).sort()).toEqual(["0001", "0726"]);
  });

  it("allows branch manager to search selected branch", async () => {
    const app = await createTestApp();
    const res = await request(app).get("/api/accounts/search?q=account&branchCode=0001");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].branchCode).toBe("0001");
    expect(res.body[0].accountKey).toBe("654321");
  });

  it("loads account detail for selected branch", async () => {
    const app = await createTestApp();
    const res = await request(app).get("/api/accounts/654321?branchCode=0001");
    expect(res.status).toBe(200);
    expect(res.body.account.branchCode).toBe("0001");
    expect(res.body.account.accountKey).toBe("654321");
  });
});
