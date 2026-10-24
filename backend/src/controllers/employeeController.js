import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, conflict, forbidden, notFoundError } from '../utils/errors.js';
import { User } from '../models/User.js';
import { Employee } from '../models/Employee.js';
import { Department } from '../models/Department.js';
import { Designation } from '../models/Designation.js';
import { Attendance } from '../models/Attendance.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { PayrollRun } from '../models/PayrollRun.js';
import { parseCsv } from '../services/csvService.js';
import { csvEscape } from '../services/csvService.js';
import { writeAudit } from '../services/attendanceService.js';
import { ownEmployee, scopedEmployee } from '../utils/scope.js';

const populate = (q) => q.populate('department').populate('designation').populate('user', 'name email role isActive');

// POST /api/employees — HR/ADMIN. Creates the login + employee record.
export const createEmployee = asyncHandler(async (req, res) => {
  const { name, email, password, employeeCode, department, designation, phone, address, joiningDate, basicSalary } = req.body;
  if (!(await Department.findById(department))) throw badRequest('Department not found');
  if (designation && !(await Designation.findById(designation))) throw badRequest('Designation not found');
  if (await User.findOne({ email })) throw conflict('An account with this email already exists');
  if (await Employee.findOne({ employeeCode: employeeCode.toUpperCase() })) throw conflict('An employee with this code already exists');
  const user = await User.create({
    name, email, password: password || crypto.randomBytes(12).toString('base64').slice(0, 16),
    role: 'EMPLOYEE', mustChangePassword: true,
  });
  try {
    const employee = await Employee.create({
      user: user._id, employeeCode: employeeCode.toUpperCase(), department,
      designation: designation || null, phone, address, joiningDate, basicSalary,
    });
    await writeAudit(req, 'CREATE', 'Employee', employee._id, null, { employeeCode, email });
    res.status(201).json({ success: true, employee: await populate(Employee.findById(employee._id)) });
  } catch (e) {
    await User.deleteOne({ _id: user._id });
    throw e;
  }
});

// GET /api/employees — HR/ADMIN, server-side search / filters / paging.
export const listEmployees = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = {};
  if (req.query.department) filter.department = req.query.department;
  if (req.query.designation) filter.designation = req.query.designation;
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  const q = (req.query.q || '').trim();
  let query = Employee.find(filter);
  if (q) {
    const users = await User.find({ $or: [{ name: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }] }).select('_id');
    query = Employee.find({ ...filter, $or: [{ employeeCode: new RegExp(q, 'i') }, { user: { $in: users.map((u) => u._id) } }] });
  }
  const total = await query.clone().countDocuments();
  const employees = await populate(query.sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit));
  res.status(200).json({ success: true, count: employees.length, total, page, pages: Math.ceil(total / limit), employees });
});

export const getMyEmployee = asyncHandler(async (req, res) => {
  const emp = await populate(Employee.findOne({ user: req.user._id }));
  if (!emp) throw notFoundError('Employee record not found');
  res.status(200).json({ success: true, employee: emp });
});

export const getEmployee = asyncHandler(async (req, res) => {
  const emp = await scopedEmployee(req, req.params.id);
  res.status(200).json({ success: true, employee: await populate(Employee.findById(emp._id)) });
});

// PATCH /api/employees/:id — HR/ADMIN may edit job/salary fields;
// an EMPLOYEE editing their own record may change phone/address only.
export const updateEmployee = asyncHandler(async (req, res) => {
  const emp = await scopedEmployee(req, req.params.id);
  if (req.user.role === 'EMPLOYEE') {
    const allowed = {};
    if (req.body.phone !== undefined) allowed.phone = req.body.phone;
    if (req.body.address !== undefined) allowed.address = req.body.address;
    if (Object.keys(req.body).some((k) => !['phone', 'address'].includes(k))) {
      throw forbidden('Employees may only edit their own phone and address');
    }
    const beforeSelf = emp.toJSON();
    Object.assign(emp, allowed);
    await emp.save();
    await writeAudit(req, 'UPDATE', 'Employee', emp._id, beforeSelf, emp.toJSON());
    return res.status(200).json({ success: true, employee: await populate(Employee.findById(emp._id)) });
  } else {
    const before = emp.toJSON();
    if (req.body.department && !(await Department.findById(req.body.department))) throw badRequest('Department not found');
    if (req.body.designation && !(await Designation.findById(req.body.designation))) throw badRequest('Designation not found');
    Object.assign(emp, req.body);
    await emp.save();
    await writeAudit(req, 'UPDATE', 'Employee', emp._id, before, emp.toJSON());
    return res.status(200).json({ success: true, employee: await populate(Employee.findById(emp._id)) });
  }
  await emp.save();
  res.status(200).json({ success: true, employee: await populate(Employee.findById(emp._id)) });
});

// GET /api/employees/:id/360 — details + attendance + leave + payslip lines.
export const getEmployee360 = asyncHandler(async (req, res) => {
  const emp = await scopedEmployee(req, req.params.id);
  const [attendance, leaves, runs] = await Promise.all([
    Attendance.find({ employee: emp._id }).sort({ date: -1 }).limit(100),
    LeaveRequest.find({ employee: emp._id }).sort({ createdAt: -1 }).populate('leaveType'),
    PayrollRun.find({ 'lines.employee': emp._id }).sort({ month: -1 }),
  ]);
  const payslips = runs.flatMap((r) => r.lines.filter((l) => String(l.employee) === String(emp._id)).map((l) => ({ month: r.month, status: r.status, ...l.toObject() })));
  res.status(200).json({
    success: true,
    employee: await populate(Employee.findById(emp._id)),
    attendance, leaves, payslips,
  });
});

// GET /api/employees/export/csv — HR/ADMIN.
export const exportEmployeesCsv = asyncHandler(async (_req, res) => {
  const employees = await populate(Employee.find().sort({ employeeCode: 1 }));
  const header = 'employeeCode,name,email,department,designation,joiningDate,basicSalary,phone';
  const lines = employees.map((e) => [
    e.employeeCode, e.user?.name || '', e.user?.email || '', e.department?.name || '',
    e.designation?.name || '', e.joiningDate?.toISOString().slice(0, 10) || '', e.basicSalary, e.phone || '',
  ].map(csvEscape).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
  res.status(200).send([header, ...lines].join('\n'));
});

// POST /api/employees/import/dry-run — validates only, writes nothing.
export const importDryRun = asyncHandler(async (req, res) => {
  const rows = parseCsv(req.body.csv);
  if (rows.length < 2) throw badRequest('CSV must have a header row and at least one data row');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const required = ['name', 'email', 'employeecode', 'department', 'joiningdate', 'basicsalary'];
  const errors = [];
  const seenCodes = new Set(); const seenEmails = new Set();
  const departments = await Department.find();
  const deptByName = new Map(departments.map((d) => [d.name.toLowerCase(), d]));
  const existingCodes = new Set((await Employee.find()).map((e) => e.employeeCode));
  const existingEmails = new Set((await User.find()).map((u) => u.email));
  let valid = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const rowNum = i + 1; // 1-based including header
    const obj = {};
    header.forEach((h, idx) => { obj[h] = (rows[i][idx] || '').trim(); });
    let rowOk = true;
    const add = (field, reason) => { errors.push({ row: rowNum, field, reason }); rowOk = false; };
    for (const f of required) if (!obj[f]) add(f, 'Required field is missing');
    if (obj.email && !/^\S+@\S+\.\S+$/.test(obj.email)) add('email', 'Invalid email format');
    if (obj.email) {
      const em = obj.email.toLowerCase();
      if (existingEmails.has(em) || seenEmails.has(em)) add('email', 'Email already exists');
      seenEmails.add(em);
    }
    if (obj.employeecode) {
      const code = obj.employeecode.toUpperCase();
      if (existingCodes.has(code) || seenCodes.has(code)) add('employeeCode', 'Employee code already exists');
      seenCodes.add(code);
    }
    if (obj.department && !deptByName.has(obj.department.toLowerCase())) add('department', 'Unknown department');
    if (obj.joiningdate && !/^\d{4}-\d{2}-\d{2}$/.test(obj.joiningdate)) add('joiningDate', 'Date must be YYYY-MM-DD');
    if (obj.basicsalary && !(Number(obj.basicsalary) > 0)) add('basicSalary', 'Salary must be greater than 0');
    if (rowOk) valid += 1;
  }
  res.status(200).json({ success: true, totalRows: rows.length - 1, validRows: valid, errors });
});
