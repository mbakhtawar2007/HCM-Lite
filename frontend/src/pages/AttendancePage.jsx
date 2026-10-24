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
  const [corrId, setCorrId] = useState('');
  const [corrIn, setCorrIn] = useState('');
  const [corrOut, setCorrOut] = useState('');
  const [busy, setBusy] = useState(false);
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
  const act = async (fn, ok) => { if (busy) return; setError(''); setMsg(''); setBusy(true); try { await fn(); setMsg(ok); load(); } catch (err) { setError(getErrorMessage(err)); } finally { setBusy(false); } };
  // Browser geolocation for the office geofence: best-effort. If the
  // user denies or the API is unavailable we send no location — the
  // server then allows check-in when no office location is set, and
  // returns a clear error when the geofence is enabled.
  const getLocation = () => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60000 },
    );
  });
  const doCheckIn = async () => { const loc = await getLocation(); await checkIn(loc); };
  return (
    <>
      <h1>Attendance</h1>
      {error && <p className="alert alert-error">{error}</p>}
      {msg && <p className="alert">{msg}</p>}
      {!isStaff && (
        <Card title="Today">
          <p><Button disabled={busy} onClick={() => act(doCheckIn, 'Checked in.')}>Check in</Button> <Button variant="ghost" disabled={busy} onClick={() => act(checkOut, 'Checked out.')}>Check out</Button></p>
          <p className="muted">Times are stamped by the server, not your device clock. A second check-in is rejected. If your company set an office location, check-in asks for your location and must be inside the office radius.</p>
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
          <form className="form" onSubmit={(e) => {
            e.preventDefault();
            // Phase 1 fix: the old form sent only attendanceId + reason,
            // but the server requires a requested check-in or check-out
            // time, so every correction from the UI failed with 400.
            // Now the employee picks the record and the corrected time(s).
            if (!corrIn && !corrOut) { setError('Enter a corrected check-in or check-out time.'); return; }
            act(() => requestCorrection({
              attendanceId: corrId || mine[0]._id, reason,
              ...(corrIn ? { requestedCheckIn: new Date(corrIn).toISOString() } : {}),
              ...(corrOut ? { requestedCheckOut: new Date(corrOut).toISOString() } : {}),
            }), 'Correction requested.').then(() => { setReason(''); setCorrIn(''); setCorrOut(''); });
          }}>
            <label className="field"><span>Record to correct</span><select value={corrId} onChange={(e) => setCorrId(e.target.value)}>{mine.map((a) => <option key={a._id} value={a._id}>{a.date.slice(0, 10)} · {a.status}</option>)}</select></label>
            <Input label="Corrected check-in (optional)" type="datetime-local" value={corrIn} onChange={(e) => setCorrIn(e.target.value)} />
            <Input label="Corrected check-out (optional)" type="datetime-local" value={corrOut} onChange={(e) => setCorrOut(e.target.value)} />
            <Input label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button type="submit" disabled={busy}>Request correction</Button>
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
