import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Card from '../components/ui/Card.jsx';

const features = [
  { title: 'Auth included', text: 'Signup, login, logout, JWT tokens and protected routes — already wired up.' },
  { title: 'Clean API layer', text: 'One axios client, one module per resource. Pages never touch URLs or headers directly.' },
  { title: 'Example CRUD', text: 'The dashboard is a working items list. Copy its model, controller and route for each new feature.' },
  { title: 'Validation + errors', text: 'Zod schemas on the backend, one central error handler, friendly messages on the frontend.' },
];

export default function Home() {
  const { user } = useAuth();

  return (
    <>
      <section className="hero">
        <h1>Start building, not setting up.</h1>
        <p>
          A full-stack starter for hackathons: React + Express + MongoDB, with
          authentication and a working example feature ready to rename.
        </p>
        {user ? (
          <Link className="btn btn-primary" to="/dashboard">
            Go to dashboard
          </Link>
        ) : (
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/register">
              Create an account
            </Link>
            <Link className="btn btn-ghost" to="/login">
              Login
            </Link>
          </div>
        )}
      </section>

      <section className="grid">
        {features.map((feature) => (
          <Card key={feature.title} title={feature.title}>
            <p>{feature.text}</p>
          </Card>
        ))}
      </section>

      <Card title="Your first feature in 4 steps">
        <ol>
          <li>
            Backend: copy <code>backend/src/models/Item.js</code>, its controller and route, and rename them.
          </li>
          <li>
            Add a Zod schema in <code>backend/src/validation/</code> and wire the route in{' '}
            <code>backend/src/app.js</code>.
          </li>
          <li>
            Frontend: add an API module in <code>frontend/src/api/</code> (copy{' '}
            <code>items.js</code>).
          </li>
          <li>Add a page in <code>frontend/src/pages/</code> and a route in <code>App.jsx</code>.</li>
        </ol>
      </Card>
    </>
  );
}
