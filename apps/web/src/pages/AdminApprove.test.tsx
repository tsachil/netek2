import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import AdminApprove from "./AdminApprove";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();

vi.mock("../api", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  apiPost: (...args: unknown[]) => apiPostMock(...args)
}));

describe("AdminApprove", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGetMock.mockImplementation((url: string) => {
      if (url.includes("/api/admin/users")) {
        return Promise.resolve([
          {
            id: "u1",
            fullName: "User One",
            employeeId: "123",
            username: "user1",
            status: "PENDING_APPROVAL",
            role: "NONE",
            branchCode: null,
            createdAt: "2026-02-07T00:00:00.000Z"
          }
        ]);
      }
      return Promise.resolve([{ branchCode: "0001", branchName: "Main", status: "ACTIVE" }]);
    });
    apiPostMock.mockResolvedValue({});
  });

  it("approves a pending user", async () => {
    render(<AdminApprove />);
    const rows = await screen.findAllByText("User One");
    expect(rows.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "אישור" }));
    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/api/admin/users/u1/approve", {
        role: "TELLER",
        branchCode: "0001"
      });
    });
  });

  it("applies user-management filters via query params", async () => {
    render(<AdminApprove />);
    await screen.findAllByText("User One");

    fireEvent.change(screen.getByLabelText("סטטוס"), { target: { value: "ACTIVE" } });
    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith(expect.stringContaining("/api/admin/users?"));
      expect(apiGetMock).toHaveBeenCalledWith(expect.stringContaining("status=ACTIVE"));
    });
  });

  it("resets user password and shows temporary password notice", async () => {
    apiPostMock.mockImplementation((url: string) => {
      if (url.includes("/reset-password")) {
        return Promise.resolve({ id: "u1", temporaryPassword: "Temp123!X" });
      }
      return Promise.resolve({});
    });

    render(<AdminApprove />);
    await screen.findAllByText("User One");

    fireEvent.click(screen.getByRole("button", { name: "איפוס סיסמה" }));
    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/api/admin/users/u1/reset-password", {});
      expect(screen.getByText(/סיסמה זמנית עבור u1: Temp123!X/)).toBeInTheDocument();
    });
  });
});
