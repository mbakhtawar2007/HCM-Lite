import Card from '../components/ui/Card.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Admin shell (P0). Empty states only — no fake headcount, payroll or
// attrition numbers. P1 adds company setup/users; P2 adds KPIs.
export default function AdminDashboard() {
  const { user } = useAuth();
  return (
    <>
      <h1>Admin dashboard</h1>
      <p className="muted">Signed in as {user?.email} · Role: ADMIN</p>
      <Card title="Company setup (P1)">
        <p className="muted">Departments, designations, leave types, holidays and office rules — not yet built.</p>
      </Card>
      <Card title="Users (P1)">
        <p className="muted">Create HR logins, deactivate or reset logins — not yet built.</p>
      </Card>
      <Card title="Payroll finalization (P1)">
        <p className="muted">Finalize a monthly payroll prepared by HR — not yet built. Only Admin can lock it.</p>
      </Card>
      <Card title="Audit log (P1)">
        <p className="muted">Every create, update, approve and finalize action — not yet built.</p>
      </Card>
    </>
  );
}
