import Card from '../components/ui/Card.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// HR shell (P0). Empty states only — no fake numbers.
export default function HRDashboard() {
  const { user } = useAuth();
  return (
    <>
      <h1>HR dashboard</h1>
      <p className="muted">Signed in as {user?.email} · Role: {user?.role}</p>
      <Card title="Employees"><p><a href="/employees">Register employees, directory and Employee 360</a>, with CSV export and import dry-run.</p></Card>
      <Card title="Attendance board"><p><a href="/attendance">Daily attendance and correction approvals</a>.</p></Card>
      <Card title="Leave approvals"><p><a href="/leaves">Approve or reject leave with a comment</a> — the employee is notified.</p></Card>
      <Card title="Payroll draft"><p><a href="/payroll">Create and review the monthly payroll draft</a> — Admin finalizes it.</p></Card>
    </>
  );
}
