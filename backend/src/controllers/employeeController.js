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
import { computeAttendanceStatus } from '../services/attendanceService.js';
import { getSetting } from '../services/settingsService.js';
import { escapeRegExp } from '../utils/escapeRegExp.js';
import { scopedEmployee } from '../utils/scope.js';
import mongoose from 'mongoose';

const populate = (q) => q.populate('department').populate('designation').populate('user', 'name email role isActive');

// POST /api/employees — HR/ADMIN. Creates the login + employee record,
// or (100%-pass A) links the record to an EXISTING login via
// existingUserId. Linking is how a staff user (ADMIN/HR) gets
// self-service: that login keeps its role and password, gains an
// employee record, and can then check in / apply for leave through
// its own record. A linked user must have no employee record yet;
// a record is never created without a real user behind it.
export const createEmployee = asyncHandler(async (req, res) => {
  const {
    existingUserId,
    name,
    email,
    password,
    employeeCode,
    department,
    designation,
    phone,
    address,
    joiningDate,
    basicSalary,
    gender,
    probationEndDate,
  } = req.body;
  if (!(await Department.findById(department))) throw badRequest('Department not found');
  if (designation) {
    const desig = await Designation.findById(designation);
    if (!desig) throw badRequest('Designation not found');
    if (String(desig.department) !== String(department))
      throw badRequest('Designation does not belong to this department');
  }
  if (await Employee.findOne({ employeeCode: employeeCode.toUpperCase() }))
    throw conflict('An employee with this code already exists');
  let user;
  let createdLogin = null;
  if (existingUserId) {
    user = await User.findById(existingUserId);
    if (!user) throw badRequest('Existing login not found');
    if (!user.isActive) throw badRequest('Existing login is deactivated');
    if (await Employee.findOne({ user: user._id })) throw conflict('That login already has an employee record');
  } else {
    if (await User.findOne({ email })) throw conflict('An account with this email already exists');
    user = await User.create({
      name,
      email,
      password: password || crypto.randomBytes(12).toString('base64').slice(0, 16),
      role: 'EMPLOYEE',
      mustChangePassword: true,
    });
    createdLogin = user;
  }
  try {
    const employee = await Employee.create({
      user: user._id,
      employeeCode: employeeCode.toUpperCase(),
      department,
      designation: designation || null,
      phone,
      address,
      joiningDate,
      basicSalary,
      gender: gender ?? null,
      probationEndDate: probationEndDate || null,
    });
    await writeAudit(req, 'CREATE', 'Employee', employee._id, null, {
      employeeCode,
      email: user.email,
      linkedExistingUser: Boolean(existingUserId),
    });
    res.status(201).json({ success: true, employee: await populate(Employee.findById(employee._id)) });
  } catch (e) {
    if (createdLogin) await User.deleteOne({ _id: createdLogin._id });
    throw e;
  }
});

// GET /api/employees — HR/ADMIN, server-side search / filters / paging.
export const listEmployees = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = {};
  // Phase 2: query IDs are validated, never passed raw into a filter
  // (with the old extended parser an object like department[$ne]=x
  // could reach Mongoose as an operator). Invalid IDs are 400.
  if (req.query.department) {
    if (!mongoose.Types.ObjectId.isValid(req.query.department)) throw badRequest('department must be a valid id');
    filter.department = req.query.department;
  }
  if (req.query.designation) {
    if (!mongoose.Types.ObjectId.isValid(req.query.designation)) throw badRequest('designation must be a valid id');
    filter.designation = req.query.designation;
  }
  if (req.query.isActive !== undefined) filter.isActive = req.query.isActive === 'true';
  const q = (req.query.q || '').trim();
  let query = Employee.find(filter);
  if (q) {
    // Phase 2: escape the search string before RegExp — unescaped user
    // input here was a regex-injection / ReDoS vector.
    const safe = new RegExp(escapeRegExp(q), 'i');
    const users = await User.find({ $or: [{ name: safe }, { email: safe }] }).select('_id');
    query = Employee.find({ ...filter, $or: [{ employeeCode: safe }, { user: { $in: users.map((u) => u._id) } }] });
  }
  const total = await query.clone().countDocuments();
  const employees = await populate(
    query
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
  );
  res
    .status(200)
    .json({ success: true, count: employees.length, total, page, pages: Math.ceil(total / limit), employees });
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
    if (req.body.department && !(await Department.findById(req.body.department)))
      throw badRequest('Department not found');
    if (req.body.designation && !(await Designation.findById(req.body.designation)))
      throw badRequest('Designation not found');
    // Phase 1 fix: name lives on the linked User, not on Employee, so
    // the old Object.assign silently dropped HR name edits. Route name
    // to the User document and keep it out of the Employee assign.
    const { name, ...employeeFields } = req.body;
    if (name !== undefined) {
      await User.updateOne({ _id: emp.user }, { $set: { name } });
    }
    Object.assign(emp, employeeFields);
    await emp.save();
    await writeAudit(req, 'UPDATE', 'Employee', emp._id, before, emp.toJSON());
    return res.status(200).json({ success: true, employee: await populate(Employee.findById(emp._id)) });
  }
});

// GET /api/employees/:id/360 — details + attendance + leave + payslip lines.
export const getEmployee360 = asyncHandler(async (req, res) => {
  const emp = await scopedEmployee(req, req.params.id);
  const setting = await getSetting();
  const [attendance, leaves, runs] = await Promise.all([
    Attendance.find({ employee: emp._id }).sort({ date: -1 }).limit(100),
    LeaveRequest.find({ employee: emp._id }).sort({ createdAt: -1 }).populate('leaveType'),
    PayrollRun.find({ 'lines.employee': emp._id }).sort({ month: -1 }),
  ]);
  // Phase 1 fix: employees must only see FINALIZED payslips (the old
  // query had no status filter, so draft lines leaked into 360).
  // Admin/HR keep seeing all runs, including drafts, for review.
  const visibleRuns = req.user.role === 'EMPLOYEE' ? runs.filter((r) => r.status === 'FINALIZED') : runs;
  const payslips = visibleRuns.flatMap((r) =>
    r.lines
      .filter((l) => String(l.employee) === String(emp._id))
      .map((l) => ({ month: r.month, status: r.status, ...l.toObject() })),
  );
  res.status(200).json({
    success: true,
    employee: await populate(Employee.findById(emp._id)),
    // Attendance docs carry no status field of their own: compute it
    // with the shared rule, exactly like /attendance/me and /attendance
    // do — otherwise the 360 Status column renders blank.
    attendance: attendance.map((r) => ({ ...r.toJSON(), status: computeAttendanceStatus(r, setting) })),
    leaves,
    payslips,
  });
});

// GET /api/employees/export/csv — HR/ADMIN.
export const exportEmployeesCsv = asyncHandler(async (_req, res) => {
  const employees = await populate(Employee.find().sort({ employeeCode: 1 }));
  const header =
    'employeeCode,name,email,department,designation,joiningDate,basicSalary,phone,address,gender,probationEndDate';
  const lines = employees.map((e) =>
    [
      e.employeeCode,
      e.user?.name || '',
      e.user?.email || '',
      e.department?.name || '',
      e.designation?.name || '',
      e.joiningDate?.toISOString().slice(0, 10) || '',
      e.basicSalary,
      e.phone || '',
      e.address || '',
      e.gender || '',
      e.probationEndDate ? e.probationEndDate.toISOString().slice(0, 10) : '',
    ]
      .map(csvEscape)
      .join(','),
  );
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
  res.status(200).send([header, ...lines].join('\n'));
});

// Shared CSV-import validation (dry-run and real import use the same
// checks, so a row the dry-run calls valid cannot fail validation on
// import). Returns per-row errors plus the parsed valid rows.
async function validateImportRows(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) throw badRequest('CSV must have a header row and at least one data row');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const required = ['name', 'email', 'employeecode', 'department', 'joiningdate', 'basicsalary'];
  const errors = [];
  const seenCodes = new Set();
  const seenEmails = new Set();
  const departments = await Department.find();
  const deptByName = new Map(departments.map((d) => [d.name.toLowerCase(), d]));
  const designations = await Designation.find();
  // Designations are unique per (name, department), not per name: the
  // same title can exist in two departments, so keep every match and
  // pick the one in the row's department below.
  const desigsByName = new Map();
  for (const d of designations) {
    const key = d.name.toLowerCase();
    if (!desigsByName.has(key)) desigsByName.set(key, []);
    desigsByName.get(key).push(d);
  }
  // A real calendar date: the format check alone is not enough, because
  // new Date('2026-02-30') silently rolls over to 2026-03-02. The
  // round-trip check catches impossible dates (same family as the
  // strict isoDate used by single employee creation and leave apply).
  const isRealDate = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return false; // e.g. month 13: toISOString() would throw
    return d.toISOString().slice(0, 10) === s;
  };
  const existingCodes = new Set((await Employee.find()).map((e) => e.employeeCode));
  const existingEmails = new Set((await User.find()).map((u) => u.email));
  const validRows = [];
  for (let i = 1; i < rows.length; i += 1) {
    const rowNum = i + 1; // 1-based including header
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = (rows[i][idx] || '').trim();
    });
    let rowOk = true;
    const add = (field, reason) => {
      errors.push({ row: rowNum, field, reason });
      rowOk = false;
    };
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
    if (obj.designation) {
      const matches = desigsByName.get(obj.designation.toLowerCase()) || [];
      const dept = deptByName.get((obj.department || '').toLowerCase());
      if (matches.length === 0) add('designation', 'Unknown designation');
      else if (dept && !matches.some((d) => String(d.department) === String(dept._id)))
        add('designation', 'Designation does not belong to this department');
    }
    if (obj.joiningdate && !isRealDate(obj.joiningdate))
      add('joiningDate', 'Date must be a real calendar date in YYYY-MM-DD');
    // probationEndDate used to pass dry-run unvalidated and then throw
    // a CastError on import, so a "valid" dry-run row failed to import.
    if (obj.probationenddate && !isRealDate(obj.probationenddate))
      add('probationEndDate', 'Date must be a real calendar date in YYYY-MM-DD');
    if (obj.basicsalary && !(Number(obj.basicsalary) > 0)) add('basicSalary', 'Salary must be greater than 0');
    if (rowOk) {
      validRows.push({
        row: rowNum,
        name: obj.name,
        email: obj.email.toLowerCase(),
        employeeCode: obj.employeecode.toUpperCase(),
        department: deptByName.get(obj.department.toLowerCase())._id,
        designation: obj.designation
          ? (
              (desigsByName.get(obj.designation.toLowerCase()) || []).find(
                (d) => String(d.department) === String(deptByName.get(obj.department.toLowerCase())._id),
              ) || (desigsByName.get(obj.designation.toLowerCase()) || [])[0]
            )?._id || null
          : null,
        phone: obj.phone || undefined,
        address: obj.address || undefined,
        gender: ['Male', 'Female', 'Other', 'Prefer not to say'].includes(obj.gender) ? obj.gender : null,
        probationEndDate: obj.probationenddate || null,
        joiningDate: obj.joiningdate,
        basicSalary: Number(obj.basicsalary),
      });
    }
  }
  return { totalRows: rows.length - 1, validRows, errors };
}

// POST /api/employees/import/dry-run — validates only, writes nothing.
export const importDryRun = asyncHandler(async (req, res) => {
  const { totalRows, validRows, errors } = await validateImportRows(req.body.csv);
  res.status(200).json({ success: true, totalRows, validRows: validRows.length, errors });
});

// POST /api/employees/import — Phase 1: the missing P1 feature. Creates
// a login + employee record for each VALID row only; invalid rows are
// skipped and reported (never partial silent writes). A row that fails
// mid-create (e.g. a duplicate that raced in) is reported as failed and
// its login is rolled back, exactly like createEmployee.
export const importEmployees = asyncHandler(async (req, res) => {
  const { totalRows, validRows, errors } = await validateImportRows(req.body.csv);
  const results = [];
  for (const row of validRows) {
    try {
      const user = await User.create({
        name: row.name,
        email: row.email,
        password: crypto.randomBytes(12).toString('base64').slice(0, 16),
        role: 'EMPLOYEE',
        mustChangePassword: true,
      });
      try {
        const employee = await Employee.create({
          user: user._id,
          employeeCode: row.employeeCode,
          department: row.department,
          designation: row.designation,
          phone: row.phone,
          address: row.address,
          gender: row.gender ?? null,
          probationEndDate: row.probationEndDate || null,
          joiningDate: row.joiningDate,
          basicSalary: row.basicSalary,
        });
        await writeAudit(req, 'CREATE', 'Employee', employee._id, null, {
          employeeCode: row.employeeCode,
          email: row.email,
          source: 'csv-import',
        });
        results.push({ row: row.row, employeeCode: row.employeeCode, email: row.email, status: 'created' });
      } catch (e) {
        await User.deleteOne({ _id: user._id });
        results.push({
          row: row.row,
          employeeCode: row.employeeCode,
          email: row.email,
          status: 'failed',
          reason: 'Could not create employee record',
        });
      }
    } catch (e) {
      results.push({
        row: row.row,
        employeeCode: row.employeeCode,
        email: row.email,
        status: 'failed',
        reason: 'Could not create login',
      });
    }
  }
  const created = results.filter((r) => r.status === 'created').length;
  res.status(200).json({
    success: true,
    totalRows,
    createdRows: created,
    failedRows: results.filter((r) => r.status === 'failed').length,
    errors,
    results,
  });
});
