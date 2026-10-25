import { forbidden, notFoundError } from './errors.js';
import { Employee } from '../models/Employee.js';

// Returns the Employee row for the logged-in user, or 404 if none.
// Role-agnostic on purpose: a staff user (ADMIN/HR) who has a linked
// employee record (see createEmployee existingUserId) self-serves
// through exactly the same record as an EMPLOYEE user.
export async function ownEmployee(userId) {
  const emp = await Employee.findOne({ user: userId });
  if (!emp) throw notFoundError('Employee record not found for this user');
  return emp;
}

// Self-service variant: staff without a linked record get a clear 403
// with guidance instead of a bare 404, so the UI can explain the fix
// (Admin links an employee record to that login) instead of crashing.
export async function ownEmployeeForSelfService(userId, role) {
  const emp = await Employee.findOne({ user: userId });
  if (!emp) {
    if (role === 'EMPLOYEE') throw notFoundError('Employee record not found for this user');
    throw forbidden(
      'No employee record is linked to this account. Ask an Admin to link an employee record to this login (Employees → Register, link to existing login), then check in / apply for leave again.',
    );
  }
  return emp;
}

// For an :employeeId param: HR/ADMIN may access any; EMPLOYEE only their own.
// Returns the Employee document.
export async function scopedEmployee(req, employeeId) {
  const emp = await Employee.findById(employeeId);
  if (!emp) throw notFoundError('Employee not found');
  if (req.user.role === 'EMPLOYEE') {
    const own = await Employee.findOne({ user: req.user._id });
    if (!own || String(own._id) !== String(emp._id)) throw forbidden('You can only access your own records');
  }
  return emp;
}
