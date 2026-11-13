import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import type { Equipment, StatusChange } from "../api/types";
import { OLIVIA, renderApp, seedSession } from "../test/renderApp";

// The edit panel inside the real dashboard, with only the API replaced.
vi.mock("../api/endpoints", () => ({
  api: {
    login: vi.fn(),
    me: vi.fn(),
    getSites: vi.fn(),
    listEquipment: vi.fn(),
    getEquipment: vi.fn(),
    getHistory: vi.fn(),
    changeStatus: vi.fn(),
  },
}));
const m = vi.mocked(api);

const PUMP: Equipment = {
  id: 9,
  name: "Pump 3",
  type: "Pump",
  site: { id: 1, name: "North Yard" },
  status: "DOWN",
  lastCheckedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  lastCheckedBy: { id: 2, displayName: "Omar Nasser" },
  isStale: false,
  version: 4,
};

const CHANGE: StatusChange = {
  id: "c1",
  equipmentId: 9,
  changedAt: PUMP.lastCheckedAt,
  oldStatus: "OPERATIONAL",
  newStatus: "DOWN",
  reason: "Seal leaking",
  user: { id: 2, displayName: "Omar Nasser" },
};

function saved(status: Equipment["status"], oldStatus: Equipment["status"] = "DOWN") {
  return {
    data: {
      equipment: { ...PUMP, status, version: 5 },
      change: { ...CHANGE, id: "c2", oldStatus, newStatus: status, user: { id: 1, displayName: "Olivia Ortiz" } },
    },
  };
}

beforeEach(() => {
  seedSession(OLIVIA);
  m.me.mockResolvedValue({ user: OLIVIA });
  m.getSites.mockResolvedValue({ data: [], types: [] });
  m.listEquipment.mockResolvedValue({ data: [PUMP], page: 1, pageSize: 20, total: 1 });
  m.getEquipment.mockResolvedValue({ data: PUMP });
  m.getHistory.mockResolvedValue({ data: [CHANGE], page: 1, pageSize: 25, total: 1 });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  localStorage.clear();
});

/** Renders the dashboard and opens the panel for Pump 3 from its Edit button. */
async function openPanel() {
  const result = renderApp("/?site=1");
  const editButton = await screen.findByRole("button", { name: "Edit Pump 3" });
  editButton.focus();
  await result.user.click(editButton);
  const panel = await screen.findByRole("dialog", { name: "Pump 3" });
  return { ...result, panel, editButton };
}

const reasonBox = () => screen.getByRole("textbox", { name: /Reason/ });
const statusSelect = () => screen.getByRole("combobox", { name: "New status" });
const location = () => screen.getByTestId("location").textContent;

describe("edit status panel", () => {
  it("opens from the Edit button with the item, its history and ?edit in the URL", async () => {
    const { panel } = await openPanel();

    expect(location()).toBe("/?site=1&edit=9");
    expect(within(panel).getByText("Pump · North Yard")).toBeInTheDocument();
    expect(within(panel).getByText(/by Omar Nasser/)).toBeInTheDocument();
    expect(statusSelect()).toHaveValue("DOWN");
    expect(await within(panel).findByText("Seal leaking")).toBeInTheDocument();
    expect(within(panel).getByText("Operational → Down")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden"); // page behind doesn't scroll
  });

  it("opens straight from a URL, loading the item by id", async () => {
    renderApp("/?edit=9");
    expect(await screen.findByRole("dialog", { name: "Pump 3" })).toBeInTheDocument();
    expect(m.getEquipment).toHaveBeenCalledWith(9, expect.anything());
  });

  it("requires a reason and caps it at 500 characters", async () => {
    const { user } = await openPanel();
    const submit = screen.getByRole("button", { name: "Confirm Down" });

    expect(submit).toBeDisabled();
    expect(reasonBox()).toHaveAttribute("maxLength", "500");

    await user.type(reasonBox(), "   ");
    expect(submit).toBeDisabled(); // whitespace only doesn't count

    await user.type(reasonBox(), "ok");
    expect(submit).toBeEnabled();
    expect(screen.getByText("5 / 500 characters")).toBeInTheDocument();
  });

  it("labels the button as a confirmation when the status is unchanged", async () => {
    const { user } = await openPanel();
    expect(screen.getByRole("button", { name: "Confirm Down" })).toBeInTheDocument();

    await user.selectOptions(statusSelect(), "OPERATIONAL");
    expect(screen.getByRole("button", { name: "Save status" })).toBeInTheDocument();
  });

  it("saves, shows progress, then closes, refreshes the dashboard and confirms", async () => {
    let resolve!: (value: ReturnType<typeof saved>) => void;
    m.changeStatus.mockReturnValue(new Promise((r) => (resolve = r)));
    const { user, editButton } = await openPanel();
    const listCalls = m.listEquipment.mock.calls.length;
    const sitesCalls = m.getSites.mock.calls.length;

    await user.selectOptions(statusSelect(), "OPERATIONAL");
    await user.type(reasonBox(), "  Replaced the seal  ");
    await user.click(screen.getByRole("button", { name: "Save status" }));

    expect(m.changeStatus).toHaveBeenCalledWith(9, {
      status: "OPERATIONAL",
      reason: "Replaced the seal",
      version: 4,
      changeId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(reasonBox()).toBeDisabled();

    resolve(saved("OPERATIONAL"));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(location()).toBe("/?site=1");
    expect(await screen.findByText("Pump 3 marked Operational.")).toBeInTheDocument();
    await waitFor(() => expect(m.listEquipment.mock.calls.length).toBeGreaterThan(listCalls));
    expect(m.getSites.mock.calls.length).toBeGreaterThan(sitesCalls);
    expect(editButton).toHaveFocus(); // focus goes back where it was
    expect(document.body.style.overflow).toBe("");
  });

  it("on a conflict, keeps the reason, shows the other change and resubmits against the new version", async () => {
    const theirs: Equipment = {
      ...PUMP,
      status: "IN_MAINTENANCE",
      version: 6,
      lastCheckedBy: { id: 3, displayName: "Sara Kim" },
    };
    m.changeStatus.mockRejectedValueOnce(
      new ApiError(409, "CONFLICT", "This equipment was changed by Sara Kim since you loaded it", { current: theirs }),
    );
    const { user } = await openPanel();

    await user.selectOptions(statusSelect(), "OPERATIONAL");
    await user.type(reasonBox(), "Fixed it");
    await user.click(screen.getByRole("button", { name: "Save status" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Sara Kim updated this item while you were editing");
    expect(alert).toHaveTextContent("now In maintenance");
    expect(reasonBox()).toHaveValue("Fixed it");
    expect(statusSelect()).toHaveValue("OPERATIONAL");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    m.changeStatus.mockResolvedValueOnce(saved("OPERATIONAL", "IN_MAINTENANCE"));
    await user.click(screen.getByRole("button", { name: "Save status" }));

    expect(m.changeStatus).toHaveBeenLastCalledWith(9, expect.objectContaining({ version: 6 }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the panel open on a network error, and a retry reuses the same changeId", async () => {
    m.changeStatus.mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Can't reach the server."));
    const { user } = await openPanel();

    await user.type(reasonBox(), "Checked, still down");
    await user.click(screen.getByRole("button", { name: "Confirm Down" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server.");
    expect(reasonBox()).toHaveValue("Checked, still down");

    m.changeStatus.mockResolvedValueOnce(saved("DOWN"));
    await user.click(screen.getByRole("button", { name: "Confirm Down" }));

    const [first, second] = m.changeStatus.mock.calls;
    expect(second![1].changeId).toBe(first![1].changeId);
    expect(await screen.findByText("Pump 3: Down confirmed.")).toBeInTheDocument();
  });

  it("uses a new changeId once the form is edited after a failure", async () => {
    m.changeStatus.mockRejectedValue(new ApiError(0, "NETWORK_ERROR", "Can't reach the server."));
    const { user } = await openPanel();

    await user.type(reasonBox(), "First");
    await user.click(screen.getByRole("button", { name: "Confirm Down" }));
    await screen.findByRole("alert");
    await user.type(reasonBox(), " and more");
    await user.click(screen.getByRole("button", { name: "Confirm Down" }));

    const [first, second] = m.changeStatus.mock.calls;
    expect(second![1].changeId).not.toBe(first![1].changeId);
  });

  it("explains when the item was removed in the meantime", async () => {
    m.changeStatus.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "Equipment 9 not found"));
    const { user } = await openPanel();

    await user.type(reasonBox(), "Checked");
    await user.click(screen.getByRole("button", { name: "Confirm Down" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This equipment has been removed");
    expect(screen.getByRole("button", { name: "Confirm Down" })).toBeDisabled();
  });

  describe("closing", () => {
    it("closes on the backdrop, Cancel, ✕ and Escape when nothing was typed", async () => {
      const { user, panel } = await openPanel();
      await user.click(panel); // target is the <dialog> itself = the backdrop
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(location()).toBe("/?site=1");

      await user.click(screen.getByRole("button", { name: "Edit Pump 3" }));
      await user.click(await screen.findByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Edit Pump 3" }));
      await user.click(await screen.findByRole("button", { name: "Close panel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Edit Pump 3" }));
      // Browsers fire "cancel" on the dialog for Escape; jsdom doesn't, so fire it directly.
      fireEvent(await screen.findByRole("dialog"), new Event("cancel", { cancelable: true }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("asks before discarding a typed reason", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      const { user, panel } = await openPanel();
      await user.type(reasonBox(), "Half written");

      await user.click(panel);
      expect(confirm).toHaveBeenCalledWith("Discard your changes?");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(reasonBox()).toHaveValue("Half written");

      confirm.mockReturnValue(true);
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("can't be closed while saving", async () => {
      m.changeStatus.mockReturnValue(new Promise(() => {}));
      const { user, panel } = await openPanel();
      await user.type(reasonBox(), "Checked");
      await user.click(screen.getByRole("button", { name: "Confirm Down" }));

      await user.click(panel);
      fireEvent(panel, new Event("cancel", { cancelable: true }));

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    });
  });
});
