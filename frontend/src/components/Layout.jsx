import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import { ToastProvider } from './ui/Toast.jsx';

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  // Close the mobile drawer on navigation and on Escape.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <ToastProvider>
      <div className="app-shell">
        <Sidebar open={menuOpen} onClose={closeMenu} />
        <div className="app-main">
          <TopBar onMenu={() => setMenuOpen(true)} />
          <main className="container">
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
