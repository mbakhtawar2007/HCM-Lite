import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Button from './ui/Button.jsx';

const ROLE_LINKS = {
  ADMIN: { to: '/admin', label: 'Admin' },
  HR: { to: '/hr', label: 'HR' },
  EMPLOYEE: { to: '/employee', label: 'My dashboard' },
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const roleLink = user ? ROLE_LINKS[user.role] : null;

  return (
    <header className="navbar">
      <Link className="brand" to="/">
        HCM Lite
      </Link>
      <nav>
        <NavLink to="/">Home</NavLink>
        {user && <NavLink to="/dashboard">Dashboard</NavLink>}
        {roleLink && <NavLink to={roleLink.to}>{roleLink.label}</NavLink>}
        {!user && (
          <>
            <NavLink to="/setup">Setup</NavLink>
            <NavLink to="/login">Login</NavLink>
          </>
        )}
        {user && (
          <Button variant="ghost" onClick={handleLogout}>
            Logout ({user.name}, {user.role})
          </Button>
        )}
      </nav>
    </header>
  );
}
