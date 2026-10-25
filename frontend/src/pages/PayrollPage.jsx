import { useEffect, useState } from 'react';
import { createPayrollRun, downloadPayslipPdf, finalizePayrollRun, getPayrollRun, listPayrollRuns, myPayslips } from '../api/p1.js';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import Badge from '../components/ui/Badge.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function PayrollPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isStaff = ['ADMIN', 'HR'].includes(user?.role);
  const [runs, setRuns] = useState([]);
  const [mine, setMine] = useState([]);
  const [selected, setSelected] = useState(null);
  const [month, setMonth] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [finalizeId, setFinalizeId] = useState(null);
  const load = () => {
    setLoading(true);
    if (isStaff) listPayrollRuns().then((d) => setRuns(d.runs)).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false));
    else myPayslips().then((d) => setMine(d.payslips)).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  const open = async (id) => { try { setSelected(await getPayrollRun(id)); } catch (err) { setError(getErrorMessage(err)); } };
  const create = async (e) => {
    e.preventDefault(); setError(''); setMsg(''); setBusy(true);
    try { await createPayrollRun({ month }); setMsg('Draft created.'); load(); } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  };
  const finalize = async () => {
    const id = finalizeId; setFinalizeId(null);
    setError(''); setMsg(''); setBusy(true);
    try {
      await finalizePayrollRun(id); showToast('Payroll finalized and locked.'); load();
      if (selected) setSelected(await getPayrollRun(id));
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Payroll" subtitle="Gross = 1.5 × basic (HRA 40%, medical 10%). Deductions: absent + unpaid leave + 0.5 × half days. Only Admin finalizes; finalized runs are locked." />
      {error && <ErrorState message={error} onRetry={load} />}
      {msg && <p className="alert alert-success">{msg}</p>}
      {isStaff ? (
        <>
          <Card title="Create a monthly draft">
            <form onSubmit={create} className="form">
              <Input label="Month (YYYY-MM)" required value={month} onChange={(e) => setMonth(e.target.value)} placeholder="2026-10" pattern="\d{4}-\d{2}" />
              <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create draft'}</Button>
            </form>
          </Card>
          <Card title="Payroll runs">
            {loading ? <Skeleton lines={4} /> : runs.length === 0 ? (
              <EmptyState icon="₨" title="No payroll runs yet" text="Create a monthly draft above — HR drafts, Admin finalizes." />
            ) : (
              <DataTable
                columns={[
                  { key: 'month', label: 'Month', render: (r) => <strong>{r.month}</strong> },
                  { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
                  { key: 'employees', label: 'Employees', render: (r) => r.lines.length },
                  { key: 'actions', label: '', render: (r) => (
                    <span><Button variant="ghost" className="btn-sm" onClick={() => open(r._id)}>View</Button>{' '}{user?.role === 'ADMIN' && r.status === 'DRAFT' && <Button variant="ghost" className="btn-sm" disabled={busy} onClick={() => setFinalizeId(r._id)}>Finalize</Button>}</span>
                  ) },
                ]}
                rows={runs}
                sortKeys={{ month: (r) => r.month || '', status: (r) => r.status || '' }}
                emptyText="No payroll runs yet."
              />
            )}
          </Card>
          {selected && (
            <Card title={`Run ${selected.run.month} — ${selected.run.status}`}>
              <p className="page-actions no-print">
                <Button variant="ghost" onClick={() => window.print()}>Print payslip view</Button>
              </p>
              <DataTable
                columns={[
                  { key: 'employee', label: 'Employee', render: (l) => l.employee?.user?.name || l.employee?.employeeCode },
                  { key: 'gross', label: 'Gross payable', render: (l) => `Rs ${l.grossPayable}` },
                  { key: 'tax', label: 'Tax', render: (l) => `Rs ${l.tax}` },
                  { key: 'net', label: 'Net pay', render: (l) => <strong>Rs {l.netPay}</strong> },
                  { key: 'pdf', label: '', render: (l) => <Button variant="ghost" className="btn-sm no-print" onClick={() => downloadPayslipPdf(selected.run._id, l.employee._id || l.employee, selected.run.month)}>PDF</Button> },
                ]}
                rows={selected.run.lines}
                emptyText="No lines in this run."
              />
              <p className="muted">Printing this page prints only the payslip view — the sidebar and navigation are hidden in print.</p>
            </Card>
          )}
        </>
      ) : (
        <Card title="My payslips (finalized only)">
          {loading ? <Skeleton lines={4} /> : mine.length === 0 ? (
            <EmptyState icon="₨" title="No finalized payslips yet" text="Drafts are not shown to employees. Once Admin finalizes a month, your payslip appears here." />
          ) : (
            <DataTable
              columns={[
                { key: 'month', label: 'Month', render: (p) => <strong>{p.month}</strong> },
                { key: 'net', label: 'Net pay', render: (p) => `Rs ${p.netPay}` },
                { key: 'gross', label: 'Gross payable', render: (p) => `Rs ${p.grossPayable}` },
                { key: 'tax', label: 'Tax', render: (p) => `Rs ${p.tax}` },
                { key: 'pdf', label: '', render: (p) => <Button variant="ghost" className="btn-sm" onClick={() => downloadPayslipPdf(p.runId, p.employee, p.month)}>PDF</Button> },
              ]}
              rows={mine}
              sortKeys={{ month: (p) => p.month || '' }}
              emptyText="No finalized payslips yet."
            />
          )}
        </Card>
      )}
      {finalizeId && (
        <ConfirmDialog
          title="Finalize this payroll run?"
          warning="Finalizing locks the month: the run cannot be edited, recomputed, or deleted afterwards, and employees will be able to download their payslips."
          onCancel={() => setFinalizeId(null)}
          onConfirm={finalize}
          confirmLabel="Finalize and lock"
          danger
        >
          <p>Only Admin can finalize. Check the draft lines carefully before confirming.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
