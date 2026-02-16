import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import AdminAudit from "./AdminAudit";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();

vi.mock("../api", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  apiPost: (...args: unknown[]) => apiPostMock(...args)
}));

describe("AdminAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGetMock.mockImplementation((url: string) => {
      if (url.includes("/retention/policy")) {
        return Promise.resolve({
          enabled: true,
          intervalHours: 24,
          olderThanDays: 2555,
          dryRun: true,
          archiveDir: null
        });
      }
      if (url.includes("/retention/status")) {
        return Promise.resolve({
          policy: {
            enabled: true,
            intervalHours: 24,
            olderThanDays: 2555,
            dryRun: true,
            archiveDir: null
          },
          lastRun: {
            id: "log-ret-1",
            createdAt: "2026-02-07T10:00:00.000Z",
            source: "MANUAL",
            dryRun: true,
            cutoffDate: "2026-02-06T00:00:00.000Z",
            matched: 3,
            deleted: 0,
            archivedFilePath: null
          },
          lastError: null
        });
      }
      if (url.includes("/retention/history")) {
        return Promise.resolve([
          {
            id: "log-ret-1",
            createdAt: "2026-02-07T10:00:00.000Z",
            source: "MANUAL",
            dryRun: true,
            cutoffDate: "2026-02-06T00:00:00.000Z",
            matched: 3,
            deleted: 0,
            archivedFilePath: null
          }
        ]);
      }
      return Promise.resolve([
        {
          id: "log-1",
          userId: "u1",
          action: "TRANSACTION_CREATE",
          entityType: "TRANSACTION",
          entityId: "TXN-0726-20260207-000001",
          branchCode: "0726",
          createdAt: "2026-02-07T08:00:00.000Z",
          actor: { id: "u1", fullName: "User One", username: "user1" }
        }
      ]);
    });
    apiPostMock.mockResolvedValue({
      dryRun: true,
      cutoffDate: "2026-02-06T00:00:00.000Z",
      matched: 3,
      deleted: 0
    });
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  it("loads and renders logs", async () => {
    render(<AdminAudit />);
    expect(await screen.findByText("TRANSACTION_CREATE")).toBeInTheDocument();
    expect(await screen.findByText(/מדיניות: פעילה כל 24 שעות/)).toBeInTheDocument();
    expect(await screen.findByText(/הרצה אחרונה:/)).toBeInTheDocument();
  });

  it("applies filter query params", async () => {
    render(<AdminAudit />);
    await screen.findByText("TRANSACTION_CREATE");

    fireEvent.change(screen.getByLabelText("פעולה"), { target: { value: "DAY_OPEN" } });
    fireEvent.change(screen.getByLabelText("קוד סניף"), { target: { value: "0726" } });
    fireEvent.click(screen.getByRole("button", { name: "סינון" }));

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith(expect.stringContaining("action=DAY_OPEN"));
      expect(apiGetMock).toHaveBeenCalledWith(expect.stringContaining("branchCode=0726"));
    });
  });

  it("opens export endpoint with filters", async () => {
    render(<AdminAudit />);
    await screen.findByText("TRANSACTION_CREATE");

    fireEvent.change(screen.getByLabelText("פעולה"), { target: { value: "DAY_OPEN" } });
    fireEvent.click(screen.getByRole("button", { name: "ייצוא CSV" }));

    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("/api/admin/audit-logs/export?action=DAY_OPEN"),
      "_blank"
    );
  });

  it("runs retention dry run", async () => {
    render(<AdminAudit />);
    await screen.findByText("TRANSACTION_CREATE");

    fireEvent.change(screen.getByLabelText("שמירת ימים אחרונים"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "בדיקת דמה לשימור" }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/api/admin/audit-logs/retention/run", {
        olderThanDays: 90,
        dryRun: true
      });
      expect(screen.getByText("בדיקת דמה: נמצאו 3, נמחקו 0")).toBeInTheDocument();
    });
  });
});
