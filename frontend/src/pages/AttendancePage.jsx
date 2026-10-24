import { useEffect, useState } from 'react';
import { attendanceBoard, checkIn, checkOut, decideCorrection, listCorrections, myAttendance, requestCorrection } from '../api/p1.js';
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
      <PageHeader title="Attendance" subtitle="Times are stamped by the server, not your device clock. A second check-in is rejected." />
      {error && <ErrorState message={error} onRetry={load} />}
      {msg && <p className="alert alert-success">{msg}</p>}
      {!isStaff && (
        <Card title="Today">
          <p className="page-actions"><Button disabled={busy} onClick={() => act(doCheckIn, 'Checked in.')}>Check in</Button> <Button variant="ghost" disabled={busy} onClick={() => act(checkOut, 'Checked out.')}>Check out</Button></p>
          <p className="muted">If your company set an office location, check-in asks for your location and must be inside the office radius.</p>
        </Card>
      )}
      {isStaff ? (
        <Card title="Daily board (today)">
          {loading ? <Skeleton lines={4} /> : board.length === 0 ? (
            <EmptyState icon="◷" title="Nobody checked in today yet" text="Employees check in from their dashboard or this page." />
          ) : (
            <DataTable
              columns={[
                { key: 'name', label: 'Employee', render: (b) => <strong>{b.employee.user?.name}</strong> },
                { key: 'code', label: 'Code', render: (b) => b.employee.employeeCode },
                { key: 'status', label: 'Status', render: (b) => <Badge status={b.status} /> },
              ]}
              rows={board}
              sortKeys={{ name: (b) => b.employee.user?.name || '', code: (b) => b.employee.employeeCode || '', status: (b) => b.status || '' }}
              emptyText="Nobody checked in today yet."
            />
          )}
        </Card>
      ) : (
        <Card title="My attendance">
          {loading ? <Skeleton lines={4} /> : mine.length === 0 ? (
            <EmptyState icon="◷" title="No attendance yet" text="Check in above to record your first day." />
          ) : (
            <DataTable
              columns={[
                { key: 'date', label: 'Date', render: (a) => a.date.slice(0, 10) },
                { key: 'in', label: 'Check-in', render: (a) => (a.checkIn ? new Date(a.checkIn).toLocaleTimeString() : '—') },
                { key: 'out', label: 'Check-out', render: (a) => (a.checkOut ? new Date(a.checkOut).toLocaleTimeString() : 'no check-out') },
                { key: 'status', label: 'Status', render: (a) => <Badge status={a.status} /> },
              ]}
              rows={mine}
              sortKeys={{ date: (a) => a.date || '', status: (a) => a.status || '' }}
              emptyText="No attendance yet."
            />
          )}
        </Card>
      )}
      <Card title="Correction requests">
        {!isStaff && mine.length > 0 && (
          <form className="form" onSubmit={(e) => {
            e.preventDefault();
            if (!corrIn && !corrOut) { setError('Enter a corrected check-in or check-out time.'); return; }
            act(() => requestCorrection({
              attendanceId: corrId || mine[0]._id, reason,
              ...(corrIn ? { requestedCheckIn: new Date(corrIn).toISOString() } : {}),
              ...(corrOut ? { requestedCheckOut: new Date(corrOut).toISOString() } : {}),
            }), 'Correction requested.').then(() => { setReason(''); setCorrIn(''); setCorrOut(''); });
          }}>
            <Select label="Record to correct" value={corrId} onChange={(e) => setCorrId(e.target.value)}>{mine.map((a) => <option key={a._id} value={a._id}>{a.date.slice(0, 10)} · {a.status}</option>)}</Select>
            <Input label="Corrected check-in (optional)" type="datetime-local" value={corrIn} onChange={(e) => setCorrIn(e.target.value)} />
            <Input label="Corrected check-out (optional)" type="datetime-local" value={corrOut} onChange={(e) => setCorrOut(e.target.value)} />
            <Input label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button type="submit" disabled={busy}>Request correction</Button>
          </form>
        )}
        {corrections.length === 0 ? <p className="muted">No correction requests.</p> : (
          <DataTable
            columns={[
              { key: 'reason', label: 'Reason', render: (c) => c.reason },
              { key: 'status', label: 'Status', render: (c) => <Badge status={c.status} /> },
              { key: 'actions', label: '', render: (c) => (isStaff && c.status === 'PENDING' ? (
                <span><Button variant="ghost" className="btn-sm" onClick={() => act(() => decideCorrection(c._id, { status: 'APPROVED' }), 'Approved.')}>Approve</Button>{' '}<Button variant="ghost" className="btn-sm" onClick={() => act(() => decideCorrection(c._id, { status: 'REJECTED' }), 'Rejected.')}>Reject</Button></span>
              ) : '') },
            ]}
            rows={corrections}
            emptyText="No correction requests."
          />
        )}
      </Card>
    </>
  );
}
