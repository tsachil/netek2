import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import Pending from "./Pending";

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

describe("Pending", () => {
  it("renders user info and logs out", async () => {
    const refresh = vi.fn();
    useAuthMock.mockReturnValue({
      me: { fullName: "User Name", status: "PENDING_APPROVAL" },
      refresh
    });
    apiPostMock.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Pending />
      </MemoryRouter>
    );

    expect(screen.getByText("User Name")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "התנתקות" }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/api/auth/logout", {});
      expect(refresh).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith("/");
    });
  });
});
