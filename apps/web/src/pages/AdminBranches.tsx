import { useEffect, useState } from "react";
import { apiGet } from "../api";
import { toUserError } from "../errors";

type Branch = {
  branchCode: string;
  branchName: string;
  status: string;
};

type CsvError = {
  line: number;
  message: string;
};

export default function AdminBranches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [csv, setCsv] = useState("branch_code,branch_name,branch_status\n0001,Main Branch,ACTIVE");
  const [error, setError] = useState<string | null>(null);
  const [csvErrors, setCsvErrors] = useState<CsvError[]>([]);
  const [busy, setBusy] = useState(false);

  function load() {
    apiGet<Branch[]>("/api/branches")
      .then(setBranches)
      .catch((err) => setError(toUserError(err, "LOAD_FAILED")));
  }

  useEffect(() => {
    load();
  }, []);

  async function onImport() {
    setError(null);
    setCsvErrors([]);
    setBusy(true);
    try {
      const res = await fetch("/api/branches/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(toUserError(new Error(data.error || "IMPORT_FAILED"), "IMPORT_FAILED"));
        if (data.errors) {
          setCsvErrors(data.errors as CsvError[]);
        }
        return;
      }
      load();
    } catch (err) {
      setError(toUserError(err, "IMPORT_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card wide" aria-busy={busy}>
      <h1>ייבוא סניפים</h1>
      <p className="subtitle">הדבקת תוכן CSV של BRANCH_MASTER וביצוע ייבוא.</p>
      {error && (
        <div className="error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      {csvErrors.length > 0 && (
        <div className="panel inset" role="alert" aria-live="assertive">
          {csvErrors.map((e) => (
            <div key={`${e.line}-${e.message}`}>
              שורה {e.line}: {e.message}
            </div>
          ))}
        </div>
      )}
      <label>
        תוכן CSV
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} />
      </label>
      <button type="button" disabled={busy} onClick={onImport}>
        ייבוא סניפים
      </button>
      <div className="table" role="table" aria-label="טבלת סניפים">
        <div className="row header" role="row">
          <span role="columnheader">קוד</span>
          <span role="columnheader">שם</span>
          <span role="columnheader">סטטוס</span>
          <span></span>
          <span></span>
        </div>
        {branches.map((b) => (
          <div className="row" role="row" key={b.branchCode}>
            <span role="cell">{b.branchCode}</span>
            <span role="cell">{b.branchName}</span>
            <span role="cell">{b.status}</span>
            <span></span>
            <span></span>
          </div>
        ))}
        {branches.length === 0 && <p className="empty">אין סניפים להצגה.</p>}
      </div>
    </div>
  );
}
