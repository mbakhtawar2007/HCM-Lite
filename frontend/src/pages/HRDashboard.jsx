import Card from '../components/ui/Card.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// HR shell (P0). Empty states only — no fake numbers.
export default function HRDashboard() {
  const { user } = useAuth();
  return (
    <>
      <h1>HR dashboard</h1>
      <p className="muted">Signed in as {user?.email} · Role: {user?.role}</p>
      <Card title="Employees (P1)">
        <p className="muted">Register employees, directory and Employee 360 — not yet built.</p>
      </Card>
      <Card title="Attendance board (P1)">
        <p className="muted">Daily attendance and correction approvals — not yet built.</p>
      </Card>
      <Card title="Leave approvals (P1)">
        <p className="muted">Approve or reject leave with a comment — not yet built.</p>
      </Card>
      <Card title="Payroll draft (P1)">
        <p className="muted">Create and review the monthly payroll draft — not yet built. Admin finalizes it.</p>
      </Card>
    </>
  );
}
