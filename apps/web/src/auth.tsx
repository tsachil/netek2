import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiGet } from "./api";
import { toUserError } from "./errors";

export type Me = {
  id: string;
  fullName: string;
  role: string;
  status: string;
  branchCode: string | null;
};

type AuthState = {
  me: Me | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    apiGet<Me>("/api/auth/me")
      .then((data) => {
        setMe(data);
        setLoading(false);
      })
      .catch((err) => {
        setMe(null);
        setError(toUserError(err, "AUTH_FAILED"));
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  const value = useMemo(
    () => ({ me, loading, error, refresh: load }),
    [me, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("AuthProvider missing");
  }
  return ctx;
}
