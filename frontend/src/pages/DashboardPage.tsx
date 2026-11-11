import { useAuth } from "../auth/AuthContext";
import styles from "./DashboardPage.module.css";

/**
 * Page shell from the mockup: header now; sidebar, stat cards, filters,
 * table and edit panel are built next.
 */
export function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <h1 className={styles.appName}>Field Equipment Tracker</h1>
        <div className={styles.account}>
          <span>{user?.displayName}</span>
          <span className={styles.role}>{user?.role === "SUPERVISOR" ? "Supervisor" : "Operator"}</span>
          <button type="button" className={styles.logout} onClick={() => logout()}>
            Log out
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <p className={styles.placeholder}>Equipment dashboard coming next.</p>
      </main>
    </div>
  );
}
