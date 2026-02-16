import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import AccountDetail from "./AccountDetail";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("../api", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args),
  apiPost: (...args: unknown[]) => apiPostMock(...args)
}));

vi.mock("../auth", () => ({
  useAuth: () => useAuthMock()
}));

const detailResponse = {
  account: {
    id: "acc-1",
    accountKey: "123456",
    fullAccountNumber: "0726-000123456",
    accountName: "Test Account",
    branchCode: "0726",
    currentBalance: 100,
    heldBalance: 0,
    liens: 0,
    openingBalance: 100,
    operationRestrictions: null,
    markers: null,
    version: 2
  },
  transactions: [
    {
      transactionId: "TXN-0726-20260207-000001",
      type: "DEPOSIT",
      amount: 10,
      balanceBefore: 90,
      balanceAfter: 100,
      status: "COMPLETED",
      referenceNote: null,
      createdAt: "2026-02-07T00:00:00.000Z"
    }
  ]
};

describe("AccountDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ me: { role: "TELLER", branchCode: "0726" } });
    apiGetMock.mockResolvedValue(detailResponse);
    apiPostMock.mockResolvedValue({});
  });

  function renderPage(initialEntry = "/accounts/123456") {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/accounts/:accountKey" element={<AccountDetail />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it("loads account and submits a transaction", async () => {
    renderPage();
    await screen.findByText("Test Account");

    fireEvent.change(screen.getByLabelText("סכום"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "ביצוע תנועה" }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/api/transactions", {
        accountKey: "123456",
        type: "DEPOSIT",
        amount: 25,
        expectedVersion: 2
      });
    });
  });

  it("voids a completed transaction", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "ביטול" }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/api/transactions/TXN-0726-20260207-000001/void", {});
    });
  });

  it("passes selected branch code for branch manager", async () => {
    useAuthMock.mockReturnValue({ me: { role: "BRANCH_MANAGER", branchCode: "0001" } });
    renderPage("/accounts/123456?branchCode=0726");

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith("/api/accounts/123456?branchCode=0726");
    });

    fireEvent.change(screen.getByLabelText("סכום"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "ביצוע תנועה" }));

    await waitFor(() => {
      expect(apiPostMock).toHaveBeenCalledWith("/api/transactions", {
        accountKey: "123456",
        type: "DEPOSIT",
        amount: 10,
        expectedVersion: 2,
        branchCode: "0726"
      });
    });
  });
});
