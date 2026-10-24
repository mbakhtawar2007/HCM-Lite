import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Wrap any route that needs a login with this. While the saved session
// is being checked, show a loader instead of flashing the login page.
export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) return <p className="muted">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}
