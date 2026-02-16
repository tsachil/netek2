import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { apiPost } from "../api";

export default function Pending() {
  const navigate = useNavigate();
  const { me, refresh } = useAuth();

  async function logout() {
    try {
      await apiPost("/api/auth/logout", {});
    } finally {
      refresh();
      navigate("/");
    }
  }

  return (
    <div className="auth-card" aria-live="polite">
      <h1>ממתין לאישור</h1>
      <p className="subtitle">הבקשה שלך נשלחה בהצלחה.</p>
      <div className="panel">
        <p>
          מנהל מערכת צריך לאשר את החשבון שלך לפני שניתן להתחבר. במקרה דחוף ניתן לפנות למנהל הסניף.
        </p>
        {me && (
          <div className="panel inset">
            <div className="row">
              <span>שם</span>
              <span>{me.fullName}</span>
            </div>
            <div className="row">
              <span>סטטוס</span>
              <span>{me.status}</span>
            </div>
          </div>
        )}
      </div>
      <p className="helper">
        <button type="button" onClick={logout}>
          התנתקות
        </button>
      </p>
    </div>
  );
}
