import { useEffect, useState } from 'react';
import { applyLeave, cancelLeave, decideLeave, leaveBalances, listLeaves, orgList } from '../api/p1.js';
import { aiSmartLeave } from '../api/ai.js';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function LeavesPage() {
  const { user } = useAuth();
  const isStaff = ['ADMIN', 'HR'].includes(user?.role);
  const [leaves, setLeaves] = useState([]);
  const [balances, setBalances] = useState([]);
  const [types, setTypes] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ leaveType: '', startDate: '', endDate: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [smartText, setSmartText] = useState('');
  const [smartLoading, setSmartLoading] = useState(false);
  // P3 smart leave: plain words -> pre-filled form. Nothing is applied
  // here — the user still checks the form and presses Apply, and on any
  // parse failure the normal form below is the fallback.
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
    listLeaves().then((d) => setLeaves(d.leaves)).catch((e) => setError(getErrorMessage(e)));
    if (!isStaff) leaveBalances().then((d) => setBalances(d.balances)).catch(() => {});
    orgList('leave-types').then((d) => setTypes(d.items)).catch(() => {});
  };
  useEffect(load, []);
  const submit = async (e) => {
    e.preventDefault(); setError(''); setMsg(''); setBusy(true);
    try { await applyLeave(form); setMsg('Leave applied. Working days skip weekends and holidays.'); load(); } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <h1>Leave</h1>
      {error && <p className="alert alert-error">{error}</p>}
      {msg && <p className="alert">{msg}</p>}
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
              <label className="field"><span>Leave type</span><select required value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })}><option value="">Select…</option>{types.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></label>
              <Input label="Start date" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              <Input label="End date" type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              <Input label="Reason" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              <Button type="submit" disabled={busy}>{busy ? 'Applying…' : 'Apply'}</Button>
            </form>
          </Card>
        </>
      )}
      <Card title={isStaff ? 'Leave requests' : 'My leave history'}>
        <ul className="item-list">{leaves.map((l) => (
          <li key={l._id}><span><strong>{l.employee?.user?.name || 'Me'}</strong> · {l.leaveType?.name} · {l.startDate.slice(0, 10)} to {l.endDate.slice(0, 10)} · {l.workingDays} working days · {l.status}</span>
            <span>
              {isStaff && l.status === 'PENDING' && <><Button variant="ghost" onClick={async () => { try { await decideLeave(l._id, { status: 'APPROVED' }); load(); } catch (err) { setError(getErrorMessage(err)); } }}>Approve</Button> <Button variant="ghost" onClick={async () => { try { await decideLeave(l._id, { status: 'REJECTED' }); load(); } catch (err) { setError(getErrorMessage(err)); } }}>Reject</Button></>}
              {!isStaff && l.status === 'PENDING' && <Button variant="ghost" onClick={async () => { try { await cancelLeave(l._id); load(); } catch (err) { setError(getErrorMessage(err)); } }}>Cancel</Button>}
            </span></li>
        ))}</ul>
      </Card>
    </>
  );
}
