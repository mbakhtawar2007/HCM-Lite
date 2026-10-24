import { useEffect, useState } from 'react';
import { getAdminDashboard } from '../api/dashboards.js';
import { orgList } from '../api/p1.js';
import { useAuth } from '../context/AuthContext.jsx';
import Card from '../components/ui/Card.jsx';
import DashboardFilters from '../components/DashboardFilters.jsx';
import Rate from '../components/Rate.jsx';
import { getErrorMessage } from '../utils/errors.js';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [filters, setFilters] = useState({ from: monthStart(), to: today(), department: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try {
      const params = { from: filters.from, to: filters.to };
      if (filters.department) params.department = filters.department;
      setData(await getAdminDashboard(params));
    } catch (e) { setError(getErrorMessage(e)); }
    setLoading(false);
  };
  useEffect(() => { orgList('departments').then((d) => setDepartments(d.items)).catch(() => {}); }, []);
  useEffect(() => { load(); }, []);
  return (
    <>
      <h1>Admin dashboard</h1>
      <p className="muted">Signed in as {user?.email} · Role: ADMIN</p>
      <DashboardFilters filters={filters} setFilters={setFilters} departments={departments} onApply={load} />
      {error && <p className="alert alert-error">{error}</p>}
      {loading && <p className="muted">Loading dashboard…</p>}
      {!loading && !data && !error && <p className="muted">No dashboard data yet.</p>}
      {data && (
        <>
          <Card title="Headcount & attrition">
            <ul className="item-list">
              <li><span>Headcount (at {data.filters.to})</span><span>{data.headcount}</span></li>
              <li><span>Headcount (at period start)</span><span>{data.headcountAtPeriodStart}</span></li>
              <li><span>Exits this year</span><span>{data.exitsYtd}</span></li>
              <li><span>Attrition YTD</span><span><Rate value={data.attritionYtd} /></span></li>
            </ul>
          </Card>
          <Card title="Payroll (finalized runs only)">
            <ul className="item-list">
              <li><span>Payroll cost (net pay)</span><span>Rs {data.payrollCost}</span></li>
              <li><span>Gross payable</span><span>Rs {data.grossPayable}</span></li>
              <li><span>Finalized runs in range</span><span>{data.finalizedRunsInRange}</span></li>
              <li><span>Average basic salary</span><span>{data.averageSalary === null ? 'No data yet' : `Rs ${data.averageSalary}`}</span></li>
            </ul>
          </Card>
          <Card title="Headcount by department">
            {data.headcountByDepartment.length === 0 ? <p className="muted">No data yet — no active employees in this range.</p> : (
              <ul className="item-list">{data.headcountByDepartment.map((r) => <li key={r.name}><span>{r.name}</span><span>{r.count} · avg Rs {r.averageBasicSalary}</span></li>)}</ul>
            )}
          </Card>
          <Card title="Payroll cost by department (net pay)">
            {data.payrollCostByDepartment.length === 0 ? <p className="muted">No finalized payroll in this range yet.</p> : (
              <ul className="item-list">{data.payrollCostByDepartment.map((r) => <li key={r.department}><span>{r.department}</span><span>Rs {r.payrollCost} · {r.employees} payslips</span></li>)}</ul>
            )}
          </Card>
          <Card title="Headcount by designation">
            {data.headcountByDesignation.length === 0 ? <p className="muted">No data yet.</p> : (
              <ul className="item-list">{data.headcountByDesignation.map((r) => <li key={r.name}><span>{r.name}</span><span>{r.count}</span></li>)}</ul>
            )}
          </Card>
          <Card title="Payroll cost by designation (net pay)">
            {data.payrollCostByDesignation.length === 0 ? <p className="muted">No finalized payroll in this range yet.</p> : (
              <ul className="item-list">{data.payrollCostByDesignation.map((r) => <li key={r.designation}><span>{r.designation}</span><span>Rs {r.payrollCost} · {r.employees} payslips</span></li>)}</ul>
            )}
          </Card>
          <Card title="Tenure (from joining date)">
            <ul className="item-list">{data.tenureDistribution.map((r) => <li key={r.bucket}><span>{r.bucket}</span><span>{r.count}</span></li>)}</ul>
          </Card>
          <Card title="Gender breakdown">
            <p className="muted">Not collected — employee records do not include a gender field, so no breakdown is shown. This is not missing data; it was never asked for.</p>
          </Card>
          <Card title="Announcements">
            {data.announcements?.length === 0 ? <p className="muted">No announcements yet.</p> : (
              <ul className="item-list">{(data.announcements || []).map((a) => <li key={a._id}><span><strong>{a.title}</strong> · {a.body}</span><span>{a.postedBy?.name || ''}</span></li>)}</ul>
            )}
            <p><a href="/announcements">All announcements</a></p>
          </Card>
          <Card title="AI summary">
            <p className="muted">Coming soon in P3 — the AI assistant is not connected yet, so no AI summary is shown. No summary text here is AI-generated.</p>
          </Card>
          <Card title="Recent audit feed">
            {data.auditFeed.length === 0 ? <p className="muted">No audit entries yet.</p> : (
              <ul className="item-list">{data.auditFeed.map((l) => <li key={l._id}><span>{l.action} {l.entity} · {l.actor?.name || 'System'}</span><span>{l.createdAt.slice(0, 10)}</span></li>)}</ul>
            )}
            <p><a href="/audit">Full audit log</a> · <a href="/payroll">Payroll</a> · <a href="/users">Users</a> · <a href="/settings">Settings</a></p>
          </Card>
        </>
      )}
    </>
  );
}
