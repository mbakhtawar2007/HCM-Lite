// Phase 1 verification (Bugs and Broken Flows) against in-memory MongoDB.
// Extends — does not replace — test-p1/p2/p3/p4/demo. Covers every
// Phase 1 flow as Admin/HR/Employee, including the edge cases fixed in
// Phase 1 (see the per-check comments). Run: node test-phase1.mjs
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from './src/app.js';

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
const hasNaN = (v) => {
  if (typeof v === 'number') return Number.isNaN(v);
  if (Array.isArray(v)) return v.some(hasNaN);
  if (v && typeof v === 'object') return Object.values(v).some(hasNaN);
  return false;
};

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
    /* non-json (csv/pdf) */
  }
  return { status: res.status, json, text, headers: res.headers };
};
const login = async (email, pw) => (await call('POST', '/api/auth/login', null, { email, password: pw })).json.token;

// --- First-run setup: fresh only, locked afterwards ---
let r = await call('POST', '/api/setup', null, {
  companyName: 'Phase1 Co',
  adminName: 'Admin',
  adminEmail: 'admin@test.local',
  adminPassword: 'Admin123!',
});
check('setup-once 201', r.status === 201, JSON.stringify(r.json));
const adminToken = r.json.token;
r = await call('POST', '/api/setup', null, {
  companyName: 'Again',
  adminName: 'Second',
  adminEmail: 'x@test.local',
  adminPassword: 'Xxxxx123!',
});
check('repeat setup 403', r.status === 403, String(r.status));
r = await call('POST', '/api/auth/register', null, { name: 'x', email: 'x@test.local', password: 'Wrong123!' });
check('public register stays 404', r.status === 404, String(r.status));
r = await call('GET', '/api/setup/status');
check(
  'setup status needsSetup false after setup',
  r.status === 200 && r.json.needsSetup === false,
  JSON.stringify(r.json),
);

// --- Login / logout / change password / temp-password force ---
r = await call('POST', '/api/users', adminToken, {
  name: 'HR One',
  email: 'hr@test.local',
  password: 'TempHr123!',
  role: 'HR',
});
check('admin creates HR login', r.status === 201 && r.json.user.mustChangePassword === true, JSON.stringify(r.json));
let hrToken = await login('hr@test.local', 'TempHr123!');
check('HR temp login works, mustChangePassword true', !!hrToken, '');
r = await call('POST', '/api/auth/logout', hrToken);
check('logout 200 with token', r.status === 200, String(r.status));
r = await call('POST', '/api/auth/logout', null);
check('logout without token 401', r.status === 401, String(r.status));
r = await call('POST', '/api/auth/change-password', hrToken, {
  currentPassword: 'Wrong123!',
  newPassword: 'NewHr123!',
});
check('change-password rejects wrong current (403)', r.status === 403, String(r.status));
r = await call('POST', '/api/auth/change-password', hrToken, {
  currentPassword: 'TempHr123!',
  newPassword: 'NewHr123!',
});
check('change-password succeeds', r.status === 200, JSON.stringify(r.json));
hrToken = await login('hr@test.local', 'NewHr123!');
check(
  'login after change, mustChangePassword false',
  hrToken &&
    (await call('POST', '/api/auth/login', null, { email: 'hr@test.local', password: 'NewHr123!' })).json.user
      .mustChangePassword === false,
  '',
);

// --- Org: departments, designations, holidays, settings (read from DB) ---
r = await call('POST', '/api/org/departments', adminToken, { name: 'Engineering' });
check('admin creates department', r.status === 201, JSON.stringify(r.json));
const deptId = r.json.item._id;
r = await call('POST', '/api/org/designations', adminToken, { name: 'Engineer', department: deptId });
check('admin creates designation', r.status === 201, JSON.stringify(r.json));
const desigId = r.json.item._id;
r = await call('POST', '/api/org/holidays', adminToken, { date: '2026-12-25', name: 'Christmas' });
check('admin creates holiday', r.status === 201, JSON.stringify(r.json));
r = await call('POST', '/api/org/holidays', adminToken, { date: '2026-02-30', name: 'Impossible' });
check('strict calendar date: Feb 30 holiday rejected 400', r.status === 400, String(r.status));
r = await call('PATCH', '/api/org/settings', adminToken, { companyName: 'Phase1 Co Renamed' });
check(
  'settings save companyName (Phase 1 fix: was dropped by UI)',
  r.status === 200 && r.json.setting.companyName === 'Phase1 Co Renamed',
  JSON.stringify(r.json),
);
r = await call('GET', '/api/org/settings', hrToken);
check(
  'settings read back from DB',
  r.status === 200 &&
    r.json.setting.companyName === 'Phase1 Co Renamed' &&
    r.json.setting.officeStartMinutes === 540 &&
    r.json.setting.graceMinutes === 15,
  JSON.stringify(r.json),
);

// --- Employees: registration creates login, directory, 360, export, dry-run, import ---
async function makeEmployee(code, email, name, joining = '2026-10-01', salary = 100000) {
  const rr = await call('POST', '/api/employees', hrToken, {
    name,
    email,
    password: 'TempEmp123!',
    employeeCode: code,
    department: deptId,
    designation: desigId,
    joiningDate: joining,
    basicSalary: salary,
  });
  check(`HR registers employee ${code}`, rr.status === 201, JSON.stringify(rr.json));
  return rr.json.employee;
}
const emp1 = await makeEmployee('EMP101', 'one@test.local', 'One Person');
const emp2 = await makeEmployee('EMP102', 'two@test.local', 'Two Person');
await makeEmployee('EMP103', 'three@test.local', 'Three Person');
const future = await makeEmployee('EMP199', 'future@test.local', 'Future Person', '2026-12-01');
async function loginChanged(email, tempPw) {
  const temp = await login(email, tempPw);
  await call('POST', '/api/auth/change-password', temp, { currentPassword: tempPw, newPassword: 'NewEmp123!' });
  return login(email, 'NewEmp123!');
}
const e1Token = await loginChanged('one@test.local', 'TempEmp123!');
const e2Token = await loginChanged('two@test.local', 'TempEmp123!');
const e3Token = await loginChanged('three@test.local', 'TempEmp123!');
r = await call('GET', '/api/employees?q=Two', hrToken);
check(
  'directory server search',
  r.status === 200 && r.json.employees.length === 1 && r.json.employees[0].employeeCode === 'EMP102',
  JSON.stringify(r.json),
);
r = await call('GET', '/api/employees?page=2&limit=1', hrToken);
check(
  'directory pagination page 2 of 4, not truncated',
  r.status === 200 && r.json.total === 4 && r.json.pages === 4 && r.json.employees.length === 1,
  JSON.stringify(r.json),
);
r = await call('GET', `/api/employees/${emp1._id}/360`, e1Token);
check('employee can view own 360', r.status === 200, String(r.status));
r = await call('GET', `/api/employees/${emp2._id}/360`, e1Token);
check('employee 360 scope 403 on other', r.status === 403, String(r.status));
r = await call('PATCH', `/api/employees/${emp1._id}`, hrToken, { name: 'One Renamed' });
check(
  'HR name edit reaches the User record (Phase 1 fix: was silently dropped)',
  r.status === 200,
  JSON.stringify(r.json),
);
r = await call('GET', `/api/employees/${emp1._id}/360`, hrToken);
check(
  'renamed employee shows new name in 360',
  r.json.employee.user.name === 'One Renamed',
  JSON.stringify(r.json.employee.user),
);
r = await call('GET', '/api/employees/export/csv', hrToken);
check(
  'CSV export has header + EMP101',
  r.status === 200 && r.text.includes('employeeCode') && r.text.includes('EMP101'),
  r.text.slice(0, 200),
);
const csvText =
  'name,email,employeecode,department,joiningdate,basicsalary\n' +
  'New Person,new@test.local,EMP201,Engineering,2026-10-05,90000\n' +
  'Bad Person,bad@test.local,EMP202,Engineering,2026-10-05,not-a-number\n' +
  'Dup Person,one@test.local,EMP203,Engineering,2026-10-05,90000\n';
r = await call('POST', '/api/employees/import/dry-run', hrToken, { csv: csvText });
check(
  'dry-run reports row+field+reason, writes nothing',
  r.status === 200 &&
    r.json.validRows === 1 &&
    r.json.totalRows === 3 &&
    r.json.errors.some((e) => e.row === 3 && e.field === 'basicSalary') &&
    r.json.errors.some((e) => e.row === 4 && e.field === 'email'),
  JSON.stringify(r.json),
);
r = await call('GET', '/api/employees?q=New Person', hrToken);
check('dry-run wrote nothing', r.json.employees.length === 0, JSON.stringify(r.json));
r = await call('POST', '/api/employees/import', hrToken, { csv: csvText });
check(
  'CSV import writes valid rows only, reports per-row outcome',
  r.status === 200 &&
    r.json.createdRows === 1 &&
    r.json.results.some((x) => x.employeeCode === 'EMP201' && x.status === 'created'),
  JSON.stringify(r.json),
);
r = await call('GET', '/api/employees?q=New Person', hrToken);
check('imported employee exists in directory', r.json.employees.length === 1, JSON.stringify(r.json));
r = await call('POST', '/api/employees/import/dry-run', hrToken, { csv: csvText });
check(
  're-import dry-run now flags EMP201 as duplicate',
  r.json.errors.some((e) => e.field === 'employeeCode'),
  JSON.stringify(r.json),
);

// --- Attendance: server timestamps, second check-in 409, corrections ---
r = await call('POST', '/api/attendance/check-in', e1Token);
check('first check-in 201', r.status === 201, JSON.stringify(r.json));
r = await call('POST', '/api/attendance/check-in', e1Token);
check('second check-in 409', r.status === 409, String(r.status));
r = await call('POST', '/api/attendance/check-out', e1Token);
check('check-out 200', r.status === 200, JSON.stringify(r.json));
r = await call('POST', '/api/attendance/check-out', e1Token);
check('second check-out 409', r.status === 409, String(r.status));
r = await call('POST', '/api/attendance/corrections', e1Token, {
  attendanceId: (await call('GET', '/api/attendance/me', e1Token)).json.attendance[0]._id,
  reason: 'Forgot to check out on time',
});
check('correction without requested time rejected 400 (server rule)', r.status === 400, String(r.status));
const attId = (await call('GET', '/api/attendance/me', e1Token)).json.attendance[0]._id;
const today = new Date().toISOString().slice(0, 10);
r = await call('POST', '/api/attendance/corrections', e1Token, {
  attendanceId: attId,
  reason: 'Wrong check-out time',
  requestedCheckOut: `${today}T18:00:00.000Z`,
});
check(
  'correction with requested time accepted (Phase 1 fix: UI now sends it)',
  r.status === 201,
  JSON.stringify(r.json),
);
const corrId = r.json.correction._id;
r = await call('PATCH', `/api/attendance/corrections/${corrId}`, hrToken, { status: 'APPROVED' });
check('HR approves correction', r.status === 200 && r.json.correction.status === 'APPROVED', JSON.stringify(r.json));
r = await call('GET', `/api/attendance?employeeId=${emp1._id}`, hrToken);
check(
  'approved correction applied the requested check-out',
  r.json.attendance.some((a) => new Date(a.checkOut).toISOString().startsWith(`${today}T18:00`)),
  JSON.stringify(r.json.attendance),
);

// --- Geofence: location check only when office location is set ---
r = await call('POST', '/api/attendance/check-in', e2Token, { latitude: 24.86 });
check('check-in with latitude only rejected 400', r.status === 400, String(r.status));
r = await call('PATCH', '/api/org/settings', adminToken, {
  officeLat: 24.86,
  officeLng: 67.0,
  officeRadiusMeters: 150,
});
check(
  'admin sets office location + radius',
  r.status === 200 && r.json.setting.officeLat === 24.86,
  JSON.stringify(r.json),
);
r = await call('POST', '/api/attendance/check-in', e2Token);
check('geofence on: check-in without location rejected 400', r.status === 400, String(r.status));
r = await call('POST', '/api/attendance/check-in', e2Token, { latitude: 24.9, longitude: 67.1 });
check('geofence on: check-in outside radius rejected 403', r.status === 403, String(r.status));
r = await call('POST', '/api/attendance/check-in', e3Token, { latitude: 24.86, longitude: 67.0 });
check('geofence on: check-in inside radius succeeds', r.status === 201, JSON.stringify(r.json));
r = await call('PATCH', '/api/org/settings', adminToken, { officeLat: null, officeLng: null });
check('admin clears office location', r.status === 200 && r.json.setting.officeLat === null, JSON.stringify(r.json));
r = await call('POST', '/api/attendance/check-in', e2Token);
check('no office location set: check-in without location works (fallback)', r.status === 201, JSON.stringify(r.json));

// --- Leave: working days, 422 overlap/over-balance, cancel pending-only, balances, HR decisions ---
const types = (await call('GET', '/api/org/leave-types', hrToken)).json.items;
const annualId = types.find((t) => t.code === 'ANNUAL')._id;
const casualId = types.find((t) => t.code === 'CASUAL')._id;
r = await call('POST', '/api/leaves', e1Token, {
  leaveType: annualId,
  startDate: '2026-10-23',
  endDate: '2026-10-26',
  reason: 'Family event',
});
check(
  'leave Fri-Mon counts 2 working days (weekend skipped)',
  r.status === 201 && r.json.leave.workingDays === 2,
  JSON.stringify(r.json),
);
const leaveOct = r.json.leave._id;
r = await call('POST', '/api/leaves', e1Token, {
  leaveType: annualId,
  startDate: '2026-10-26',
  endDate: '2026-10-27',
  reason: 'Overlap',
});
check('overlapping leave 422', r.status === 422, String(r.status));
r = await call('POST', '/api/leaves', e1Token, {
  leaveType: annualId,
  startDate: '2026-11-02',
  endDate: '2026-11-20',
  reason: 'Too long',
});
check('over-balance leave 422 (15 weekdays > quota 14)', r.status === 422, String(r.status));
r = await call('POST', '/api/leaves', e1Token, {
  leaveType: annualId,
  startDate: '2026-02-30',
  endDate: '2026-03-01',
  reason: 'Bad date',
});
check('strict calendar date: Feb 30 leave rejected 400', r.status === 400, String(r.status));
r = await call('PATCH', `/api/leaves/${leaveOct}/decision`, hrToken, { status: 'APPROVED', comment: 'Enjoy' });
check('HR approves leave with comment', r.status === 200 && r.json.leave.status === 'APPROVED', JSON.stringify(r.json));
r = await call('GET', '/api/notifications', e1Token);
check(
  'employee notified of leave decision',
  r.status === 200 && r.json.notifications.some((n) => n.type === 'LEAVE_DECISION'),
  JSON.stringify(r.json.notifications),
);
r = await call('PATCH', `/api/leaves/${leaveOct}/cancel`, e1Token);
check('cancel approved leave rejected 409 (pending-only rule kept)', r.status === 409, String(r.status));
r = await call('POST', '/api/leaves', e1Token, {
  leaveType: casualId,
  startDate: '2026-11-23',
  endDate: '2026-11-24',
  reason: 'Errand',
});
const leaveCas = r.json.leave._id;
r = await call('PATCH', `/api/leaves/${leaveCas}/cancel`, e1Token);
check('cancel pending leave succeeds', r.status === 200 && r.json.leave.status === 'CANCELLED', JSON.stringify(r.json));
r = await call('POST', '/api/leaves', e1Token, {
  leaveType: annualId,
  startDate: '2026-11-25',
  endDate: '2026-11-26',
  reason: 'Rest',
});
const leaveNov = r.json.leave._id;
r = await call('PATCH', `/api/leaves/${leaveNov}/decision`, hrToken, { status: 'APPROVED' });
check('HR approves second leave', r.status === 200, JSON.stringify(r.json));
r = await call('GET', `/api/leaves/balances?year=2026&employeeId=${emp1._id}`, hrToken);
const annBal = r.json.balances.find((b) => b.leaveType.code === 'ANNUAL');
check(
  '2026 annual balance: used 4 (2+2), remaining 10',
  annBal && annBal.used === 4 && annBal.remaining === 10,
  JSON.stringify(r.json.balances),
);
// Cross-year leave: Dec 31 2026 (Thu) + Jan 1 2027 (Fri) = 2 working days,
// 1 in each year — previously charged 2 in both years.
r = await call('POST', '/api/leaves', e2Token, {
  leaveType: annualId,
  startDate: '2026-12-31',
  endDate: '2027-01-02',
  reason: 'New year',
});
check(
  'cross-year leave counts 2 working days total',
  r.status === 201 && r.json.leave.workingDays === 2,
  JSON.stringify(r.json),
);
const leaveXY = r.json.leave._id;
r = await call('PATCH', `/api/leaves/${leaveXY}/decision`, hrToken, { status: 'APPROVED' });
check('HR approves cross-year leave', r.status === 200, JSON.stringify(r.json));
r = await call('GET', `/api/leaves/balances?year=2026&employeeId=${emp2._id}`, hrToken);
check(
  '2026 balance counts only the 2026 portion (1, not 2)',
  r.json.balances.find((b) => b.leaveType.code === 'ANNUAL').used === 1,
  JSON.stringify(r.json.balances),
);
r = await call('GET', `/api/leaves/balances?year=2027&employeeId=${emp2._id}`, hrToken);
check(
  '2027 balance counts only the 2027 portion (1, not 2)',
  r.json.balances.find((b) => b.leaveType.code === 'ANNUAL').used === 1,
  JSON.stringify(r.json.balances),
);
r = await call('GET', '/api/dashboards/employee', e2Token);
check(
  'employee dashboard balances agree with per-year counting (used 1)',
  r.json.leaveBalances.find((b) => b.leaveType.code === 'ANNUAL').used === 1,
  JSON.stringify(r.json.leaveBalances),
);

// --- Payroll: draft, duplicate month, finalize-only-Admin, lock, PDF, zero-day exclusion, draft leak ---
r = await call('POST', '/api/payroll/runs', hrToken, { month: '2026-11' });
check('HR creates Nov draft run', r.status === 201, JSON.stringify(r.json));
r = await call('GET', `/api/employees/${emp1._id}/360`, e1Token);
check(
  'employee 360 hides DRAFT payslips (Phase 1 fix: was leaking)',
  !r.json.payslips.some((p) => p.month === '2026-11'),
  JSON.stringify(r.json.payslips),
);
r = await call('GET', `/api/employees/${emp1._id}/360`, hrToken);
check(
  'staff 360 still shows drafts for review',
  r.json.payslips.some((p) => p.month === '2026-11'),
  JSON.stringify(r.json.payslips),
);
r = await call('POST', '/api/payroll/runs', hrToken, { month: '2026-10' });
check('HR creates Oct draft run', r.status === 201, JSON.stringify(r.json));
const octRunId = r.json.run._id;
check(
  'Oct run excludes employee not yet joined in Oct (Phase 1 fix: was negative net)',
  !r.json.run.lines.some((l) => String(l.employee) === String(future._id)) &&
    r.json.run.lines.some((l) => String(l.employee) === String(emp1._id)),
  JSON.stringify(r.json.run.lines.map((l) => l.employee)),
);
r = await call('POST', '/api/payroll/runs', hrToken, { month: '2026-10' });
check('duplicate payroll month 409', r.status === 409, String(r.status));
r = await call('POST', '/api/payroll/runs', hrToken, { month: '2026-13' });
check('payroll month 13 rejected 400', r.status === 400, String(r.status));
r = await call('POST', `/api/payroll/runs/${octRunId}/finalize`, hrToken);
check('HR cannot finalize (403, Admin only)', r.status === 403, String(r.status));
r = await call('POST', `/api/payroll/runs/${octRunId}/finalize`, adminToken);
check('Admin finalizes', r.status === 200 && r.json.run.status === 'FINALIZED', JSON.stringify(r.json));
r = await call('POST', `/api/payroll/runs/${octRunId}/recompute`, hrToken);
check('finalized run locked: recompute 409', r.status === 409, String(r.status));
r = await call('GET', `/api/employees/${emp1._id}/360`, e1Token);
check(
  'employee 360 shows FINALIZED Oct payslip',
  r.json.payslips.some((p) => p.month === '2026-10' && p.status === 'FINALIZED'),
  JSON.stringify(r.json.payslips),
);
r = await call('GET', `/api/payroll/runs/${octRunId}/payslip/${emp1._id}/pdf`, e1Token);
check(
  'finalized payslip PDF 200, application/pdf',
  r.status === 200 && String(r.headers.get('content-type')).includes('pdf'),
  String(r.headers.get('content-type')),
);
r = await call('GET', '/api/notifications', e1Token);
check(
  'employee notified of payslip finalization',
  r.json.notifications.some((n) => n.type === 'PAYSLIP_AVAILABLE'),
  JSON.stringify(r.json.notifications),
);

// --- Announcements, audit log, dashboards ---
r = await call('POST', '/api/announcements', hrToken, { title: 'Phase1 note', body: 'Hello team' });
check('HR posts announcement', r.status === 201, JSON.stringify(r.json));
const annId = r.json.announcement._id;
r = await call('GET', '/api/announcements', e1Token);
check(
  'employee reads announcements',
  r.status === 200 && r.json.announcements.some((a) => String(a._id) === String(annId)),
  JSON.stringify(r.json),
);
r = await call('DELETE', `/api/announcements/${annId}`, hrToken);
check('HR cannot delete announcement (403, Admin only)', r.status === 403, String(r.status));
r = await call('DELETE', `/api/announcements/${annId}`, adminToken);
check('Admin deletes announcement', r.status === 200, String(r.status));
r = await call('GET', '/api/audit-logs?entity=Employee&action=CREATE', adminToken);
check(
  'audit log Admin read: actor/action/entity/before/after present',
  r.status === 200 &&
    r.json.logs.length > 0 &&
    r.json.logs.every(
      (l) => l.entity === 'Employee' && l.action === 'CREATE' && l.actor && 'before' in l && 'after' in l,
    ),
  JSON.stringify(r.json.logs).slice(0, 300),
);
r = await call('GET', '/api/audit-logs', hrToken);
check('HR cannot read audit logs (403)', r.status === 403, String(r.status));
r = await call('GET', `/api/dashboards/admin?from=2026-10-01&to=2026-10-31&department=${deptId}`, adminToken);
check(
  'admin dashboard with date-range + department filter, no NaN',
  r.status === 200 && !hasNaN(r.json) && r.json.headcount >= 4,
  JSON.stringify(r.json).slice(0, 300),
);
r = await call('GET', '/api/dashboards/hr?from=2020-01-01&to=2020-01-31', hrToken);
check(
  'empty-range HR dashboard: rates null (never NaN), no NaN anywhere',
  r.status === 200 && r.json.attendanceRate === null && r.json.lateRate === null && !hasNaN(r.json),
  JSON.stringify(r.json).slice(0, 300),
);
r = await call('GET', '/api/dashboards/admin', e1Token);
check('employee cannot read admin dashboard (403)', r.status === 403, String(r.status));

console.log(`\nPhase 1: ${passed} passed, ${failed} failed`);
await mongoose.disconnect();
await mongod.stop();
server.close();
process.exit(failed ? 1 : 0);
