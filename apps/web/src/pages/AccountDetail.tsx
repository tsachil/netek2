import { FormEvent, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiGet, apiPost } from "../api";
import { useAuth } from "../auth";
import { toUserError } from "../errors";

type Account = {
  id: string;
  accountKey: string;
  fullAccountNumber: string;
  accountName: string;
  branchCode: string;
  currentBalance: number;
  heldBalance: number;
  liens: number;
  openingBalance: number;
  operationRestrictions: string | null;
  markers: string | null;
  version: number;
};

type Tx = {
  transactionId: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  status: "COMPLETED" | "VOIDED";
  referenceNote: string | null;
  createdAt: string;
};

type DetailResponse = {
  account: Account;
  transactions: Tx[];
};

export default function AccountDetail() {
  const { me } = useAuth();
  const canOverrideBranch = me?.role === "ADMIN" || me?.role === "BRANCH_MANAGER";
  const { accountKey = "" } = useParams();
  const [searchParams] = useSearchParams();
  const branchCode = searchParams.get("branchCode") ?? "";

  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [txType, setTxType] = useState<"DEPOSIT" | "WITHDRAWAL">("DEPOSIT");
  const [amount, setAmount] = useState("");
  const [referenceNote, setReferenceNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadAccount() {
    setError(null);
    try {
      const params = new URLSearchParams();
      if (canOverrideBranch && branchCode) {
        params.set("branchCode", branchCode);
      }
      const suffix = params.toString();
      const data = await apiGet<DetailResponse>(
        `/api/accounts/${accountKey}${suffix ? `?${suffix}` : ""}`
      );
      setDetail(data);
    } catch (err) {
      setError(toUserError(err, "LOAD_FAILED"));
    }
  }

  useEffect(() => {
    if (!accountKey) {
      return;
    }
    loadAccount();
  }, [accountKey, branchCode]);

  async function submitTransaction(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;

    setBusy(true);
    setError(null);
    try {
      const payload: {
        accountKey: string;
        type: "DEPOSIT" | "WITHDRAWAL";
        amount: number;
        expectedVersion: number;
        referenceNote?: string;
        branchCode?: string;
      } = {
        accountKey,
        type: txType,
        amount: Number(amount),
        expectedVersion: detail.account.version
      };

      if (referenceNote.trim()) {
        payload.referenceNote = referenceNote.trim();
      }
      if (canOverrideBranch && branchCode) {
        payload.branchCode = branchCode;
      }

      await apiPost("/api/transactions", payload);
      setAmount("");
      setReferenceNote("");
      await loadAccount();
    } catch (err) {
      setError(toUserError(err, "TRANSACTION_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  async function voidTransaction(transactionId: string) {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/transactions/${transactionId}/void`, {});
      await loadAccount();
    } catch (err) {
      setError(toUserError(err, "VOID_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card wide" aria-busy={busy}>
      <h1>פרטי חשבון</h1>
      <p className="subtitle">
        <Link to="/accounts/search">חזרה לחיפוש חשבונות</Link>
      </p>
      {error && (
        <div className="error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      {!detail ? (
        <div className="empty">טוען נתוני חשבון...</div>
      ) : (
        <>
          <div className="panel">
            <div className="row">
              <span>חשבון</span>
              <span>{detail.account.fullAccountNumber}</span>
              <span>שם</span>
              <span>{detail.account.accountName}</span>
              <span />
            </div>
            <div className="row">
              <span>סניף</span>
              <span>{detail.account.branchCode}</span>
              <span>יתרה נוכחית</span>
              <span>{detail.account.currentBalance.toFixed(2)}</span>
              <span />
            </div>
            <div className="row">
              <span>סכום מעוכב</span>
              <span>{detail.account.heldBalance.toFixed(2)}</span>
              <span>שעבודים</span>
              <span>{detail.account.liens.toFixed(2)}</span>
              <span />
            </div>
            <div className="row">
              <span>מגבלות</span>
              <span>{detail.account.operationRestrictions || "ללא"}</span>
              <span>גרסה</span>
              <span>{detail.account.version}</span>
              <span />
            </div>
          </div>

          <form className="panel form" onSubmit={submitTransaction}>
            <label>
              סוג תנועה
              <select value={txType} onChange={(e) => setTxType(e.target.value as "DEPOSIT" | "WITHDRAWAL")}>
                <option value="DEPOSIT">הפקדה</option>
                <option value="WITHDRAWAL">משיכה</option>
              </select>
            </label>
            <label>
              סכום
              <input
                value={amount}
                type="number"
                step="0.01"
                min="0.01"
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              הערת אסמכתא (אופציונלי)
              <input value={referenceNote} onChange={(e) => setReferenceNote(e.target.value)} maxLength={300} />
            </label>
            <button type="submit" disabled={busy || Number(amount) <= 0}>
              ביצוע תנועה
            </button>
          </form>

          <div className="table" role="table" aria-label="היסטוריית תנועות">
            <div className="row header" role="row">
              <span role="columnheader">מזהה תנועה</span>
              <span role="columnheader">סוג</span>
              <span role="columnheader">סכום</span>
              <span role="columnheader">סטטוס</span>
              <span role="columnheader">פעולה</span>
            </div>
            {detail.transactions.length === 0 ? (
              <div className="empty" aria-live="polite">
                אין תנועות ליום העסקים הנוכחי.
              </div>
            ) : (
              detail.transactions.map((tx) => (
                <div className="row" role="row" key={tx.transactionId}>
                  <span role="cell">{tx.transactionId}</span>
                  <span role="cell">{tx.type}</span>
                  <span role="cell">{tx.amount.toFixed(2)}</span>
                  <span role="cell">{tx.status}</span>
                  {tx.status === "COMPLETED" ? (
                    <button type="button" disabled={busy} onClick={() => voidTransaction(tx.transactionId)}>
                      ביטול
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
