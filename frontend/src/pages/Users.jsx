import { useEffect, useState } from 'react';
import { createUser, listUsers, resetUserPassword, updateUser } from '../api/p1.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function Users() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'HR' });
  const load = () => listUsers().then((d) => setUsers(d.users)).catch((e) => setError(getErrorMessage(e)));
  useEffect(load, []);
  const submit = async (e) => {
    e.preventDefault(); setError(''); setMsg('');
    try { await createUser(form); setMsg('Login created with a temporary password.'); setForm({ name: '', email: '', password: '', role: 'HR' }); load(); }
    catch (err) { setError(getErrorMessage(err)); }
  };
  const toggle = async (u) => { try { await updateUser(u._id, { isActive: !u.isActive }); load(); } catch (err) { setError(getErrorMessage(err)); } };
  const reset = async (u) => {
    const pw = window.prompt('New temporary password (min 8 characters):');
    if (!pw) return;
    try { await resetUserPassword(u._id, { password: pw }); setMsg('Temporary password set; user must change it on next sign-in.'); } catch (err) { setError(getErrorMessage(err)); }
  };
  return (
    <>
      <h1>Users</h1>
      <p className="muted">Admin only. New logins start with a temporary password and must change it on first sign-in.</p>
      {error && <p className="alert alert-error">{error}</p>}
      {msg && <p className="alert">{msg}</p>}
      <Card title="Create a login">
        <form onSubmit={submit} className="form">
          <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Temporary password" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <label className="field"><span>Role</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option>ADMIN</option><option>HR</option><option>EMPLOYEE</option></select></label>
          <Button type="submit">Create login</Button>
        </form>
      </Card>
      <Card title="All logins">
        <ul className="item-list">
          {users.map((u) => (
            <li key={u._id}><span><strong>{u.name}</strong> · {u.email} · {u.role} · {u.isActive ? 'Active' : 'Deactivated'}{u.mustChangePassword ? ' · Must change password' : ''}</span><span><Button variant="ghost" onClick={() => toggle(u)}>{u.isActive ? 'Deactivate' : 'Activate'}</Button> <Button variant="ghost" onClick={() => reset(u)}>Reset password</Button></span></li>
          ))}
          {users.length === 0 && <li className="muted">No users yet.</li>}
        </ul>
      </Card>
    </>
  );
}
