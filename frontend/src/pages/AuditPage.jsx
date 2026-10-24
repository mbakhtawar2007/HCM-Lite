import { useEffect, useState } from 'react';
import { listAuditLogs } from '../api/p1.js';
import Card from '../components/ui/Card.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { listAuditLogs().then((d) => setLogs(d.logs)).catch((e) => setError(getErrorMessage(e))); }, []);
  return (
    <>
      <h1>Audit log</h1>
      <p className="muted">Admin only. The log is never editable or deletable — there is no update or delete endpoint for it.</p>
      {error && <p className="alert alert-error">{error}</p>}
      <Card title="Recent actions">
        <ul className="item-list">{logs.map((l) => (
          <li key={l._id}><span><strong>{l.action}</strong> {l.entity} · {l.actor?.email || 'system'} · {new Date(l.createdAt).toLocaleString()}</span></li>
        ))}
        {logs.length === 0 && <li className="muted">No audit entries yet.</li>}</ul>
      </Card>
    </>
  );
}
