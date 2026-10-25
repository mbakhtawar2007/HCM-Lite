import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const COMMON = [
  { to: '/dashboard', label: 'Dashboard', icon: '⌂' },
  { to: '/ai', label: 'AI assistant', icon: '✦' },
  { to: '/attendance', label: 'Attendance', icon: '◷' },
  { to: '/leaves', label: 'Leave', icon: '○' },
  { to: '/payroll', label: 'Payroll', icon: '₨' },
  { to: '/announcements', label: 'Announcements', icon: '📣' },
];
const STAFF = [
  { to: '/employees', label: 'Employees', icon: '👥' },
  { to: '/settings', label: 'Company setup', icon: '⚙' },
];
const ADMIN_ONLY = [
  { to: '/users', label: 'Users', icon: '🔑' },
  { to: '/audit', label: 'Audit log', icon: '📋' },
];

export default function Sidebar({ open, onClose }) {
  const { user } = useAuth();
  const role = user?.role;
  const roleLink =
    role === 'ADMIN'
      ? { to: '/admin', label: 'Admin dashboard' }
      : role === 'HR'
        ? { to: '/hr', label: 'HR dashboard' }
        : role === 'EMPLOYEE'
          ? { to: '/employee', label: 'My dashboard' }
          : null;
  return (
    <>
      <div className={`sidebar-backdrop${open ? ' open' : ''}`} aria-hidden="true" onClick={onClose} />
      <aside className={`sidebar${open ? ' open' : ''}`} aria-label="Main navigation">
        <Link className="brand" to="/" onClick={onClose}>
          <span className="brand-mark" aria-hidden="true">
            H
          </span>{' '}
          HCM Lite
        </Link>
        <nav>
          <NavLink to="/" end onClick={onClose}>
            <span className="icon" aria-hidden="true">
              ⌂
            </span>{' '}
            Home
          </NavLink>
          {user && (
            <>
              <div className="sidebar-section">My work</div>
              {roleLink && (
                <NavLink to={roleLink.to} onClick={onClose}>
                  <span className="icon" aria-hidden="true">
                    ▦
                  </span>{' '}
                  {roleLink.label}
                </NavLink>
              )}
              {COMMON.map((l) => (
                <NavLink key={l.to} to={l.to} onClick={onClose}>
                  <span className="icon" aria-hidden="true">
                    {l.icon}
                  </span>{' '}
                  {l.label}
                </NavLink>
              ))}
            </>
          )}
          {user && ['ADMIN', 'HR'].includes(role) && (
            <>
              <div className="sidebar-section">People &amp; org</div>
              {STAFF.map((l) => (
                <NavLink key={l.to} to={l.to} onClick={onClose}>
                  <span className="icon" aria-hidden="true">
                    {l.icon}
                  </span>{' '}
                  {l.label}
                </NavLink>
              ))}
            </>
          )}
          {user?.role === 'ADMIN' && (
            <>
              <div className="sidebar-section">Admin</div>
              {ADMIN_ONLY.map((l) => (
                <NavLink key={l.to} to={l.to} onClick={onClose}>
                  <span className="icon" aria-hidden="true">
                    {l.icon}
                  </span>{' '}
                  {l.label}
                </NavLink>
              ))}
            </>
          )}
          {user?.mustChangePassword && (
            <NavLink to="/change-password" onClick={onClose}>
              <span className="icon" aria-hidden="true">
                🔑
              </span>{' '}
              Change password
            </NavLink>
          )}
          {!user && (
            <>
              <NavLink to="/setup" onClick={onClose}>
                <span className="icon" aria-hidden="true">
                  ⚙
                </span>{' '}
                Setup
              </NavLink>
              <NavLink to="/login" onClick={onClose}>
                <span className="icon" aria-hidden="true">
                  →
                </span>{' '}
                Login
              </NavLink>
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
