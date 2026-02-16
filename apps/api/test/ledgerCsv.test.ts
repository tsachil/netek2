import { describe, expect, it } from "vitest";
import { formatBusinessDate, generateLedgerCsv } from "../src/ledgerCsv";

describe("ledger csv", () => {
  it("formats business date for file names", () => {
    expect(formatBusinessDate(new Date("2026-02-07T00:00:00.000Z"))).toBe("20260207");
  });

  it("generates csv with summary row", () => {
    const csv = generateLedgerCsv("0726", new Date("2026-02-07T00:00:00.000Z"));
    expect(csv.startsWith("\uFEFFtransaction_id")).toBe(true);
    expect(csv).toContain("SUMMARY");
    expect(csv).toContain("0726");
  });
});
