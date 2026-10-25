import { asyncHandler } from '../utils/asyncHandler.js';
import { forbidden } from '../utils/errors.js';
import { Employee } from '../models/Employee.js';
import { getAdminDashboard, getEmployeeDashboard, getHrDashboard } from '../services/dashboardService.js';
import { ownEmployee, scopedEmployee } from '../utils/scope.js';

export const adminDashboard = asyncHandler(async (req, res) => {
  const data = await getAdminDashboard(req.query);
  res.status(200).json({ success: true, ...data });
});

export const hrDashboard = asyncHandler(async (req, res) => {
  const data = await getHrDashboard(req.query);
  res.status(200).json({ success: true, ...data });
});

export const employeeDashboard = asyncHandler(async (req, res) => {
  // EMPLOYEE: own dashboard only; an employeeId for anyone else is 403.
  // ADMIN/HR: a specific employee's dashboard via employeeId (required —
  // staff users have no employee record of their own to fall back to).
  let employee;
  if (req.user.role === 'EMPLOYEE') {
    if (req.query.employeeId) {
      const own = await ownEmployee(req.user._id);
      if (String(own._id) !== String(req.query.employeeId)) throw forbidden('You can only access your own records');
      employee = own;
    } else {
      employee = await ownEmployee(req.user._id);
    }
  } else if (req.query.employeeId) {
    employee = await scopedEmployee(req, req.query.employeeId);
  } else {
    throw forbidden('employeeId is required to view an employee dashboard as staff');
  }
  // Mongoose 8: Document.populate() returns a promise, so chaining
  // .populate() on it fails — re-fetch with query populates instead.
  const populated = await Employee.findById(employee._id)
    .populate('department')
    .populate('designation')
    .populate('user', 'name email role');
  const data = await getEmployeeDashboard(populated, req.query);
  res.status(200).json({ success: true, ...data });
});
