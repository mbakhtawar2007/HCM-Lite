import { useEffect, useState } from 'react';
import { createUser, listUsers, resetUserPassword, updateUser } from '../api/p1.js';
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

export default function Users() {
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'HR' });
  const [deactivateUser, setDeactivateUser] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [resetPw, setResetPw] = useState('');
  const load = () => {
    setLoading(true);
    listUsers()
      .then((d) => setUsers(d.users))
      .catch((e) => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    setBusy(true);
    try {
      await createUser(form);
      setMsg('Login created with a temporary password.');
      setForm({ name: '', email: '', password: '', role: 'HR' });
      load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const toggle = async () => {
    const u = deactivateUser;
    setDeactivateUser(null);
    try {
      await updateUser(u._id, { isActive: !u.isActive });
      showToast(u.isActive ? 'User deactivated.' : 'User activated.');
      load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };
  const reset = async (e) => {
    e.preventDefault();
    if (resetPw.length < 8) {
      setError('New temporary password must be at least 8 characters.');
      return;
    }
    try {
      await resetUserPassword(resetUser._id, { password: resetPw });
      setResetUser(null);
      setResetPw('');
      showToast('Temporary password set; user must change it on next sign-in.');
      load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };
  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Admin only. Create sign-in accounts here. A new account gets a temporary password and must set its own password the first time it signs in — this is not the same as registering an employee (see the Employees page)."
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {msg && <p className="alert alert-success">{msg}</p>}
      <Card title="Create a sign-in account">
        <form onSubmit={submit} className="form">
          <Input
            label="Full name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Email (they will sign in with this)"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            label="Temporary password (share it with them privately)"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Select
            label="Role — what can this person do?"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option>ADMIN</option>
            <option>HR</option>
            <option>EMPLOYEE</option>
          </Select>
          <p className="muted">
            Admin: runs everything. HR: manages employees, leave and payroll drafts. Employee: sees only their own data.
            Only HR and Employees mark attendance — Admin accounts never check in.
          </p>
          <p className="muted">
            Tip: to add a new employee, use Employees → Register instead — that creates the login and the employee
            record together. A bare Employee login created here has no employee record until one is linked to it.
          </p>
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create sign-in account'}
          </Button>
        </form>
      </Card>
      <Card title="All sign-in accounts">
        {loading ? (
          <Skeleton lines={4} />
        ) : users.length === 0 ? (
          <EmptyState icon="🔑" title="No users yet" text="Create the first login above." />
        ) : (
          <DataTable
            columns={[
              { key: 'name', label: 'Name', render: (u) => <strong>{u.name}</strong> },
              { key: 'email', label: 'Email', render: (u) => u.email },
              { key: 'role', label: 'Role', render: (u) => u.role },
              {
                key: 'status',
                label: 'Status',
                render: (u) => (
                  <>
                    {u.isActive ? (
                      <Badge status="approved" label="Active" />
                    ) : (
                      <Badge status="rejected" label="Deactivated" />
                    )}
                    {u.mustChangePassword ? ' · Needs a new password on first sign-in' : ''}
                  </>
                ),
              },
              {
                key: 'actions',
                label: '',
                render: (u) => (
                  <span>
                    <Button variant="ghost" className="btn-sm" onClick={() => setDeactivateUser(u)}>
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </Button>{' '}
                    <Button variant="ghost" className="btn-sm" onClick={() => setResetUser(u)}>
                      Reset password
                    </Button>
                  </span>
                ),
              },
            ]}
            rows={users}
            sortKeys={{ name: (u) => u.name || '', email: (u) => u.email || '', role: (u) => u.role || '' }}
            emptyText="No users yet."
          />
        )}
      </Card>
      {deactivateUser && (
        <ConfirmDialog
          title={deactivateUser.isActive ? 'Deactivate this user?' : 'Activate this user?'}
          warning={
            deactivateUser.isActive
              ? 'A deactivated user is rejected on their next request and cannot sign in until reactivated.'
              : undefined
          }
          onCancel={() => setDeactivateUser(null)}
          onConfirm={toggle}
          confirmLabel={deactivateUser.isActive ? 'Deactivate' : 'Activate'}
          danger={deactivateUser.isActive}
        >
          <p>
            {deactivateUser.name} · {deactivateUser.email} · {deactivateUser.role}
          </p>
        </ConfirmDialog>
      )}
      {resetUser && (
        <div className="modal-backdrop" onClick={() => setResetUser(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="reset-title">Reset password for {resetUser.name}</h2>
            <form onSubmit={reset} className="form">
              <Input
                label="New temporary password (min 8 characters)"
                type="password"
                required
                minLength={8}
                value={resetPw}
                onChange={(e) => setResetPw(e.target.value)}
              />
              <p className="muted">
                The user must change this password on next sign-in, and their old tokens stop working.
              </p>
              <div className="modal-actions">
                <Button variant="ghost" onClick={() => setResetUser(null)}>
                  Cancel
                </Button>
                <Button type="submit">Set temporary password</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
