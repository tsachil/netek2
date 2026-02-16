import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendOpsAlert } from "../src/opsAlerts";

describe("opsAlerts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPS_ALERT_WEBHOOK_URL;
    delete process.env.OPS_ALERT_WEBHOOK_TOKEN;
  });

  it("returns false when webhook is not configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const ok = await sendOpsAlert({
      eventType: "TEST",
      severity: "INFO",
      message: "no webhook",
      source: "test"
    });
    expect(ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts payload to configured webhook", async () => {
    process.env.OPS_ALERT_WEBHOOK_URL = "https://example.com/webhook";
    process.env.OPS_ALERT_WEBHOOK_TOKEN = "secret-token";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true
    } as Response);

    const ok = await sendOpsAlert({
      eventType: "AUDIT_RETENTION_ERROR",
      severity: "ERROR",
      message: "failed",
      source: "auditRetention",
      details: { a: 1 }
    });

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/webhook",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer secret-token"
        }
      })
    );
  });
});
