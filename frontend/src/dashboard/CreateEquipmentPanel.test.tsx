import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { Equipment, SiteSummary } from "../api/types";
import { OLIVIA, SARA, renderApp, seedSession } from "../test/renderApp";

// The create panel inside the real dashboard, with only the API replaced.
vi.mock("../api/endpoints", () => ({
  api: {
    login: vi.fn(),
    me: vi.fn(),
    getSites: vi.fn(),
    listEquipment: vi.fn(),
    createEquipment: vi.fn(),
  },
}));
const m = vi.mocked(api);

const COUNTS = { OPERATIONAL: 1, DEGRADED: 0, DOWN: 0, IN_MAINTENANCE: 0 };
const SITES: SiteSummary[] = [
  { id: 1, name: "North Yard", total: 1, staleCount: 0, counts: COUNTS },
  { id: 2, name: "South Plant", total: 1, staleCount: 0, counts: COUNTS },
];

const CREATED: Equipment = {
  id: 50,
  name: "Pump 9",
  type: "Pump",
  site: { id: 2, name: "South Plant" },
  status: "DEGRADED",
  lastCheckedAt: new Date().toISOString(),
  lastCheckedBy: null,
  isStale: false,
  version: 1,
};

beforeEach(() => {
  seedSession(SARA);
  m.me.mockResolvedValue({ user: SARA });
  m.getSites.mockResolvedValue({ data: SITES, types: ["Generator", "Pump"] });
  m.listEquipment.mockResolvedValue({ data: [], page: 1, pageSize: 20, total: 0 });
  m.createEquipment.mockResolvedValue({ data: CREATED });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  localStorage.clear();
});

/** Renders the dashboard and opens the panel from the Add equipment button. */
async function openPanel(path = "/") {
  const result = renderApp(path);
  const addButton = await screen.findByRole("button", { name: "+ Add equipment" });
  addButton.focus();
  await result.user.click(addButton);
  const panel = await screen.findByRole("dialog", { name: "Add equipment" });
  // Wait for the form: the sites come from the dashboard's cached query.
  await within(panel).findByRole("textbox", { name: /Name/ });
  return { ...result, panel, addButton };
}

// Scoped to the panel: the dashboard behind it has its own Type and Status controls.
const inPanel = () => within(screen.getByRole("dialog"));
const nameBox = () => inPanel().getByRole("textbox", { name: /Name/ });
const typeBox = () => inPanel().getByRole("combobox", { name: /Type/ });
const siteSelect = () => inPanel().getByRole("combobox", { name: /Site/ });
const statusSelect = () => inPanel().getByRole("combobox", { name: "Status" });
const submit = () => inPanel().getByRole("button", { name: /^(Add equipment|Adding…)$/ });
const location = () => screen.getByTestId("location").textContent;

describe("add equipment panel", () => {
  it("is offered to supervisors only", async () => {
    seedSession(OLIVIA);
    m.me.mockResolvedValue({ user: OLIVIA });
    renderApp("/?create=1");

    await screen.findByText("No equipment matches these filters.");
    expect(screen.queryByRole("button", { name: "+ Add equipment" })).not.toBeInTheDocument();
    // Even with ?create=1 in the URL, an operator gets no panel.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens with ?create=1, the selected site preselected and existing types suggested", async () => {
    await openPanel("/?site=2");

    expect(location()).toBe("/?site=2&create=1");
    expect(siteSelect()).toHaveValue("2");
    expect(statusSelect()).toHaveValue("OPERATIONAL");
    expect(nameBox()).toHaveAttribute("maxLength", "100");
    expect(typeBox()).toHaveAttribute("maxLength", "50");
    const suggestions = document.getElementById("equipment-types")!;
    expect([...suggestions.querySelectorAll("option")].map((o) => o.value)).toEqual(["Generator", "Pump"]);
  });

  it("needs a name, a type and a site before it can be submitted", async () => {
    const { user } = await openPanel();

    expect(siteSelect()).toHaveValue("");
    expect(submit()).toBeDisabled();
    await user.type(nameBox(), "Pump 9");
    await user.type(typeBox(), "   ");
    await user.selectOptions(siteSelect(), "South Plant");
    expect(submit()).toBeDisabled(); // a blank type doesn't count

    await user.type(typeBox(), "Pump");
    expect(submit()).toBeEnabled();
  });

  it("creates, shows progress, then closes, refreshes the dashboard and confirms", async () => {
    let resolve!: (value: { data: Equipment }) => void;
    m.createEquipment.mockReturnValue(new Promise((r) => (resolve = r)));
    const { user, addButton } = await openPanel();
    const listCalls = m.listEquipment.mock.calls.length;
    const siteCalls = m.getSites.mock.calls.length;

    await user.type(nameBox(), "  Pump 9 ");
    await user.type(typeBox(), "Pump");
    await user.selectOptions(siteSelect(), "South Plant");
    await user.selectOptions(statusSelect(), "DEGRADED");
    await user.click(submit());

    expect(m.createEquipment).toHaveBeenCalledWith({ name: "Pump 9", type: "Pump", siteId: 2, status: "DEGRADED" });
    expect(submit()).toHaveTextContent("Adding…");
    expect(submit()).toBeDisabled();
    expect(nameBox()).toBeDisabled();

    resolve({ data: CREATED });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(location()).toBe("/");
    expect(await screen.findByText("Added Pump 9 (Pump) to South Plant.")).toBeInTheDocument();
    await waitFor(() => expect(m.listEquipment.mock.calls.length).toBeGreaterThan(listCalls));
    await waitFor(() => expect(m.getSites.mock.calls.length).toBeGreaterThan(siteCalls));
    expect(addButton).toHaveFocus();
  });

  it.each([
    [
      "a validation error",
      new ApiError(400, "VALIDATION_ERROR", "Request validation failed", [
        { path: "siteId", message: "Site 2 does not exist" },
      ]),
      "Site 2 does not exist",
    ],
    ["a 403", new ApiError(403, "FORBIDDEN", "Only supervisors can do that."), "Only supervisors can do that."],
    ["a network error", new ApiError(0, "NETWORK_ERROR", "Can't reach the server."), "Can't reach the server."],
  ])("shows %s in the panel and keeps the form filled in", async (_label, error, message) => {
    m.createEquipment.mockRejectedValueOnce(error);
    const { user, panel } = await openPanel("/?site=2");

    await user.type(nameBox(), "Pump 9");
    await user.type(typeBox(), "Pump");
    await user.click(submit());

    expect(await within(panel).findByRole("alert")).toHaveTextContent(message);
    expect(nameBox()).toHaveValue("Pump 9");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Editing hides the old error; submitting again works.
    await user.type(nameBox(), "b");
    expect(within(panel).queryByRole("alert")).not.toBeInTheDocument();
    await user.click(submit());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("explains and offers a retry when the sites can't be loaded", async () => {
    // The dashboard's own sites request fails too: they share one cache entry.
    m.getSites.mockRejectedValue(new ApiError(0, "NETWORK_ERROR", "Can't reach the server."));
    const { user } = renderApp("/?create=1");

    const panel = await screen.findByRole("dialog", { name: "Add equipment" });
    const alert = await within(panel).findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load sites. Can't reach the server.");
    expect(within(panel).queryByRole("button", { name: "Add equipment" })).not.toBeInTheDocument();

    m.getSites.mockResolvedValue({ data: SITES, types: [] });
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await within(panel).findByRole("textbox", { name: /Name/ })).toBeInTheDocument();
  });

  describe("closing", () => {
    it("closes without asking when nothing was entered", async () => {
      const confirm = vi.spyOn(window, "confirm");
      const { user } = await openPanel();

      await user.click(inPanel().getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(confirm).not.toHaveBeenCalled();
    });

    it("asks before discarding as soon as anything was entered", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      const { user } = await openPanel();

      await user.type(nameBox(), "P"); // one field is enough
      // Browsers fire "cancel" on the dialog for Escape; jsdom doesn't, so fire it directly.
      fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));

      expect(confirm).toHaveBeenCalledWith("Discard this new equipment?");
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      confirm.mockReturnValue(true);
      await user.click(screen.getByRole("button", { name: "Close panel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("can't be closed while saving", async () => {
      m.createEquipment.mockReturnValue(new Promise(() => {}));
      const { user } = await openPanel("/?site=1");

      await user.type(nameBox(), "Pump 9");
      await user.type(typeBox(), "Pump");
      await user.click(submit());
      fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(inPanel().getByRole("button", { name: "Cancel" })).toBeDisabled();
    });
  });
});
