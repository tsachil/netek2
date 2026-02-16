import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import AccountSearch from "./AccountSearch";

const apiGetMock = vi.fn();
const useAuthMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("../api", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args)
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

describe("AccountSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGetMock.mockImplementation((url: string) => {
      if (url === "/api/branches") {
        return Promise.resolve([
          { branchCode: "0726", branchName: "תל אביב", status: "ACTIVE" },
          { branchCode: "0001", branchName: "ראשי", status: "ACTIVE" }
        ]);
      }

      return Promise.resolve([
        {
          id: "acc-1",
          accountKey: "123456",
          fullAccountNumber: "0726-000123456",
          accountName: "Test Account",
          currentBalance: 120.5,
          restricted: false,
          hasLiens: false,
          version: 3,
          branchCode: "0726"
        }
      ]);
    });
  });

  it("searches and opens account details for teller", async () => {
    useAuthMock.mockReturnValue({
      me: { role: "TELLER", branchCode: "0726" }
    });

    render(<AccountSearch />);
    const branchSelect = screen.getByLabelText("סניף") as HTMLSelectElement;
    expect(branchSelect.value).toBe("0726");
    expect(branchSelect).toBeDisabled();
    fireEvent.change(screen.getByLabelText("מונח חיפוש"), { target: { value: "test" } });
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith("/api/accounts/search?q=test");
    });

    fireEvent.click(await screen.findByRole("button", { name: "פתיחה" }));
    expect(navigateMock).toHaveBeenCalledWith("/accounts/123456");
  });

  it("searches all branches for admin when no branch is selected", async () => {
    useAuthMock.mockReturnValue({
      me: { role: "ADMIN", branchCode: null }
    });

    render(<AccountSearch />);
    fireEvent.change(screen.getByLabelText("מונח חיפוש"), { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith("/api/accounts/search?q=abc");
    });
  });

  it("includes branch filter for admin when a branch is selected", async () => {
    useAuthMock.mockReturnValue({
      me: { role: "ADMIN", branchCode: null }
    });

    render(<AccountSearch />);
    await screen.findByRole("option", { name: "0726 - תל אביב" });
    fireEvent.change(screen.getByLabelText("מונח חיפוש"), { target: { value: "abc" } });
    fireEvent.change(screen.getByLabelText("סניף"), { target: { value: "0726" } });
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith("/api/accounts/search?q=abc&branchCode=0726");
    });
  });

  it("defaults branch manager to assigned branch but allows changing it", async () => {
    useAuthMock.mockReturnValue({
      me: { role: "BRANCH_MANAGER", branchCode: "0001" }
    });

    render(<AccountSearch />);
    await screen.findByRole("option", { name: "0001 - ראשי" });

    const branchSelect = screen.getByLabelText("סניף") as HTMLSelectElement;
    expect(branchSelect.value).toBe("0001");
    expect(branchSelect).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText("מונח חיפוש"), { target: { value: "abc" } });
    fireEvent.change(branchSelect, { target: { value: "0726" } });
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));

    await waitFor(() => {
      expect(apiGetMock).toHaveBeenCalledWith("/api/accounts/search?q=abc&branchCode=0726");
    });
  });
});
