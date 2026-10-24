import { useEffect, useState } from 'react';
import { getHrDashboard } from '../api/dashboards.js';
import { orgList } from '../api/p1.js';
import { useAuth } from '../context/AuthContext.jsx';
import Card from '../components/ui/Card.jsx';
import DashboardAiSummary from '../components/DashboardAiSummary.jsx';
import DashboardFilters from '../components/DashboardFilters.jsx';
import Rate from '../components/Rate.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import KpiCard from '../components/ui/KpiCard.jsx';
import { HBarChart, LineChart } from '../components/Charts.jsx';
import { PageSkeleton } from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
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
      <PageHeader title="HR dashboard" subtitle={`Signed in as ${user?.email} · Role: ${user?.role}`} />
      <DashboardFilters filters={filters} setFilters={setFilters} departments={departments} onApply={load} loading={loading} />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && <PageSkeleton />}
      {!loading && !data && !error && <EmptyState icon="▦" title="No dashboard data yet" text="Once employees check in and take leave, this dashboard fills in from the server." actionLabel="View employees" actionTo="/employees" />}
      {data && (
        <>
          <div className="kpi-grid">
            <KpiCard label="Headcount" value={data.headcount} />
            <KpiCard label="Checked in today" value={data.today.checkedIn} sub={`present ${data.today.present} · late ${data.today.late} · half day ${data.today.halfDay} · missing checkout ${data.today.missingCheckout}`} />
            <KpiCard label="On leave today" value={data.today.onLeave} />
            <KpiCard label="Absent today" value={data.today.absent} />
            <KpiCard label="Attendance rate" value={<Rate value={data.attendanceRate} />} />
            <KpiCard label="Late rate" value={<Rate value={data.lateRate} />} />
            <KpiCard label="Pending leave approvals" value={data.pendingLeaveApprovals} />
            <KpiCard label="Pending attendance corrections" value={data.pendingAttendanceCorrections} />
          </div>
          <Card title={`Today (${data.today.date})${data.today.isWorkingDay ? '' : ' — not a working day'}`}>
            <p className="muted">Present / late / half / missing checkout / absent / on leave in range: {data.attendanceTotals.present} / {data.attendanceTotals.late} / {data.attendanceTotals.halfDay} / {data.attendanceTotals.missingCheckout} / {data.attendanceTotals.absent} / {data.attendanceTotals.onLeave}</p>
          </Card>
          <Card title="Attendance trend (working days)">
            {data.attendanceTrend.length === 0 ? <p className="muted">No working days in this range.</p> : (
              <LineChart
                xLabels={data.attendanceTrend.map((d) => d.date.slice(5))}
                series={[
                  { label: 'Present', lineClass: 'chart-line', points: data.attendanceTrend.map((d) => ({ y: d.present })) },
                  { label: 'Late', lineClass: 'chart-line-2', dotClass: 'chart-dot-2', points: data.attendanceTrend.map((d) => ({ y: d.late })) },
                ]}
              />
            )}
            {data.attendanceTrend.length > 0 && (
              <ul className="item-list">{data.attendanceTrend.map((d) => <li key={d.date}><span>{d.date}</span><span>present {d.present} · late {d.late} · half {d.halfDay} · missing {d.missingCheckout} · absent {d.absent} · leave {d.onLeave}</span></li>)}</ul>
            )}
          </Card>
          <Card title="Absenteeism by department">
            <HBarChart data={data.absenteeismByDepartment} label={(r) => r.department} value={(r) => Math.round((r.absenteeismRate || 0) * 100)} format={(v) => `${v}%`} />
            {data.absenteeismByDepartment.length > 0 && (
              <ul className="item-list">{data.absenteeismByDepartment.map((r) => <li key={r.department}><span>{r.department}</span><span><Rate value={r.absenteeismRate} /> · {r.absentDays} absent of {r.expectedWorkingDays} due days</span></li>)}</ul>
            )}
          </Card>
          <Card title="Leave by type (approved days in range)">
            <HBarChart data={data.leaveByType} label={(r) => r.leaveType.name} value={(r) => r.approvedDays} format={(v) => `${v} days`} />
            {data.leaveByType.length > 0 && (
              <ul className="item-list">{data.leaveByType.map((r) => <li key={r.leaveType._id}><span>{r.leaveType.name}</span><span>{r.approvedDays} days · utilization <Rate value={r.utilization} />{r.quota === null ? ' (unlimited)' : ` of ${r.quota}`}</span></li>)}</ul>
            )}
          </Card>
          <Card title="Top 5 late-comers in range">
            <HBarChart data={data.topLateComers} label={(r) => `${r.name} (${r.employeeCode})`} value={(r) => r.lateDays} format={(v) => `${v} late days`} maxBars={5} />
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
