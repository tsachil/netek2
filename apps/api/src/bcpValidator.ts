import { parse } from "csv-parse/sync";

export const EXPECTED_COLUMNS = 19;

export type ValidationError = { line: number; message: string };

export type Summary = {
  rows: number;
  branchCode: string;
  totalCurrentBalance: number;
};

export type ParsedBcpRow = {
  accountKey: string;
  fullAccountNumber: string;
  accountName: string;
  operationRestrictions: string | null;
  currentBalance: number;
  heldBalance: number;
  fxSupplementaryAccounts: number;
  loans: number;
  deposits: number;
  savingsPlans: number;
  securities: number;
  guarantees: number;
  liens: number;
  pledges: number;
  annualDebitTurnover: number;
  totalCreditLines: number;
  nextVisaCharge: number;
  visaDebt: number;
  markers: string | null;
};

export function validateFilename(filename: string) {
  const match = filename.match(/^BCP_REPORT_SNIF(\d+)\.csv$/i);
  if (!match) {
    return { ok: false, error: "INVALID_FILENAME" } as const;
  }
  return { ok: true, branchCode: match[1] } as const;
}

function parseDecimal(
  rawValue: string | undefined,
  required: boolean,
  line: number,
  field: string,
  errors: ValidationError[]
) {
  if (rawValue === undefined || rawValue === "") {
    if (required) {
      errors.push({ line, message: `Missing ${field}` });
    }
    return 0;
  }

  const parsed = Number(rawValue);
  if (Number.isNaN(parsed)) {
    errors.push({ line, message: `Invalid ${field}` });
    return 0;
  }
  return parsed;
}

export function parseValidateAndExtract(csv: string, filename: string):
  | { errors: ValidationError[] }
  | { summary: Summary; rows: ParsedBcpRow[] } {
  const filenameCheck = validateFilename(filename);
  if (!filenameCheck.ok) {
    return { errors: [{ line: 0, message: filenameCheck.error } as ValidationError] };
  }

  const records = parse(csv, {
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
    skip_empty_lines: true,
    trim: true
  }) as string[][];

  const errors: ValidationError[] = [];
  const parsedRows: ParsedBcpRow[] = [];
  let totalCurrentBalance = 0;

  records.forEach((rawRow, index) => {
    const line = index + 1;

    if (rawRow.length > 0 && rawRow[0]?.includes("חן קלע")) {
      return; // header
    }

    if (rawRow.length < EXPECTED_COLUMNS) {
      errors.push({ line, message: `Expected ${EXPECTED_COLUMNS} columns` });
      return;
    }

    const row = rawRow.slice(0, EXPECTED_COLUMNS);
    const accountKey = row[0]?.trim() ?? "";
    const fullAccountNumber = row[1]?.trim() ?? "";
    const accountName = row[2]?.trim() ?? "";
    const operationRestrictions = row[3]?.trim() ?? "";

    if (!accountKey) {
      errors.push({ line, message: "Missing account key" });
      return;
    }
    if (!fullAccountNumber) {
      errors.push({ line, message: "Missing full account number" });
      return;
    }
    if (!accountName) {
      errors.push({ line, message: "Missing account name" });
      return;
    }

    const currentBalance = parseDecimal(row[4], true, line, "current balance", errors);
    const heldBalance = parseDecimal(row[5], false, line, "held balance", errors);
    const fxSupplementaryAccounts = parseDecimal(
      row[6],
      false,
      line,
      "fx supplementary accounts",
      errors
    );
    const loans = parseDecimal(row[7], false, line, "loans", errors);
    const deposits = parseDecimal(row[8], false, line, "deposits", errors);
    const savingsPlans = parseDecimal(row[9], false, line, "savings plans", errors);
    const securities = parseDecimal(row[10], false, line, "securities", errors);
    const guarantees = parseDecimal(row[11], false, line, "guarantees", errors);
    const liens = parseDecimal(row[12], false, line, "liens", errors);
    const pledges = parseDecimal(row[13], false, line, "pledges", errors);
    const annualDebitTurnover = parseDecimal(row[14], false, line, "annual debit turnover", errors);
    const totalCreditLines = parseDecimal(row[15], false, line, "total credit lines", errors);
    const nextVisaCharge = parseDecimal(row[16], false, line, "next visa charge", errors);
    const visaDebt = parseDecimal(row[17], false, line, "visa debt", errors);
    const markers = row[18]?.trim() ?? "";

    if (errors.some((error) => error.line === line)) {
      return;
    }

    parsedRows.push({
      accountKey,
      fullAccountNumber,
      accountName,
      operationRestrictions: operationRestrictions || null,
      currentBalance,
      heldBalance,
      fxSupplementaryAccounts,
      loans,
      deposits,
      savingsPlans,
      securities,
      guarantees,
      liens,
      pledges,
      annualDebitTurnover,
      totalCreditLines,
      nextVisaCharge,
      visaDebt,
      markers: markers || null
    });

    totalCurrentBalance += currentBalance;
  });

  if (errors.length > 0) {
    return { errors };
  }

  return {
    summary: {
      rows: parsedRows.length,
      branchCode: filenameCheck.branchCode,
      totalCurrentBalance
    },
    rows: parsedRows
  };
}

export function parseAndValidate(csv: string, filename: string):
  | { errors: ValidationError[] }
  | { summary: Summary } {
  const result = parseValidateAndExtract(csv, filename);
  if ("errors" in result) {
    return result;
  }
  return { summary: result.summary };
}
