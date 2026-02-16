import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import Dashboard from "./Dashboard";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const useAuthMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("../api", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
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

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGetMock.mockImplementation((url: string) => {
      if (url === "/api/ledger/branches") {
        return Promise.resolve({
          businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
          branches: ["0726"]
        });
      }
      if (url === "/api/reconciliation/branch-handoff") {
        return Promise.resolve({
          businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
          branchCode: null,
          tellers: []
        });
      }
      if (url.startsWith("/api/dashboard/summary")) {
        return Promise.resolve({
          businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
          role: "ADMIN",
          scopeBranchCode: null,
          totals: {
            txCount: 2,
            deposits: 50,
            withdrawals: 20,
            net: 30
          },
          recentPage: 1,
          recentPageSize: 10,
          recentTotal: 0,
          recentTotalPages: 1,
          recent: []
        });
      }
      return Promise.resolve({
        businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
        state: "LOADING",
        branchesLoaded: 1,
        totalAccountsLoaded: 12,
        ledgerRecordCount: 0
      });
    });
    useAuthMock.mockReturnValue({ me: { role: "ADMIN" }, refresh: vi.fn() });
  });

  it("loads day state and triggers open action", async () => {
    apiPostMock.mockResolvedValue({
      businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
      state: "OPEN",
      branchesLoaded: 1,
      totalAccountsLoaded: 12,
      ledgerRecordCount: 0
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(await screen.findByText("LOADING")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "פתיחת יום עסקים" }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/api/day/open", {});
    });
  });

  it("renders teller daily summary panel", async () => {
    useAuthMock.mockReturnValue({ me: { role: "TELLER" }, refresh: vi.fn() });
    apiGetMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/dashboard/summary")) {
        return Promise.resolve({
          businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
          role: "TELLER",
          scopeBranchCode: "0726",
          totals: {
            txCount: 1,
            deposits: 100,
            withdrawals: 0,
            net: 100
          },
          recentPage: 1,
          recentPageSize: 10,
          recentTotal: 1,
          recentTotalPages: 1,
          recent: [
            {
              transactionId: "TXN-0726-20260207-000001",
              type: "DEPOSIT",
              amount: 100,
              status: "COMPLETED",
              branchCode: "0726",
              accountKey: "123456",
              createdAt: new Date("2026-02-07T00:00:00.000Z").toISOString()
            }
          ]
        });
      }
      if (url === "/api/reconciliation/summary") {
        return Promise.resolve({
          businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
          dayState: "CLOSING",
          role: "TELLER",
          branchCode: "0726",
          totals: {
            txCount: 1,
            deposits: 100,
            withdrawals: 0,
            net: 100,
            voidedCount: 0,
            lastActivityAt: new Date("2026-02-07T00:00:00.000Z").toISOString()
          },
          canSubmit: true,
          handoff: null
        });
      }
      if (url === "/api/ledger/branches") {
        return Promise.resolve({
          businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
          branches: []
        });
      }
      return Promise.resolve({
        businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
        state: "OPEN",
        branchesLoaded: 1,
        totalAccountsLoaded: 12,
        ledgerRecordCount: 0
      });
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(await screen.findByText("התנועות שלי היום")).toBeInTheDocument();
    expect(screen.getByText("TXN-0726-20260207-000001")).toBeInTheDocument();
    expect(screen.getByText("מסירת התאמת סוף יום")).toBeInTheDocument();
  });

  it("renders branch manager team activity panel", async () => {
    useAuthMock.mockReturnValue({ me: { role: "BRANCH_MANAGER" }, refresh: vi.fn() });
    apiGetMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/dashboard/summary")) {
        return Promise.resolve({
          businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
          role: "BRANCH_MANAGER",
          scopeBranchCode: "0726",
          totals: {
            txCount: 2,
            deposits: 40,
            withdrawals: 10,
            net: 30
          },
          recentPage: 1,
          recentPageSize: 10,
          recentTotal: 0,
          recentTotalPages: 1,
          team: [
            {
              tellerUserId: "teller-1",
              fullName: "Teller One",
              username: "teller1",
              txCount: 2,
              lastActivityAt: new Date("2026-02-07T10:00:00.000Z").toISOString()
            },
            {
              tellerUserId: "teller-2",
              fullName: "Teller Two",
              username: "teller2",
              txCount: 0,
              lastActivityAt: null
            }
          ],
          recent: []
        });
      }
      if (url === "/api/ledger/branches") {
        return Promise.resolve({
          businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
          branches: []
        });
      }
      if (url === "/api/reconciliation/branch-handoff") {
        return Promise.resolve({
          businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
          branchCode: "0726",
          tellers: [
            {
              tellerUserId: "teller-1",
              fullName: "Teller One",
              username: "teller1",
              branchCode: "0726",
              totals: {
                txCount: 2,
                deposits: 40,
                withdrawals: 10,
                net: 30,
                voidedCount: 0
              },
              handoff: {
                declaredNet: 30,
                discrepancy: 0,
                submittedAt: new Date("2026-02-07T11:00:00.000Z").toISOString()
              }
            }
          ]
        });
      }
      return Promise.resolve({
        businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
        state: "OPEN",
        branchesLoaded: 1,
        totalAccountsLoaded: 12,
        ledgerRecordCount: 0
      });
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(await screen.findByText("סיכום סניף 0726")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "פעילות טלרים בסניף" })).toBeInTheDocument();
    expect(screen.getAllByText("Teller One").length).toBeGreaterThan(0);
    expect(screen.getByText("teller2")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "מסירות התאמה של טלרים" })).toBeInTheDocument();
  });

  it("requests summary with filters and paging", async () => {
    apiGetMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/dashboard/summary")) {
        const parsed = new URL(url, "http://localhost");
        const page = Number(parsed.searchParams.get("page") ?? "1");
        return Promise.resolve({
          businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
          role: "ADMIN",
          scopeBranchCode: null,
          totals: {
            txCount: 2,
            deposits: 50,
            withdrawals: 20,
            net: 30
          },
          recentPage: page,
          recentPageSize: 10,
          recentTotal: 12,
          recentTotalPages: 2,
          recent: []
        });
      }
      if (url === "/api/ledger/branches") {
        return Promise.resolve({
          businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
          branches: ["0726"]
        });
      }
      if (url === "/api/reconciliation/branch-handoff") {
        return Promise.resolve({
          businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
          branchCode: null,
          tellers: []
        });
      }
      return Promise.resolve({
        businessDate: new Date("2026-02-07T00:00:00.000Z").toISOString(),
        state: "LOADING",
        branchesLoaded: 1,
        totalAccountsLoaded: 12,
        ledgerRecordCount: 0
      });
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await screen.findByText("עמוד 1 מתוך 2 (12 תנועות)");
    fireEvent.change(screen.getByLabelText("חיפוש"), { target: { value: "0726" } });
    fireEvent.change(screen.getByLabelText("סוג תנועה"), { target: { value: "DEPOSIT" } });
    fireEvent.change(screen.getByLabelText("סטטוס"), { target: { value: "COMPLETED" } });

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith(
        "/api/dashboard/summary?page=1&pageSize=10&q=0726&type=DEPOSIT&status=COMPLETED"
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "הבא" }));
    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith(
        "/api/dashboard/summary?page=2&pageSize=10&q=0726&type=DEPOSIT&status=COMPLETED"
      );
    });
  });
});
