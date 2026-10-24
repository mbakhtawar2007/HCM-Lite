import { useEffect, useState } from 'react';
import { attendanceBoard, checkIn, checkOut, decideCorrection, listCorrections, myAttendance, requestCorrection } from '../api/p1.js';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function AttendancePage() {
  const { user } = useAuth();
  const isStaff = ['ADMIN', 'HR'].includes(user?.role);
  const [mine, setMine] = useState([]);
  const [board, setBoard] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    if (isStaff) {
      attendanceBoard(new Date().toISOString().slice(0, 10)).then((d) => setBoard(d.board)).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false));
      listCorrections().then((d) => setCorrections(d.corrections)).catch(() => {});
    } else {
      myAttendance().then((d) => setMine(d.attendance)).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false));
      listCorrections().then((d) => setCorrections(d.corrections)).catch(() => {});
    }
  };
  useEffect(load, []);
  const act = async (fn, ok) => { setError(''); setMsg(''); try { await fn(); setMsg(ok); load(); } catch (err) { setError(getErrorMessage(err)); } };
  return (
    <>
      <h1>Attendance</h1>
      {error && <p className="alert alert-error">{error}</p>}
      {msg && <p className="alert">{msg}</p>}
      {!isStaff && (
        <Card title="Today">
          <p><Button onClick={() => act(checkIn, 'Checked in.')}>Check in</Button> <Button variant="ghost" onClick={() => act(checkOut, 'Checked out.')}>Check out</Button></p>
          <p className="muted">Times are stamped by the server, not your device clock. A second check-in is rejected.</p>
        </Card>
      )}
      {isStaff ? (
        <Card title="Daily board (today)">
          <ul className="item-list">{loading && <li className="muted">Loading…</li>}{board.map((b) => <li key={b.employee._id}><span><strong>{b.employee.user?.name}</strong> · {b.employee.employeeCode}</span><span>{b.status}</span></li>)}</ul>
        </Card>
      ) : (
        <Card title="My attendance">
          <ul className="item-list">{loading && <li className="muted">Loading…</li>}{mine.map((a) => <li key={a._id}><span>{a.date.slice(0, 10)} · {a.checkIn ? new Date(a.checkIn).toLocaleTimeString() : ''} — {a.checkOut ? new Date(a.checkOut).toLocaleTimeString() : 'no check-out'}</span><span>{a.status}</span></li>)}</ul>
        </Card>
      )}
      <Card title="Correction requests">
        {!isStaff && mine.length > 0 && (
          <form className="form" onSubmit={(e) => { e.preventDefault(); act(() => requestCorrection({ attendanceId: mine[0]._id, reason }), 'Correction requested.'); }}>
            <Input label="Reason for correcting your latest record" required value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button type="submit">Request correction</Button>
          </form>
        )}
        <ul className="item-list">{corrections.map((c) => (
          <li key={c._id}><span>{c.reason} · {c.status}</span>
            {isStaff && c.status === 'PENDING' && <span><Button variant="ghost" onClick={() => act(() => decideCorrection(c._id, { status: 'APPROVED' }), 'Approved.')}>Approve</Button> <Button variant="ghost" onClick={() => act(() => decideCorrection(c._id, { status: 'REJECTED' }), 'Rejected.')}>Reject</Button></span>}</li>
        ))}</ul>
      </Card>
    </>
  );
}
