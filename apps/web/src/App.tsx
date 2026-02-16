import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Pending from "./pages/Pending";
import Dashboard from "./pages/Dashboard";
import AdminApprove from "./pages/AdminApprove";
import AdminBranches from "./pages/AdminBranches";
import AdminBcp from "./pages/AdminBcp";
import AdminAudit from "./pages/AdminAudit";
import AccountSearch from "./pages/AccountSearch";
import AccountDetail from "./pages/AccountDetail";
import "./index.css";
import { AuthProvider, useAuth } from "./auth";
import ProtectedRoute from "./ProtectedRoute";
import { apiPost } from "./api";

type Crumb = {
  label: string;
  to?: string;
};

function buildCrumbs(pathname: string): Crumb[] {
  if (pathname === "/") return [{ label: "התחברות" }];
  if (pathname === "/register") return [{ label: "הרשמה" }];
  if (pathname === "/pending") return [{ label: "ממתין לאישור" }];
  if (pathname === "/dashboard") return [{ label: "לוח בקרה" }];
  if (pathname === "/admin/approvals") {
    return [{ label: "לוח בקרה", to: "/dashboard" }, { label: "אישורי משתמשים" }];
  }
  if (pathname === "/admin/branches") {
    return [{ label: "לוח בקרה", to: "/dashboard" }, { label: "ניהול סניפים" }];
  }
  if (pathname === "/admin/bcp") {
    return [{ label: "לוח בקרה", to: "/dashboard" }, { label: "ניהול יום עסקים" }];
  }
  if (pathname === "/admin/audit") {
    return [{ label: "לוח בקרה", to: "/dashboard" }, { label: "יומן ביקורת" }];
  }
  if (pathname === "/accounts/search") {
    return [{ label: "לוח בקרה", to: "/dashboard" }, { label: "חיפוש חשבונות" }];
  }
  if (pathname.startsWith("/accounts/")) {
    return [
      { label: "לוח בקרה", to: "/dashboard" },
      { label: "חיפוש חשבונות", to: "/accounts/search" },
      { label: "פרטי חשבון" }
    ];
  }
  return [{ label: "מסך" }];
}

function AppShell() {
  const { me, refresh } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const showWorkspaceNav = Boolean(me && location.pathname !== "/" && location.pathname !== "/register");
  const crumbs = buildCrumbs(location.pathname);

  async function logout() {
    try {
      await apiPost("/api/auth/logout", {});
    } finally {
      refresh();
      navigate("/");
    }
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        דילוג לתוכן הראשי
      </a>
      {showWorkspaceNav && (
        <header className="topbar" role="banner">
          <div className="topbar-brand">
            <strong>אופק בנתק</strong>
            <span>מערכת סניפים ותנועות</span>
          </div>
          <nav className="menu" aria-label="ניווט ראשי">
            <Link to="/dashboard">לוח בקרה</Link>
            <Link to="/accounts/search">חשבונות ותנועות</Link>
            {me?.role === "ADMIN" && <Link to="/admin/approvals">אדמין</Link>}
            <button type="button" className="menu-logout" onClick={logout}>
              התנתקות
            </button>
          </nav>
        </header>
      )}
      {showWorkspaceNav && (
        <div className="subnav">
          <button type="button" className="back-button" onClick={() => navigate(-1)}>
            חזרה
          </button>
          <nav className="breadcrumbs" aria-label="פירורי לחם">
            {crumbs.map((crumb, idx) => {
              const isLast = idx === crumbs.length - 1;
              return (
                <span key={`${crumb.label}-${idx}`}>
                  {crumb.to && !isLast ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
                  {!isLast && <span className="crumb-sep">/</span>}
                </span>
              );
            })}
          </nav>
        </div>
      )}
      <main id="main-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/pending"
            element={
              <ProtectedRoute allowPending>
                <Pending />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/approvals"
            element={
              <ProtectedRoute>
                <AdminApprove />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/branches"
            element={
              <ProtectedRoute>
                <AdminBranches />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/bcp"
            element={
              <ProtectedRoute>
                <AdminBcp />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/audit"
            element={
              <ProtectedRoute>
                <AdminAudit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts/search"
            element={
              <ProtectedRoute>
                <AccountSearch />
              </ProtectedRoute>
            }
          />
          <Route
            path="/accounts/:accountKey"
            element={
              <ProtectedRoute>
                <AccountDetail />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  );
}
