import { Link, useLocation } from "react-router";
import { useAuth } from "../auth/AuthContext";
import styles from "./NotFoundPage.module.css";

export function NotFoundPage() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  return (
    <main className={styles.page}>
      <h1>Page not found</h1>
      <p>
        There's nothing at <code>{pathname}</code>.
      </p>
      {user ? <Link to="/">Back to the dashboard</Link> : <Link to="/login">Go to sign in</Link>}
    </main>
  );
}
