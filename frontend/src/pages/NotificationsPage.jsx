import { useEffect, useState } from 'react';
import { listNotifications, markNotificationRead } from '../api/p1.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function NotificationsPage() {
  const [data, setData] = useState({ notifications: [], unreadCount: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); listNotifications().then(setData).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false)); };
  useEffect(load, []);
  return (
    <>
      <h1>Notifications</h1>
      {error && <p className="alert alert-error">{error}</p>}
      <Card title={`${data.unreadCount} unread`}>
        <ul className="item-list">{data.notifications.map((n) => (
          <li key={n._id}><span><strong>{n.title}</strong> · {n.message}</span>{!n.isRead && <Button variant="ghost" onClick={async () => { await markNotificationRead(n._id); load(); }}>Mark read</Button>}</li>
        ))}
        {loading && <li className="muted">Loading…</li>}
        {!loading && data.notifications.length === 0 && <li className="muted">No notifications.</li>}</ul>
      </Card>
    </>
  );
}
