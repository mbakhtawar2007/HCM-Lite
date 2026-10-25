import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { listNotifications } from '../api/p1.js';
import Button from './ui/Button.jsx';
import ThemeToggle from './ThemeToggle.jsx';

export default function TopBar({ onMenu }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    let cancelled = false;
    listNotifications()
      .then((d) => {
        if (!cancelled) setUnread(d.unreadCount || 0);
      })
      .catch(() => {});
    const t = window.setInterval(() => {
      listNotifications()
        .then((d) => {
          if (!cancelled) setUnread(d.unreadCount || 0);
        })
        .catch(() => {});
    }, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [user]);
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };
  return (
    <header className="topbar">
      <Button variant="ghost" className="menu-btn btn-icon" aria-label="Open navigation menu" onClick={onMenu}>
        <span aria-hidden="true">☰</span>
      </Button>
      <span className="muted" style={{ fontWeight: 600 }}>
        HCM Lite
      </span>
      <span className="topbar-spacer" />
      {user && (
        <Link className="bell" to="/notifications" aria-label={`Notifications, ${unread} unread`}>
          <span aria-hidden="true" style={{ fontSize: '1.25rem' }}>
            🔔
          </span>
          {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
        </Link>
      )}
      <ThemeToggle />
      {user && (
        <div style={{ position: 'relative' }}>
          <Button variant="ghost" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            <span className="user-chip">
              <span className="name">{user.name}</span> · {user.role}
            </span>{' '}
            ▾
          </Button>
          {menuOpen && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                right: 0,
                top: '110%',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-lg)',
                minWidth: 200,
                zIndex: 30,
                padding: '0.5rem',
              }}
            >
              <Link
                role="menuitem"
                to="/dashboard"
                style={{ display: 'block', padding: '0.5rem 0.75rem', color: 'var(--text)' }}
                onClick={() => setMenuOpen(false)}
              >
                Dashboard
              </Link>
              <Link
                role="menuitem"
                to="/ai"
                style={{ display: 'block', padding: '0.5rem 0.75rem', color: 'var(--text)' }}
                onClick={() => setMenuOpen(false)}
              >
                AI assistant
              </Link>
              <Link
                role="menuitem"
                to="/change-password"
                style={{ display: 'block', padding: '0.5rem 0.75rem', color: 'var(--text)' }}
                onClick={() => setMenuOpen(false)}
              >
                Change password
              </Link>
              <button
                type="button"
                role="menuitem"
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      )}
      {!user && (
        <Link className="btn btn-primary" to="/login">
          Login
        </Link>
      )}
    </header>
  );
}
