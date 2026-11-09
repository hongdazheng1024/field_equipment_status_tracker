import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api/client";

/**
 * Placeholder until the login page and dashboard are built: proves the
 * frontend reaches the API through the Vite proxy.
 */
function App() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => apiFetch<{ status: string }>("/health", { signal }),
  });

  return (
    <main className="placeholder">
      <h1>Field Equipment Tracker</h1>
      <p role="status">
        API:{" "}
        {health.isPending ? "checking…" : health.isError ? `unreachable (${health.error.message})` : health.data.status}
      </p>
    </main>
  );
}

export default App;
