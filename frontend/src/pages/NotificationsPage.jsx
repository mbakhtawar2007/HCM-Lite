import { useEffect, useState } from 'react';
import { listNotifications, markNotificationRead } from '../api/p1.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import Badge from '../components/ui/Badge.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function NotificationsPage() {
  const [data, setData] = useState({ notifications: [], unreadCount: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); listNotifications().then(setData).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  return (
    <>
      <PageHeader title="Notifications" subtitle={`${data.unreadCount} unread — leave decisions and payslip availability appear here.`} />
      {error && <ErrorState message={error} onRetry={load} />}
      <Card title="All notifications">
        {loading ? <Skeleton lines={4} /> : data.notifications.length === 0 ? (
          <EmptyState icon="🔔" title="No notifications" text="Leave decisions and payslip availability will appear here." />
        ) : (
          <DataTable
            columns={[
              { key: 'title', label: 'Title', render: (n) => <strong>{n.title}</strong> },
              { key: 'message', label: 'Message', render: (n) => n.message },
              { key: 'status', label: 'Status', render: (n) => (n.isRead ? <Badge status="approved" label="Read" /> : <Badge status="pending" label="Unread" />) },
              { key: 'actions', label: '', render: (n) => (!n.isRead ? <Button variant="ghost" className="btn-sm" onClick={async () => { await markNotificationRead(n._id); load(); }}>Mark read</Button> : '') },
            ]}
            rows={data.notifications}
            emptyText="No notifications."
          />
        )}
      </Card>
    </>
  );
}
