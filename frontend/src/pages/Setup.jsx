import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSetupStatus, runSetup } from '../api/setup.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getErrorMessage } from '../utils/errors.js';

// First-run setup (brief #01). Shown when GET /api/setup/status says
// needsSetup. After a successful setup we sign in with the new Admin
// account and go to the dashboard; a second setup attempt is 403.
export default function Setup() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ companyName: '', adminName: '', adminEmail: '', adminPassword: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSetupStatus()
      .then((data) => setStatus(data))
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await runSetup(form);
      await login({ email: form.adminEmail, password: form.adminPassword });
      navigate('/dashboard');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!status && !error)
    return (
      <>
        <PageHeader title="Set up HCM Lite" />
        <Skeleton lines={4} />
      </>
    );

  if (status && !status.needsSetup) {
    return (
      <>
        <PageHeader title="Set up HCM Lite" />
        <Card title="Setup already complete">
          <p className="muted">A company and Admin account already exist. Sign in to continue.</p>
          <Link className="btn btn-primary" to="/login">
            Go to login
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Set up HCM Lite"
        subtitle="First time here? Do this once, and you are done: name your company and create your own Admin sign-in. After this page, sign in and add departments, employees and HR logins from inside the app."
      />
      <Card title="Step 1 — Create your company and Admin account">
        <form onSubmit={handleSubmit} className="form">
          {error && <p className="alert alert-error">{error}</p>}
          <h3>Your company</h3>
          <Input
            label="Company name"
            required
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          />
          <h3>Your Admin account</h3>
          <p className="muted">
            This is the account you will sign in with. It can do everything in the app. You can add HR accounts later
            from the Users page.
          </p>
          <Input
            label="Your full name"
            required
            value={form.adminName}
            onChange={(e) => setForm({ ...form, adminName: e.target.value })}
          />
          <Input
            label="Your email (you will sign in with this)"
            type="email"
            required
            value={form.adminEmail}
            onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
          />
          <Input
            label="Choose a password (at least 8 characters)"
            type="password"
            required
            minLength={8}
            value={form.adminPassword}
            onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
          />
          <Button type="submit" disabled={busy}>
            {busy ? 'Setting up…' : 'Create my company and Admin account'}
          </Button>
        </form>
      </Card>
    </>
  );
}
