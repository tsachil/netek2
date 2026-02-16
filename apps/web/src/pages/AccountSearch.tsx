import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../api";
import { useAuth } from "../auth";
import { toUserError } from "../errors";

type AccountResult = {
  id: string;
  accountKey: string;
  fullAccountNumber: string;
  accountName: string;
  currentBalance: number;
  restricted: boolean;
  hasLiens: boolean;
  version: number;
  branchCode: string;
};

type Branch = {
  branchCode: string;
  branchName: string;
  status: string;
};

export default function AccountSearch() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const isAdmin = me?.role === "ADMIN";
  const isBranchManager = me?.role === "BRANCH_MANAGER";
  const canChooseBranch = isAdmin || isBranchManager;
  const isFixedBranchUser = !canChooseBranch && Boolean(me?.branchCode);
  const [query, setQuery] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [results, setResults] = useState<AccountResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canChooseBranch) {
      return;
    }

    apiGet<Branch[]>("/api/branches")
      .then((data) => setBranches(data.filter((branch) => branch.status === "ACTIVE")))
      .catch(() => setBranches([]));
  }, [canChooseBranch]);

  useEffect(() => {
    if (!me) {
      return;
    }
    if (isAdmin) {
      setBranchCode("");
      return;
    }
    if (isBranchManager) {
      setBranchCode(me.branchCode ?? "");
      return;
    }
    setBranchCode(me.branchCode ?? "");
  }, [isAdmin, isBranchManager, me]);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query.trim() });
      if (canChooseBranch && branchCode.trim()) {
        params.set("branchCode", branchCode.trim());
      }
      const data = await apiGet<AccountResult[]>(`/api/accounts/search?${params.toString()}`);
      setResults(data);
    } catch (err) {
      setResults([]);
      setError(toUserError(err, "SEARCH_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  function openAccount(account: AccountResult) {
    const params = new URLSearchParams();
    if (canChooseBranch) {
      params.set("branchCode", account.branchCode);
    }
    const suffix = params.toString();
    navigate(`/accounts/${account.accountKey}${suffix ? `?${suffix}` : ""}`);
  }

  return (
    <div className="auth-card wide" aria-busy={busy}>
      <h1>חיפוש חשבונות</h1>
      <p className="subtitle">איתור לפי שם, מזהה חשבון או מספר חשבון מלא.</p>
      <form className="form" onSubmit={onSearch}>
        <label>
          מונח חיפוש
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="שם / מזהה חשבון" />
        </label>
        {(canChooseBranch || isFixedBranchUser) && (
          <label>
            סניף
            <select
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value)}
              disabled={isFixedBranchUser}
            >
              {isAdmin && <option value="">כל הסניפים</option>}
              {(canChooseBranch ? branches : branches.filter((b) => b.branchCode === me?.branchCode)).map((branch) => (
                <option key={branch.branchCode} value={branch.branchCode}>
                  {branch.branchCode} - {branch.branchName}
                </option>
              ))}
              {isFixedBranchUser && branches.length === 0 && me?.branchCode && (
                <option value={me.branchCode}>{me.branchCode}</option>
              )}
            </select>
          </label>
        )}
        {error && (
          <div className="error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}
        <button type="submit" disabled={busy || query.trim().length === 0}>
          חיפוש
        </button>
      </form>

      <div className="table" role="table" aria-label="תוצאות חיפוש חשבונות">
        <div className="row header" role="row">
          <span role="columnheader">חשבון</span>
          <span role="columnheader">שם</span>
          <span role="columnheader">סניף</span>
          <span role="columnheader">יתרה</span>
          <span role="columnheader">פעולות</span>
        </div>
        {results.length === 0 ? (
          <div className="empty" aria-live="polite">
            אין תוצאות להצגה.
          </div>
        ) : (
          results.map((account) => (
            <div className="row" role="row" key={account.id}>
              <span role="cell">{account.fullAccountNumber}</span>
              <span role="cell">{account.accountName}</span>
              <span role="cell">{account.branchCode}</span>
              <span role="cell">{account.currentBalance.toFixed(2)}</span>
              <button type="button" onClick={() => openAccount(account)}>
                פתיחה
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
