import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { Equipment, Paginated, SiteSummary } from "../api/types";
import { OLIVIA, renderApp, seedSession } from "../test/renderApp";

// The real dashboard (router, auth, React Query, all components) with only the
// API functions replaced, so each test checks what's shown and what's requested.
vi.mock("../api/endpoints", () => ({
  api: { login: vi.fn(), me: vi.fn(), getSites: vi.fn(), listEquipment: vi.fn() },
}));
const getSites = vi.mocked(api.getSites);
const listEquipment = vi.mocked(api.listEquipment);

const SITES: SiteSummary[] = [
  { id: 1, name: "North Yard", total: 10, staleCount: 2, counts: { OPERATIONAL: 6, DEGRADED: 2, DOWN: 1, IN_MAINTENANCE: 1 } },
  { id: 2, name: "South Plant", total: 5, staleCount: 1, counts: { OPERATIONAL: 2, DEGRADED: 0, DOWN: 3, IN_MAINTENANCE: 0 } },
];

const DAY = 86_400_000;
function item(overrides: Partial<Equipment> & { id: number; name: string }): Equipment {
  return {
    type: "Generator",
    site: { id: 1, name: "North Yard" },
    status: "OPERATIONAL",
    lastCheckedAt: new Date(Date.now() - DAY).toISOString(),
    lastCheckedBy: { id: 1, displayName: "Olivia Ortiz" },
    isStale: false,
    version: 1,
    ...overrides,
  };
}

const ITEMS = [
  item({ id: 7, name: "Generator A" }),
  item({
    id: 9,
    name: "Pump 3",
    type: "Pump",
    status: "DOWN",
    isStale: true,
    lastCheckedAt: new Date(Date.now() - 12 * DAY).toISOString(),
  }),
];

function page(data: Equipment[], extra: Partial<Paginated<Equipment>> = {}): Paginated<Equipment> {
  return { data, page: 1, pageSize: 20, total: data.length, ...extra };
}

/** The query sent with the most recent list request. */
const lastListQuery = () => listEquipment.mock.lastCall?.[0];

beforeEach(() => {
  seedSession(OLIVIA);
  vi.mocked(api.me).mockResolvedValue({ user: OLIVIA });
  getSites.mockResolvedValue({ data: SITES, types: ["Generator", "Pump"] });
  listEquipment.mockResolvedValue(page(ITEMS));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  localStorage.clear();
});

async function renderDashboard(path = "/") {
  const result = renderApp(path);
  await screen.findByRole("cell", { name: "7" });
  return result;
}

const card = (name: RegExp) => within(screen.getByRole("region", { name: "Status summary" })).getByRole("button", { name });

describe("dashboard", () => {
  it("loads sites and the first page of equipment on mount", async () => {
    await renderDashboard();

    expect(getSites).toHaveBeenCalledOnce();
    expect(lastListQuery()).toEqual(expect.objectContaining({ page: 1, pageSize: 20 }));
    expect(lastListQuery()?.siteId).toBeUndefined();

    const sidebar = screen.getByRole("navigation", { name: "Sites" });
    expect(within(sidebar).getByRole("button", { name: /All sites/ })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar).getByRole("button", { name: /South Plant/ })).toHaveTextContent("3");

    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2
    expect(within(rows[2]!).getByRole("rowheader")).toHaveTextContent("Pump 3");
    expect(rows[2]).toHaveTextContent("Down");
    expect(rows[2]).toHaveTextContent("12 days ago");
  });

  it("adds up every site's counts for the stat cards when no site is selected", async () => {
    await renderDashboard();

    expect(card(/Total/)).toHaveTextContent("15");
    expect(card(/Down/)).toHaveTextContent("4");
    expect(card(/Operational/)).toHaveTextContent("8");
    expect(card(/Stale/)).toHaveTextContent("3");
  });

  it("selecting a site filters the list, updates the URL and shows that site's counts", async () => {
    const { user } = await renderDashboard("/?page=2");

    await user.click(screen.getByRole("button", { name: /South Plant/ }));

    expect(screen.getByTestId("location")).toHaveTextContent("/?site=2");
    await waitFor(() => expect(lastListQuery()).toEqual(expect.objectContaining({ siteId: 2, page: 1 })));
    expect(screen.getByRole("heading", { name: "South Plant" })).toBeInTheDocument();
    expect(card(/Total/)).toHaveTextContent("5");
    expect(card(/Down/)).toHaveTextContent("3");
  });

  it("clicking a status card filters the table by that status, and clicking it again clears it", async () => {
    const { user } = await renderDashboard();

    await user.click(card(/Down/));

    expect(card(/Down/)).toHaveAttribute("aria-pressed", "true");
    expect(card(/Total/)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("location")).toHaveTextContent("/?status=DOWN");
    await waitFor(() => expect(lastListQuery()?.status).toEqual(["DOWN"]));
    // The matching chip shows the same filter.
    expect(within(screen.getByRole("group", { name: "Status" })).getByRole("button", { name: /Down/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(card(/Down/));
    expect(card(/Total/)).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(lastListQuery()?.status).toBeUndefined());
  });

  it("the stale card asks the server for stale items only", async () => {
    const { user } = await renderDashboard();

    await user.click(card(/Stale/));

    await waitFor(() => expect(lastListQuery()?.stale).toBe(true));
    expect(screen.getByTestId("location")).toHaveTextContent("/?stale=1");
  });

  it("highlights stale rows", async () => {
    await renderDashboard();

    const [, fresh, stale] = screen.getAllByRole("row");
    expect(stale!.className).toMatch(/staleRow/);
    expect(within(stale!).getByText("Stale")).toBeInTheDocument();
    expect(fresh!.className).not.toMatch(/staleRow/);
  });

  it("restores filters from the URL on load", async () => {
    await renderDashboard("/?site=1&status=DOWN,DEGRADED&type=Pump&q=gen&page=2");

    expect(lastListQuery()).toEqual({
      siteId: 1,
      status: ["DOWN", "DEGRADED"],
      stale: undefined,
      type: "Pump",
      q: "gen",
      page: 2,
      pageSize: 20,
    });
    expect(screen.getByRole("searchbox")).toHaveValue("gen");
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue("Pump");
  });

  it("searches once typing pauses, not on every keystroke", async () => {
    const { user } = await renderDashboard();
    const callsBefore = listEquipment.mock.calls.length;

    await user.type(screen.getByRole("searchbox"), "pump");

    await waitFor(() => expect(lastListQuery()?.q).toBe("pump"));
    expect(listEquipment.mock.calls.length).toBe(callsBefore + 1);
    expect(screen.getByTestId("location")).toHaveTextContent("/?q=pump");
  });

  it("filters by type from the dropdown", async () => {
    const { user } = await renderDashboard();

    await user.selectOptions(screen.getByRole("combobox", { name: "Type" }), "Pump");

    await waitFor(() => expect(lastListQuery()?.type).toBe("Pump"));
  });

  it("pages through results", async () => {
    listEquipment.mockResolvedValue(page(ITEMS, { total: 45 }));
    const { user } = await renderDashboard();

    expect(screen.getByText("Showing 1–20 of 45")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Page 3" }));

    await waitFor(() => expect(lastListQuery()?.page).toBe(3));
    expect(screen.getByTestId("location")).toHaveTextContent("/?page=3");
  });

  it("keeps the current rows, with correct ages, while the next page loads", async () => {
    listEquipment.mockResolvedValue(page(ITEMS, { total: 45 }));
    const { user } = await renderDashboard();
    listEquipment.mockReturnValue(new Promise(() => {})); // page 2 never arrives

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Updating…")).toBeInTheDocument();
    expect(screen.getByText("12 days ago")).toBeInTheDocument();
  });

  it("the edit button logs the equipment id", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { user } = await renderDashboard();

    await user.click(screen.getByRole("button", { name: "Edit Pump 3" }));

    expect(log).toHaveBeenCalledWith("Edit equipment 9");
  });

  it("shows an empty state that can clear the filters", async () => {
    listEquipment.mockResolvedValue(page([]));
    const { user } = renderApp("/?status=DOWN&q=zzz");

    expect(await screen.findByText("No equipment matches these filters.")).toBeInTheDocument();
    const clearButtons = screen.getAllByRole("button", { name: "Clear filters" });
    await user.click(clearButtons[clearButtons.length - 1]!);

    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
  });

  it("shows an error with a working retry when the list fails to load", async () => {
    listEquipment.mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Can't reach the server."));
    const { user } = renderApp("/");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Can't reach the server.");

    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("cell", { name: "7" })).toBeInTheDocument();
  });
});
