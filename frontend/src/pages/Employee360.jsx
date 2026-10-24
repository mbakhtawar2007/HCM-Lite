import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getEmployee360, updateEmployee } from '../api/p1.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import Badge from '../components/ui/Badge.jsx';
import { PageSkeleton } from '../components/ui/Skeleton.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function Employee360() {
  const { id } = useParams();
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
  if (error) return <><PageHeader title="Employee 360" /><ErrorState message={error} onRetry={load} /></>;
  if (!data) return <><PageHeader title="Employee 360" /><PageSkeleton /></>;
  const em = data.employee;
  return (
    <>
      <PageHeader
        title={`${em.user?.name} — ${em.employeeCode}`}
        breadcrumb={[{ label: 'Employees', to: '/employees' }]}
        subtitle={`${em.department?.name} · ${em.designation?.name || ''} · Joined ${em.joiningDate?.slice(0, 10)} · Basic Rs ${em.basicSalary}`}
      />
      <Card title="Contact (employees edit their own phone/address)">
        <form onSubmit={saveContact} className="form">
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save contact'}</Button>
        </form>
      </Card>
      <Card title="Attendance (recent)">
        <DataTable
          columns={[
            { key: 'date', label: 'Date', render: (a) => a.date.slice(0, 10) },
            { key: 'in', label: 'Check-in', render: (a) => (a.checkIn ? new Date(a.checkIn).toLocaleTimeString() : '—') },
            { key: 'out', label: 'Check-out', render: (a) => (a.checkOut ? new Date(a.checkOut).toLocaleTimeString() : 'no check-out') },
            { key: 'status', label: 'Status', render: (a) => <Badge status={a.status} /> },
          ]}
          rows={data.attendance.slice(0, 30)}
          sortKeys={{ date: (a) => a.date || '', status: (a) => a.status || '' }}
          emptyText="No attendance yet."
        />
      </Card>
      <Card title="Leave history">
        <DataTable
          columns={[
            { key: 'type', label: 'Type', render: (l) => l.leaveType?.name },
            { key: 'dates', label: 'Dates', render: (l) => `${l.startDate.slice(0, 10)} to ${l.endDate.slice(0, 10)} · ${l.workingDays} days` },
            { key: 'status', label: 'Status', render: (l) => <Badge status={l.status} /> },
          ]}
          rows={data.leaves}
          sortKeys={{ type: (l) => l.leaveType?.name || '', dates: (l) => l.startDate || '', status: (l) => l.status || '' }}
          emptyText="No leave history yet."
        />
      </Card>
      <Card title="Payslips">
        <DataTable
          columns={[
            { key: 'month', label: 'Month', render: (p) => p.month },
            { key: 'status', label: 'Status', render: (p) => <Badge status={p.status} /> },
            { key: 'net', label: 'Net pay', render: (p) => `Rs ${p.netPay}` },
          ]}
          rows={data.payslips}
          sortKeys={{ month: (p) => p.month || '' }}
          emptyText="No payslips yet."
        />
      </Card>
    </>
  );
}
