import { useEffect, useState } from 'react';
import { createPayrollRun, downloadPayslipPdf, finalizePayrollRun, getPayrollRun, listPayrollRuns, myPayslips } from '../api/p1.js';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function PayrollPage() {
  const { user } = useAuth();
  const isStaff = ['ADMIN', 'HR'].includes(user?.role);
  const [runs, setRuns] = useState([]);
  const [mine, setMine] = useState([]);
  const [selected, setSelected] = useState(null);
  const [month, setMonth] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    if (isStaff) listPayrollRuns().then((d) => setRuns(d.runs)).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false));
    else myPayslips().then((d) => setMine(d.payslips)).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false));
  };
  useEffect(load, []);
  const open = async (id) => { try { setSelected(await getPayrollRun(id)); } catch (err) { setError(getErrorMessage(err)); } };
  const create = async (e) => {
    e.preventDefault(); setError(''); setMsg('');
    try { await createPayrollRun({ month }); setMsg('Draft created.'); load(); } catch (err) { setError(getErrorMessage(err)); }
  };
  return (
    <>
      <h1>Payroll</h1>
      <p className="muted">Gross = 1.5 × basic (HRA 40%, medical 10%). Deductions: absent + unpaid leave + 0.5 × half days. Only Admin finalizes; finalized runs are locked.</p>
      {error && <p className="alert alert-error">{error}</p>}
      {msg && <p className="alert">{msg}</p>}
      {isStaff ? (
        <>
          <Card title="Create a monthly draft">
            <form onSubmit={create} className="form">
              <Input label="Month (YYYY-MM)" required value={month} onChange={(e) => setMonth(e.target.value)} placeholder="2026-10" />
              <Button type="submit">Create draft</Button>
            </form>
          </Card>
          <Card title="Payroll runs">
            <ul className="item-list">{loading && <li className="muted">Loading…</li>}{!loading && runs.length === 0 && <li className="muted">No payroll runs yet.</li>}{runs.map((r) => (
              <li key={r._id}><span><strong>{r.month}</strong> · {r.status} · {r.lines.length} employees</span><span><Button variant="ghost" onClick={() => open(r._id)}>View</Button> {user?.role === 'ADMIN' && r.status === 'DRAFT' && <Button variant="ghost" onClick={async () => { try { await finalizePayrollRun(r._id); setMsg('Finalized and locked.'); load(); } catch (err) { setError(getErrorMessage(err)); } }}>Finalize</Button>}</span></li>
            ))}</ul>
          </Card>
          {selected && (
            <Card title={`Run ${selected.run.month} — ${selected.run.status}`}>
              <ul className="item-list">{selected.run.lines.map((l, i) => (
                <li key={i}><span>{l.employee?.user?.name || l.employee?.employeeCode} · Gross Rs {l.grossPayable} · Tax Rs {l.tax} · <strong>Net Rs {l.netPay}</strong></span><Button variant="ghost" onClick={() => downloadPayslipPdf(selected.run._id, l.employee._id || l.employee, selected.run.month)}>PDF</Button></li>
              ))}</ul>
            </Card>
          )}
        </>
      ) : (
        <Card title="My payslips (finalized only)">
          <ul className="item-list">{mine.map((p, i) => (
            <li key={i}><span><strong>{p.month}</strong> · Net Rs {p.netPay} · Gross payable Rs {p.grossPayable} · Tax Rs {p.tax}</span><Button variant="ghost" onClick={() => downloadPayslipPdf(p.runId, p.employee, p.month)}>PDF</Button></li>
          ))}
          {loading && <li className="muted">Loading…</li>}
          {!loading && mine.length === 0 && <li className="muted">No finalized payslips yet.</li>}</ul>
        </Card>
      )}
    </>
  );
}
