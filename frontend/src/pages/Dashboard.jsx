import { Link } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Role-aware dashboard hub (P0 shell). No numbers are shown here:
// P2 will fill these from server-computed KPIs, never from fake data.
const ROLE_PAGES = {
  ADMIN: { path: '/admin', label: 'Admin dashboard' },
  HR: { path: '/hr', label: 'HR dashboard' },
  EMPLOYEE: { path: '/employee', label: 'My dashboard' },
};

export default function Dashboard() {
  const { user } = useAuth();
  const rolePage = ROLE_PAGES[user?.role] || ROLE_PAGES.EMPLOYEE;

  return (
    <>
      <h1>Welcome, {user?.name}</h1>
      <p className="muted">
        Signed in as {user?.email} · Role: {user?.role}
        {user?.mustChangePassword ? ' · You must change your password on first sign-in (P1).' : ''}
      </p>
      <Card title={rolePage.label}>
        <p className="muted">
          Employees, attendance, leave and payroll (P1), server-computed dashboards (P2), the AI assistant (P3),
          and audit, announcements and notifications (P4) are all live. Open your role dashboard below.
        </p>
        <Link className="btn btn-primary" to={rolePage.path}>
          Open {rolePage.label.toLowerCase()}
        </Link>
      </Card>
    </>
  );
}
