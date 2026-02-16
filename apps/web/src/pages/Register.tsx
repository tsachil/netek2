import { FormEvent, useState } from "react";
import { apiPost } from "../api";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { toUserError } from "../errors";

export default function Register() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [fullName, setFullName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [username, setUsername] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError(toUserError(new Error("PASSWORDS_MISMATCH"), "REGISTER_FAILED"));
      return;
    }
    try {
      await apiPost("/api/auth/register", {
        fullName,
        employeeId,
        username,
        password,
        branchCode
      });
      refresh();
      navigate("/pending");
    } catch (err) {
      setError(toUserError(err, "REGISTER_FAILED"));
    }
  }

  return (
    <div className="auth-card">
      <h1>הרשמה</h1>
      <p className="subtitle">בקשת גישה למערכת אופק בנתק</p>
      <form onSubmit={onSubmit} className="form" aria-describedby={error ? "register-error" : undefined}>
        <label>
          שם מלא
          <input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label>
          מספר עובד
          <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
        </label>
        <label>
          שם משתמש
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          קוד סניף
          <input value={branchCode} onChange={(e) => setBranchCode(e.target.value)} />
        </label>
        <label>
          סיסמה
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          אימות סיסמה
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>
        {error && (
          <div id="register-error" className="error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}
        <button type="submit">שליחת בקשה</button>
      </form>
      <p className="helper">
        כבר יש לך הרשאה? <Link to="/">התחברות</Link>
      </p>
    </div>
  );
}
