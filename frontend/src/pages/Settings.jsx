import { useEffect, useState } from 'react';
import { getSetting, orgCreate, orgDelete, orgList, orgUpdate, updateSetting } from '../api/p1.js';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import { getErrorMessage } from '../utils/errors.js';

function Section({ title, section, fields, readOnly }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const load = () => orgList(section).then((d) => setItems(d.items)).catch((e) => setError(getErrorMessage(e)));
  useEffect(load, []);
  const submit = async (e) => {
    e.preventDefault(); setError('');
    try { await orgCreate(section, form); setForm({}); load(); } catch (err) { setError(getErrorMessage(err)); }
  };
  return (
    <Card title={title}>
      {error && <p className="alert alert-error">{error}</p>}
      <ul className="item-list">
        {items.map((it) => (
          <li key={it._id}><span><strong>{it.name || it.code}</strong>{it.description ? ` — ${it.description}` : ''}{it.yearlyQuota !== undefined ? ` · Quota ${it.yearlyQuota}${it.isUnlimited ? ' (unlimited)' : ''}` : ''}{it.date ? ` · ${it.date.slice(0, 10)}` : ''}</span>
            {!readOnly && <Button variant="danger" onClick={async () => { try { await orgDelete(section, it._id); load(); } catch (err) { setError(getErrorMessage(err)); } }}>Delete</Button>}</li>
        ))}
        {items.length === 0 && <li className="muted">None yet.</li>}
      </ul>
      {!readOnly && (
        <form onSubmit={submit} className="form">
          {fields.map((f) => (
            <Input key={f.key} label={f.label} type={f.type || 'text'} required={f.required} value={form[f.key] || ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          ))}
          <Button type="submit">Add</Button>
        </form>
      )}
    </Card>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const readOnly = user?.role !== 'ADMIN';
  const [setting, setSetting] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { getSetting().then((d) => setSetting(d.setting)).catch((e) => setError(getErrorMessage(e))); }, []);
  const save = async (e) => {
    e.preventDefault(); setError(''); setMsg('');
    try { await updateSetting({ officeStartMinutes: Number(setting.officeStartMinutes), graceMinutes: Number(setting.graceMinutes), officeRadiusMeters: Number(setting.officeRadiusMeters) }); setMsg('Settings saved.'); } catch (err) { setError(getErrorMessage(err)); }
  };
  if (!setting) return <p className="muted">Loading…</p>;
  return (
    <>
      <h1>Company setup</h1>
      <p className="muted">{readOnly ? 'HR view is read-only; only Admin can change these.' : 'Admin only. Attendance and leave rules are read from these settings, not hard-coded.'}</p>
      {error && <p className="alert alert-error">{error}</p>}
      {msg && <p className="alert">{msg}</p>}
      <Card title="Office rules">
        <form onSubmit={save} className="form">
          <Input label="Company" value={setting.companyName} onChange={(e) => setSetting({ ...setting, companyName: e.target.value })} disabled={readOnly} />
          <Input label="Office start (minutes after midnight, 540 = 09:00)" type="number" value={setting.officeStartMinutes} onChange={(e) => setSetting({ ...setting, officeStartMinutes: e.target.value })} disabled={readOnly} />
          <Input label="Grace (minutes)" type="number" value={setting.graceMinutes} onChange={(e) => setSetting({ ...setting, graceMinutes: e.target.value })} disabled={readOnly} />
          <Input label="Office radius (metres)" type="number" value={setting.officeRadiusMeters} onChange={(e) => setSetting({ ...setting, officeRadiusMeters: e.target.value })} disabled={readOnly} />
          <p className="muted">Weekends: {setting.weekendDays?.join(', ')} · Late after {Math.floor((setting.officeStartMinutes + setting.graceMinutes) / 60)}:{String((setting.officeStartMinutes + setting.graceMinutes) % 60).padStart(2, '0')}</p>
          {!readOnly && <Button type="submit">Save settings</Button>}
        </form>
      </Card>
      <Section title="Departments" section="departments" readOnly={readOnly} fields={[{ key: 'name', label: 'Name', required: true }, { key: 'description', label: 'Description' }]} />
      <Section title="Designations" section="designations" readOnly={readOnly} fields={[{ key: 'name', label: 'Name', required: true }]} />
      <Section title="Leave types" section="leave-types" readOnly={readOnly} fields={[{ key: 'code', label: 'Code (e.g. ANNUAL)', required: true }, { key: 'name', label: 'Name', required: true }, { key: 'yearlyQuota', label: 'Yearly quota', type: 'number' }]} />
      <Section title="Holidays" section="holidays" readOnly={readOnly} fields={[{ key: 'date', label: 'Date', type: 'date', required: true }, { key: 'name', label: 'Name', required: true }]} />
    </>
  );
}
