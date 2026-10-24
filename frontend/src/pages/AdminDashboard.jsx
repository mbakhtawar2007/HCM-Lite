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
      <Card title="Company setup"><p><a href="/settings">Departments, designations, leave types, holidays and office rules</a> — HR can view, only Admin can change.</p></Card>
      <Card title="Users"><p><a href="/users">Create HR logins, deactivate or reset logins</a>.</p></Card>
      <Card title="Payroll finalization"><p><a href="/payroll">Finalize a monthly payroll prepared by HR</a> — only Admin can lock it.</p></Card>
      <Card title="Audit log"><p><a href="/audit">Every create, update, approve and finalize action</a> — read-only, never editable.</p></Card>
    </>
  );
}
