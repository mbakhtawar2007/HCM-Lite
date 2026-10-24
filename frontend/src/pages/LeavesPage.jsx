import { useEffect, useState } from 'react';
import { applyLeave, cancelLeave, decideLeave, leaveBalances, listLeaves, orgList } from '../api/p1.js';
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
  const load = () => {
    listLeaves().then((d) => setLeaves(d.leaves)).catch((e) => setError(getErrorMessage(e)));
    if (!isStaff) leaveBalances().then((d) => setBalances(d.balances)).catch(() => {});
    orgList('leave-types').then((d) => setTypes(d.items)).catch(() => {});
  };
  useEffect(load, []);
  const submit = async (e) => {
    e.preventDefault(); setError(''); setMsg('');
    try { await applyLeave(form); setMsg('Leave applied. Working days skip weekends and holidays.'); load(); } catch (err) { setError(getErrorMessage(err)); }
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
          <Card title="Apply for leave">
            <form onSubmit={submit} className="form">
              <label className="field"><span>Leave type</span><select required value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })}><option value="">Select…</option>{types.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}</select></label>
              <Input label="Start date" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              <Input label="End date" type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              <Input label="Reason" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              <Button type="submit">Apply</Button>
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
