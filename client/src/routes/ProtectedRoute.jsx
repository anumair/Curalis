import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// isLoading covers the silent-refresh-on-mount window (AuthContext) — we
// must not redirect to sign-in before that settles, or a page reload
// would always bounce a genuinely logged-in user.
export function ProtectedRoute({ roles }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user) return <Navigate to="/sign-in" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;

  return <Outlet />;
}
