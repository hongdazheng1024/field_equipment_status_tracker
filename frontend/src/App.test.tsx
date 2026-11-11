import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api/client";
import { api } from "./api/endpoints";
import { loadSession } from "./auth/session";
import { OLIVIA, renderApp, seedSession } from "./test/renderApp";

// Routing and session behaviour across the three pages.
vi.mock("./api/endpoints", () => ({
  api: {
    login: vi.fn(),
    me: vi.fn(),
    // The dashboard loads these on mount; an empty account keeps these tests about routing/auth.
    getSites: vi.fn(() => Promise.resolve({ data: [], types: [] })),
    listEquipment: vi.fn(() => Promise.resolve({ data: [], page: 1, pageSize: 20, total: 0 })),
  },
}));
const me = vi.mocked(api.me);

beforeEach(() => {
  me.mockResolvedValue({ user: OLIVIA });
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("protected dashboard", () => {
  it("sends a logged-out visitor to /login", () => {
    renderApp("/");
    expect(screen.getByRole("heading", { name: "Field Equipment Tracker" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });

  it("returns to the page the user was heading to, filters included, after login", async () => {
    vi.mocked(api.login).mockResolvedValue({ token: "t1", user: OLIVIA });
    const { user } = renderApp("/?site=2&status=DOWN");

    await user.click(screen.getByRole("button", { name: /Olivia/ }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/?site=2&status=DOWN"));
  });

  it("restores a saved session without asking to log in again", async () => {
    seedSession(OLIVIA);
    renderApp("/");

    expect(screen.getByText("Olivia Ortiz")).toBeInTheDocument();
    expect(me).toHaveBeenCalledOnce(); // token checked in the background
  });

  it("sends a logged-in user away from /login", () => {
    seedSession(OLIVIA);
    renderApp("/login");
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
  });

  it("logs out with an explanation when the saved token has expired", async () => {
    seedSession(OLIVIA);
    me.mockRejectedValue(new ApiError(401, "UNAUTHORIZED", "Invalid or expired token"));
    renderApp("/");

    expect(await screen.findByText("Your session expired. Please sign in again.")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(loadSession()).toBeNull();
  });

  it("stays logged in when offline (the token check can't reach the server)", async () => {
    seedSession(OLIVIA);
    me.mockRejectedValue(new ApiError(0, "NETWORK_ERROR", "Can't reach the server."));
    renderApp("/");

    await waitFor(() => expect(me).toHaveBeenCalled());
    expect(screen.getByText("Olivia Ortiz")).toBeInTheDocument();
    expect(loadSession()).not.toBeNull();
  });

  it("logs out: back to /login with the saved session cleared", async () => {
    seedSession(OLIVIA);
    const { user } = renderApp("/");

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(screen.queryByText("Your session expired. Please sign in again.")).not.toBeInTheDocument();
    expect(loadSession()).toBeNull();
  });
});

describe("404 page", () => {
  it("shows the unknown path and a link to sign in when logged out", () => {
    renderApp("/nope");
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByText("/nope", { selector: "code" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/login");
  });

  it("links back to the dashboard when logged in", () => {
    seedSession(OLIVIA);
    renderApp("/equipment/12");
    expect(screen.getByRole("link", { name: "Back to the dashboard" })).toHaveAttribute("href", "/");
  });
});
