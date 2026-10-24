import { useEffect, useState } from 'react';
import { listAuditLogs } from '../api/p1.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ entity: '', action: '', actor: '', from: '', to: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async (p = page) => {
    setError(''); setLoading(true);
    try {
      const params = { page: p, limit: 50 };
      for (const [k, v] of Object.entries(filters)) if (v) params[k] = v;
      const d = await listAuditLogs(params);
      setLogs(d.logs); setPages(d.pages || 1); setTotal(d.total || 0); setPage(d.page || p);
    } catch (e) { setError(getErrorMessage(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(1); }, []);
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <PageHeader title="Audit log" subtitle="Admin only. The log is never editable or deletable — there is no update or delete endpoint for it." />
      {error && <ErrorState message={error} onRetry={() => load(1)} />}
      <Card title="Filters">
        <div className="form-row">
          <Input label="Entity" value={filters.entity} onChange={set('entity')} placeholder="Employee" />
          <Input label="Action" value={filters.action} onChange={set('action')} placeholder="CREATE" />
          <Input label="Actor email" value={filters.actor} onChange={set('actor')} placeholder="admin@example.com" />
          <Input label="From" type="date" value={filters.from} onChange={set('from')} />
          <Input label="To" type="date" value={filters.to} onChange={set('to')} />
        </div>
        <p className="page-actions"><Button onClick={() => load(1)}>Apply filters</Button></p>
      </Card>
      <Card title={`Entries (${total}) — page ${page} of ${pages}`}>
        {loading ? <Skeleton lines={5} /> : logs.length === 0 ? (
          <EmptyState icon="📋" title="No audit entries match these filters" text="Try widening the date range or clearing a filter." />
        ) : (
          <DataTable
            columns={[
              { key: 'action', label: 'Action', render: (l) => <strong>{l.action}</strong> },
              { key: 'entity', label: 'Entity', render: (l) => l.entity },
              { key: 'actor', label: 'Actor', render: (l) => l.actor?.email || 'system' },
              { key: 'when', label: 'When', render: (l) => new Date(l.createdAt).toLocaleString() },
            ]}
            rows={logs}
            sortKeys={{ action: (l) => l.action || '', entity: (l) => l.entity || '', when: (l) => l.createdAt || '' }}
            emptyText="No audit entries match these filters."
          />
        )}
        <p className="pager">
          <Button variant="ghost" className="btn-sm" disabled={page <= 1} onClick={() => load(page - 1)}>Previous</Button>
          <Button variant="ghost" className="btn-sm" disabled={page >= pages} onClick={() => load(page + 1)}>Next</Button>
        </p>
      </Card>
    </>
  );
}
