type LedgerRow = {
  transactionId: string;
  businessDate: string;
  branchCode: string;
  accountKey: string;
  fullAccountNumber: string;
  accountName: string;
  transactionType: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  status: string;
  voidReference: string;
  tellerUserId: string;
  referenceNote: string;
  timestamp: string;
};

const headers = [
  "transaction_id",
  "business_date",
  "branch_code",
  "account_key",
  "full_account_number",
  "account_name",
  "transaction_type",
  "amount",
  "balance_before",
  "balance_after",
  "status",
  "void_reference",
  "teller_user_id",
  "reference_note",
  "timestamp"
];

function escapeCsvValue(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatRow(row: LedgerRow) {
  return [
    row.transactionId,
    row.businessDate,
    row.branchCode,
    row.accountKey,
    row.fullAccountNumber,
    row.accountName,
    row.transactionType,
    row.amount,
    row.balanceBefore,
    row.balanceAfter,
    row.status,
    row.voidReference,
    row.tellerUserId,
    row.referenceNote,
    row.timestamp
  ]
    .map(escapeCsvValue)
    .join(",");
}

export function formatBusinessDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

export function generateLedgerCsv(branchCode: string, businessDate: Date) {
  const yyyymmdd = formatBusinessDate(businessDate);
  const summaryRow: LedgerRow = {
    transactionId: "SUMMARY",
    businessDate: yyyymmdd,
    branchCode,
    accountKey: "",
    fullAccountNumber: "",
    accountName: "",
    transactionType: "SUMMARY",
    amount: "0.00",
    balanceBefore: "0.00",
    balanceAfter: "0.00",
    status: "CLOSED",
    voidReference: "",
    tellerUserId: "",
    referenceNote: "deposit_total=0.00;withdrawal_total=0.00;net=0.00;count=0",
    timestamp: ""
  };

  return `\uFEFF${headers.join(",")}\n${formatRow(summaryRow)}\n`;
}
