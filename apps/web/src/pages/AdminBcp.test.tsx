import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import AdminBcp from "./AdminBcp";

const fetchMock = vi.fn();
const openMock = vi.fn();

describe("AdminBcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/day/current") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            businessDate: "2026-02-07T00:00:00.000Z",
            state: "LOADING",
            branchesLoaded: 1,
            totalAccountsLoaded: 10,
            ledgerRecordCount: 0
          })
        });
      }
      if (url === "/api/ledger/branches") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            businessDate: "2026-02-07T00:00:00.000Z",
            branches: ["0726"]
          })
        });
      }
      if (url === "/api/day/open" && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            businessDate: "2026-02-07T00:00:00.000Z",
            state: "OPEN",
            branchesLoaded: 1,
            totalAccountsLoaded: 10,
            ledgerRecordCount: 0
          })
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ rows: 1, branchCode: "0726", totalCurrentBalance: 100 })
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("open", openMock);
  });

  it("validates pasted CSV and renders summary", async () => {
    render(<AdminBcp />);
    fireEvent.change(screen.getByLabelText("תוכן CSV"), { target: { value: "a,b,c" } });
    fireEvent.click(screen.getByRole("button", { name: "בדיקת CSV מודבק" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/bcp/validate", expect.any(Object));
      expect(screen.getByText("0726")).toBeInTheDocument();
    });
  });

  it("triggers day open action and ledger downloads", async () => {
    render(<AdminBcp />);
    expect(await screen.findByText("LOADING")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "פתיחת יום עסקים" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/day/open", expect.any(Object));
    });

    fireEvent.click(screen.getByRole("button", { name: "הורדת כל קבצי ה-Ledger (ZIP)" }));
    expect(openMock).toHaveBeenCalledWith("/api/ledger/all", "_blank");
  });
});
