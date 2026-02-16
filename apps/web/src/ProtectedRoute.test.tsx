import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import ProtectedRoute from "./ProtectedRoute";

const useAuthMock = vi.fn();

vi.mock("./auth", () => ({
  useAuth: () => useAuthMock()
}));

function renderRoute(allowPending = false) {
  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route
          path="/"
          element={<div>Login Page</div>}
        />
        <Route
          path="/pending"
          element={<div>Pending Page</div>}
        />
        <Route
          path="/protected"
          element={
            <ProtectedRoute allowPending={allowPending}>
              <div>Secret Content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  it("shows loading state while auth is loading", () => {
    useAuthMock.mockReturnValue({ me: null, loading: true });
    renderRoute();
    expect(screen.getByText("טוען...")).toBeInTheDocument();
  });

  it("redirects unauthenticated users to login", () => {
    useAuthMock.mockReturnValue({ me: null, loading: false });
    renderRoute();
    expect(screen.getByText("Login Page")).toBeInTheDocument();
  });

  it("redirects non-active users to pending when allowPending is false", () => {
    useAuthMock.mockReturnValue({
      me: { id: "u1", status: "PENDING_APPROVAL" },
      loading: false
    });
    renderRoute(false);
    expect(screen.getByText("Pending Page")).toBeInTheDocument();
  });

  it("renders children when user is active", () => {
    useAuthMock.mockReturnValue({
      me: { id: "u1", status: "ACTIVE" },
      loading: false
    });
    renderRoute();
    expect(screen.getByText("Secret Content")).toBeInTheDocument();
  });
});
