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
import { minutesToTime, timeToMinutes } from '../utils/time.js';

const DAY_NAMES = {
  Sat: 'Saturday',
  Sun: 'Sunday',
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
};

function Section({ title, section, fields, readOnly, help }) {
  const { showToast } = useToast();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const load = () =>
    orgList(section)
      .then((d) => setItems(d.items))
      .catch((e) => setError(getErrorMessage(e)));
  useEffect(() => {
    load();
  }, []);
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      // Edit mode reuses the previously unused orgUpdate API: pick an
      // item's Edit button and this form updates it instead of adding.
      const payload = { ...form };
      if (payload.yearlyQuota !== undefined && payload.yearlyQuota !== '')
        payload.yearlyQuota = Number(payload.yearlyQuota);
      if (editingId) {
        await orgUpdate(section, editingId, payload);
        showToast(`${title} updated.`);
      } else {
        await orgCreate(section, payload);
        showToast(`${title} added.`);
      }
      setForm({});
      setEditingId(null);
      load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const startEdit = (it) => {
    const next = {};
    for (const f of fields) {
      if (f.key === 'date') next[f.key] = it.date ? it.date.slice(0, 10) : '';
      else if (it[f.key] !== undefined) next[f.key] = it[f.key];
    }
    setForm(next);
    setEditingId(it._id);
  };
  const doDelete = async () => {
    try {
      await orgDelete(section, deleteId);
      setDeleteId(null);
      showToast(`${title} deleted.`);
      load();
    } catch (err) {
      setError(getErrorMessage(err));
      setDeleteId(null);
    }
  };
  return (
    <Card title={title}>
      {help && <p className="muted">{help}</p>}
      {error && <p className="alert alert-error">{error}</p>}
      <ul className="item-list">
        {items.map((it) => (
          <li key={it._id}>
            <span>
              <strong>{it.name || it.code}</strong>
              {it.description ? ` — ${it.description}` : ''}
              {it.yearlyQuota !== undefined ? ` · Quota ${it.yearlyQuota}${it.isUnlimited ? ' (unlimited)' : ''}` : ''}
              {it.date ? ` · ${it.date.slice(0, 10)}` : ''}
            </span>
            {!readOnly && (
              <span>
                <Button variant="ghost" className="btn-sm" onClick={() => startEdit(it)}>
                  Edit
                </Button>{' '}
                <Button variant="danger" className="btn-sm" onClick={() => setDeleteId(it._id)}>
                  Delete
                </Button>
              </span>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="muted">None yet.</li>}
      </ul>
      {!readOnly && (
        <form onSubmit={submit} className="form">
          {editingId && (
            <p className="muted">
              Editing — Save updates this item, or Cancel to add a new one.{' '}
              <Button
                variant="ghost"
                className="btn-sm"
                type="button"
                onClick={() => {
                  setForm({});
                  setEditingId(null);
                }}
              >
                Cancel edit
              </Button>
            </p>
          )}
          {fields.map((f) => (
            <Input
              key={f.key}
              label={f.label}
              type={f.type || 'text'}
              required={f.required}
              value={form[f.key] ?? ''}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            />
          ))}
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : editingId ? 'Save changes' : 'Add'}
          </Button>
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
  const [locBusy, setLocBusy] = useState(false);
  const [locMsg, setLocMsg] = useState('');
  // One-tap office location, like food-delivery apps: use the Admin's
  // current device GPS instead of copying coordinates from Maps.
  // It only fills the two fields — the Admin still clicks Save
  // settings, so a stray GPS reading can never silently change the
  // office location on its own.
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocMsg('Location is not available in this browser — enter latitude and longitude manually.');
      return;
    }
    setLocBusy(true);
    setLocMsg('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setSetting((s) => (s ? { ...s, officeLat: latitude, officeLng: longitude } : s));
        setLocMsg(
          `Location detected: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (accuracy ±${Math.round(accuracy)}m). Click Save settings to apply it.`,
        );
        setLocBusy(false);
      },
      (err) => {
        setLocMsg(
          err.code === 1
            ? 'Location permission denied — allow location for this site and try again, or enter the coordinates manually.'
            : 'Could not detect location — try again (outdoors works best), or enter the coordinates manually.',
        );
        setLocBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };
  const loadSetting = () =>
    getSetting()
      .then((d) => setSetting(d.setting))
      .catch((e) => setError(getErrorMessage(e)));
  useEffect(() => {
    loadSetting();
  }, []);
  const save = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    setBusy(true);
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
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        title="Company setup"
        subtitle={
          readOnly
            ? 'You can look, but only an Admin can change these settings.'
            : 'Set up your company once: working hours, check-in location, departments, leave types and holidays. Everything else in the app follows these rules.'
        }
      />
      {error && <ErrorState message={error} onRetry={loadSetting} />}
      {msg && <p className="alert alert-success">{msg}</p>}
      {!setting ? (
        <Skeleton lines={4} />
      ) : (
        <Card title="Office rules">
          <form onSubmit={save} className="form">
            <h3>Your company</h3>
            <Input
              label="Company name"
              value={setting.companyName}
              onChange={(e) => setSetting({ ...setting, companyName: e.target.value })}
              disabled={readOnly}
            />
            <h3>Working hours</h3>
            <Input
              label="Office start time"
              type="time"
              value={minutesToTime(setting.officeStartMinutes)}
              onChange={(e) => setSetting({ ...setting, officeStartMinutes: timeToMinutes(e.target.value) })}
              disabled={readOnly}
            />
            <Input
              label="Grace period (minutes)"
              type="number"
              value={setting.graceMinutes}
              onChange={(e) => setSetting({ ...setting, graceMinutes: e.target.value })}
              disabled={readOnly}
            />
            <p className="muted">
              The grace period is how late someone can be before they count as late. With a{' '}
              {minutesToTime(setting.officeStartMinutes)} start and {setting.graceMinutes} minutes grace, someone is
              late after {minutesToTime(Number(setting.officeStartMinutes) + Number(setting.graceMinutes))}.
            </p>
            <h3>Location for check-ins</h3>
            <Input
              label="Office radius (metres)"
              type="number"
              value={setting.officeRadiusMeters}
              onChange={(e) => setSetting({ ...setting, officeRadiusMeters: e.target.value })}
              disabled={readOnly}
            />
            <p className="muted">
              Check-ins must be inside this circle around the office. Leave the latitude and longitude blank if you do
              not want location checks at all.
            </p>
            <Input
              label="Office latitude"
              type="number"
              step="any"
              value={setting.officeLat ?? ''}
              onChange={(e) => setSetting({ ...setting, officeLat: e.target.value })}
              disabled={readOnly}
            />
            <Input
              label="Office longitude"
              type="number"
              step="any"
              value={setting.officeLng ?? ''}
              onChange={(e) => setSetting({ ...setting, officeLng: e.target.value })}
              disabled={readOnly}
            />
            {!readOnly && (
              <p className="page-actions">
                <Button type="button" variant="ghost" disabled={locBusy} onClick={useCurrentLocation}>
                  {locBusy ? 'Detecting location…' : '📍 Use my current location'}
                </Button>
              </p>
            )}
            {locMsg && <p className="muted">{locMsg}</p>}
            <p className="muted">
              Days off each week: {(setting.weekendDays || []).map((d) => DAY_NAMES[d] || d).join(', ') || 'None set'}.
              When latitude and longitude are set, check-in requires the employee&rsquo;s location to be inside the
              radius; otherwise check-in works without location.
            </p>
            {!readOnly && (
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save company settings'}
              </Button>
            )}
          </form>
        </Card>
      )}
      <Section
        title="Departments"
        section="departments"
        readOnly={readOnly}
        help="Groups employees belong to, for example Engineering or Sales. Employees must pick a department that already exists here."
        fields={[
          { key: 'name', label: 'Department name', required: true },
          { key: 'description', label: 'Description (optional)' },
        ]}
      />
      <Section
        title="Designations"
        section="designations"
        readOnly={readOnly}
        help="Job titles, for example Software Engineer or HR Executive."
        fields={[{ key: 'name', label: 'Job title', required: true }]}
      />
      <Section
        title="Leave types"
        section="leave-types"
        readOnly={readOnly}
        help="Kinds of leave and how many days each employee gets per year. Leave the quota blank for unlimited leave (used for Unpaid)."
        fields={[
          { key: 'code', label: 'Short code (e.g. ANNUAL)', required: true },
          { key: 'name', label: 'Leave name', required: true },
          { key: 'yearlyQuota', label: 'Days per year', type: 'number' },
        ]}
      />
      <Section
        title="Holidays"
        section="holidays"
        readOnly={readOnly}
        help="Days the office is closed. Holidays are not counted as working days for attendance or leave."
        fields={[
          { key: 'date', label: 'Date', type: 'date', required: true },
          { key: 'name', label: 'Holiday name', required: true },
        ]}
      />
    </>
  );
}
