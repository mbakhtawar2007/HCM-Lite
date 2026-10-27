import { Link } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';

// 404 page (route "*"). Unknown routes still serve the app through the
// Netlify SPA fallback, and this page handles them — that routing is
// unchanged. The visual is CSS animation only: three floating numerals
// (the 0 in emerald), a pulsing shadow beneath them, and the existing
// card fade-in. Under prefers-reduced-motion all of it stops and the
// numerals, message and buttons stay fully readable as static text.
export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" subtitle="The address you opened does not match any page in HCM Lite." />
      <Card title="This page does not exist">
        <div className="notfound">
          <div className="notfound-visual" aria-hidden="true">
            <span>4</span>
            <span className="notfound-zero">0</span>
            <span>4</span>
          </div>
          <div className="notfound-shadow" aria-hidden="true" />
          <p className="muted">
            The link may be mistyped, or the page may have moved. Your data is safe — nothing was changed or deleted.
            Pick a button below to get back.
          </p>
          <p className="page-actions">
            <Link className="btn btn-primary" to="/">
              Back to home
            </Link>
            <Link className="btn btn-ghost" to="/dashboard">
              Go to my dashboard
            </Link>
          </p>
        </div>
      </Card>
    </>
  );
}
