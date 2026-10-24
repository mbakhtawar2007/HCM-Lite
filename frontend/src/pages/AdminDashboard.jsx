import { useEffect, useState } from 'react';
import { getAdminDashboard } from '../api/dashboards.js';
import { orgList } from '../api/p1.js';
import { useAuth } from '../context/AuthContext.jsx';
import Card from '../components/ui/Card.jsx';
import DashboardAiSummary from '../components/DashboardAiSummary.jsx';
import DashboardFilters from '../components/DashboardFilters.jsx';
import Rate from '../components/Rate.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import KpiCard from '../components/ui/KpiCard.jsx';
import { HBarChart } from '../components/Charts.jsx';
import { PageSkeleton } from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
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
      <PageHeader title="Admin dashboard" subtitle={`Signed in as ${user?.email} · Role: ADMIN`} />
      <DashboardFilters filters={filters} setFilters={setFilters} departments={departments} onApply={load} loading={loading} />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && <PageSkeleton />}
      {!loading && !data && !error && <EmptyState icon="▦" title="No dashboard data yet" text="Once employees and payroll exist, this dashboard fills in from the server." actionLabel="Register an employee" actionTo="/employees" />}
      {data && (
        <>
          <div className="kpi-grid">
            <KpiCard label={`Headcount (at ${data.filters.to})`} value={data.headcount} />
            <KpiCard label="Headcount (at period start)" value={data.headcountAtPeriodStart} />
            <KpiCard label="Exits this year" value={data.exitsYtd} />
            <KpiCard label="Attrition YTD" value={<Rate value={data.attritionYtd} />} />
            <KpiCard label="Payroll cost (net, finalized only)" value={`Rs ${data.payrollCost}`} />
            <KpiCard label="Finalized runs in range" value={data.finalizedRunsInRange} />
          </div>
          <Card title="Payroll (finalized runs only)">
            <ul className="item-list">
              <li><span>Gross payable</span><span>Rs {data.grossPayable}</span></li>
              <li><span>Average basic salary</span><span>{data.averageSalary === null ? 'No data yet' : `Rs ${data.averageSalary}`}</span></li>
            </ul>
          </Card>
          <Card title="Headcount by department">
            <HBarChart data={data.headcountByDepartment} label={(r) => r.name} value={(r) => r.count} format={(v) => `${v} people`} />
            {data.headcountByDepartment.length > 0 && (
              <ul className="item-list">{data.headcountByDepartment.map((r) => <li key={r.name}><span>{r.name}</span><span>{r.count} · avg Rs {r.averageBasicSalary}</span></li>)}</ul>
            )}
          </Card>
          <Card title="Payroll cost by department (net pay)">
            <HBarChart data={data.payrollCostByDepartment} label={(r) => r.department} value={(r) => r.payrollCost} format={(v) => `Rs ${v}`} />
            {data.payrollCostByDepartment.length > 0 && (
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
            <HBarChart data={data.tenureDistribution} label={(r) => r.bucket} value={(r) => r.count} format={(v) => `${v} people`} />
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
          <DashboardAiSummary kpi={{ headcount: data.headcount, headcountAtPeriodStart: data.headcountAtPeriodStart, exitsYtd: data.exitsYtd, attritionYtd: data.attritionYtd, payrollCost: data.payrollCost, grossPayable: data.grossPayable, finalizedRunsInRange: data.finalizedRunsInRange, averageSalary: data.averageSalary, from: data.filters.from, to: data.filters.to }} />
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
