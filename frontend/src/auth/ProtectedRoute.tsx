import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "./AuthContext";

/**
 * Wraps routes that need a logged-in user. Logged-out visitors go to /login,
 * which remembers where they were heading and sends them back after login.
 */
export function ProtectedRoute() {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
