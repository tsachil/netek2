import { Navigate } from "react-router-dom";
import { useAuth } from "./auth";

export default function ProtectedRoute({
  children,
  allowPending = false
}: {
  children: React.ReactNode;
  allowPending?: boolean;
}) {
  const { me, loading } = useAuth();

  if (loading) {
    return <div className="auth-card">טוען...</div>;
  }

  if (!me) {
    return <Navigate to="/" replace />;
  }

  if (!allowPending && me.status !== "ACTIVE") {
    return <Navigate to="/pending" replace />;
  }

  return <>{children}</>;
}
