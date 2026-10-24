import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getEmployee360, updateEmployee } from '../api/p1.js';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function Employee360() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => getEmployee360(id).then((d) => { setData(d); setPhone(d.employee.phone || ''); setAddress(d.employee.address || ''); }).catch((e) => setError(getErrorMessage(e)));
  useEffect(load, [id]);
  const saveContact = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await updateEmployee(id, { phone, address }); load(); } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  };
  if (error) return <p className="alert alert-error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const em = data.employee;
  return (
    <>
      <h1>{em.user?.name} — {em.employeeCode}</h1>
      <p className="muted">{em.department?.name} · {em.designation?.name || ''} · Joined {em.joiningDate?.slice(0, 10)} · Basic Rs {em.basicSalary}</p>
      <Card title="Contact (employees edit their own phone/address)">
        <form onSubmit={saveContact} className="form">
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save contact'}</Button>
        </form>
      </Card>
      <Card title="Attendance (recent)">
        <ul className="item-list">{data.attendance.slice(0, 30).map((a) => <li key={a._id}><span>{a.date.slice(0, 10)} · {a.checkIn ? new Date(a.checkIn).toLocaleTimeString() : ''} — {a.checkOut ? new Date(a.checkOut).toLocaleTimeString() : 'no check-out'}</span></li>)}</ul>
      </Card>
      <Card title="Leave history">
        <ul className="item-list">{data.leaves.map((l) => <li key={l._id}><span>{l.leaveType?.name} · {l.startDate.slice(0, 10)} to {l.endDate.slice(0, 10)} · {l.workingDays} days · {l.status}</span></li>)}</ul>
      </Card>
      <Card title="Payslips">
        <ul className="item-list">{data.payslips.map((p, i) => <li key={i}><span>{p.month} · {p.status} · Net Rs {p.netPay}</span></li>)}</ul>
      </Card>
    </>
  );
}
