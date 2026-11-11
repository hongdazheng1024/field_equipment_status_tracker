import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { api } from "../api/endpoints";
import { loadSession } from "../auth/session";
import { OLIVIA, SARA, renderApp } from "../test/renderApp";

// Component test: the real LoginPage, router and AuthProvider, with only the
// API calls replaced.
vi.mock("../api/endpoints", () => ({
  api: {
    login: vi.fn(),
    me: vi.fn(),
    // The dashboard loads these on mount; an empty account keeps these tests about routing/auth.
    getSites: vi.fn(() => Promise.resolve({ data: [], types: [] })),
    listEquipment: vi.fn(() => Promise.resolve({ data: [], page: 1, pageSize: 20, total: 0 })),
  },
}));
const login = vi.mocked(api.login);

beforeEach(() => {
  vi.mocked(api.me).mockResolvedValue({ user: OLIVIA });
});

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("LoginPage", () => {
  it("keeps Sign in disabled until both fields are filled", async () => {
    const { user } = renderApp("/login");
    const button = screen.getByRole("button", { name: "Sign in" });

    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Username"), "olivia");
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText("Password"), "password");
    expect(button).toBeEnabled();
  });

  it("logs in and lands on the dashboard, remembering the session", async () => {
    login.mockResolvedValue({ token: "t1", user: OLIVIA });
    const { user } = renderApp("/login");

    await user.type(screen.getByLabelText("Username"), "  olivia ");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(login).toHaveBeenCalledWith("olivia", "password"); // username trimmed
    expect(await screen.findByText("Olivia Ortiz")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
    expect(loadSession()).toEqual({ token: "t1", user: OLIVIA });
  });

  it("shows 'Signing in…' and disables the form while the request is in flight", async () => {
    let finish!: (value: { token: string; user: typeof OLIVIA }) => void;
    login.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user } = renderApp("/login");

    await user.type(screen.getByLabelText("Username"), "olivia");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Sara/ })).toBeDisabled();

    finish({ token: "t1", user: OLIVIA });
    expect(await screen.findByText("Olivia Ortiz")).toBeInTheDocument();
  });

  it("shows the API's message on wrong credentials and stays on the page", async () => {
    login.mockRejectedValue(new ApiError(401, "UNAUTHORIZED", "Invalid username or password"));
    const { user } = renderApp("/login");

    await user.type(screen.getByLabelText("Username"), "olivia");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid username or password");
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled(); // can retry
    expect(loadSession()).toBeNull();
  });

  it("explains when the server can't be reached", async () => {
    login.mockRejectedValue(new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection."));
    const { user } = renderApp("/login");

    await user.click(screen.getByRole("button", { name: /Omar/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server");
  });

  it("logs in with one click on a demo account", async () => {
    login.mockResolvedValue({ token: "t3", user: SARA });
    const { user } = renderApp("/login");

    await user.click(screen.getByRole("button", { name: "Sara (Supervisor)" }));

    expect(login).toHaveBeenCalledWith("sara", "password");
    expect(await screen.findByText("Supervisor")).toBeInTheDocument();
  });
});
