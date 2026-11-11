import { useState, type FormEvent } from "react";
import { Navigate, useLocation, type Location } from "react-router";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import styles from "./LoginPage.module.css";

// Seeded mock accounts (see README). One click logs in as that role.
const DEMO_ACCOUNTS = [
  { username: "olivia", label: "Olivia", role: "Operator" },
  { username: "omar", label: "Omar", role: "Operator" },
  { username: "sara", label: "Sara", role: "Supervisor" },
] as const;
const DEMO_PASSWORD = "password";

export function LoginPage() {
  const { user, login, logoutReason } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Once logged in (or if already logged in), go where the user was heading.
  if (user) {
    const from = (location.state as { from?: Location } | null)?.from;
    return <Navigate to={from ? `${from.pathname}${from.search}` : "/"} replace />;
  }

  async function signIn(name: string, pass: string) {
    setSubmitting(true);
    setError(null);
    try {
      await login(name, pass);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void signIn(username.trim(), password);
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-title">
        <h1 id="login-title" className={styles.title}>
          Field Equipment Tracker
        </h1>
        <p className={styles.subtitle}>Sign in to view and update equipment status.</p>

        {logoutReason === "expired" && !error && (
          <p className={styles.notice} role="status">
            Your session expired. Please sign in again.
          </p>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <label className={styles.label}>
            Username
            <input
              className={styles.input}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className={styles.label}>
            Password
            <input
              className={styles.input}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button type="submit" className={styles.primary} disabled={submitting || !username.trim() || !password}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className={styles.demo}>
          <h2 className={styles.demoTitle}>Demo accounts</h2>
          <ul className={styles.demoList}>
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.username}>
                <button
                  type="button"
                  className={styles.demoButton}
                  disabled={submitting}
                  onClick={() => void signIn(account.username, DEMO_PASSWORD)}
                >
                  {account.label} <span className={styles.demoRole}>({account.role})</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
