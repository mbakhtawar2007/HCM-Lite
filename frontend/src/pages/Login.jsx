import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await login(form);
      // Temporary-password accounts must change on first sign-in.
      navigate(data.user?.mustChangePassword ? '/change-password' : '/dashboard');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Login" subtitle="Sign in with the login created for you. First sign-in uses a temporary password." />
      <Card title="Login">
      <form onSubmit={handleSubmit} className="form">
        {error && <p className="alert alert-error">{error}</p>}
        <Input
          label="Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          label="Password"
          type="password"
          required
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <Button type="submit" disabled={busy}>
          {busy ? 'Logging in…' : 'Login'}
        </Button>
        <p className="muted">
          First time here? <Link to="/setup">Set up HCM Lite</Link> — it creates
          the company and the first Admin account.
        </p>
      </form>
      </Card>
    </>
  );
}
