import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { PageSkeleton } from './ui/Skeleton.jsx';

// Wrap any route that needs a login with this. While the saved session
// is being checked, show a loader instead of flashing the login page.
// allowedRoles, when given, also redirects a wrong-role user to /dashboard
// (server-side requireRole is the real enforcement).
export default function ProtectedRoute({ allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) return <PageSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
