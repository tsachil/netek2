import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import Register from "./Register";

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

describe("Register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ refresh: vi.fn() });
  });

  it("shows mismatch error when passwords differ", async () => {
    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("סיסמה"), { target: { value: "one" } });
    fireEvent.change(screen.getByLabelText("אימות סיסמה"), { target: { value: "two" } });
    fireEvent.click(screen.getByRole("button", { name: "שליחת בקשה" }));

    expect(await screen.findByText("הסיסמאות אינן תואמות.")).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("submits registration and navigates to pending", async () => {
    const refresh = vi.fn();
    useAuthMock.mockReturnValue({ refresh });
    apiPostMock.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText("שם מלא"), { target: { value: "Test User" } });
    fireEvent.change(screen.getByLabelText("מספר עובד"), { target: { value: "1234" } });
    fireEvent.change(screen.getByLabelText("שם משתמש"), { target: { value: "testuser" } });
    fireEvent.change(screen.getByLabelText("קוד סניף"), { target: { value: "0001" } });
    fireEvent.change(screen.getByLabelText("סיסמה"), { target: { value: "Pass123!" } });
    fireEvent.change(screen.getByLabelText("אימות סיסמה"), { target: { value: "Pass123!" } });
    fireEvent.click(screen.getByRole("button", { name: "שליחת בקשה" }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalled();
      expect(refresh).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith("/pending");
    });
  });
});
