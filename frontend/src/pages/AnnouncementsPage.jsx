import { useEffect, useState } from 'react';
import { createAnnouncement, deleteAnnouncement, listAnnouncements } from '../api/p1.js';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const canPost = user && ['ADMIN', 'HR'].includes(user.role);
  const [announcements, setAnnouncements] = useState([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const load = () => { setLoading(true); listAnnouncements().then((d) => setAnnouncements(d.announcements)).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const post = async (e) => {
    e.preventDefault(); setError(''); setMessage(''); setBusy(true);
    try {
      await createAnnouncement({ title, body });
      setTitle(''); setBody(''); setMessage('Announcement posted.');
      load();
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  };
  const doDelete = async () => {
    try { await deleteAnnouncement(deleteId); setDeleteId(null); showToast('Announcement deleted.'); load(); } catch (err) { setError(getErrorMessage(err)); setDeleteId(null); }
  };
  return (
    <>
      <PageHeader title="Announcements" subtitle="Posted by Admin and HR; everyone can read them. They also appear on every dashboard." />
      {error && <ErrorState message={error} onRetry={load} />}
      {message && <p className="alert alert-success">{message}</p>}
      {canPost && (
        <Card title="Post an announcement">
          <form onSubmit={post} className="form">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <label className="field"><span>Body</span><textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={4} /></label>
            <Button type="submit" disabled={busy}>{busy ? 'Posting…' : 'Post'}</Button>
          </form>
        </Card>
      )}
      <Card title="All announcements">
        {loading ? <Skeleton lines={4} /> : announcements.length === 0 ? (
          <EmptyState icon="📣" title="No announcements yet" text={canPost ? 'Post the first announcement above.' : 'Announcements from Admin and HR will appear here.'} />
        ) : (
          <DataTable
            columns={[
              { key: 'title', label: 'Title', render: (a) => <strong>{a.title}</strong> },
              { key: 'body', label: 'Body', render: (a) => a.body },
              { key: 'by', label: 'Posted by', render: (a) => `${a.postedBy?.name || 'Unknown'} · ${new Date(a.createdAt).toLocaleDateString()}` },
              { key: 'actions', label: '', render: (a) => (user?.role === 'ADMIN' ? <Button variant="ghost" className="btn-sm" onClick={() => setDeleteId(a._id)}>Delete</Button> : '') },
            ]}
            rows={announcements}
            sortKeys={{ title: (a) => a.title || '', by: (a) => a.postedBy?.name || '' }}
            emptyText="No announcements yet."
          />
        )}
      </Card>
      {deleteId && (
        <ConfirmDialog
          title="Delete this announcement?"
          onCancel={() => setDeleteId(null)}
          onConfirm={doDelete}
          confirmLabel="Delete"
          danger
        >
          <p>Announcements cannot be edited — deleting removes it from every dashboard. This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
