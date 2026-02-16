import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
import App from "./App";

vi.mock("./auth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ me: null })
}));

vi.mock("./pages/Login", () => ({
  default: () => <div>Login Page</div>
}));

vi.mock("./pages/Register", () => ({
  default: () => <div>Register Page</div>
}));

vi.mock("./pages/Pending", () => ({
  default: () => <div>Pending Page</div>
}));

vi.mock("./pages/Dashboard", () => ({
  default: () => <div>Dashboard Page</div>
}));

vi.mock("./pages/AdminApprove", () => ({
  default: () => <div>Admin Approve Page</div>
}));

vi.mock("./pages/AdminBranches", () => ({
  default: () => <div>Admin Branches Page</div>
}));

vi.mock("./pages/AdminBcp", () => ({
  default: () => <div>Admin BCP Page</div>
}));

vi.mock("./pages/AdminAudit", () => ({
  default: () => <div>Admin Audit Page</div>
}));

vi.mock("./pages/AccountSearch", () => ({
  default: () => <div>Account Search Page</div>
}));

vi.mock("./pages/AccountDetail", () => ({
  default: () => <div>Account Detail Page</div>
}));

vi.mock("./ProtectedRoute", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

describe("App", () => {
  it("renders default login route", () => {
    render(<App />);
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });
});
