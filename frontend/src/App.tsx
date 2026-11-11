import { Route, Routes } from "react-router";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";

/**
 * Routes only; the router and providers are set up in main.tsx (and in the
 * test helper), so tests can render this with an in-memory router.
 */
function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        {/* Filters and the edit panel live in the query string: /?site=2&edit=31 */}
        <Route path="/" element={<DashboardPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
