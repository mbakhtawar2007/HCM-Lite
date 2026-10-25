import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getEmployeeDashboard } from '../api/dashboards.js';
import { checkIn, checkOut } from '../api/p1.js';
import { useAuth } from '../context/AuthContext.jsx';
import Card from '../components/ui/Card.jsx';
import DashboardFilters from '../components/DashboardFilters.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import KpiCard from '../components/ui/KpiCard.jsx';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import { PageSkeleton } from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import { getErrorMessage } from '../utils/errors.js';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const now = useClock();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ from: monthStart(), to: today(), department: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getEmployeeDashboard({ from: filters.from, to: filters.to }));
    } catch (e) {
      setError(getErrorMessage(e));
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);
  const act = async (fn, ok) => {
    if (busy) return;
    setError('');
    setMsg('');
    setBusy(true);
    try {
      await fn();
      setMsg(ok);
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const getLocation = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000, maximumAge: 60000 },
      );
    });
  const doCheckIn = async () => {
    const loc = await getLocation();
    await checkIn(loc);
  };
  const weekPct = data ? Math.min(100, Math.round((data.week.hours / Math.max(data.week.targetHours, 1)) * 100)) : 0;
  return (
    <>
      <PageHeader
        title="My dashboard"
        subtitle={`Signed in as ${user?.email} · Role: EMPLOYEE — your own data only.`}
      />
      <DashboardFilters
        filters={filters}
        setFilters={setFilters}
        includeDepartment={false}
        onApply={load}
        loading={loading}
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {msg && <p className="alert alert-success">{msg}</p>}
      {loading && <PageSkeleton />}
      {!loading && !data && !error && (
        <EmptyState
          icon="👤"
          title="No dashboard data yet"
          text="If you have no employee record, ask HR to register you."
          actionLabel="View my attendance"
          actionTo="/attendance"
        />
      )}
      {data && (
        <>
          <Card title={`Check-in today (${data.today.date})`}>
            <p className="clock" aria-live="off">
              {now.toLocaleTimeString()}
            </p>
            <p>
              Today&rsquo;s status: <Badge status={data.today.status} label={data.today.status} />
            </p>
            <ul className="item-list">
              <li>
                <span>Check-in</span>
                <span>{data.today.checkIn ? new Date(data.today.checkIn).toLocaleTimeString() : '—'}</span>
              </li>
              <li>
                <span>Check-out</span>
                <span>{data.today.checkOut ? new Date(data.today.checkOut).toLocaleTimeString() : '—'}</span>
              </li>
            </ul>
            <p className="page-actions no-print">
              <Button disabled={busy} onClick={() => act(doCheckIn, 'Checked in.')}>
                Check in
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => act(checkOut, 'Checked out.')}>
                Check out
              </Button>
              <Link className="btn btn-ghost" to="/attendance">
                Full attendance
              </Link>
            </p>
            <p className="muted">
              Times are stamped by the server, not your device clock. A second check-in is rejected. If your company set
              an office location, check-in asks for your location and must be inside the office radius.
            </p>
          </Card>
          <div className="kpi-grid">
            <KpiCard
              label="Hours this week"
              value={`${data.week.hours} / ${data.week.targetHours}h`}
              sub={`${data.week.start} to ${data.week.end} · only completed check-in/out durations count`}
            />
            <KpiCard label={`Late days (${data.filters.from} to ${data.filters.to})`} value={data.lateCount} />
          </div>
          <Card title="Hours this week vs 40h">
            <div
              className="progress"
              role="progressbar"
              aria-valuenow={weekPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Weekly hours progress"
            >
              <div className="progress-bar" style={{ width: `${weekPct}%` }} />
            </div>
            <p className="muted">
              {data.week.hours} hours of a {data.week.targetHours}-hour week ({weekPct}%).
            </p>
          </Card>
          <Card title="My leave balances">
            {data.leaveBalances.length === 0 ? (
              <p className="muted">No leave types configured yet.</p>
            ) : (
              <ul className="item-list">
                {data.leaveBalances.map((b) => (
                  <li key={b.leaveType._id}>
                    <span>{b.leaveType.name}</span>
                    <span>
                      {b.quota === null
                        ? `Unlimited · ${b.used} used`
                        : `${b.used} used · ${b.remaining} left of ${b.quota}`}
                      {b.pending ? ` · ${b.pending} pending` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p>
              <a href="/leaves">Apply for leave</a>
            </p>
          </Card>
          <Card title="Last payslip (finalized only)">
            {data.lastPayslip ? (
              <p>
                {data.lastPayslip.month} · net Rs {data.lastPayslip.netPay} · gross payable Rs{' '}
                {data.lastPayslip.grossPayable}. <a href="/payroll">Download my payslips</a>
              </p>
            ) : (
              <p className="muted">No finalized payslip yet — drafts are not shown to employees.</p>
            )}
          </Card>
          <Card title="Announcements">
            {data.announcements?.length === 0 ? (
              <p className="muted">No announcements yet.</p>
            ) : (
              <ul className="item-list">
                {(data.announcements || []).map((a) => (
                  <li key={a._id}>
                    <span>
                      <strong>{a.title}</strong> · {a.body}
                    </span>
                    <span>{a.postedBy?.name || ''}</span>
                  </li>
                ))}
              </ul>
            )}
            <p>
              <a href="/announcements">All announcements</a>
            </p>
          </Card>
          <Card title="Ask my assistant">
            <p className="muted">
              Ask about your own leave balance, your attendance, or company policy — answers use your own data only.
            </p>
            <Link className="btn btn-primary" to="/ai">
              Ask my assistant
            </Link>
          </Card>
          <Card title="My notifications">
            <p>
              <a href="/notifications">View my notifications</a> — leave decisions and payslip availability appear
              there.
            </p>
          </Card>
        </>
      )}
    </>
  );
}
