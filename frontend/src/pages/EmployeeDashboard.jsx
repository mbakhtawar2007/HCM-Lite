import Card from '../components/ui/Card.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Employee self-service shell (P0). Own data only, and empty for now.
export default function EmployeeDashboard() {
  const { user } = useAuth();
  return (
    <>
      <h1>My dashboard</h1>
      <p className="muted">Signed in as {user?.email} · Role: EMPLOYEE</p>
      <Card title="Check-in"><p><a href="/attendance">Web check-in and check-out</a>, plus your own attendance and correction requests.</p></Card>
      <Card title="My leave"><p><a href="/leaves">Apply for leave, see your balance and history</a>.</p></Card>
      <Card title="My payslips"><p><a href="/payroll">Download your own payslips</a> (finalized runs only).</p></Card>
    </>
  );
}
