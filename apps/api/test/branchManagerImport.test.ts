import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseBranchManagerImportWorkbook } from "../src/branchManagerImport";

function buildWorkbookBuffer(rows: unknown[][]) {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("branch manager import parser", () => {
  it("maps requested columns and fallbacks", () => {
    const buffer = buildWorkbookBuffer([
      ["A", "B", "C", "D", "", "", "", "", "I", "J", "K", "L"],
      ["aa", "11", "Dana", "Levi", "", "", "", "", "", "", 72600, "Tel Aviv"],
      ["bb", "22", "Gil", "Cohen", "", "", "", "", 100100, "Haifa", "", ""]
    ]);

    const result = parseBranchManagerImportWorkbook(buffer);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toEqual([
      {
        email: "aa11@dbank.co.il",
        employeeId: "aa11",
        fullName: "Dana Levi",
        branchCode: "0726",
        branchName: "Tel Aviv"
      },
      {
        email: "bb22@dbank.co.il",
        employeeId: "bb22",
        fullName: "Gil Cohen",
        branchCode: "1001",
        branchName: "Haifa"
      }
    ]);
  });

  it("returns validation errors for missing required mapped values", () => {
    const buffer = buildWorkbookBuffer([
      ["A", "B", "C", "D", "", "", "", "", "I", "J", "K", "L"],
      ["", "", "Dana", "Levi", "", "", "", "", 72600, "Tel Aviv", "", ""],
      ["aa", "11", "", "", "", "", "", "", "", "", "", ""]
    ]);

    const result = parseBranchManagerImportWorkbook(buffer);
    expect(result.rows).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
