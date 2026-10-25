import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSetupStatus } from '../api/setup.js';
import Card from '../components/ui/Card.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const features = [
  {
    title: 'Three roles',
    text: 'Admin, HR and Employee, each with its own menu, data scope and dashboard. Roles are enforced on the server.',
  },
  {
    title: 'First-run setup',
    text: 'The app starts empty. Set up the company and the first Admin account, then build everything from real data — no dummy data.',
  },
  {
    title: 'Core HR, then AI',
    text: 'Employees, attendance, leave and payroll, server dashboards, and the AI assistant on the same scoped data — all live.',
  },
];

export default function Home() {
  const { user } = useAuth();
  const [needsSetup, setNeedsSetup] = useState(null);

  useEffect(() => {
    if (user) return;
    getSetupStatus()
      .then((data) => setNeedsSetup(data.needsSetup))
      .catch(() => setNeedsSetup(null));
  }, [user]);

  return (
    <>
      <section className="hero">
        <h1>HCM Lite</h1>
        <p>
          AI-assisted Human Capital Management for Admin, HR and Employees. Built for the Saylani Hackathon: the system
          starts empty, and every number comes from what people do in the app.
        </p>
        {user ? (
          <Link className="btn btn-primary" to="/dashboard">
            Go to dashboard
          </Link>
        ) : needsSetup ? (
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/setup">
              Set up HCM Lite
            </Link>
            <Link className="btn btn-ghost" to="/login">
              Login
            </Link>
          </div>
        ) : (
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/login">
              Login
            </Link>
            <Link className="btn btn-ghost" to="/setup">
              Set up HCM Lite
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

      <Card title="What is live">
        <p>
          First-run setup, role-based auth, organisation setup, employees, attendance, leave, payroll, server
          dashboards, the AI assistant, audit, announcements and notifications. See the README for the full done /
          not-done list.
        </p>
      </Card>
    </>
  );
}
