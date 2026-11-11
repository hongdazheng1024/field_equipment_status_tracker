import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import App from "../App";
import type { AuthUser } from "../api/types";
import { AuthProvider } from "../auth/AuthProvider";
import { saveSession } from "../auth/session";

/** Prints the current URL so tests can assert on redirects. */
function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}

/**
 * Renders the whole app (routes + auth) at `path` with an in-memory router,
 * exactly as main.tsx wires it, minus the real browser URL.
 */
export function renderApp(path = "/") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
          <LocationProbe />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...result, user: userEvent.setup() };
}

export const OLIVIA: AuthUser = { id: 1, username: "olivia", displayName: "Olivia Ortiz", role: "OPERATOR" };
export const SARA: AuthUser = { id: 3, username: "sara", displayName: "Sara Kim", role: "SUPERVISOR" };

/** Simulates a session saved by an earlier visit. */
export function seedSession(user: AuthUser, token = "saved-token") {
  saveSession({ token, user });
}
