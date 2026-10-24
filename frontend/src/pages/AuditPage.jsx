import { useEffect, useState } from 'react';
import { listAuditLogs } from '../api/p1.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ entity: '', action: '', actor: '', from: '', to: '' });
  const [error, setError] = useState('');
  const load = async (p = page) => {
    setError('');
    try {
      const params = { page: p, limit: 50 };
      for (const [k, v] of Object.entries(filters)) if (v) params[k] = v;
      const d = await listAuditLogs(params);
      setLogs(d.logs); setPages(d.pages || 1); setTotal(d.total || 0); setPage(d.page || p);
    } catch (e) { setError(getErrorMessage(e)); }
  };
  useEffect(() => { load(1); }, []);
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <h1>Audit log</h1>
      <p className="muted">Admin only. The log is never editable or deletable — there is no update or delete endpoint for it.</p>
      {error && <p className="alert alert-error">{error}</p>}
      <Card title="Filters">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Input label="Entity" value={filters.entity} onChange={set('entity')} placeholder="Employee" />
          <Input label="Action" value={filters.action} onChange={set('action')} placeholder="CREATE" />
          <Input label="Actor email" value={filters.actor} onChange={set('actor')} placeholder="admin@example.com" />
          <Input label="From" type="date" value={filters.from} onChange={set('from')} />
          <Input label="To" type="date" value={filters.to} onChange={set('to')} />
          <Button onClick={() => load(1)}>Apply filters</Button>
        </div>
      </Card>
      <Card title={`Entries (${total}) — page ${page} of ${pages}`}>
        <ul className="item-list">{logs.map((l) => (
          <li key={l._id}><span><strong>{l.action}</strong> {l.entity} · {l.actor?.email || 'system'} · {new Date(l.createdAt).toLocaleString()}</span></li>
        ))}
        {logs.length === 0 && <li className="muted">No audit entries match these filters.</li>}</ul>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="ghost" disabled={page <= 1} onClick={() => load(page - 1)}>Previous</Button>
          <Button variant="ghost" disabled={page >= pages} onClick={() => load(page + 1)}>Next</Button>
        </div>
      </Card>
    </>
  );
}
