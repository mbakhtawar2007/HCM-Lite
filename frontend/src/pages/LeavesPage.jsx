import { useEffect, useState } from 'react';
import { applyLeave, cancelLeave, decideLeave, leaveBalances, listLeaves, orgList } from '../api/p1.js';
import { aiSmartLeave } from '../api/ai.js';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import Select from '../components/ui/Select.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import Badge from '../components/ui/Badge.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function LeavesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isStaff = ['ADMIN', 'HR'].includes(user?.role);
  const [leaves, setLeaves] = useState([]);
  const [balances, setBalances] = useState([]);
  const [types, setTypes] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ leaveType: '', startDate: '', endDate: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [smartText, setSmartText] = useState('');
  const [smartLoading, setSmartLoading] = useState(false);
  const [cancelId, setCancelId] = useState(null);
  const runSmartLeave = async (e) => {
    e.preventDefault();
    if (!smartText.trim() || smartLoading) return;
    setSmartLoading(true); setError('');
    try {
      const d = await aiSmartLeave(smartText.trim());
      if (d.parseFailed) {
        setMsg('Could not understand that leave request — please use the leave form below.');
      } else if (d.leave) {
        setForm({ leaveType: d.leave.leaveTypeId, startDate: d.leave.start, endDate: d.leave.end, reason: d.leave.reason });
        setMsg(`Pre-filled from your message (${d.leave.workingDays} working days) — check it and press Apply. Nothing has been submitted yet.`);
      }
    } catch (err) {
      if (err.response?.status === 503) setMsg('Smart leave is unavailable — the AI key has not been added yet. Please use the leave form below.');
      else setError(getErrorMessage(err));
    }
    setSmartLoading(false);
  };
  const load = () => {
    setLoading(true);
    listLeaves().then((d) => setLeaves(d.leaves)).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false));
    if (!isStaff) leaveBalances().then((d) => setBalances(d.balances)).catch(() => {});
    orgList('leave-types').then((d) => setTypes(d.items)).catch(() => {});
  };
  useEffect(load, []);
  const submit = async (e) => {
    e.preventDefault(); setError(''); setMsg(''); setFormError('');
    if (form.startDate && form.endDate && form.endDate < form.startDate) { setFormError('End date must be on or after the start date.'); return; }
    setBusy(true);
    try { await applyLeave(form); setMsg('Leave applied. Working days skip weekends and holidays.'); load(); } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  };
  const decide = async (id, status) => {
    try { await decideLeave(id, { status }); showToast(`Leave ${status.toLowerCase()}.`); load(); } catch (err) { setError(getErrorMessage(err)); }
  };
  const doCancel = async () => {
    try { await cancelLeave(cancelId); setCancelId(null); showToast('Leave cancelled.'); load(); } catch (err) { setError(getErrorMessage(err)); setCancelId(null); }
  };
  return (
    <>
      <PageHeader title="Leave" subtitle="Working days only — weekends and holidays are skipped. Overlap or over-balance is rejected." />
      {error && <ErrorState message={error} onRetry={load} />}
      {msg && <p className="alert alert-success">{msg}</p>}
      {!isStaff && (
        <>
          <Card title="My balances">
            <ul className="item-list">{balances.map((b) => <li key={b.leaveType._id}><span>{b.leaveType.name}</span><span>{b.quota === null ? 'Unlimited' : `${b.used} used · ${b.remaining} left of ${b.quota}`}{b.pending ? ` · ${b.pending} pending` : ''}</span></li>)}</ul>
          </Card>
          <Card title="Smart leave — describe it in plain words">
            <form onSubmit={runSmartLeave} className="form">
              <Input label="e.g. I need next Monday and Tuesday off for a wedding" required value={smartText} onChange={(e) => setSmartText(e.target.value)} />
              <Button type="submit" disabled={smartLoading}>{smartLoading ? 'Understanding…' : 'Pre-fill form'}</Button>
            </form>
            <p className="muted">AI-generated suggestion only — check the dates and type below before you apply.</p>
          </Card>
          <Card title="Apply for leave">
            <form onSubmit={submit} className="form">
              {formError && <p className="alert alert-error">{formError}</p>}
              <Select label="Leave type" required value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })}><option value="">Select…</option>{types.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</Select>
              <Input label="Start date" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              <Input label="End date" type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              <Input label="Reason" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              <Button type="submit" disabled={busy}>{busy ? 'Applying…' : 'Apply'}</Button>
            </form>
          </Card>
        </>
      )}
      <Card title={isStaff ? 'Leave requests' : 'My leave history'}>
        {loading ? <Skeleton lines={4} /> : leaves.length === 0 ? (
          <EmptyState icon="○" title="No leave requests yet" text={isStaff ? 'Leave requests from employees will appear here.' : 'Apply for leave above — balances and history will appear here.'} />
        ) : (
          <DataTable
            columns={[
              { key: 'employee', label: 'Employee', render: (l) => <strong>{l.employee?.user?.name || 'Me'}</strong> },
              { key: 'type', label: 'Type', render: (l) => l.leaveType?.name },
              { key: 'dates', label: 'Dates', render: (l) => `${l.startDate.slice(0, 10)} to ${l.endDate.slice(0, 10)} · ${l.workingDays} days` },
              { key: 'status', label: 'Status', render: (l) => <Badge status={l.status} /> },
              { key: 'actions', label: '', render: (l) => (
                <span>
                  {isStaff && l.status === 'PENDING' && <><Button variant="ghost" className="btn-sm" onClick={() => decide(l._id, 'APPROVED')}>Approve</Button>{' '}<Button variant="ghost" className="btn-sm" onClick={() => decide(l._id, 'REJECTED')}>Reject</Button></>}
                  {!isStaff && l.status === 'PENDING' && <Button variant="ghost" className="btn-sm" onClick={() => setCancelId(l._id)}>Cancel</Button>}
                </span>
              ) },
            ]}
            rows={leaves}
            sortKeys={{ employee: (l) => l.employee?.user?.name || '', type: (l) => l.leaveType?.name || '', dates: (l) => l.startDate || '', status: (l) => l.status || '' }}
            emptyText="No leave requests yet."
          />
        )}
      </Card>
      {cancelId && (
        <ConfirmDialog
          title="Cancel this leave request?"
          onCancel={() => setCancelId(null)}
          onConfirm={doCancel}
          confirmLabel="Cancel leave"
          danger
        >
          <p>Only pending requests can be cancelled. This cannot be undone — you would need to apply again.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
