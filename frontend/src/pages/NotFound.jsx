import { Link } from 'react-router-dom';
import Card from '../components/ui/Card.jsx';

export default function NotFound() {
  return (
    <Card title="Page not found">
      <p>This page does not exist.</p>
      <Link className="btn btn-primary" to="/">
        Back home
      </Link>
    </Card>
  );
}
