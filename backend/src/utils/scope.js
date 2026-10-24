import { forbidden, notFoundError } from './errors.js';
import { Employee } from '../models/Employee.js';

// Returns the Employee row for the logged-in user, or 404 if none.
export async function ownEmployee(userId) {
  const emp = await Employee.findOne({ user: userId });
  if (!emp) throw notFoundError('Employee record not found for this user');
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
