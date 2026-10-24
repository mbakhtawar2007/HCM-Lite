import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import Dashboard from './pages/Dashboard.jsx';
import EmployeeDashboard from './pages/EmployeeDashboard.jsx';
import Home from './pages/Home.jsx';
import HRDashboard from './pages/HRDashboard.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';
import Setup from './pages/Setup.jsx';

// To add a page: create it in pages/, then add a <Route> here.
// Wrap protected pages in <ProtectedRoute>; pass allowedRoles to
// enforce a role on the frontend too (the server enforces it for real).
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/login" element={<Login />} />
        {/* No /register route in P0: accounts come from first-run setup, then Admin/HR creation in P1. */}

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
          <Route path="/admin" element={<AdminDashboard />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['HR', 'ADMIN']} />}>
          <Route path="/hr" element={<HRDashboard />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['EMPLOYEE']} />}>
          <Route path="/employee" element={<EmployeeDashboard />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
