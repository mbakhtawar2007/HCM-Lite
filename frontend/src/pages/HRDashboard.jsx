import { useEffect, useState } from 'react';
import { getHrDashboard } from '../api/dashboards.js';
import { orgList } from '../api/p1.js';
import { useAuth } from '../context/AuthContext.jsx';
import Card from '../components/ui/Card.jsx';
import DashboardAiSummary from '../components/DashboardAiSummary.jsx';
import DashboardFilters from '../components/DashboardFilters.jsx';
import Rate from '../components/Rate.jsx';
import { getErrorMessage } from '../utils/errors.js';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;

export default function HRDashboard() {
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
      setData(await getHrDashboard(params));
    } catch (e) { setError(getErrorMessage(e)); }
    setLoading(false);
  };
  useEffect(() => { orgList('departments').then((d) => setDepartments(d.items)).catch(() => {}); }, []);
  useEffect(() => { load(); }, []);
  return (
    <>
      <h1>HR dashboard</h1>
      <p className="muted">Signed in as {user?.email} · Role: {user?.role}</p>
      <DashboardFilters filters={filters} setFilters={setFilters} departments={departments} onApply={load} />
      {error && <p className="alert alert-error">{error}</p>}
      {loading && <p className="muted">Loading dashboard…</p>}
      {!loading && !data && !error && <p className="muted">No dashboard data yet.</p>}
      {data && (
        <>
          <Card title={`Today (${data.today.date})${data.today.isWorkingDay ? '' : ' — not a working day'}`}>
            <ul className="item-list">
              <li><span>Headcount</span><span>{data.headcount}</span></li>
              <li><span>Checked in</span><span>{data.today.checkedIn} (present {data.today.present} · late {data.today.late} · half day {data.today.halfDay} · missing checkout {data.today.missingCheckout})</span></li>
              <li><span>On leave today</span><span>{data.today.onLeave}</span></li>
              <li><span>Absent today</span><span>{data.today.absent}</span></li>
              <li><span>Pending leave approvals</span><span>{data.pendingLeaveApprovals}</span></li>
              <li><span>Pending attendance corrections</span><span>{data.pendingAttendanceCorrections}</span></li>
            </ul>
          </Card>
          <Card title="Attendance in range">
            <ul className="item-list">
              <li><span>Attendance rate</span><span><Rate value={data.attendanceRate} /></span></li>
              <li><span>Late rate</span><span><Rate value={data.lateRate} /></span></li>
              <li><span>Present / late / half / missing checkout / absent / on leave</span><span>{data.attendanceTotals.present} / {data.attendanceTotals.late} / {data.attendanceTotals.halfDay} / {data.attendanceTotals.missingCheckout} / {data.attendanceTotals.absent} / {data.attendanceTotals.onLeave}</span></li>
            </ul>
          </Card>
          <Card title="Attendance trend (working days)">
            {data.attendanceTrend.length === 0 ? <p className="muted">No working days in this range.</p> : (
              <ul className="item-list">{data.attendanceTrend.map((d) => <li key={d.date}><span>{d.date}</span><span>present {d.present} · late {d.late} · half {d.halfDay} · missing {d.missingCheckout} · absent {d.absent} · leave {d.onLeave}</span></li>)}</ul>
            )}
          </Card>
          <Card title="Absenteeism by department">
            {data.absenteeismByDepartment.length === 0 ? <p className="muted">No data yet.</p> : (
              <ul className="item-list">{data.absenteeismByDepartment.map((r) => <li key={r.department}><span>{r.department}</span><span><Rate value={r.absenteeismRate} /> · {r.absentDays} absent of {r.expectedWorkingDays} due days</span></li>)}</ul>
            )}
          </Card>
          <Card title="Leave by type (approved days in range)">
            {data.leaveByType.length === 0 ? <p className="muted">No leave types yet.</p> : (
              <ul className="item-list">{data.leaveByType.map((r) => <li key={r.leaveType._id}><span>{r.leaveType.name}</span><span>{r.approvedDays} days · utilization <Rate value={r.utilization} />{r.quota === null ? ' (unlimited)' : ` of ${r.quota}`}</span></li>)}</ul>
            )}
          </Card>
          <Card title="Top 5 late-comers in range">
            {data.topLateComers.length === 0 ? <p className="muted">No late check-ins in this range.</p> : (
              <ul className="item-list">{data.topLateComers.map((r) => <li key={r.employeeId}><span>{r.name} ({r.employeeCode}) · {r.department}</span><span>{r.lateDays} late days</span></li>)}</ul>
            )}
          </Card>
          <Card title="Pending leave approvals">
            {data.pendingLeaves.length === 0 ? <p className="muted">No pending leave requests.</p> : (
              <ul className="item-list">{data.pendingLeaves.map((l) => <li key={l._id}><span>{l.employee?.user?.name} · {l.leaveType?.name} · {l.startDate.slice(0, 10)} to {l.endDate.slice(0, 10)} · {l.workingDays} days</span><span><a href="/leaves">Decide</a></span></li>)}</ul>
            )}
          </Card>
          <Card title="Announcements">
            {data.announcements?.length === 0 ? <p className="muted">No announcements yet.</p> : (
              <ul className="item-list">{(data.announcements || []).map((a) => <li key={a._id}><span><strong>{a.title}</strong> · {a.body}</span><span>{a.postedBy?.name || ''}</span></li>)}</ul>
            )}
            <p><a href="/announcements">All announcements</a></p>
          </Card>
          <DashboardAiSummary kpi={{ headcount: data.headcount, attendanceRate: data.attendanceRate, lateRate: data.lateRate, present: data.attendanceTotals.present, late: data.attendanceTotals.late, absent: data.attendanceTotals.absent, onLeave: data.attendanceTotals.onLeave, workingDays: data.attendanceTotals.workingDays, pendingLeaveApprovals: data.pendingLeaveApprovals, pendingAttendanceCorrections: data.pendingAttendanceCorrections, from: data.filters.from, to: data.filters.to }} />
          <p><a href="/employees">Employees</a> · <a href="/attendance">Attendance board</a> · <a href="/leaves">Leave approvals</a> · <a href="/payroll">Payroll draft</a></p>
        </>
      )}
    </>
  );
}
