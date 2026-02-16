import { FormEvent, useEffect, useState } from "react";
import { apiGet, apiPost } from "../api";
import { formatDateTime } from "../format";
import { toUserError } from "../errors";

type AuditLog = {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  branchCode: string | null;
  createdAt: string;
  actor: {
    id: string;
    fullName: string;
    username: string;
  } | null;
};

type RetentionPolicy = {
  enabled: boolean;
  intervalHours: number;
  olderThanDays: number;
  dryRun: boolean;
  archiveDir: string | null;
};
type RetentionRun = {
  id: string;
  createdAt: string;
  source: string | null;
  dryRun: boolean | null;
  cutoffDate: string | null;
  matched: number | null;
  deleted: number | null;
  archivedFilePath: string | null;
};
type RetentionStatus = {
  policy: RetentionPolicy;
  lastRun: RetentionRun | null;
  lastError: {
    id: string;
    createdAt: string;
    metadata: unknown;
  } | null;
};

export default function AdminAudit() {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [userId, setUserId] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState("2555");
  const [retentionResult, setRetentionResult] = useState<string | null>(null);
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null);
  const [retentionStatus, setRetentionStatus] = useState<RetentionStatus | null>(null);
  const [retentionHistory, setRetentionHistory] = useState<RetentionRun[]>([]);
  const [busy, setBusy] = useState(false);

  function buildFilterQuery() {
    const params = new URLSearchParams();
    if (action.trim()) params.set("action", action.trim());
    if (entityType.trim()) params.set("entityType", entityType.trim());
    if (userId.trim()) params.set("userId", userId.trim());
    if (branchCode.trim()) params.set("branchCode", branchCode.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("limit", "100");
    return params.toString();
  }

  async function loadLogs(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await apiGet<AuditLog[]>(`/api/admin/audit-logs?${buildFilterQuery()}`);
      setLogs(data);
    } catch (err) {
      setLogs([]);
      setError(toUserError(err, "AUDIT_LOAD_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    window.open(`/api/admin/audit-logs/export?${buildFilterQuery()}`, "_blank");
  }

  async function runRetention(dryRun: boolean) {
    setBusy(true);
    setError(null);
    setRetentionResult(null);
    try {
      const response = await apiPost<{
        dryRun: boolean;
        cutoffDate: string;
        matched: number;
        deleted: number;
      }>("/api/admin/audit-logs/retention/run", {
        olderThanDays: Number(retentionDays),
        dryRun
      });
      setRetentionResult(
        `${response.dryRun ? "בדיקת דמה" : "בוצע"}: נמצאו ${response.matched}, נמחקו ${response.deleted}`
      );
      await Promise.all([loadLogs(), loadRetentionMonitoring()]);
    } catch (err) {
      setError(toUserError(err, "RETENTION_FAILED"));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadLogs();
    apiGet<RetentionPolicy>("/api/admin/audit-logs/retention/policy")
      .then((data) => {
        setPolicy(data);
        setRetentionDays(String(data.olderThanDays));
      })
      .catch(() => {
        setPolicy(null);
      });
    loadRetentionMonitoring();
  }, []);

  async function loadRetentionMonitoring() {
    try {
      const [status, history] = await Promise.all([
        apiGet<RetentionStatus>("/api/admin/audit-logs/retention/status"),
        apiGet<RetentionRun[]>("/api/admin/audit-logs/retention/history?limit=5")
      ]);
      setRetentionStatus(status);
      setRetentionHistory(history);
    } catch {
      setRetentionStatus(null);
      setRetentionHistory([]);
    }
  }

  return (
    <div className="auth-card wide">
      <h1>יומן ביקורת</h1>
      <p className="subtitle">סקירת פעולות מערכת ופעולות כספיות.</p>
      <form className="form grid" onSubmit={loadLogs}>
        <label>
          פעולה
          <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="TRANSACTION_CREATE" />
        </label>
        <label>
          סוג ישות
          <input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="TRANSACTION" />
        </label>
        <label>
          מזהה משתמש
          <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="cuid" />
        </label>
        <label>
          קוד סניף
          <input value={branchCode} onChange={(e) => setBranchCode(e.target.value)} placeholder="0726" />
        </label>
        <label>
          מתאריך
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          עד תאריך
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="submit" disabled={busy}>
          סינון
        </button>
        <button type="button" disabled={busy} onClick={exportCsv}>
          ייצוא CSV
        </button>
      </form>
      {error && (
        <div className="error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      {retentionResult && (
        <div className="panel inset" aria-live="polite">
          {retentionResult}
        </div>
      )}

      <div className="panel inset">
        <p className="subtitle">שימור לוגים</p>
        {policy && (
          <div className="helper">
            מדיניות: {policy.enabled ? "פעילה" : "לא פעילה"} כל {policy.intervalHours} שעות, ברירת מחדל{" "}
            {policy.olderThanDays} ימים, מצב {policy.dryRun ? "dry-run" : "מחיקה"}
            {policy.archiveDir ? `, תיקיית ארכיון ${policy.archiveDir}` : ""}
          </div>
        )}
        <label>
          שמירת ימים אחרונים
          <input
            type="number"
            min="1"
            max="3650"
            value={retentionDays}
            onChange={(e) => setRetentionDays(e.target.value)}
          />
        </label>
        <div className="buttons">
          <button type="button" disabled={busy || Number(retentionDays) <= 0} onClick={() => runRetention(true)}>
            בדיקת דמה לשימור
          </button>
          <button type="button" disabled={busy || Number(retentionDays) <= 0} onClick={() => runRetention(false)}>
            הפעלת שימור
          </button>
          <button type="button" disabled={busy} onClick={loadRetentionMonitoring}>
            רענון סטטוס שימור
          </button>
        </div>
        {retentionStatus?.lastRun && (
          <div className="helper">
            הרצה אחרונה: {formatDateTime(retentionStatus.lastRun.createdAt)} ({retentionStatus.lastRun.source},{" "}
            {retentionStatus.lastRun.dryRun ? "dry-run" : "delete"})
          </div>
        )}
        {retentionStatus?.lastError && <div className="error">נרשמה שגיאה בהרצת שימור אחרונה.</div>}
        {retentionHistory.length > 0 && (
          <div className="helper">
            הרצות אחרונות:{" "}
            {retentionHistory
              .map((run) => `${run.source ?? "N/A"}:${run.dryRun ? "dry" : "exec"}:${run.deleted ?? 0}`)
              .join(" | ")}
          </div>
        )}
      </div>

      <div className="table">
        <div className="row header">
          <span>נוצר בתאריך</span>
          <span>פעולה</span>
          <span>ישות</span>
          <span>מבצע</span>
          <span>סניף</span>
        </div>
        {logs.length === 0 ? (
          <div className="empty">לא נמצאו רשומות ביקורת.</div>
        ) : (
          logs.map((log) => (
            <div className="row" key={log.id}>
              <span>{formatDateTime(log.createdAt)}</span>
              <span>{log.action}</span>
              <span>
                {log.entityType}
                {log.entityId ? ` (${log.entityId})` : ""}
              </span>
              <span>{log.actor ? `${log.actor.fullName} (${log.actor.username})` : log.userId ?? "SYSTEM"}</span>
              <span>{log.branchCode ?? "--"}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
