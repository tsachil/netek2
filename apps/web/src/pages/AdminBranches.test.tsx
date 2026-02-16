import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import AdminBranches from "./AdminBranches";

const apiGetMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("../api", () => ({
  apiGet: (...args: unknown[]) => apiGetMock(...args)
}));

describe("AdminBranches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGetMock.mockResolvedValue([{ branchCode: "0001", branchName: "Main", status: "ACTIVE" }]);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ imported: 1 }) });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("loads branch table and imports CSV", async () => {
    render(<AdminBranches />);
    expect(await screen.findByText("Main")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ייבוא סניפים" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/branches/import", expect.any(Object));
    });
  });
});
