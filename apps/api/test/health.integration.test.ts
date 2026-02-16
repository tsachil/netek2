import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import session from "express-session";

const queryRawMock = vi.fn();

vi.mock("../src/db", () => ({
  default: {
    $queryRaw: (...args: unknown[]) => queryRawMock(...args)
  }
}));

class HealthySessionStore extends session.Store {
  private readonly data = new Map<string, session.SessionData>();

  override get(sid: string, callback: (err?: any, session?: session.SessionData | null) => void): void {
    callback(undefined, this.data.get(sid) ?? null);
  }

  override set(
    sid: string,
    value: session.SessionData,
    callback?: (err?: any) => void
  ): void {
    this.data.set(sid, value);
    callback?.();
  }

  override destroy(sid: string, callback?: (err?: any) => void): void {
    this.data.delete(sid);
    callback?.();
  }
}

class FailingSessionStore extends session.Store {
  override get(_sid: string, callback: (err?: any, session?: session.SessionData | null) => void): void {
    callback(undefined, null);
  }

  override set(
    _sid: string,
    _value: session.SessionData,
    callback?: (err?: any) => void
  ): void {
    callback?.(new Error("SESSION_WRITE_FAILED"));
  }

  override destroy(_sid: string, callback?: (err?: any) => void): void {
    callback?.();
  }
}

class ReadbackFailSessionStore extends session.Store {
  override get(_sid: string, callback: (err?: any, session?: session.SessionData | null) => void): void {
    callback(undefined, null);
  }

  override set(
    _sid: string,
    _value: session.SessionData,
    callback?: (err?: any) => void
  ): void {
    callback?.();
  }

  override destroy(_sid: string, callback?: (err?: any) => void): void {
    callback?.();
  }
}

async function createTestApp(store?: session.Store) {
  const { createApp } = await import("../src/app");
  return createApp(store);
}

describe("health readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryRawMock.mockResolvedValue([{ "?column?": 1 }]);
  });

  it("returns ready when db and session store are healthy", async () => {
    const app = await createTestApp(new HealthySessionStore());
    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.checks.database.healthy).toBe(true);
    expect(res.body.checks.sessionStore.healthy).toBe(true);
    expect(res.body.checks.sessionStore.mode).toBe("configured");
  });

  it("returns not_ready when db probe fails", async () => {
    queryRawMock.mockRejectedValueOnce(new Error("DB_DOWN"));
    const app = await createTestApp(new HealthySessionStore());
    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
    expect(res.body.checks.database.healthy).toBe(false);
    expect(res.body.checks.database.error).toContain("DB_DOWN");
  });

  it("returns not_ready when session store probe fails", async () => {
    const app = await createTestApp(new FailingSessionStore());
    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
    expect(res.body.checks.database.healthy).toBe(true);
    expect(res.body.checks.sessionStore.healthy).toBe(false);
    expect(res.body.checks.sessionStore.error).toContain("SESSION_WRITE_FAILED");
  });

  it("returns not_ready when session readback probe fails", async () => {
    const app = await createTestApp(new ReadbackFailSessionStore());
    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("not_ready");
    expect(res.body.checks.database.healthy).toBe(true);
    expect(res.body.checks.sessionStore.healthy).toBe(false);
    expect(res.body.checks.sessionStore.error).toContain("SESSION_STORE_READBACK_FAILED");
  });
});
