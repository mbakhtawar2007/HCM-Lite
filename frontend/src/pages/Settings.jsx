import { useEffect, useState } from 'react';
import { getSetting, orgCreate, orgDelete, orgList, orgUpdate, updateSetting } from '../api/p1.js';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { getErrorMessage } from '../utils/errors.js';

function Section({ title, section, fields, readOnly }) {
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const load = () => orgList(section).then((d) => setItems(d.items)).catch((e) => setError(getErrorMessage(e)));
  useEffect(load, []);
  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      // Edit mode reuses the previously unused orgUpdate API: pick an
      // item's Edit button and this form updates it instead of adding.
      const payload = { ...form };
      if (payload.yearlyQuota !== undefined && payload.yearlyQuota !== '') payload.yearlyQuota = Number(payload.yearlyQuota);
      if (editingId) { await orgUpdate(section, editingId, payload); showToast(`${title} updated.`); }
      else { await orgCreate(section, payload); showToast(`${title} added.`); }
      setForm({}); setEditingId(null); load();
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  };
  const startEdit = (it) => {
    const next = {};
    for (const f of fields) {
      if (f.key === 'date') next[f.key] = it.date ? it.date.slice(0, 10) : '';
      else if (it[f.key] !== undefined) next[f.key] = it[f.key];
    }
    setForm(next); setEditingId(it._id);
  };
  const doDelete = async () => {
    try { await orgDelete(section, deleteId); setDeleteId(null); showToast(`${title} deleted.`); load(); } catch (err) { setError(getErrorMessage(err)); setDeleteId(null); }
  };
  return (
    <Card title={title}>
      {error && <p className="alert alert-error">{error}</p>}
      <ul className="item-list">
        {items.map((it) => (
          <li key={it._id}><span><strong>{it.name || it.code}</strong>{it.description ? ` — ${it.description}` : ''}{it.yearlyQuota !== undefined ? ` · Quota ${it.yearlyQuota}${it.isUnlimited ? ' (unlimited)' : ''}` : ''}{it.date ? ` · ${it.date.slice(0, 10)}` : ''}</span>
            {!readOnly && <span><Button variant="ghost" className="btn-sm" onClick={() => startEdit(it)}>Edit</Button>{' '}<Button variant="danger" className="btn-sm" onClick={() => setDeleteId(it._id)}>Delete</Button></span>}</li>
        ))}
        {items.length === 0 && <li className="muted">None yet.</li>}
      </ul>
      {!readOnly && (
        <form onSubmit={submit} className="form">
          {editingId && <p className="muted">Editing — Save updates this item, or Cancel to add a new one. <Button variant="ghost" className="btn-sm" type="button" onClick={() => { setForm({}); setEditingId(null); }}>Cancel edit</Button></p>}
          {fields.map((f) => (
            <Input key={f.key} label={f.label} type={f.type || 'text'} required={f.required} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          ))}
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : (editingId ? 'Save changes' : 'Add')}</Button>
        </form>
      )}
      {deleteId && (
        <ConfirmDialog
          title={`Delete this ${title.toLowerCase().slice(0, -1)}?`}
          onCancel={() => setDeleteId(null)}
          onConfirm={doDelete}
          confirmLabel="Delete"
          danger
        >
          <p>Employees or leave records that reference this item may fail to display it. This cannot be undone.</p>
        </ConfirmDialog>
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
  const [busy, setBusy] = useState(false);
  const loadSetting = () => getSetting().then((d) => setSetting(d.setting)).catch((e) => setError(getErrorMessage(e)));
  useEffect(loadSetting, []);
  const save = async (e) => {
    e.preventDefault(); setError(''); setMsg(''); setBusy(true);
    try {
      await updateSetting({
        companyName: setting.companyName,
        officeStartMinutes: Number(setting.officeStartMinutes),
        graceMinutes: Number(setting.graceMinutes),
        officeRadiusMeters: Number(setting.officeRadiusMeters),
        officeLat: setting.officeLat === '' || setting.officeLat == null ? null : Number(setting.officeLat),
        officeLng: setting.officeLng === '' || setting.officeLng == null ? null : Number(setting.officeLng),
      });
      const fresh = await getSetting();
      setSetting(fresh.setting);
      setMsg('Settings saved.');
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Company setup" subtitle={readOnly ? 'HR view is read-only; only Admin can change these.' : 'Admin only. Attendance and leave rules are read from these settings, not hard-coded.'} />
      {error && <ErrorState message={error} onRetry={loadSetting} />}
      {msg && <p className="alert alert-success">{msg}</p>}
      {!setting ? <Skeleton lines={4} /> : (
        <Card title="Office rules">
          <form onSubmit={save} className="form">
            <Input label="Company" value={setting.companyName} onChange={(e) => setSetting({ ...setting, companyName: e.target.value })} disabled={readOnly} />
            <Input label="Office start (minutes after midnight, 540 = 09:00)" type="number" value={setting.officeStartMinutes} onChange={(e) => setSetting({ ...setting, officeStartMinutes: e.target.value })} disabled={readOnly} />
            <Input label="Grace (minutes)" type="number" value={setting.graceMinutes} onChange={(e) => setSetting({ ...setting, graceMinutes: e.target.value })} disabled={readOnly} />
            <Input label="Office radius (metres)" type="number" value={setting.officeRadiusMeters} onChange={(e) => setSetting({ ...setting, officeRadiusMeters: e.target.value })} disabled={readOnly} />
            <Input label="Office latitude (blank = no location check)" type="number" step="any" value={setting.officeLat ?? ''} onChange={(e) => setSetting({ ...setting, officeLat: e.target.value })} disabled={readOnly} />
            <Input label="Office longitude (blank = no location check)" type="number" step="any" value={setting.officeLng ?? ''} onChange={(e) => setSetting({ ...setting, officeLng: e.target.value })} disabled={readOnly} />
            <p className="muted">Weekends: {setting.weekendDays?.join(', ')} · Late after {Math.floor((setting.officeStartMinutes + setting.graceMinutes) / 60)}:{String((setting.officeStartMinutes + setting.graceMinutes) % 60).padStart(2, '0')} · When latitude and longitude are set, check-in requires the employee's location to be inside the radius; otherwise check-in works without location.</p>
            {!readOnly && <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button>}
          </form>
        </Card>
      )}
      <Section title="Departments" section="departments" readOnly={readOnly} fields={[{ key: 'name', label: 'Name', required: true }, { key: 'description', label: 'Description' }]} />
      <Section title="Designations" section="designations" readOnly={readOnly} fields={[{ key: 'name', label: 'Name', required: true }]} />
      <Section title="Leave types" section="leave-types" readOnly={readOnly} fields={[{ key: 'code', label: 'Code (e.g. ANNUAL)', required: true }, { key: 'name', label: 'Name', required: true }, { key: 'yearlyQuota', label: 'Yearly quota', type: 'number' }]} />
      <Section title="Holidays" section="holidays" readOnly={readOnly} fields={[{ key: 'date', label: 'Date', type: 'date', required: true }, { key: 'name', label: 'Name', required: true }]} />
    </>
  );
}
