import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import Login from "./Login";

const apiPostMock = vi.fn();
const navigateMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("../api", () => ({
  apiPost: (...args: unknown[]) => apiPostMock(...args)
}));

vi.mock("../auth", () => ({
  useAuth: () => useAuthMock()
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ me: null, loading: false, refresh: vi.fn() });
  });

  it("submits credentials and navigates teller to account search", async () => {
    const refresh = vi.fn();
    useAuthMock.mockReturnValue({ me: null, loading: false, refresh });
    apiPostMock.mockResolvedValue({ role: "TELLER" });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("שם משתמש"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("סיסמה"), { target: { value: "Admin123!" } });
    fireEvent.click(screen.getByRole("button", { name: "כניסה" }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/api/auth/login", {
        username: "admin",
        password: "Admin123!"
      });
      expect(refresh).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith("/accounts/search");
    });
  });

  it("navigates non-teller users to account search", async () => {
    const refresh = vi.fn();
    useAuthMock.mockReturnValue({ me: null, loading: false, refresh });
    apiPostMock.mockResolvedValue({ role: "ADMIN" });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("שם משתמש"), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText("סיסמה"), { target: { value: "Admin123!" } });
    fireEvent.click(screen.getByRole("button", { name: "כניסה" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/accounts/search");
    });
  });
});
