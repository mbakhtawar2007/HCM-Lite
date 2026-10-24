import { Link } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
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
      <PageHeader title={`Welcome, ${user?.name}`} subtitle={`Signed in as ${user?.email} · Role: ${user?.role}${user?.mustChangePassword ? ' · You must change your password on first sign-in.' : ''}`} />
      <Card title={rolePage.label}>
        <p className="muted">
          Employees, attendance, leave and payroll, server-computed dashboards, the AI assistant,
          and audit, announcements and notifications are all live. Open your role dashboard below.
        </p>
        <Link className="btn btn-primary" to={rolePage.path}>
          Open {rolePage.label.toLowerCase()}
        </Link>
      </Card>
    </>
  );
}
