import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { formatDate, formatDateTime } from "../format";
import { toUserError } from "../errors";

type DayState = {
  businessDate: string;
  state: string;
  branchesLoaded: number;
  totalAccountsLoaded: number;
  ledgerRecordCount: number;
};
type LoadedBranches = {
  businessDate: string;
  branches: string[];
};
type DashboardSummary = {
  businessDate: string;
  role: string;
  scopeBranchCode: string | null;
  totals: {
    txCount: number;
    deposits: number;
    withdrawals: number;
    net: number;
  };
  recent: Array<{
    transactionId: string;
    type: "DEPOSIT" | "WITHDRAWAL";
    amount: number;
    status: string;
    branchCode: string;
    accountKey: string;
    createdAt: string;
  }>;
  recentPage: number;
  recentPageSize: number;
  recentTotal: number;
  recentTotalPages: number;
  team?: Array<{
    tellerUserId: string;
    fullName: string;
    username: string;
    txCount: number;
    lastActivityAt: string | null;
  }>;
};

type TellerReconciliationSummary = {
  businessDate: string;
  dayState: string;
  role: string;
  branchCode: string | null;
  totals: {
    txCount: number;
    deposits: number;
    withdrawals: number;
    net: number;
    voidedCount: number;
    lastActivityAt: string | null;
  };
  canSubmit: boolean;
  handoff: {
    declaredNet: number;
    discrepancy: number;
    note: string | null;
    submittedAt: string;
  } | null;
};

type BranchHandoffSummary = {
  businessDate: string;
  branchCode: string | null;
  tellers: Array<{
    tellerUserId: string;
    fullName: string;
    username: string;
    branchCode: string;
    totals: {
      txCount: number;
      deposits: number;
      withdrawals: number;
      net: number;
      voidedCount: number;
    };
    handoff: {
      declaredNet: number;
      discrepancy: number;
      submittedAt: string;
    } | null;
  }>;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { me, refresh } = useAuth();
  const [day, setDay] = useState<DayState | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentQuery, setRecentQuery] = useState("");
  const [recentType, setRecentType] = useState<"ALL" | "DEPOSIT" | "WITHDRAWAL">("ALL");
  const [recentStatus, setRecentStatus] = useState<"ALL" | "COMPLETED" | "VOIDED">("ALL");
  const [recentPage, setRecentPage] = useState(1);
  const [reconciliation, setReconciliation] = useState<TellerReconciliationSummary | null>(null);
  const [branchHandoff, setBranchHandoff] = useState<BranchHandoffSummary | null>(null);
  const [declaredNet, setDeclaredNet] = useState("");
  const [handoffNote, setHandoffNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function buildSummaryPath(page: number) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "10"
    });
    if (recentQuery.trim().length > 0) {
      params.set("q", recentQuery.trim());
    }
    if (recentType !== "ALL") {
      params.set("type", recentType);
    }
    if (recentStatus !== "ALL") {
      params.set("status", recentStatus);
    }
    return `/api/dashboard/summary?${params.toString()}`;
  }

  function loadSummary() {
    apiGet<DashboardSummary>(buildSummaryPath(recentPage))
      .then(setSummary)
      .catch(() => setSummary(null));
  }

  function loadDay() {
    apiGet<DayState>("/api/day/current")
      .then(setDay)
      .catch((err) => setError(toUserError(err, "LOAD_FAILED")));
    apiGet<LoadedBranches>("/api/ledger/branches")
      .then((data) => setBranches(Array.isArray(data.branches) ? data.branches : []))
      .catch(() => setBranches([]));
    loadSummary();
    if (me?.role === "TELLER") {
      apiGet<TellerReconciliationSummary>("/api/reconciliation/summary")
        .then(setReconciliation)
        .catch(() => setReconciliation(null));
    } else {
      setReconciliation(null);
    }
    if (me?.role === "BRANCH_MANAGER" || me?.role === "ADMIN") {
      apiGet<BranchHandoffSummary>("/api/reconciliation/branch-handoff")
        .then(setBranchHandoff)
        .catch(() => setBranchHandoff(null));
    } else {
      setBranchHandoff(null);
    }
  }

  useEffect(() => {
    loadDay();
  }, [me?.role]);

  useEffect(() => {
    loadSummary();
  }, [me?.role, recentPage, recentQuery, recentType, recentStatus]);

  async function openDay() {
    setError(null);
    setBusy(true);
    try {
      const next = await apiPost<DayState>("/api/day/open", {});
      setDay(next);
    } catch (err) {
      setError(toUserError(err, "DAY_ACTION_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  async function closeDay() {
    setError(null);
    setBusy(true);
    try {
      const next = await apiPost<DayState>("/api/day/close", {});
      setDay(next);
    } catch (err) {
      setError(toUserError(err, "DAY_ACTION_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  async function reconcileDay() {
    setError(null);
    setBusy(true);
    try {
      const next = await apiPost<DayState>("/api/day/reconcile", {});
      setDay(next);
    } catch (err) {
      setError(toUserError(err, "DAY_ACTION_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmCloseDay() {
    setError(null);
    setBusy(true);
    try {
      const next = await apiPost<DayState>("/api/day/close/confirm", {});
      setDay(next);
    } catch (err) {
      setError(toUserError(err, "DAY_ACTION_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await apiPost("/api/auth/logout", {});
    } finally {
      refresh();
      navigate("/");
    }
  }

  async function submitHandoff() {
    if (!reconciliation) return;
    setError(null);
    setBusy(true);
    try {
      await apiPost("/api/reconciliation/handoff", {
        declaredNet: Number(declaredNet),
        note: handoffNote.trim() || undefined
      });
      setDeclaredNet("");
      setHandoffNote("");
      loadDay();
    } catch (err) {
      setError(toUserError(err, "REQUEST_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  function downloadBranchLedger(branchCode: string) {
    window.open(`/api/ledger/branch/${branchCode}`, "_blank");
  }

  function downloadAllLedgers() {
    window.open("/api/ledger/all", "_blank");
  }

  return (
    <div className="auth-card">
      <h1>לוח בקרה</h1>
      <p className="subtitle">מצב יום עסקים ופעולות מערכת</p>
      {error && (
        <div className="error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      <div className="panel">
        <div className="row">
          <span>יום עסקים</span>
          <span className="pill">{day?.state ?? "UNKNOWN"}</span>
        </div>
        <div className="row">
          <span>תאריך</span>
          <span>{day?.businessDate ? formatDate(day.businessDate) : "--"}</span>
        </div>
        <div className="row">
          <span>סניפים שנטענו</span>
          <span>{day?.branchesLoaded ?? 0}</span>
        </div>
        <div className="row">
          <span>חשבונות שנטענו</span>
          <span>{day?.totalAccountsLoaded ?? 0}</span>
        </div>
      </div>
      {summary && (
        <div className="panel actions">
          <p className="subtitle">
            {me?.role === "TELLER"
              ? "התנועות שלי היום"
              : me?.role === "BRANCH_MANAGER"
                ? `סיכום סניף ${summary.scopeBranchCode ?? ""}`
                : "סיכום מערכת היום"}
          </p>
          <div className="row">
            <span>מספר תנועות</span>
            <span>{summary.totals.txCount}</span>
            <span>נטו יומי</span>
            <span>{summary.totals.net.toFixed(2)}</span>
            <span />
          </div>
          <div className="row">
            <span>סה״כ הפקדות</span>
            <span>{summary.totals.deposits.toFixed(2)}</span>
            <span>סה״כ משיכות</span>
            <span>{summary.totals.withdrawals.toFixed(2)}</span>
            <span />
          </div>
          {me?.role === "BRANCH_MANAGER" && summary.team && (
            <div className="table" role="table" aria-label="פעילות טלרים בסניף">
              <div className="row header" role="row">
                <span role="columnheader">שם טלר</span>
                <span role="columnheader">שם משתמש</span>
                <span role="columnheader">תנועות היום</span>
                <span role="columnheader">פעילות אחרונה</span>
                <span role="columnheader" />
              </div>
              {summary.team.map((member) => (
                <div className="row" role="row" key={member.tellerUserId}>
                  <span role="cell">{member.fullName}</span>
                  <span role="cell">{member.username}</span>
                  <span role="cell">{member.txCount}</span>
                  <span role="cell">{member.lastActivityAt ? formatDate(member.lastActivityAt) : "--"}</span>
                  <span role="cell" />
                </div>
              ))}
            </div>
          )}
          <div className="table" role="table" aria-label="תנועות אחרונות בלוח בקרה">
            <div className="toolbar">
              <label>
                חיפוש
                <input
                  value={recentQuery}
                  onChange={(e) => {
                    setRecentQuery(e.target.value);
                    setRecentPage(1);
                  }}
                  placeholder="מזהה תנועה או חשבון"
                />
              </label>
              <label>
                סוג תנועה
                <select
                  value={recentType}
                  onChange={(e) => {
                    setRecentType(e.target.value as "ALL" | "DEPOSIT" | "WITHDRAWAL");
                    setRecentPage(1);
                  }}
                >
                  <option value="ALL">הכול</option>
                  <option value="DEPOSIT">הפקדה</option>
                  <option value="WITHDRAWAL">משיכה</option>
                </select>
              </label>
              <label>
                סטטוס
                <select
                  value={recentStatus}
                  onChange={(e) => {
                    setRecentStatus(e.target.value as "ALL" | "COMPLETED" | "VOIDED");
                    setRecentPage(1);
                  }}
                >
                  <option value="ALL">הכול</option>
                  <option value="COMPLETED">בוצע</option>
                  <option value="VOIDED">בוטל</option>
                </select>
              </label>
            </div>
            <div className="row header" role="row">
              <span role="columnheader">מזהה</span>
              <span role="columnheader">סוג</span>
              <span role="columnheader">סכום</span>
              <span role="columnheader">סניף</span>
              <span role="columnheader">סטטוס</span>
            </div>
            {summary.recent.length === 0 ? (
              <div className="empty">אין תנועות להצגה.</div>
            ) : (
              summary.recent.map((tx) => (
                <div className="row" role="row" key={tx.transactionId}>
                  <span role="cell">{tx.transactionId}</span>
                  <span role="cell">{tx.type}</span>
                  <span role="cell">{tx.amount.toFixed(2)}</span>
                  <span role="cell">{tx.branchCode}</span>
                  <span role="cell">{tx.status}</span>
                </div>
              ))
            )}
            <div className="pagination">
              <button
                type="button"
                disabled={summary.recentPage <= 1}
                onClick={() => setRecentPage((current) => Math.max(1, current - 1))}
              >
                הקודם
              </button>
              <span>
                עמוד {summary.recentPage} מתוך {summary.recentTotalPages} ({summary.recentTotal} תנועות)
              </span>
              <button
                type="button"
                disabled={summary.recentPage >= summary.recentTotalPages}
                onClick={() =>
                  setRecentPage((current) => Math.min(summary.recentTotalPages, current + 1))
                }
              >
                הבא
              </button>
            </div>
          </div>
        </div>
      )}
      {me?.role === "TELLER" && reconciliation && (
        <div className="panel actions">
          <p className="subtitle">מסירת התאמת סוף יום</p>
          <div className="row">
            <span>מצב יום</span>
            <span>{reconciliation.dayState}</span>
            <span>נטו מחושב</span>
            <span>{reconciliation.totals.net.toFixed(2)}</span>
            <span />
          </div>
          <div className="row">
            <span>מספר תנועות</span>
            <span>{reconciliation.totals.txCount}</span>
            <span>תנועות מבוטלות</span>
            <span>{reconciliation.totals.voidedCount}</span>
            <span />
          </div>
          {reconciliation.handoff && (
            <div className="row">
              <span>דיווח אחרון</span>
              <span>{reconciliation.handoff.declaredNet.toFixed(2)}</span>
              <span>הפרש</span>
              <span>{reconciliation.handoff.discrepancy.toFixed(2)}</span>
              <span>{formatDateTime(reconciliation.handoff.submittedAt)}</span>
            </div>
          )}
          <label>
            נטו מדווח
            <input
              type="number"
              step="0.01"
              value={declaredNet}
              onChange={(e) => setDeclaredNet(e.target.value)}
              disabled={!reconciliation.canSubmit || busy}
            />
          </label>
          <label>
            הערת מסירה
            <input
              value={handoffNote}
              onChange={(e) => setHandoffNote(e.target.value)}
              maxLength={500}
              disabled={!reconciliation.canSubmit || busy}
            />
          </label>
          <button
            type="button"
            disabled={!reconciliation.canSubmit || busy || declaredNet.trim().length === 0}
            onClick={submitHandoff}
          >
            שליחת התאמה למנהל הסניף
          </button>
        </div>
      )}
      {(me?.role === "BRANCH_MANAGER" || me?.role === "ADMIN") && branchHandoff && (
        <div className="panel actions">
          <p className="subtitle">מסירות טלרים לסגירת יום</p>
          <div className="table" role="table" aria-label="מסירות התאמה של טלרים">
            <div className="row header" role="row">
              <span role="columnheader">שם טלר</span>
              <span role="columnheader">תנועות</span>
              <span role="columnheader">נטו מחושב</span>
              <span role="columnheader">נטו מדווח</span>
              <span role="columnheader">הפרש</span>
            </div>
            {branchHandoff.tellers.length === 0 ? (
              <div className="empty">אין טלרים להצגה.</div>
            ) : (
              branchHandoff.tellers.map((teller) => (
                <div className="row" role="row" key={teller.tellerUserId}>
                  <span role="cell">{teller.fullName}</span>
                  <span role="cell">{teller.totals.txCount}</span>
                  <span role="cell">{teller.totals.net.toFixed(2)}</span>
                  <span role="cell">{teller.handoff ? teller.handoff.declaredNet.toFixed(2) : "--"}</span>
                  <span role="cell">{teller.handoff ? teller.handoff.discrepancy.toFixed(2) : "--"}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {me?.role === "ADMIN" && (
        <div className="panel actions">
          <p className="subtitle">פעולות ניהול יום</p>
          <div className="buttons">
            <button disabled={busy || day?.state !== "LOADING"} onClick={openDay}>
              פתיחת יום עסקים
            </button>
            <button disabled={busy || day?.state !== "OPEN"} onClick={closeDay}>
              התחלת סגירת יום
            </button>
            <button disabled={busy || day?.state !== "CLOSING"} onClick={reconcileDay}>
              התחלת התאמה
            </button>
            <button disabled={busy || day?.state !== "RECONCILING"} onClick={confirmCloseDay}>
              אישור סגירת יום
            </button>
          </div>
        </div>
      )}
      {me?.role === "ADMIN" && branches.length > 0 && (
        <div className="panel actions">
          <p className="subtitle">הורדת קבצי Ledger</p>
          <div className="buttons">
            <button type="button" onClick={downloadAllLedgers}>
              הורדת כל הקבצים (ZIP)
            </button>
            {branches.map((branchCode) => (
              <button
                key={branchCode}
                type="button"
                onClick={() => downloadBranchLedger(branchCode)}
              >
                הורדת Ledger {branchCode}
              </button>
            ))}
          </div>
        </div>
      )}
      {me?.role === "ADMIN" && (
        <p className="helper">
          <Link to="/admin/approvals">אישורים ממתינים</Link>
          <span className="divider" />
          <Link to="/admin/branches">ייבוא סניפים</Link>
          <span className="divider" />
          <Link to="/admin/bcp">ניהול יום עסקים</Link>
          <span className="divider" />
          <Link to="/admin/audit">יומן ביקורת</Link>
        </p>
      )}
      <p className="helper">
        <Link to="/accounts/search">חיפוש חשבונות ותנועות</Link>
      </p>
      <p className="helper">
        <button type="button" onClick={logout}>
          התנתקות
        </button>
      </p>
    </div>
  );
}
