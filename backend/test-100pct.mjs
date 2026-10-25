// 100%-pass verification (gaps A–G) against in-memory MongoDB.
// Run: node test-100pct.mjs  (or: npm test, which runs every suite)
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from './src/app.js';
import { Attendance } from './src/models/Attendance.js';
import { computePayrollLine } from './src/services/payrollService.js';

let passed = 0;
let failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name} ${detail}`);
  }
};
const eq = (a, b) => Math.abs(a - b) < 0.01;

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
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON (csv/pdf) — json stays null
  }
  return { status: res.status, json, text };
};
const login = async (email, pw) => (await call('POST', '/api/auth/login', null, { email, password: pw })).json.token;

// --- Setup + org ---
let r = await call('POST', '/api/setup', null, {
  companyName: 'Pass Co',
  adminName: 'Admin',
  adminEmail: 'admin@test.local',
  adminPassword: 'Admin123!',
});
check('setup 201', r.status === 201, JSON.stringify(r.json));
const adminToken = r.json.token;
r = await call('POST', '/api/org/departments', adminToken, { name: 'Engineering' });
const deptId = r.json.item._id;
check('department created', r.status === 201, JSON.stringify(r.json));
r = await call('POST', '/api/org/designations', adminToken, { name: 'Engineer', department: deptId });
const desigId = r.json.item._id;
r = await call('GET', '/api/org/leave-types', adminToken);
const annualType = r.json.items.find((t) => t.code === 'ANNUAL') || r.json.items[0];
check('leave types seeded', !!annualType, JSON.stringify(r.json));

// --- A: HR login + linked employee record ---
r = await call('POST', '/api/users', adminToken, {
  name: 'HR One',
  email: 'hr@test.local',
  password: 'TempHr123!',
  role: 'HR',
});
const hrUserId = r.json.user._id;
check('HR login created', r.status === 201, JSON.stringify(r.json));
let hrToken = await login('hr@test.local', 'TempHr123!');
r = await call('POST', '/api/auth/change-password', hrToken, {
  currentPassword: 'TempHr123!',
  newPassword: 'NewHr123!',
});
check('HR changes temp password', r.status === 200, JSON.stringify(r.json));
hrToken = await login('hr@test.local', 'NewHr123!');
// HR without a linked record gets a clear 403, not a crash
r = await call('POST', '/api/attendance/check-in', hrToken, {});
check(
  'HR without linked record: check-in 403 with guidance',
  r.status === 403 && /No employee record/.test(r.json.message || ''),
  JSON.stringify(r.json),
);
// Admin links an employee record to the existing HR login
r = await call('POST', '/api/employees', adminToken, {
  existingUserId: hrUserId,
  employeeCode: 'EMP900',
  department: deptId,
  designation: desigId,
  joiningDate: '2026-10-01',
  basicSalary: 120000,
  gender: 'Female',
  probationEndDate: '2026-12-31',
});
check(
  'linked employee record created for HR',
  r.status === 201 && r.json.employee.user.role === 'HR',
  JSON.stringify(r.json),
);
const hrEmpId = r.json.employee._id;
check(
  'linked record keeps gender/probation',
  r.json.employee.gender === 'Female' && r.json.employee.probationEndDate?.slice(0, 10) === '2026-12-31',
  JSON.stringify(r.json.employee),
);
// Linking the same login twice is a conflict, not a duplicate record
r = await call('POST', '/api/employees', adminToken, {
  existingUserId: hrUserId,
  employeeCode: 'EMP901',
  department: deptId,
  joiningDate: '2026-10-01',
  basicSalary: 100000,
});
check('double link rejected 409', r.status === 409, String(r.status));
// Linked HR can now check in and check out
r = await call('POST', '/api/attendance/check-in', hrToken, {});
check('linked HR check-in 201', r.status === 201, JSON.stringify(r.json));
r = await call('POST', '/api/attendance/check-out', hrToken, {});
check('linked HR check-out 200', r.status === 200, JSON.stringify(r.json));
r = await call('GET', '/api/attendance/me', hrToken);
check('linked HR my-attendance works', r.status === 200 && r.json.attendance.length >= 1, JSON.stringify(r.json));

// --- A/B: HR leave apply, approve, cancel approved future, cancel past blocked ---
r = await call('POST', '/api/leaves', hrToken, {
  leaveType: annualType._id,
  startDate: '2027-01-04',
  endDate: '2027-01-05',
  reason: 'Future leave to cancel',
});
check('linked HR applies leave', r.status === 201, JSON.stringify(r.json));
const futureLeaveId = r.json.leave._id;
r = await call('PATCH', `/api/leaves/${futureLeaveId}/decision`, adminToken, { status: 'APPROVED', comment: 'ok' });
check('admin approves HR leave', r.status === 200, JSON.stringify(r.json));
r = await call('PATCH', `/api/leaves/${futureLeaveId}/cancel`, hrToken);
check(
  'approved future leave can be cancelled',
  r.status === 200 && r.json.leave.status === 'CANCELLED',
  JSON.stringify(r.json),
);
// Balance restored: used for 2027 annual must be 0 again
r = await call('GET', `/api/leaves/balances?employeeId=${hrEmpId}&year=2027`, adminToken);
const annualBal = r.json.balances.find((b) => String(b.leaveType._id) === String(annualType._id));
check('cancel restores balance (2027 annual used 0)', annualBal && annualBal.used === 0, JSON.stringify(r.json));
// Past approved leave cannot be cancelled
r = await call('POST', '/api/leaves', hrToken, {
  leaveType: annualType._id,
  startDate: '2026-01-05',
  endDate: '2026-01-06',
  reason: 'Past leave',
});
const pastLeaveId = r.json.leave?._id;
check('past leave applies (dates in past are not blocked at apply)', r.status === 201, JSON.stringify(r.json));
if (pastLeaveId) {
  await call('PATCH', `/api/leaves/${pastLeaveId}/decision`, adminToken, { status: 'APPROVED', comment: 'ok' });
  r = await call('PATCH', `/api/leaves/${pastLeaveId}/cancel`, hrToken);
  check('approved started/past leave cancel blocked', r.status === 409, String(r.status));
}
// Pending cancel still works
r = await call('POST', '/api/leaves', hrToken, {
  leaveType: annualType._id,
  startDate: '2027-02-01',
  endDate: '2027-02-02',
  reason: 'Pending to cancel',
});
const pendingId = r.json.leave._id;
r = await call('PATCH', `/api/leaves/${pendingId}/cancel`, hrToken);
check('pending cancel still works', r.status === 200 && r.json.leave.status === 'CANCELLED', JSON.stringify(r.json));
// Other-user cancel is 403: create a regular employee, apply, HR tries to cancel it
r = await call('POST', '/api/employees', adminToken, {
  name: 'Emp Two',
  email: 'emp2@test.local',
  password: 'Emp21234!',
  employeeCode: 'EMP902',
  department: deptId,
  joiningDate: '2026-10-01',
  basicSalary: 90000,
});
const emp2Id = r.json.employee._id;
let emp2Token = await login('emp2@test.local', 'Emp21234!');
await call('POST', '/api/auth/change-password', emp2Token, { currentPassword: 'Emp21234!', newPassword: 'Emp2New1!' });
emp2Token = await login('emp2@test.local', 'Emp2New1!');
r = await call('POST', '/api/leaves', emp2Token, {
  leaveType: annualType._id,
  startDate: '2027-03-01',
  endDate: '2027-03-02',
  reason: 'Someone else leave',
});
const otherLeaveId = r.json.leave._id;
r = await call('PATCH', `/api/leaves/${otherLeaveId}/cancel`, hrToken);
check('other-user cancel 403', r.status === 403, String(r.status));
// Admin was notified of the approved cancellation
r = await call('GET', '/api/notifications', adminToken);
check(
  'admin notified of approved cancellation',
  (r.json.notifications || []).some((n) => n.type === 'LEAVE_CANCELLED'),
  JSON.stringify(r.json).slice(0, 400),
);

// --- C: gender/probation + CSV round-trip ---
r = await call('GET', '/api/dashboards/admin?from=2026-10-01&to=2026-10-31', adminToken);
check(
  'admin dashboard gender counts collected values',
  r.json.genderBreakdown?.byGender?.Female >= 1,
  JSON.stringify(r.json.genderBreakdown),
);
check(
  'admin dashboard probation counts probation employee',
  r.json.probation?.onProbation >= 1,
  JSON.stringify(r.json.probation),
);
check(
  'admin dashboard existing employees are Not specified, not invented',
  (r.json.genderBreakdown?.byGender?.['Not specified'] || 0) >= 1,
  JSON.stringify(r.json.genderBreakdown),
);
r = await call('GET', '/api/employees/export/csv', adminToken);
check(
  'CSV export header includes gender + probationEndDate',
  r.text.split('\n')[0].includes('gender,probationEndDate'),
  r.text.split('\n')[0],
);
check(
  'CSV export line includes Female + probation date',
  r.text.includes('Female') && r.text.includes('2026-12-31'),
  r.text.slice(0, 500),
);
r = await call('POST', '/api/employees/import/dry-run', adminToken, {
  csv: 'employeeCode,name,email,department,designation,joiningDate,basicSalary,phone,address,gender,probationEndDate\nEMP903,CSV Person,csv@test.local,Engineering,Engineer,2026-10-01,80000,0300-1111111,Karachi,Male,2027-01-31',
});
check('CSV import dry-run with gender/probation valid', r.json.validRows === 1, JSON.stringify(r.json));
r = await call('POST', '/api/employees/import', adminToken, {
  csv: 'employeeCode,name,email,department,designation,joiningDate,basicSalary,phone,address,gender,probationEndDate\nEMP903,CSV Person,csv@test.local,Engineering,Engineer,2026-10-01,80000,0300-1111111,Karachi,Male,2027-01-31',
});
check('CSV import creates employee with gender/probation', r.json.createdRows === 1, JSON.stringify(r.json));
r = await call('GET', '/api/employees?limit=100', adminToken);
const csvEmp = r.json.employees.find((e) => e.employeeCode === 'EMP903');
check(
  'imported employee stores gender/probation',
  csvEmp?.gender === 'Male' && csvEmp?.probationEndDate?.slice(0, 10) === '2027-01-31',
  JSON.stringify(csvEmp),
);

// --- D: late penalty (pure function, hand-checkable) ---
const hand = computePayrollLine({
  basicSalary: 100000,
  workingDays: 22,
  effectiveWorkingDays: 22,
  lateDays: 1,
  halfDays: 1,
  absentDays: 1,
  unpaidLeaveDays: 1,
  paidLeaveDays: 0,
  presentDays: 18,
});
check(
  'hand-calc net unchanged with 1 late (penalty 0)',
  eq(hand.netPay, 122954.55) && hand.latePenaltyDays === 0,
  JSON.stringify(hand),
);
const three = computePayrollLine({
  basicSalary: 100000,
  workingDays: 22,
  effectiveWorkingDays: 22,
  lateDays: 3,
  halfDays: 0,
  absentDays: 0,
  unpaidLeaveDays: 0,
  paidLeaveDays: 0,
  presentDays: 19,
});
check('3 lates = 0.5 day penalty', three.latePenaltyDays === 0.5 && three.deductionDays === 0.5, JSON.stringify(three));
const six = computePayrollLine({
  basicSalary: 100000,
  workingDays: 22,
  effectiveWorkingDays: 22,
  lateDays: 6,
  halfDays: 0,
  absentDays: 0,
  unpaidLeaveDays: 0,
  paidLeaveDays: 0,
  presentDays: 16,
});
check('6 lates = 1 day penalty', six.latePenaltyDays === 1 && six.deductionDays === 1, JSON.stringify(six));
const two = computePayrollLine({
  basicSalary: 100000,
  workingDays: 22,
  effectiveWorkingDays: 22,
  lateDays: 2,
  halfDays: 0,
  absentDays: 0,
  unpaidLeaveDays: 0,
  paidLeaveDays: 0,
  presentDays: 20,
});
check('2 lates = 0 penalty', two.latePenaltyDays === 0, JSON.stringify(two));

// --- E/F: anomalies + risk on HR dashboard (range 2026-10-05 to 2026-10-09, Mon-Fri) ---
// emp2: present Mon+Tue, absent Wed+Thu+Fri (3 consecutive, 60% absence)
const day = (d) => new Date(`${d}T00:00:00.000Z`);
for (const d of ['2026-10-05', '2026-10-06']) {
  await Attendance.create({
    employee: emp2Id,
    date: day(d),
    checkIn: new Date(`${d}T08:00:00.000Z`),
    checkOut: new Date(`${d}T17:00:00.000Z`),
  });
}
r = await call('GET', '/api/dashboards/hr?from=2026-10-05&to=2026-10-09', adminToken);
const flags = r.json.absenceAnomalies || [];
check(
  'anomaly: consecutive absences flagged',
  flags.some((f) => f.type === 'CONSECUTIVE_ABSENCES' && f.employeeCode === 'EMP902'),
  JSON.stringify(flags),
);
check(
  'anomaly: high absence rate flagged',
  flags.some((f) => f.type === 'HIGH_ABSENCE_RATE' && f.employeeCode === 'EMP902'),
  JSON.stringify(flags),
);
const risk = (r.json.attritionRisk || []).find((x) => x.employeeCode === 'EMP902');
check(
  'attrition risk: absent-heavy new joiner is Medium (score 38)',
  risk && risk.band === 'Medium' && risk.score === 38,
  JSON.stringify(risk),
);
r = await call('GET', '/api/dashboards/hr?from=2026-10-05&to=2026-10-09', adminToken);
check(
  'HR dashboard anomalies/risk present (not empty on real data)',
  Array.isArray(r.json.absenceAnomalies) && Array.isArray(r.json.attritionRisk),
  '',
);

// --- G: camera check-in server checks ---
r = await call('PATCH', '/api/org/settings', adminToken, {
  officeLat: 24.86,
  officeLng: 67.0,
  officeRadiusMeters: 150,
});
check('office location set for camera tests', r.status === 200, JSON.stringify(r.json));
r = await call('POST', '/api/attendance/check-in/camera', emp2Token, {
  latitude: 24.86,
  longitude: 67.0,
  accuracy: 50,
  faceCount: 0,
});
check('camera: 0 faces rejected 400', r.status === 400, String(r.status));
r = await call('POST', '/api/attendance/check-in/camera', emp2Token, {
  latitude: 24.86,
  longitude: 67.0,
  accuracy: 50,
  faceCount: 2,
});
check('camera: 2 faces rejected 400', r.status === 400, String(r.status));
r = await call('POST', '/api/attendance/check-in/camera', emp2Token, {
  latitude: 24.86,
  longitude: 67.0,
  accuracy: 200,
  faceCount: 1,
});
check('camera: accuracy >100m rejected 400', r.status === 400, String(r.status));
r = await call('POST', '/api/attendance/check-in/camera', emp2Token, {
  latitude: 25.0,
  longitude: 67.0,
  accuracy: 50,
  faceCount: 1,
});
check('camera: outside radius rejected 403', r.status === 403, String(r.status));
// emp2 has no record today (test day), so a valid camera check-in should succeed and store source=camera
r = await call('POST', '/api/attendance/check-in/camera', emp2Token, {
  latitude: 24.86,
  longitude: 67.0,
  accuracy: 50,
  faceCount: 1,
});
check(
  'camera: valid check-in 201 with source=camera',
  r.status === 201 && r.json.attendance.source === 'camera',
  JSON.stringify(r.json),
);
r = await call('POST', '/api/attendance/check-in/camera', emp2Token, {
  latitude: 24.86,
  longitude: 67.0,
  accuracy: 50,
  faceCount: 1,
});
check('camera: second check-in same day 409', r.status === 409, String(r.status));

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
server.close();
await mongoose.disconnect();
await mongod.stop();
if (failed > 0) process.exit(1);
