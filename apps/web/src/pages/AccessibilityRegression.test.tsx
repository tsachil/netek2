import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import Login from "./Login";
import AccountSearch from "./AccountSearch";
import AccountDetail from "./AccountDetail";

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

describe("Accessibility Regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps login controls accessible by label", () => {
    useAuthMock.mockReturnValue({ me: null, loading: false, refresh: vi.fn() });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "התחברות" })).toBeInTheDocument();
    expect(screen.getByLabelText("שם משתמש")).toBeInTheDocument();
    expect(screen.getByLabelText("סיסמה")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "כניסה" })).toBeInTheDocument();
  });

  it("keeps account search table and branch selector accessible for admin", async () => {
    useAuthMock.mockReturnValue({ me: { role: "ADMIN", branchCode: null } });
    apiGetMock.mockImplementation((url: string) => {
      if (url === "/api/branches") {
        return Promise.resolve([{ branchCode: "0726", branchName: "תל אביב", status: "ACTIVE" }]);
      }
      return Promise.resolve([]);
    });

    render(<AccountSearch />);

    expect(await screen.findByLabelText("סניף")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "כל הסניפים" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "תוצאות חיפוש חשבונות" })).toBeInTheDocument();
  });

  it("keeps account detail transaction history table accessible", async () => {
    useAuthMock.mockReturnValue({ me: { role: "TELLER", branchCode: "0726" } });
    apiGetMock.mockResolvedValue({
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
        version: 1
      },
      transactions: []
    });

    render(
      <MemoryRouter initialEntries={["/accounts/123456"]}>
        <Routes>
          <Route path="/accounts/:accountKey" element={<AccountDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "פרטי חשבון" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "היסטוריית תנועות" })).toBeInTheDocument();
  });
});
