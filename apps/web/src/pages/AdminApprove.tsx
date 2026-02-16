import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../api";
import { formatDate } from "../format";
import { toUserError } from "../errors";

type PendingUser = {
  id: string;
  fullName: string;
  employeeId: string;
  username: string;
  status: string;
  role: string;
  branchCode: string | null;
  createdAt: string;
};

type Branch = {
  branchCode: string;
  branchName: string;
  status: string;
};

type UserDraft = {
  role: string;
  status: string;
  branchCode: string;
};

type BranchManagerImportSummary = {
  totalRows: number;
  created: number;
  updated: number;
};

export default function AdminApprove() {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [allUsers, setAllUsers] = useState<PendingUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [role, setRole] = useState("TELLER");
  const [branchCode, setBranchCode] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [temporaryPasswordNotice, setTemporaryPasswordNotice] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importSummary, setImportSummary] = useState<BranchManagerImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  function load() {
    apiGet<PendingUser[]>("/api/admin/users?status=PENDING_APPROVAL")
      .then(setUsers)
      .catch((err) => setError(toUserError(err, "LOAD_FAILED")));
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (filterRole) params.set("role", filterRole);
    if (filterBranch) params.set("branchCode", filterBranch);
    if (search.trim()) params.set("q", search.trim());
    const usersUrl = params.toString() ? `/api/admin/users?${params.toString()}` : "/api/admin/users";

    apiGet<PendingUser[]>(usersUrl)
      .then(setAllUsers)
      .catch((err) => setError(toUserError(err, "LOAD_FAILED")));
    apiGet<Branch[]>("/api/branches")
      .then((data) => {
        setBranches(data.filter((b) => b.status === "ACTIVE"));
        if (!branchCode && data.length > 0) {
          setBranchCode(data[0].branchCode);
        }
      })
      .catch((err) => setError(toUserError(err, "LOAD_FAILED")));
  }

  useEffect(() => {
    load();
  }, [filterStatus, filterRole, filterBranch, search]);

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const user of allUsers) {
        if (!next[user.id]) {
          next[user.id] = {
            role: user.role,
            status: user.status,
            branchCode: user.branchCode || ""
          };
        }
      }
      return next;
    });
  }, [allUsers]);

  async function approve(id: string) {
    setError(null);
    setBusyUserId(id);
    try {
      await apiPost(`/api/admin/users/${id}/approve`, { role, branchCode });
      load();
    } catch (err) {
      setError(toUserError(err, "APPROVE_FAILED"));
    } finally {
      setBusyUserId(null);
    }
  }

  function updateDraft(userId: string, patch: Partial<UserDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [userId]: {
        role: prev[userId]?.role ?? "NONE",
        status: prev[userId]?.status ?? "PENDING_APPROVAL",
        branchCode: prev[userId]?.branchCode ?? "",
        ...patch
      }
    }));
  }

  async function saveUser(user: PendingUser) {
    setError(null);
    setBusyUserId(user.id);
    try {
      const draft = drafts[user.id] ?? {
        role: user.role,
        status: user.status,
        branchCode: user.branchCode || ""
      };
      const payload: Record<string, string | boolean> = {
        role: draft.role,
        status: draft.status
      };
      if (draft.role !== "ADMIN" && draft.role !== "NONE") {
        payload.branchCode = draft.branchCode || branchCode;
      } else {
        payload.clearBranch = true;
      }
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "UPDATE_FAILED");
      }
      load();
    } catch (err) {
      setError(toUserError(err, "UPDATE_FAILED"));
    } finally {
      setBusyUserId(null);
    }
  }

  async function unlockUser(id: string) {
    setError(null);
    setBusyUserId(id);
    try {
      await apiPost(`/api/admin/users/${id}/unlock`, {});
      load();
    } catch (err) {
      setError(toUserError(err, "UNLOCK_FAILED"));
    } finally {
      setBusyUserId(null);
    }
  }

  async function resetPassword(userId: string) {
    setError(null);
    setTemporaryPasswordNotice(null);
    setBusyUserId(userId);
    try {
      const result = await apiPost<{ id: string; temporaryPassword: string }>(
        `/api/admin/users/${userId}/reset-password`,
        {}
      );
      setTemporaryPasswordNotice(
        `סיסמה זמנית עבור ${result.id}: ${result.temporaryPassword}`
      );
      load();
    } catch (err) {
      setError(toUserError(err, "RESET_PASSWORD_FAILED"));
    } finally {
      setBusyUserId(null);
    }
  }

  async function uploadBranchManagersFile() {
    if (!importFile) {
      setError(toUserError(new Error("MISSING_FILE"), "IMPORT_FAILED"));
      return;
    }
    setError(null);
    setImportBusy(true);
    setImportSummary(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await fetch("/api/admin/users/import-branch-managers", {
        method: "POST",
        credentials: "include",
        body: formData
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "IMPORT_FAILED");
      }
      const summary = (await res.json()) as BranchManagerImportSummary;
      setImportSummary(summary);
      setImportFile(null);
      load();
    } catch (err) {
      setError(toUserError(err, "IMPORT_FAILED"));
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <div className="auth-card wide">
      <h1>אישורים ממתינים</h1>
      <p className="subtitle">אישור משתמשים חדשים והקצאת הרשאות.</p>
      <div className="panel inset">
        <p className="subtitle">ייבוא מנהלי סניף מקובץ XLSX</p>
        <div className="buttons">
          <label>
            בחירת קובץ
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              aria-label="ייבוא מנהלי סניף מקובץ XLSX"
            />
          </label>
          <button type="button" onClick={uploadBranchManagersFile} disabled={importBusy || !importFile}>
            טעינת מנהלי סניף
          </button>
        </div>
        {importSummary && (
          <p className="helper">
            נטענו {importSummary.totalRows} רשומות, נוצרו {importSummary.created}, עודכנו {importSummary.updated}.
          </p>
        )}
      </div>
      {error && (
        <div className="error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}
      {temporaryPasswordNotice && (
        <div className="panel inset" aria-live="polite">
          {temporaryPasswordNotice}
        </div>
      )}
      <div className="form grid">
        <label>
          תפקיד
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="TELLER">פקיד</option>
            <option value="BRANCH_MANAGER">מנהל סניף</option>
          </select>
        </label>
        <label>
          סניף
          <select value={branchCode} onChange={(e) => setBranchCode(e.target.value)}>
            {branches.map((b) => (
              <option key={b.branchCode} value={b.branchCode}>
                {b.branchCode} — {b.branchName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="table">
        <div className="row header">
          <span>שם</span>
          <span>מספר עובד</span>
          <span>שם משתמש</span>
          <span>תאריך בקשה</span>
          <span></span>
        </div>
        {users.map((u) => (
          <div className="row" key={u.id}>
            <span>{u.fullName}</span>
            <span>{u.employeeId}</span>
            <span>{u.username}</span>
            <span>{formatDate(u.createdAt)}</span>
            <button type="button" onClick={() => approve(u.id)}>
              אישור
            </button>
          </div>
        ))}
        {users.length === 0 && <p className="empty">אין משתמשים ממתינים.</p>}
      </div>
      <h2>ניהול משתמשים</h2>
      <div className="form grid">
        <label>
          חיפוש
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="שם, מספר עובד, שם משתמש"
          />
        </label>
        <label>
          סטטוס
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">הכל</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
          </select>
        </label>
        <label>
          תפקיד
          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
            <option value="">הכל</option>
            <option value="ADMIN">ADMIN</option>
            <option value="BRANCH_MANAGER">BRANCH_MANAGER</option>
            <option value="TELLER">TELLER</option>
            <option value="NONE">NONE</option>
          </select>
        </label>
        <label>
          סניף
          <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)}>
            <option value="">הכל</option>
            {branches
              .filter((b) => b.status === "ACTIVE")
              .map((b) => (
                <option key={`filter-${b.branchCode}`} value={b.branchCode}>
                  {b.branchCode} — {b.branchName}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="table">
        <div className="row header">
          <span>שם</span>
          <span>שם משתמש</span>
          <span>תפקיד</span>
          <span>סטטוס</span>
          <span>סניף</span>
        </div>
        {allUsers.map((u) => (
          <div className="row" key={`manage-${u.id}`}>
            <span>{u.fullName}</span>
            <span>{u.username}</span>
            <span>
              <select
                value={drafts[u.id]?.role ?? u.role}
                onChange={(e) => updateDraft(u.id, { role: e.target.value })}
                disabled={busyUserId === u.id}
              >
                <option value="ADMIN">מנהל מערכת</option>
                <option value="BRANCH_MANAGER">מנהל סניף</option>
                <option value="TELLER">פקיד</option>
                <option value="NONE">ללא</option>
              </select>
            </span>
            <span>
              <select
                value={drafts[u.id]?.status ?? u.status}
                onChange={(e) => updateDraft(u.id, { status: e.target.value })}
                disabled={busyUserId === u.id}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
              </select>
            </span>
            <span>
              <select
                value={drafts[u.id]?.branchCode ?? u.branchCode ?? ""}
                onChange={(e) => updateDraft(u.id, { branchCode: e.target.value })}
                disabled={busyUserId === u.id}
              >
                <option value="">-</option>
                {branches
                  .filter((b) => b.status === "ACTIVE")
                  .map((b) => (
                    <option key={`user-${u.id}-${b.branchCode}`} value={b.branchCode}>
                      {b.branchCode}
                    </option>
                  ))}
              </select>{" "}
              <button
                type="button"
                onClick={() => saveUser(u)}
                disabled={busyUserId === u.id}
              >
                שמירה
              </button>{" "}
              <button
                type="button"
                onClick={() => unlockUser(u.id)}
                disabled={busyUserId === u.id}
              >
                פתיחת נעילה
              </button>{" "}
              <button
                type="button"
                onClick={() => resetPassword(u.id)}
                disabled={busyUserId === u.id}
              >
                איפוס סיסמה
              </button>
            </span>
          </div>
        ))}
        {allUsers.length === 0 && <p className="empty">לא נמצאו משתמשים.</p>}
      </div>
    </div>
  );
}
