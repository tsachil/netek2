import * as XLSX from "xlsx";

export type BranchManagerImportRow = {
  email: string;
  fullName: string;
  employeeId: string;
  branchCode: string;
  branchName: string;
};

export type BranchManagerImportError = {
  row: number;
  message: string;
};

export type BranchManagerImportResult = {
  rows: BranchManagerImportRow[];
  errors: BranchManagerImportError[];
};

function cellToString(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseBranchNumeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const text = cellToString(value).replaceAll(",", "");
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function toBranchCode(rawBranchValue: unknown) {
  const branchNumeric = parseBranchNumeric(rawBranchValue);
  if (branchNumeric === null) return null;
  const normalized = Math.trunc(branchNumeric / 100);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return null;
  }
  return String(normalized).padStart(4, "0");
}

function isRowEmpty(row: unknown[]) {
  return row.every((cell) => cellToString(cell) === "");
}

export function parseBranchManagerImportWorkbook(fileBuffer: Buffer): BranchManagerImportResult {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { rows: [], errors: [{ row: 1, message: "Workbook is empty" }] };
  }

  const firstSheet = workbook.Sheets[firstSheetName];
  const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    raw: true,
    defval: ""
  });
  const errors: BranchManagerImportError[] = [];
  const rows: BranchManagerImportRow[] = [];
  const seenEmails = new Set<string>();

  for (let i = 1; i < sheetRows.length; i += 1) {
    const excelRowNumber = i + 1;
    const row = Array.isArray(sheetRows[i]) ? sheetRows[i] : [];
    if (isRowEmpty(row)) continue;

    const colA = cellToString(row[0]);
    const colB = cellToString(row[1]);
    const colC = cellToString(row[2]);
    const colD = cellToString(row[3]);
    const colI = row[8];
    const colJ = cellToString(row[9]);
    const colK = row[10];
    const colL = cellToString(row[11]);

    if (!colA || !colB) {
      errors.push({ row: excelRowNumber, message: "Columns A and B are required for email" });
      continue;
    }

    const email = `${colA}${colB}@dbank.co.il`.toLowerCase();
    if (seenEmails.has(email)) {
      errors.push({ row: excelRowNumber, message: `Duplicate email in file: ${email}` });
      continue;
    }
    seenEmails.add(email);

    const fullName = `${colC} ${colD}`.trim().replace(/\s+/g, " ");
    if (!fullName) {
      errors.push({ row: excelRowNumber, message: "Columns C and D are required for full name" });
      continue;
    }

    const branchCode = toBranchCode(colI ?? colK) ?? toBranchCode(colK);
    if (!branchCode) {
      errors.push({
        row: excelRowNumber,
        message: "Column I (or fallback K) must contain a valid numeric branch number"
      });
      continue;
    }

    const branchName = (colJ || colL).trim();
    if (!branchName) {
      errors.push({ row: excelRowNumber, message: "Column J (or fallback L) is required for branch name" });
      continue;
    }

    rows.push({
      email,
      employeeId: `${colA}${colB}`,
      fullName,
      branchCode,
      branchName
    });
  }

  return { rows, errors };
}
