import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword } from '../api/p1.js';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function ChangePassword() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setDone(''); setBusy(true);
    try {
      await changePassword(form);
      setDone('Password changed. Please sign in again with your new password.');
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  };
  return (
    <Card title="Change password">
      <p className="muted">Accounts created by Admin/HR start with a temporary password and must be changed on first sign-in.</p>
      <form onSubmit={handleSubmit} className="form">
        {error && <p className="alert alert-error">{error}</p>}
        {done && <p className="alert">{done}</p>}
        <Input label="Current password" type="password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
        <Input label="New password" type="password" required value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
        <Button type="submit" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</Button>
        {done && <Button variant="ghost" onClick={() => navigate('/dashboard')}>Back to dashboard</Button>}
      </form>
    </Card>
  );
}
