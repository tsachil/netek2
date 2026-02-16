import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import JSZip from "jszip";

type DayRecord = {
  businessDate: Date;
  state: "CLOSED" | "LOADING" | "OPEN" | "CLOSING" | "RECONCILING";
  openedAt: Date | null;
  closedAt: Date | null;
  openedById: string | null;
  closedById: string | null;
  branchesLoaded: number;
  totalAccountsLoaded: number;
  ledgerRecordCount: number;
};

const dayStore = new Map<number, DayRecord>();
const accountStore = new Map<string, { branchCode: string; loadedDate: Date }>();
const auditStore: Array<{ action: string; entityType: string; userId: string | null }> = [];

function dayDefaults(businessDate: Date): DayRecord {
  return {
    businessDate,
    state: "CLOSED",
    openedAt: null,
    closedAt: null,
    openedById: null,
    closedById: null,
    branchesLoaded: 0,
    totalAccountsLoaded: 0,
    ledgerRecordCount: 0
  };
}

function dayKey(date: Date) {
  return date.getTime();
}

function accountKey(accountKeyValue: string, branchCode: string, loadedDate: Date) {
  return `${accountKeyValue}|${branchCode}|${loadedDate.getTime()}`;
}

const prismaMock = {
  dayCycle: {
    async upsert({ where, create, update }: any) {
      const key = dayKey(where.businessDate);
      const existing = dayStore.get(key);
      if (existing) {
        const next = { ...existing, ...update };
        dayStore.set(key, next);
        return next;
      }
      const next = { ...dayDefaults(create.businessDate), ...create };
      dayStore.set(key, next);
      return next;
    },
    async findUnique({ where }: any) {
      return dayStore.get(dayKey(where.businessDate)) ?? null;
    },
    async update({ where, data }: any) {
      const key = dayKey(where.businessDate);
      const existing = dayStore.get(key);
      if (!existing) {
        throw new Error("DAY_NOT_FOUND");
      }
      const next = { ...existing, ...data };
      dayStore.set(key, next);
      return next;
    }
  },
  auditLog: {
    async create({ data }: any) {
      auditStore.push({
        action: data.action,
        entityType: data.entityType,
        userId: data.userId ?? null
      });
      return {
        id: `audit-${auditStore.length}`,
        createdAt: new Date(),
        ...data
      };
    }
  },
  branch: {
    async findUnique({ where }: any) {
      if (where.branchCode === "0726") {
        return { branchCode: "0726" };
      }
      return null;
    }
  },
  account: {
    async upsert({ where, create, update }: any) {
      const key = accountKey(
        where.accountKey_branchCode_loadedDate.accountKey,
        where.accountKey_branchCode_loadedDate.branchCode,
        where.accountKey_branchCode_loadedDate.loadedDate
      );
      const existing = accountStore.get(key);
      if (existing) {
        const merged = { ...existing, ...update };
        accountStore.set(key, merged);
        return merged;
      }
      accountStore.set(key, create);
      return create;
    },
    async findMany({ where, distinct }: any) {
      if (distinct?.[0] === "branchCode") {
        const branchSet = new Set<string>();
        for (const row of accountStore.values()) {
          if (row.loadedDate.getTime() === where.loadedDate.getTime()) {
            branchSet.add(row.branchCode);
          }
        }
        return [...branchSet].map((branchCode) => ({ branchCode }));
      }
      return [];
    },
    async findFirst({ where }: any) {
      for (const row of accountStore.values()) {
        if (
          row.loadedDate.getTime() === where.loadedDate.getTime() &&
          row.branchCode === where.branchCode
        ) {
          return { id: "acc-1" };
        }
      }
      return null;
    },
    async count({ where }: any) {
      let count = 0;
      for (const row of accountStore.values()) {
        if (row.loadedDate.getTime() === where.loadedDate.getTime()) {
          count += 1;
        }
      }
      return count;
    }
  },
  async $transaction(arg: any) {
    if (typeof arg === "function") {
      return arg(prismaMock as any);
    }
    return Promise.all(arg);
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
        id: "admin-user",
        role: "ADMIN",
        branchCode: null,
        status: "ACTIVE"
      };
      next();
    }
}));

async function startServer() {
  const { createApp } = await import("../src/app");
  return createApp();
}

async function postJson(app: any, path: string, body: unknown) {
  const res = await request(app).post(path).send(body);
  return { status: res.status, data: res.body };
}

async function getPath(app: any, path: string) {
  const res = await request(app).get(path);
  return { status: res.status, data: res.body, headers: res.headers, text: res.text, body: res.body };
}

async function getBinaryPath(app: any, path: string) {
  const res = await request(app)
    .get(path)
    .buffer(true)
    .parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => callback(null, Buffer.concat(chunks)));
    });
  return { status: res.status, headers: res.headers, body: res.body as Buffer };
}

function buildValidBcpCsv() {
  return [
    "חן קלע,חן אופק,שם חשבון,חסימות קודי פעולה,יתרת עו\"ש נוכחית,יתרת עו\"ש מעוכבת,יתרת חשבונות נספחים עו\"ש מט\"ח,הלוואות,פקדונות,תוכניות חסכון,ניירות ערך,ערבויות,עיקולים,שיעבודים,מחזור חובה שנתי,סך קווי אשראי,חיוב ויזה קרוב,חוב ויזה,סמנים",
    "123456,123456789012,דניאל לוי,,12543.78,0,250.00,0,50000,12000,34500,0,0,0,180000,75000,2300,4500,T1"
  ].join("\n");
}

async function uploadBcp(app: any) {
  const res = await request(app)
    .post("/api/bcp/upload")
    .attach("file", Buffer.from(buildValidBcpCsv(), "utf-8"), {
      filename: "BCP_REPORT_SNIF0726.csv",
      contentType: "text/csv"
    });
  return { status: res.status, data: res.body };
}

describe("day API integration flow", () => {
  let app: any;

  beforeEach(async () => {
    dayStore.clear();
    accountStore.clear();
    auditStore.length = 0;
    app = await startServer();
  });

  afterEach(async () => {});

  it("runs full day close completion flow after BCP load", async () => {
    const openWithoutLoad = await postJson(app, "/api/day/open", {});
    expect(openWithoutLoad.status).toBe(409);
    expect(openWithoutLoad.data.error).toBe("INVALID_DAY_TRANSITION");

    const upload = await uploadBcp(app);
    expect(upload.status).toBe(200);
    expect(upload.data.rows).toBe(1);

    const open = await postJson(app, "/api/day/open", {});
    expect(open.status).toBe(200);
    expect(open.data.state).toBe("OPEN");

    const close = await postJson(app, "/api/day/close", {});
    expect(close.status).toBe(200);
    expect(close.data.state).toBe("CLOSING");

    const reconcile = await postJson(app, "/api/day/reconcile", {});
    expect(reconcile.status).toBe(200);
    expect(reconcile.data.state).toBe("RECONCILING");

    const confirmClose = await postJson(app, "/api/day/close/confirm", {});
    expect(confirmClose.status).toBe(200);
    expect(confirmClose.data.state).toBe("CLOSED");
    expect(confirmClose.data.totalAccountsLoaded).toBe(1);
    expect(auditStore.map((entry) => entry.action)).toEqual([
      "DAY_OPEN",
      "DAY_CLOSE_INIT",
      "DAY_RECONCILE_START",
      "DAY_CLOSE_CONFIRM"
    ]);
  });

  it("rejects BCP upload when business day is OPEN", async () => {
    await uploadBcp(app);
    await postJson(app, "/api/day/open", {});

    const blockedUpload = await uploadBcp(app);
    expect(blockedUpload.status).toBe(409);
    expect(blockedUpload.data.error).toBe("DAY_NOT_LOADABLE");
    expect(blockedUpload.data.state).toBe("OPEN");
  });

  it("returns branch and zip ledger downloads after load", async () => {
    await uploadBcp(app);

    const branchList = await getPath(app, "/api/ledger/branches");
    expect(branchList.status).toBe(200);
    expect(branchList.data.branches).toEqual(["0726"]);

    const branchLedger = await getPath(app, "/api/ledger/branch/0726");
    expect(branchLedger.status).toBe(200);
    expect(branchLedger.headers["content-type"]).toContain("text/csv");
    const branchDisposition = String(branchLedger.headers["content-disposition"] ?? "");
    expect(branchDisposition).toMatch(/BT_LEDGER_SNIF0726_(\d{8})\.csv/);
    const dateStampMatch = branchDisposition.match(/BT_LEDGER_SNIF0726_(\d{8})\.csv/);
    const dateStamp = dateStampMatch?.[1];
    expect(dateStamp).toBeTruthy();
    expect(branchLedger.text).toContain("transaction_id");
    expect(branchLedger.text).toContain("SUMMARY");

    const allLedgers = await getBinaryPath(app, "/api/ledger/all");
    expect(allLedgers.status).toBe(200);
    expect(allLedgers.headers["content-type"]).toContain("application/zip");
    expect(allLedgers.headers["content-disposition"]).toContain(`BT_LEDGER_ALL_${dateStamp}.zip`);

    const zip = await JSZip.loadAsync(allLedgers.body);
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual([`BT_LEDGER_SNIF0726_${dateStamp}.csv`]);
    const csvContent = await zip.file(names[0])!.async("string");
    expect(csvContent).toContain("transaction_id,business_date,branch_code");
    expect(csvContent).toContain("SUMMARY");
  });
});
