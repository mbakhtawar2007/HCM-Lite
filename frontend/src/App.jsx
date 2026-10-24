import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AttendancePage from './pages/AttendancePage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Employee360 from './pages/Employee360.jsx';
import EmployeeDashboard from './pages/EmployeeDashboard.jsx';
import Employees from './pages/Employees.jsx';
import Home from './pages/Home.jsx';
import HRDashboard from './pages/HRDashboard.jsx';
import LeavesPage from './pages/LeavesPage.jsx';
import Login from './pages/Login.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import NotFound from './pages/NotFound.jsx';
import PayrollPage from './pages/PayrollPage.jsx';
import Settings from './pages/Settings.jsx';
import Setup from './pages/Setup.jsx';
import Users from './pages/Users.jsx';

// Role guards here are a convenience only — the server enforces roles
// on every route (requireRole). No /register route: accounts come from
// setup, then Admin/HR creation.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/leaves" element={<LeavesPage />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/employees/:id" element={<Employee360 />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/users" element={<Users />} />
          <Route path="/audit" element={<AuditPage />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['HR', 'ADMIN']} />}>
          <Route path="/hr" element={<HRDashboard />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['EMPLOYEE']} />}>
          <Route path="/employee" element={<EmployeeDashboard />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
