import { useEffect, useState } from 'react';
import { createAnnouncement, deleteAnnouncement, listAnnouncements } from '../api/p1.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const canPost = user && ['ADMIN', 'HR'].includes(user.role);
  const [announcements, setAnnouncements] = useState([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = () => { setLoading(true); listAnnouncements().then((d) => setAnnouncements(d.announcements)).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false)); };
  useEffect(load, []);
  const post = async (e) => {
    e.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      await createAnnouncement({ title, body });
      setTitle(''); setBody(''); setMessage('Announcement posted.');
      load();
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <h1>Announcements</h1>
      <p className="muted">Posted by Admin and HR; everyone can read them. They also appear on every dashboard.</p>
      {error && <p className="alert alert-error">{error}</p>}
      {message && <p className="alert">{message}</p>}
      {canPost && (
        <Card title="Post an announcement">
          <form onSubmit={post}>
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <label>Body<textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={4} style={{ width: '100%' }} /></label>
            <Button type="submit" disabled={busy}>{busy ? 'Posting…' : 'Post'}</Button>
          </form>
        </Card>
      )}
      <Card title="All announcements">
        <ul className="item-list">{announcements.map((a) => (
          <li key={a._id}><span><strong>{a.title}</strong> · {a.body} — {a.postedBy?.name || 'Unknown'} · {new Date(a.createdAt).toLocaleDateString()}</span>
            {user?.role === 'ADMIN' && <Button variant="ghost" onClick={async () => { await deleteAnnouncement(a._id); load(); }}>Delete</Button>}</li>
        ))}
        {loading && <li className="muted">Loading…</li>}
        {!loading && announcements.length === 0 && <li className="muted">No announcements yet.</li>}</ul>
      </Card>
    </>
  );
}
