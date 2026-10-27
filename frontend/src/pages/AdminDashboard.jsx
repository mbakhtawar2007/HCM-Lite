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
    setLoading(true);
    setError('');
    try {
      const params = { from: filters.from, to: filters.to };
      if (filters.department) params.department = filters.department;
      setData(await getAdminDashboard(params));
    } catch (e) {
      setError(getErrorMessage(e));
    }
    setLoading(false);
  };
  useEffect(() => {
    orgList('departments')
      .then((d) => setDepartments(d.items))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <PageHeader
        title="Admin dashboard"
        subtitle={`Signed in as ${user?.email} · Admin. Everything below comes from real records in the date range you pick — nothing here is made up.`}
      />
      <Card title="Start here">
        <p className="muted">
          New to the app? Do these in order: <a href="/settings">1. Company setup</a> (departments and working hours) →{' '}
          <a href="/employees">2. Register employees</a> → <a href="/users">3. Create HR logins</a> →{' '}
          <a href="/payroll">4. Run payroll</a>.
        </p>
      </Card>
      <DashboardFilters
        filters={filters}
        setFilters={setFilters}
        departments={departments}
        onApply={load}
        loading={loading}
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && <PageSkeleton />}
      {!loading && !data && !error && (
        <EmptyState
          icon="▦"
          title="No dashboard data yet"
          text="Once employees and payroll exist, this dashboard fills in from the server."
          actionLabel="Register an employee"
          actionTo="/employees"
        />
      )}
      {data && (
        <>
          <div className="kpi-grid">
            <KpiCard label="Employees now" value={data.headcount} sub="Active employees today" />
            <KpiCard label="Employees at start of period" value={data.headcountAtPeriodStart} />
            <KpiCard label="People who left this year" value={data.exitsYtd} />
            <KpiCard label="Leaving rate this year" value={<Rate value={data.attritionYtd} />} />
            <KpiCard
              label="Payroll cost (final pay only)"
              value={`Rs ${data.payrollCost}`}
              sub="Total take-home pay, finalised months only"
            />
            <KpiCard label="Pay months finalised in range" value={data.finalizedRunsInRange} />
          </div>
          <Card title="Payroll — final pay only">
            <p className="muted">Only months you have finalised count here. Drafts do not count yet.</p>
            <ul className="item-list">
              <li>
                <span>Gross payable</span>
                <span>Rs {data.grossPayable}</span>
              </li>
              <li>
                <span>Average basic salary</span>
                <span>{data.averageSalary === null ? 'No data yet' : `Rs ${data.averageSalary}`}</span>
              </li>
            </ul>
          </Card>
          <Card title="People by department">
            <HBarChart
              data={data.headcountByDepartment}
              label={(r) => r.name}
              value={(r) => r.count}
              format={(v) => `${v} people`}
            />
            {data.headcountByDepartment.length > 0 && (
              <ul className="item-list">
                {data.headcountByDepartment.map((r) => (
                  <li key={r.name}>
                    <span>{r.name}</span>
                    <span>
                      {r.count} · avg Rs {r.averageBasicSalary}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Payroll cost by department">
            <HBarChart
              data={data.payrollCostByDepartment}
              label={(r) => r.department}
              value={(r) => r.payrollCost}
              format={(v) => `Rs ${v}`}
            />
            {data.payrollCostByDepartment.length > 0 && (
              <ul className="item-list">
                {data.payrollCostByDepartment.map((r) => (
                  <li key={r.department}>
                    <span>{r.department}</span>
                    <span>
                      Rs {r.payrollCost} · {r.employees} payslips
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="People by job title">
            {data.headcountByDesignation.length === 0 ? (
              <p className="muted">No data yet.</p>
            ) : (
              <ul className="item-list">
                {data.headcountByDesignation.map((r) => (
                  <li key={r.name}>
                    <span>{r.name}</span>
                    <span>{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Payroll cost by job title">
            {data.payrollCostByDesignation.length === 0 ? (
              <p className="muted">No finalized payroll in this range yet.</p>
            ) : (
              <ul className="item-list">
                {data.payrollCostByDesignation.map((r) => (
                  <li key={r.designation}>
                    <span>{r.designation}</span>
                    <span>
                      Rs {r.payrollCost} · {r.employees} payslips
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="How long people have worked here">
            <HBarChart
              data={data.tenureDistribution}
              label={(r) => r.bucket}
              value={(r) => r.count}
              format={(v) => `${v} people`}
            />
          </Card>
          <Card title="Gender (only where employees shared it)">
            {data.genderBreakdown?.available ? (
              <ul className="item-list">
                {Object.entries(data.genderBreakdown.byGender).map(([g, n]) => (
                  <li key={g}>
                    <span>{g}</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Not collected yet.</p>
            )}
            <p className="muted">
              Employees without a gender are counted as &quot;Not specified&quot; — no value is ever assigned for them.
            </p>
          </Card>
          <Card title="On probation">
            <p className="muted">
              On probation (probation end date on or after {data.filters.to}):{' '}
              <strong>{data.probation?.onProbation ?? 0}</strong> of {data.probation?.total ?? 0} active employees.
            </p>
          </Card>
          <Card title="Unusual absence patterns">
            {(data.absenceAnomalies || []).length === 0 ? (
              <p className="muted">No anomaly flags in this range.</p>
            ) : (
              <ul className="item-list">
                {data.absenceAnomalies.map((a, i) => (
                  <li key={i}>
                    <span>
                      {a.name} ({a.employeeCode}) — {a.type}
                    </span>
                    <span>{a.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted">
              Thresholds: 3+ consecutive absent working days; 3+ Monday/Friday absences; absence rate over 30% with at
              least 5 due days.
            </p>
          </Card>
          <Card title="Who might leave (indicator only, not a prediction)">
            {(data.attritionRisk || []).length === 0 ? (
              <p className="muted">No employees in this range.</p>
            ) : (
              <ul className="item-list">
                {data.attritionRisk.map((r) => (
                  <li key={r.employeeId}>
                    <span>
                      {r.name} ({r.employeeCode}) — {r.band}
                    </span>
                    <span>{r.score === null ? 'No data' : `Score ${r.score}`}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="muted">
              Score = late rate × 30 + absence rate × 30 + leave use × 20 + tenure points (20 if under 1 year, 10 if
              under 2 years). Bands: 60+ High, 35+ Medium, otherwise Low.
            </p>
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
          <DashboardAiSummary
            kpi={{
              headcount: data.headcount,
              headcountAtPeriodStart: data.headcountAtPeriodStart,
              exitsYtd: data.exitsYtd,
              attritionYtd: data.attritionYtd,
              payrollCost: data.payrollCost,
              grossPayable: data.grossPayable,
              finalizedRunsInRange: data.finalizedRunsInRange,
              averageSalary: data.averageSalary,
              from: data.filters.from,
              to: data.filters.to,
            }}
          />
          <Card title="Recent audit feed">
            {data.auditFeed.length === 0 ? (
              <p className="muted">No audit entries yet.</p>
            ) : (
              <ul className="item-list">
                {data.auditFeed.map((l) => (
                  <li key={l._id}>
                    <span>
                      {l.action} {l.entity} · {l.actor?.name || 'System'}
                    </span>
                    <span>{l.createdAt.slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p>
              <a href="/audit">Full audit log</a> · <a href="/payroll">Payroll</a> · <a href="/users">Users</a> ·{' '}
              <a href="/settings">Settings</a>
            </p>
          </Card>
        </>
      )}
    </>
  );
}
