import { FormEvent, useEffect, useState } from "react";
import { apiPost } from "../api";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { toUserError } from "../errors";

function defaultRoute() {
  return "/accounts/search";
}

export default function Login() {
  const navigate = useNavigate();
  const { me, loading, refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && me) {
      navigate(defaultRoute(), { replace: true });
    }
  }, [loading, me, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiPost<{ role?: string }>("/api/auth/login", { username, password });
      refresh();
      navigate(defaultRoute());
    } catch (err) {
      const message = err instanceof Error ? err.message : "LOGIN_FAILED";
      if (message === "PENDING_APPROVAL") {
        navigate("/pending");
        return;
      }
      setError(toUserError(err, "LOGIN_FAILED"));
    }
  }

  return (
    <div className="auth-card">
      <h1>התחברות</h1>
      <p className="subtitle">גישה למערכת אופק בנתק</p>
      <form onSubmit={onSubmit} className="form" aria-describedby={error ? "login-error" : undefined}>
        <label>
          שם משתמש
          <input
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          סיסמה
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <div id="login-error" className="error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}
        <button type="submit">כניסה</button>
      </form>
      <p className="helper">
        עדיין אין משתמש? <Link to="/register">הרשמה</Link>
      </p>
    </div>
  );
}
