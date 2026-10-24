// P1 verification against in-memory MongoDB. No real secrets, no live DB.
// Run: node test-p1.mjs
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from './src/app.js';
import { Setting } from './src/models/Setting.js';
import { Department } from './src/models/Department.js';
import { Designation } from './src/models/Designation.js';
import { LeaveType, seedDefaultLeaveTypes } from './src/models/LeaveType.js';
import { User } from './src/models/User.js';
import { Employee } from './src/models/Employee.js';
import { Attendance } from './src/models/Attendance.js';
import { LeaveRequest } from './src/models/LeaveRequest.js';
import { computeAttendanceStatus } from './src/services/attendanceService.js';
import { computePayrollLine, monthlyTax } from './src/services/payrollService.js';

let passed = 0; let failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.log(`FAIL ${name} ${detail}`); }
};
const eq = (a, b) => Math.abs(a - b) < 0.005;

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, path, token, body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* non-json (pdf/csv) */ }
  return { status: res.status, json, text, headers: res.headers };
};

// Seed: setup creates admin + setting + leave types.
let r = await call('POST', '/api/setup', null, { companyName: 'Test Co', adminName: 'Admin', adminEmail: 'admin@test.local', adminPassword: 'Admin123!' });
check('setup creates admin', r.status === 201, JSON.stringify(r.json));
const adminToken = r.json.token;
const admin = await User.findOne({ email: 'admin@test.local' });

// Register stays 404
r = await call('POST', '/api/auth/register', null, { name: 'x', email: 'x@test.local', password: 'Wrong123!' });
check('public register stays 404', r.status === 404, String(r.status));

// Admin creates HR with temp password
r = await call('POST', '/api/users', adminToken, { name: 'HR One', email: 'hr@test.local', password: 'TempHr123!', role: 'HR' });
check('admin creates HR login', r.status === 201 && r.json.user.mustChangePassword === true, JSON.stringify(r.json));
r = await call('POST', '/api/auth/login', null, { email: 'hr@test.local', password: 'TempHr123!' });
check('HR temp login works', r.status === 200 && r.json.user.mustChangePassword === true, JSON.stringify(r.json));
const hrToken = r.json.token;
// Temp-password change flow
r = await call('POST', '/api/auth/change-password', hrToken, { currentPassword: 'Wrong123!', newPassword: 'NewHr123!' });
check('change-password rejects wrong current', r.status === 403, String(r.status));
r = await call('POST', '/api/auth/change-password', hrToken, { currentPassword: 'TempHr123!', newPassword: 'NewHr123!' });
check('change-password succeeds', r.status === 200, JSON.stringify(r.json));
r = await call('POST', '/api/auth/login', null, { email: 'hr@test.local', password: 'NewHr123!' });
check('login after change, mustChangePassword false', r.status === 200 && r.json.user.mustChangePassword === false, JSON.stringify(r.json));
const hrToken2 = r.json.token;

// Org: dept + designation + holiday (Admin), HR read-only check
r = await call('POST', '/api/org/departments', adminToken, { name: 'Engineering', description: 'Eng' });
check('admin creates department', r.status === 201, JSON.stringify(r.json));
const deptId = r.json.item._id;
r = await call('POST', '/api/org/designations', adminToken, { name: 'Engineer', department: deptId });
const desigId = r.json.item._id;
r = await call('POST', '/api/org/departments', hrToken2, { name: 'Nope' });
check('HR cannot create department (403)', r.status === 403, String(r.status));
r = await call('GET', '/api/org/settings', hrToken2);
check('HR can read settings', r.status === 200 && r.json.setting.officeStartMinutes === 540, JSON.stringify(r.json));
r = await call('GET', '/api/org/settings', null, null);
check('settings require auth', r.status === 401, String(r.status));

// HR registers employees (login + record)
async function makeEmployee(code, email, name, salary = 100000) {
  const rr = await call('POST', '/api/employees', hrToken2, {
    name, email, password: 'TempEmp123!', employeeCode: code, department: deptId, designation: desigId,
    joiningDate: '2026-10-01', basicSalary: salary,
  });
  check(`HR registers employee ${code}`, rr.status === 201, JSON.stringify(rr.json));
  return rr.json.employee;
}
const empPay = await makeEmployee('EMP001', 'pay@test.local', 'Pay Person');
const empLeave = await makeEmployee('EMP002', 'leave@test.local', 'Leave Person');
const empCheck = await makeEmployee('EMP003', 'check@test.local', 'Check Person');
const empOther = await makeEmployee('EMP004', 'other@test.local', 'Other Person');

async function loginAs(email, pw = 'TempEmp123!') {
  // Phase 2: temp-password tokens are blocked from other endpoints, so
  // follow the forced-change flow here (temp login -> change -> login).
  const rr = await call('POST', '/api/auth/login', null, { email, password: pw });
  await call('POST', '/api/auth/change-password', rr.json.token, { currentPassword: pw, newPassword: 'NewEmp123!' });
  const rr2 = await call('POST', '/api/auth/login', null, { email, password: 'NewEmp123!' });
  return rr2.json.token;
}
const payToken = await loginAs('pay@test.local');
const leaveToken = await loginAs('leave@test.local');
const checkToken = await loginAs('check@test.local');
const otherToken = await loginAs('other@test.local');

// Employee scope: 403 on another employee's 360 and attendance
r = await call('GET', `/api/employees/${empOther._id}/360`, leaveToken);
check('employee 360 scope 403 on other', r.status === 403, String(r.status));
r = await call('GET', `/api/attendance?employeeId=${empOther._id}`, leaveToken);
check('employee attendance scope 403 on other', r.status === 403, String(r.status));
r = await call('GET', `/api/employees/${empLeave._id}/360`, leaveToken);
check('employee can view own 360', r.status === 200, String(r.status));
// Employee edits own phone only; salary edit forbidden
r = await call('PATCH', `/api/employees/${empLeave._id}`, leaveToken, { phone: '0300-1234567' });
check('employee edits own phone', r.status === 200 && r.json.employee.phone === '0300-1234567', JSON.stringify(r.json));
r = await call('PATCH', `/api/employees/${empLeave._id}`, leaveToken, { basicSalary: 999999 });
check('employee salary edit forbidden', r.status === 403, String(r.status));

// Attendance check-in: second check-in 409
r = await call('POST', '/api/attendance/check-in', checkToken);
check('first check-in 201', r.status === 201, JSON.stringify(r.json));
r = await call('POST', '/api/attendance/check-in', checkToken);
check('second check-in 409', r.status === 409, String(r.status));
r = await call('POST', '/api/attendance/check-out', checkToken);
check('check-out 200', r.status === 200, JSON.stringify(r.json));

// Late boundary via shared status service (09:15 = on time, 09:16 = late)
const setting = await Setting.findOne();
const at = (h, m, h2, m2) => ({ checkIn: new Date(Date.UTC(2026, 9, 5, h, m)), checkOut: new Date(Date.UTC(2026, 9, 5, h2, m2)) });
check('late boundary 09:15 on time', computeAttendanceStatus(at(9, 15, 17, 0), setting) === 'PRESENT', computeAttendanceStatus(at(9, 15, 17, 0), setting));
check('late boundary 09:16 late', computeAttendanceStatus(at(9, 16, 17, 0), setting) === 'LATE', computeAttendanceStatus(at(9, 16, 17, 0), setting));
check('half-day under 5h', computeAttendanceStatus(at(9, 0, 12, 59), setting) === 'HALF_DAY');
check('exactly 5h is present', computeAttendanceStatus(at(9, 0, 14, 0), setting) === 'PRESENT');
check('missing checkout', computeAttendanceStatus({ checkIn: new Date(), checkOut: null }, setting) === 'MISSING_CHECKOUT');
check('monthly tax slab check', eq(monthlyTax(150000), 10000), String(monthlyTax(150000)));
check('pure payroll line check', (() => { const l = computePayrollLine({ basicSalary: 100000, workingDays: 22, effectiveWorkingDays: 22, presentDays: 18, lateDays: 1, halfDays: 1, absentDays: 1, unpaidLeaveDays: 1, paidLeaveDays: 0 }); return eq(l.grossPayable, 132954.55) && eq(l.tax, 10000) && eq(l.netPay, 122954.55); })());

// Leave: apply, overlap 422, over-balance 422, HR decision + notification
const annual = await LeaveType.findOne({ code: 'ANNUAL' });
const unpaid = await LeaveType.findOne({ code: 'UNPAID' });
r = await call('POST', '/api/leaves', leaveToken, { leaveType: annual._id, startDate: '2026-11-02', endDate: '2026-11-03', reason: 'Trip' });
check('leave apply 201 (2 working days)', r.status === 201 && r.json.leave.workingDays === 2, JSON.stringify(r.json));
const leaveId = r.json.leave._id;
r = await call('POST', '/api/leaves', leaveToken, { leaveType: annual._id, startDate: '2026-11-03', endDate: '2026-11-04', reason: 'Overlap' });
check('leave overlap 422', r.status === 422, String(r.status));
r = await call('POST', '/api/leaves', leaveToken, { leaveType: annual._id, startDate: '2026-11-09', endDate: '2026-11-27', reason: 'Too much' });
check('leave over-balance 422 (15 > 14)', r.status === 422, String(r.status));
r = await call('PATCH', `/api/leaves/${leaveId}/decision`, hrToken2, { status: 'APPROVED', comment: 'OK' });
check('HR approves leave', r.status === 200 && r.json.leave.status === 'APPROVED', JSON.stringify(r.json));
r = await call('GET', '/api/notifications', leaveToken);
check('leave decision creates notification', r.status === 200 && r.json.notifications.some((n) => n.type === 'LEAVE_DECISION'), JSON.stringify(r.json));
// Weekend-only leave = 422 (no working days)
r = await call('POST', '/api/leaves', leaveToken, { leaveType: annual._id, startDate: '2026-11-07', endDate: '2026-11-08', reason: 'Weekend' });
check('weekend-only leave 422', r.status === 422, String(r.status));

// Payroll hand-calculation: Oct 2026, EMP001, basic 100000, gross 150000
// Working days Oct 2026 = 22. Days: 05 late, 06 half, 07 absent, 08 unpaid, rest present.
const d = (day) => new Date(Date.UTC(2026, 9, day));
const att = [];
const workingOct = [1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29, 30];
for (const day of workingOct) {
  if (day === 7) continue; // absent
  if (day === 8) continue; // unpaid leave (inserted below)
  let ci = new Date(Date.UTC(2026, 9, day, 9, 0)); let co = new Date(Date.UTC(2026, 9, day, 17, 0));
  if (day === 5) ci = new Date(Date.UTC(2026, 9, day, 9, 20));
  if (day === 6) co = new Date(Date.UTC(2026, 9, day, 13, 0));
  att.push({ employee: empPay._id, date: d(day), checkIn: ci, checkOut: co });
}
await Attendance.insertMany(att);
await LeaveRequest.create({ employee: empPay._id, leaveType: unpaid._id, startDate: d(8), endDate: d(8), workingDays: 1, reason: 'Unpaid', status: 'APPROVED' });
r = await call('POST', '/api/payroll/runs', hrToken2, { month: '2026-10' });
check('payroll draft created', r.status === 201, JSON.stringify(r.json));
const runId = r.json.run._id;
const line = r.json.run.lines.find((l) => String(l.employee) === String(empPay._id));
check('payroll working days 22', line && line.workingDays === 22, JSON.stringify(line));
check('payroll counts late1 half1 absent1 unpaid1 present18', line && line.lateDays === 1 && line.halfDays === 1 && line.absentDays === 1 && line.unpaidLeaveDays === 1 && line.presentDays === 18, JSON.stringify(line));
check('payroll gross payable 132954.55', line && eq(line.grossPayable, 132954.55), JSON.stringify(line));
check('payroll tax 10000', line && eq(line.tax, 10000), JSON.stringify(line));
check('payroll net 122954.55 to the rupee', line && eq(line.netPay, 122954.55), JSON.stringify(line));
// Employee payslip blocked before finalization, allowed after
r = await call('GET', `/api/payroll/runs/${runId}/payslip/${empPay._id}`, payToken);
check('employee payslip blocked while draft', r.status === 403, String(r.status));
r = await call('POST', `/api/payroll/runs/${runId}/finalize`, hrToken2);
check('HR cannot finalize (403, admin only)', r.status === 403, String(r.status));
r = await call('POST', `/api/payroll/runs/${runId}/finalize`, adminToken);
check('admin finalizes', r.status === 200 && r.json.run.status === 'FINALIZED', JSON.stringify(r.json));
r = await call('GET', `/api/payroll/runs/${runId}/payslip/${empPay._id}`, payToken);
check('employee own payslip after finalize', r.status === 200, String(r.status));
r = await call('GET', `/api/payroll/runs/${runId}/payslip/${empPay._id}`, otherToken);
check('other employee payslip 403', r.status === 403, String(r.status));
// Finalized-run lock
r = await call('POST', `/api/payroll/runs/${runId}/recompute`, hrToken2);
check('finalized run recompute locked', r.status === 409, String(r.status));
r = await call('DELETE', `/api/payroll/runs/${runId}`, hrToken2);
check('finalized run delete locked', r.status === 409, String(r.status));
// PDF download (own)
{
  const res = await fetch(`${base}/api/payroll/runs/${runId}/payslip/${empPay._id}/pdf`, { headers: { Authorization: `Bearer ${payToken}` } });
  const buf = Buffer.from(await res.arrayBuffer());
  check('payslip PDF downloads', res.status === 200 && res.headers.get('content-type')?.includes('pdf') && buf.slice(0, 4).toString() === '%PDF', `${res.status} ${buf.slice(0, 4)}`);
}
// CSV export + dry-run
r = await call('GET', '/api/employees/export/csv', hrToken2);
check('CSV export', r.status === 200 && r.text.includes('EMP001'), r.text.slice(0, 100));
const csv = 'name,email,employeeCode,department,joiningDate,basicSalary\nGood Guy,good@test.local,EMP099,Engineering,2026-01-05,50000\nBad Guy,,EMP001,UnknownDept,05-01-2026,0';
r = await call('POST', '/api/employees/import/dry-run', hrToken2, { csv });
check('CSV dry-run flags errors', r.status === 200 && r.json.validRows === 1 && r.json.errors.some((e) => e.field === 'email') && r.json.errors.some((e) => e.field === 'employeeCode') && r.json.errors.some((e) => e.field === 'department') && r.json.errors.some((e) => e.field === 'joiningDate') && r.json.errors.some((e) => e.field === 'basicSalary'), JSON.stringify(r.json));
// Audit log admin-only, contains entries
r = await call('GET', '/api/audit-logs', adminToken);
check('audit log readable by admin', r.status === 200 && r.json.logs.length > 0, String(r.status));
r = await call('GET', '/api/audit-logs', hrToken2);
check('audit log forbidden for HR', r.status === 403, String(r.status));
// Correction flow
const myAtt = await Attendance.findOne({ employee: (await Employee.findOne({ user: (await User.findOne({ email: 'check@test.local' }))._id }))._id });
r = await call('POST', '/api/attendance/corrections', checkToken, { attendanceId: String(myAtt._id), requestedCheckOut: new Date().toISOString(), reason: 'Forgot checkout time' });
check('correction request created', r.status === 201, JSON.stringify(r.json));
const corrId = r.json.correction._id;
r = await call('PATCH', `/api/attendance/corrections/${corrId}`, hrToken2, { status: 'APPROVED', comment: 'OK' });
check('HR approves correction', r.status === 200 && r.json.correction.status === 'APPROVED', JSON.stringify(r.json));

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
server.close();
await mongoose.disconnect();
await mongod.stop();
process.exit(failed ? 1 : 0);
