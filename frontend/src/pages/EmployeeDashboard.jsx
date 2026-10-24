import Card from '../components/ui/Card.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Employee self-service shell (P0). Own data only, and empty for now.
export default function EmployeeDashboard() {
  const { user } = useAuth();
  return (
    <>
      <h1>My dashboard</h1>
      <p className="muted">Signed in as {user?.email} · Role: EMPLOYEE</p>
      <Card title="Check-in (P1)">
        <p className="muted">Web check-in and check-out — not yet built.</p>
      </Card>
      <Card title="My attendance (P1)">
        <p className="muted">Your own attendance calendar and correction requests — not yet built.</p>
      </Card>
      <Card title="My leave (P1)">
        <p className="muted">Apply for leave, see your balance and history — not yet built.</p>
      </Card>
      <Card title="My payslips (P1)">
        <p className="muted">Download your own payslips — not yet built.</p>
      </Card>
    </>
  );
}
