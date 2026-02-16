import { useEffect, useState } from "react";
import { formatDate } from "../format";
import { toUserError } from "../errors";

type Summary = {
  rows: number;
  branchCode: string;
  totalCurrentBalance: number;
};

type CsvError = {
  line: number;
  message: string;
};

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

export default function AdminBcp() {
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("BCP_REPORT_SNIF0726.csv");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [errors, setErrors] = useState<CsvError[]>([]);
  const [day, setDay] = useState<DayState | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadDay() {
    try {
      const [dayRes, branchesRes] = await Promise.all([
        fetch("/api/day/current", { credentials: "include" }),
        fetch("/api/ledger/branches", { credentials: "include" })
      ]);
      if (dayRes.ok) {
        setDay((await dayRes.json()) as DayState);
      }
      if (branchesRes.ok) {
        const payload = (await branchesRes.json()) as LoadedBranches;
        setBranches(payload.branches);
      } else {
        setBranches([]);
      }
    } catch {
      setBranches([]);
    }
  }

  useEffect(() => {
    loadDay();
  }, []);

  async function dayAction(path: "/api/day/open" | "/api/day/close" | "/api/day/reconcile" | "/api/day/close/confirm") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(toUserError(new Error(data.error || "DAY_ACTION_FAILED"), "DAY_ACTION_FAILED"));
        return;
      }
      setDay((await res.json()) as DayState);
      await loadDay();
    } catch (err) {
      setError(toUserError(err, "DAY_ACTION_FAILED"));
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

  async function validateText() {
    setBusy(true);
    setError(null);
    setErrors([]);
    setSummary(null);
    try {
      const res = await fetch("/api/bcp/validate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, filename })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(toUserError(new Error(data.error || "FAILED"), "REQUEST_FAILED"));
        if (data.errors) {
          setErrors(data.errors as CsvError[]);
        }
        return;
      }
      const data = (await res.json()) as Summary;
      setSummary(data);
      await loadDay();
    } catch (err) {
      setError(toUserError(err, "REQUEST_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  async function validateFile(file: File) {
    setBusy(true);
    setError(null);
    setErrors([]);
    setSummary(null);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/bcp/upload", {
        method: "POST",
        credentials: "include",
        body: formData
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(toUserError(new Error(data.error || "FAILED"), "REQUEST_FAILED"));
        if (data.errors) {
          setErrors(data.errors as CsvError[]);
        }
        return;
      }
      const data = (await res.json()) as Summary;
      setSummary(data);
      await loadDay();
    } catch (err) {
      setError(toUserError(err, "REQUEST_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card wide" aria-busy={busy}>
      <h1>ניהול יום עסקים</h1>
      <p className="subtitle">העלאת קובץ BCP_REPORT_SNIF*.csv או הדבקת התוכן ידנית.</p>
      {day && (
        <div className="panel inset">
          <div className="row">
            <span>מצב יום</span>
            <span>{day.state}</span>
          </div>
          <div className="row">
            <span>תאריך</span>
            <span>{formatDate(day.businessDate)}</span>
          </div>
          <div className="row">
            <span>סניפים שנטענו</span>
            <span>{day.branchesLoaded}</span>
          </div>
          <div className="row">
            <span>חשבונות שנטענו</span>
            <span>{day.totalAccountsLoaded}</span>
          </div>
          <div className="buttons">
            <button type="button" disabled={busy || day.state !== "LOADING"} onClick={() => dayAction("/api/day/open")}>
              פתיחת יום עסקים
            </button>
            <button type="button" disabled={busy || day.state !== "OPEN"} onClick={() => dayAction("/api/day/close")}>
              התחלת סגירת יום
            </button>
            <button
              type="button"
              disabled={busy || day.state !== "CLOSING"}
              onClick={() => dayAction("/api/day/reconcile")}
            >
              התחלת התאמה
            </button>
            <button
              type="button"
              disabled={busy || day.state !== "RECONCILING"}
              onClick={() => dayAction("/api/day/close/confirm")}
            >
              אישור סגירת יום
            </button>
          </div>
          {branches.length > 0 && (
            <div className="buttons">
              <button type="button" onClick={downloadAllLedgers}>
                הורדת כל קבצי ה-Ledger (ZIP)
              </button>
              {branches.map((branchCode) => (
                <button key={branchCode} type="button" onClick={() => downloadBranchLedger(branchCode)}>
                  הורדת Ledger {branchCode}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      {errors.length > 0 && (
        <div className="panel inset" role="alert" aria-live="assertive">
          {errors.map((e) => (
            <div key={`${e.line}-${e.message}`}>
              שורה {e.line}: {e.message}
            </div>
          ))}
        </div>
      )}
      {summary && (
        <div className="panel inset" aria-live="polite">
          <div className="row">
            <span>סניף</span>
            <span>{summary.branchCode}</span>
          </div>
          <div className="row">
            <span>שורות</span>
            <span>{summary.rows}</span>
          </div>
          <div className="row">
            <span>סה"כ יתרה נוכחית</span>
            <span>{summary.totalCurrentBalance.toFixed(2)}</span>
          </div>
        </div>
      )}

      <label>
        העלאת קובץ
        <input
          type="file"
          accept=".csv"
          aria-label="העלאת קובץ BCP CSV"
          onChange={(e) => e.target.files && validateFile(e.target.files[0])}
        />
      </label>

      <label>
        שם קובץ (לתוכן מודבק)
        <input value={filename} onChange={(e) => setFilename(e.target.value)} />
      </label>
      <label>
        תוכן CSV
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={8} />
      </label>
      <button type="button" disabled={busy} onClick={validateText}>
        בדיקת CSV מודבק
      </button>
    </div>
  );
}
