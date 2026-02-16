import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const findManyMock = vi.fn();
const countMock = vi.fn();
const userFindManyMock = vi.fn();

const prismaMock = {
  transaction: {
    findMany: (...args: unknown[]) => findManyMock(...args),
    count: (...args: unknown[]) => countMock(...args)
  },
  user: {
    findMany: (...args: unknown[]) => userFindManyMock(...args)
  }
};

vi.mock("../src/db", () => ({
  default: prismaMock
}));

const sessionUser = {
  id: "admin-1",
  role: "ADMIN",
  branchCode: null,
  status: "ACTIVE"
};

vi.mock("../src/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    if (!req.session) req.session = {};
    req.session.user = { ...sessionUser };
    next();
  },
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

describe("dashboard summary API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUser.id = "admin-1";
    sessionUser.role = "ADMIN";
    sessionUser.branchCode = null;
    userFindManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(1);

    findManyMock.mockImplementation((args: any) => {
      if (typeof args.take === "number") {
        return Promise.resolve([
          {
            transactionId: "TXN-0726-20260207-000001",
            type: "DEPOSIT",
            amount: 100,
            status: "COMPLETED",
            branchCode: "0726",
            accountKey: "123456",
            createdAt: new Date("2026-02-07T10:00:00.000Z")
          }
        ]);
      }
      return Promise.resolve([
        { type: "DEPOSIT", amount: 100, status: "COMPLETED" },
        { type: "WITHDRAWAL", amount: 30, status: "COMPLETED" }
      ]);
    });
  });

  it("returns aggregated totals for admin scope", async () => {
    const app = await createTestApp();
    const res = await request(app).get("/api/dashboard/summary");

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("ADMIN");
    expect(res.body.totals.txCount).toBe(2);
    expect(res.body.totals.deposits).toBe(100);
    expect(res.body.totals.withdrawals).toBe(30);
    expect(res.body.totals.net).toBe(70);
    expect(res.body.recentPage).toBe(1);
    expect(res.body.recentPageSize).toBe(10);
    expect(res.body.recentTotal).toBe(1);
    expect(res.body.recentTotalPages).toBe(1);
    expect(findManyMock).toHaveBeenCalledTimes(2);
    expect(countMock).toHaveBeenCalledTimes(1);
    expect(findManyMock.mock.calls[0][0].where.branchCode).toBeUndefined();
  });

  it("scopes branch manager and teller by branch and teller id", async () => {
    sessionUser.id = "teller-1";
    sessionUser.role = "TELLER";
    sessionUser.branchCode = "0726";

    const app = await createTestApp();
    const res = await request(app).get("/api/dashboard/summary");

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("TELLER");
    expect(findManyMock.mock.calls[0][0].where.branchCode).toBe("0726");
    expect(findManyMock.mock.calls[1][0].where.branchCode).toBe("0726");
    expect(findManyMock.mock.calls[1][0].where.tellerUserId).toBe("teller-1");
    expect(countMock.mock.calls[0][0].where.tellerUserId).toBe("teller-1");
  });

  it("returns branch manager team activity summary", async () => {
    sessionUser.id = "bm-1";
    sessionUser.role = "BRANCH_MANAGER";
    sessionUser.branchCode = "0726";

    findManyMock.mockImplementation((args: any) => {
      if (typeof args.take === "number") {
        return Promise.resolve([]);
      }
      return Promise.resolve([
        {
          type: "DEPOSIT",
          amount: 40,
          status: "COMPLETED",
          tellerUserId: "teller-1",
          createdAt: new Date("2026-02-07T09:00:00.000Z")
        },
        {
          type: "WITHDRAWAL",
          amount: 10,
          status: "COMPLETED",
          tellerUserId: "teller-1",
          createdAt: new Date("2026-02-07T10:00:00.000Z")
        }
      ]);
    });

    userFindManyMock.mockResolvedValue([
      { id: "teller-1", fullName: "Teller One", username: "teller1" },
      { id: "teller-2", fullName: "Teller Two", username: "teller2" }
    ]);

    const app = await createTestApp();
    const res = await request(app).get("/api/dashboard/summary");

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("BRANCH_MANAGER");
    expect(res.body.team).toHaveLength(2);
    expect(res.body.team[0]).toMatchObject({
      tellerUserId: "teller-1",
      txCount: 2
    });
    expect(res.body.team[1]).toMatchObject({
      tellerUserId: "teller-2",
      txCount: 0,
      lastActivityAt: null
    });
    expect(userFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: "TELLER",
          branchCode: "0726"
        })
      })
    );
  });

  it("applies recent filters and paging", async () => {
    countMock.mockResolvedValue(3);
    const app = await createTestApp();
    const res = await request(app).get(
      "/api/dashboard/summary?q=0726&type=deposit&status=completed&page=2&pageSize=2"
    );

    expect(res.status).toBe(200);
    expect(res.body.recentPage).toBe(2);
    expect(res.body.recentPageSize).toBe(2);
    expect(res.body.recentTotal).toBe(3);
    expect(res.body.recentTotalPages).toBe(2);
    expect(findManyMock.mock.calls[1][0]).toMatchObject({
      skip: 2,
      take: 2,
      where: expect.objectContaining({
        type: "DEPOSIT",
        status: "COMPLETED"
      })
    });
    expect(findManyMock.mock.calls[1][0].where.OR).toEqual(
      expect.arrayContaining([
        { transactionId: { contains: "0726", mode: "insensitive" } },
        { accountKey: { contains: "0726", mode: "insensitive" } }
      ])
    );
    expect(countMock.mock.calls[0][0].where.type).toBe("DEPOSIT");
    expect(countMock.mock.calls[0][0].where.status).toBe("COMPLETED");
  });
});
