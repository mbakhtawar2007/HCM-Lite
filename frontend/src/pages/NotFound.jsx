import { Link } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';

export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <Card title="This page does not exist">
        <p className="muted">
          The link may be mistyped, or the page may have moved. Use the sidebar to get back to your dashboard.
        </p>
        <p className="page-actions">
          <Link className="btn btn-primary" to="/">
            Back home
          </Link>
          <Link className="btn btn-ghost" to="/dashboard">
            Go to dashboard
          </Link>
        </p>
      </Card>
    </>
  );
}
