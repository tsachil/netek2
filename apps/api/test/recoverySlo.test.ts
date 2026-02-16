import { describe, expect, it } from "vitest";
import { evaluateRecoverySlo } from "../src/recoverySlo";

describe("recoverySlo", () => {
  it("computes RPO/RTO and pass flags", () => {
    const result = evaluateRecoverySlo({
      backupCompletedAt: "2026-02-08T09:00:00.000Z",
      restorePointAt: "2026-02-08T08:30:00.000Z",
      restoreCompletedAt: "2026-02-08T09:20:00.000Z",
      targetRpoMinutes: 60,
      targetRtoMinutes: 30
    });

    expect(result.measured.rpoMinutes).toBe(30);
    expect(result.measured.rtoMinutes).toBe(20);
    expect(result.pass.rpo).toBe(true);
    expect(result.pass.rto).toBe(true);
    expect(result.overallPass).toBe(true);
  });

  it("fails when sequence is invalid", () => {
    expect(() =>
      evaluateRecoverySlo({
        backupCompletedAt: "2026-02-08T08:00:00.000Z",
        restorePointAt: "2026-02-08T09:00:00.000Z",
        restoreCompletedAt: "2026-02-08T09:20:00.000Z",
        targetRpoMinutes: 60,
        targetRtoMinutes: 30
      })
    ).toThrow("INVALID_SEQUENCE_RPO_NEGATIVE");
  });
});
