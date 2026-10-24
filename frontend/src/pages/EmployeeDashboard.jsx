import { useEffect, useState } from 'react';
import { getEmployeeDashboard } from '../api/dashboards.js';
import { useAuth } from '../context/AuthContext.jsx';
import Card from '../components/ui/Card.jsx';
import DashboardFilters from '../components/DashboardFilters.jsx';
import { getErrorMessage } from '../utils/errors.js';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ from: monthStart(), to: today(), department: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try { setData(await getEmployeeDashboard({ from: filters.from, to: filters.to })); }
    catch (e) { setError(getErrorMessage(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  return (
    <>
      <h1>My dashboard</h1>
      <p className="muted">Signed in as {user?.email} · Role: EMPLOYEE — your own data only.</p>
      <DashboardFilters filters={filters} setFilters={setFilters} includeDepartment={false} onApply={load} />
      {error && <p className="alert alert-error">{error}</p>}
      {loading && <p className="muted">Loading dashboard…</p>}
      {!loading && !data && !error && <p className="muted">No dashboard data yet — if you have no employee record, ask HR to register you.</p>}
      {data && (
        <>
          <Card title={`Check-in today (${data.today.date})`}>
            <ul className="item-list">
              <li><span>Status</span><span>{data.today.status}</span></li>
              <li><span>Check-in</span><span>{data.today.checkIn ? new Date(data.today.checkIn).toLocaleTimeString() : '—'}</span></li>
              <li><span>Check-out</span><span>{data.today.checkOut ? new Date(data.today.checkOut).toLocaleTimeString() : '—'}</span></li>
            </ul>
            <p><a href="/attendance">Check in / out and view my attendance</a></p>
          </Card>
          <Card title="Hours this week">
            <p>{data.week.hours} hours of a {data.week.targetHours}-hour week ({data.week.start} to {data.week.end}). Only completed check-in/out durations count.</p>
          </Card>
          <Card title="Late count in range">
            <p>{data.lateCount} late day(s) from {data.filters.from} to {data.filters.to}.</p>
          </Card>
          <Card title="My leave balances">
            {data.leaveBalances.length === 0 ? <p className="muted">No leave types configured yet.</p> : (
              <ul className="item-list">{data.leaveBalances.map((b) => <li key={b.leaveType._id}><span>{b.leaveType.name}</span><span>{b.quota === null ? `Unlimited · ${b.used} used` : `${b.used} used · ${b.remaining} left of ${b.quota}`}{b.pending ? ` · ${b.pending} pending` : ''}</span></li>)}</ul>
            )}
            <p><a href="/leaves">Apply for leave</a></p>
          </Card>
          <Card title="Last payslip (finalized only)">
            {data.lastPayslip ? (
              <p>{data.lastPayslip.month} · net Rs {data.lastPayslip.netPay} · gross payable Rs {data.lastPayslip.grossPayable}. <a href="/payroll">Download my payslips</a></p>
            ) : <p className="muted">No finalized payslip yet — drafts are not shown to employees.</p>}
          </Card>
          <Card title="Announcements">
            {data.announcements?.length === 0 ? <p className="muted">No announcements yet.</p> : (
              <ul className="item-list">{(data.announcements || []).map((a) => <li key={a._id}><span><strong>{a.title}</strong> · {a.body}</span><span>{a.postedBy?.name || ''}</span></li>)}</ul>
            )}
            <p><a href="/announcements">All announcements</a></p>
          </Card>
          <Card title="Ask my assistant">
            <p className="muted">Coming soon in P3 — the AI assistant is not connected yet, so no AI answers are shown here.</p>
          </Card>
          <Card title="My notifications">
            <p><a href="/notifications">View my notifications</a> — leave decisions and payslip availability appear there.</p>
          </Card>
        </>
      )}
    </>
  );
}
