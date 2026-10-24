// P4 verification against in-memory MongoDB. No real secrets, no live DB.
// Run: node test-p4.mjs
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from './src/app.js';
import { AuditLog } from './src/models/AuditLog.js';
import { Notification } from './src/models/Notification.js';
import { User } from './src/models/User.js';

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
    /* non-json */
  }
  return { status: res.status, json, text };
};
const audit = async (action, entity) => AuditLog.findOne({ action, entity }).sort({ createdAt: -1 });

// --- Setup: admin, HR, dept, two employees ---
let r = await call('POST', '/api/setup', null, {
  companyName: 'Test Co',
  adminName: 'Admin',
  adminEmail: 'admin@test.local',
  adminPassword: 'Admin123!',
});
check('setup creates admin', r.status === 201, JSON.stringify(r.json));
const adminToken = r.json.token;
r = await call('POST', '/api/users', adminToken, {
  name: 'HR One',
  email: 'hr@test.local',
  password: 'TempHr123!',
  role: 'HR',
});
check('admin creates HR (audit CREATE User)', r.status === 201, JSON.stringify(r.json));
const hrId = r.json.user._id;
let a = await audit('CREATE', 'User');
check(
  'audit CREATE User: before null, after has name/email',
  !!a && a.before === null && a.after?.email === 'hr@test.local',
  JSON.stringify(a),
);
r = await call('POST', '/api/auth/login', null, { email: 'hr@test.local', password: 'TempHr123!' });
const hrTempToken = r.json.token;
// Phase 2: temp tokens cannot create employees, so change first.
await call('POST', '/api/auth/change-password', hrTempToken, {
  currentPassword: 'TempHr123!',
  newPassword: 'NewHr123!',
});
r = await call('POST', '/api/auth/login', null, { email: 'hr@test.local', password: 'NewHr123!' });
const hrToken = r.json.token;
r = await call('POST', '/api/org/departments', adminToken, { name: 'Engineering' });
const deptId = r.json.item._id;
r = await call('POST', '/api/org/designations', adminToken, { name: 'Engineer', department: deptId });
const desigId = r.json.item._id;
async function makeEmployee(code, email, name) {
  const rr = await call('POST', '/api/employees', hrToken, {
    name,
    email,
    password: 'TempEmp123!',
    employeeCode: code,
    department: deptId,
    designation: desigId,
    joiningDate: '2026-01-05',
    basicSalary: 100000,
  });
  if (rr.status !== 201) throw new Error(`employee create failed: ${JSON.stringify(rr.json)}`);
  const login = await call('POST', '/api/auth/login', null, { email, password: 'TempEmp123!' });
  await call('POST', '/api/auth/change-password', login.json.token, {
    currentPassword: 'TempEmp123!',
    newPassword: 'NewEmp123!',
  });
  const login2 = await call('POST', '/api/auth/login', null, { email, password: 'NewEmp123!' });
  return {
    id: rr.json.employee._id,
    userId: rr.json.employee.user._id || rr.json.employee.user,
    token: login2.json.token,
  };
}
const empA = await makeEmployee('E001', 'empA@test.local', 'Emp A');
const empB = await makeEmployee('E002', 'empB@test.local', 'Emp B');

// --- Audit: update (user rename) ---
r = await call('PATCH', `/api/users/${hrId}`, adminToken, { name: 'HR Renamed' });
check('admin renames HR', r.status === 200, JSON.stringify(r.json));
a = await audit('UPDATE', 'User');
check(
  'audit UPDATE User: before old name, after new name',
  !!a && a.before?.name === 'HR One' && a.after?.name === 'HR Renamed',
  JSON.stringify(a),
);

// --- Audit: change-password (no password values logged) ---
// (HR already changed TempHr123! -> NewHr123! above, Phase 2 flow;
// this second change proves the audit entry contains no password.)
r = await call('POST', '/api/auth/change-password', hrToken, {
  currentPassword: 'NewHr123!',
  newPassword: 'NewHr123!x',
});
check('HR change-password succeeds', r.status === 200, JSON.stringify(r.json));
a = await AuditLog.findOne({ action: 'UPDATE', entity: 'User' }).sort({ createdAt: -1 });
check(
  'audit change-password logs no password value',
  !!a && !JSON.stringify(a.after).toLowerCase().includes('newhr123'),
  JSON.stringify(a.after),
);
r = await call('POST', '/api/auth/login', null, { email: 'hr@test.local', password: 'NewHr123!x' });
const hrToken2 = r.json.token;

// --- Audit: employee self-update ---
r = await call('PATCH', `/api/employees/${empA.id}`, empA.token, { phone: '0300-1111111' });
check('employee self phone update succeeds', r.status === 200, JSON.stringify(r.json));
a = await audit('UPDATE', 'Employee');
check(
  'audit UPDATE Employee (self edit): before/after present',
  !!a && a.before && a.after?.phone === '0300-1111111',
  JSON.stringify(a),
);

// --- Audit: attendance check-in / check-out, correction request ---
r = await call('POST', '/api/attendance/check-in', empA.token);
check('employee check-in', r.status === 201, JSON.stringify(r.json));
const attId = r.json.attendance._id;
r = await call('POST', '/api/attendance/check-out', empA.token);
check('employee check-out', r.status === 200, JSON.stringify(r.json));
a = await audit('UPDATE', 'Attendance');
check(
  'audit UPDATE Attendance on check-out: before no checkOut, after has checkOut',
  !!a && !a.before?.checkOut && !!a.after?.checkOut,
  JSON.stringify(a),
);
r = await call('POST', '/api/attendance/corrections', empA.token, {
  attendanceId: attId,
  requestedCheckIn: '2026-01-05T09:00:00.000Z',
  reason: 'Forgot to check in on time',
});
check('correction request succeeds', r.status === 201, JSON.stringify(r.json));
a = await audit('CREATE', 'AttendanceCorrection');
check('audit CREATE AttendanceCorrection', !!a && a.after?.reason === 'Forgot to check in on time', JSON.stringify(a));

// --- Leave: apply, decide (approval audit + notification), cancel (audit) ---
r = await call('GET', '/api/org/leave-types', hrToken2);
const annual = r.json.items.find((t) => t.code === 'ANNUAL' || t.name.toLowerCase().includes('annual'));
r = await call('POST', '/api/leaves', empA.token, {
  leaveType: annual._id,
  startDate: '2026-11-02',
  endDate: '2026-11-03',
  reason: 'Family wedding',
});
check('employee applies leave', r.status === 201, JSON.stringify(r.json));
const leaveId = r.json.leave._id;
r = await call('PATCH', `/api/leaves/${leaveId}/decision`, hrToken2, { status: 'APPROVED', comment: 'Enjoy' });
check('HR approves leave', r.status === 200, JSON.stringify(r.json));
a = await audit('DECIDE', 'LeaveRequest');
check(
  'audit DECIDE LeaveRequest: before PENDING, after APPROVED',
  !!a && a.before?.status === 'PENDING' && a.after?.status === 'APPROVED',
  JSON.stringify(a),
);
let note = await Notification.findOne({ user: empA.userId, type: 'LEAVE_DECISION' });
check(
  'notification created on leave decision (own user)',
  !!note && note.message.includes('approved'),
  JSON.stringify(note),
);
r = await call('POST', '/api/leaves', empA.token, {
  leaveType: annual._id,
  startDate: '2026-11-09',
  endDate: '2026-11-10',
  reason: 'Rest',
});
const leave2Id = r.json.leave._id;
r = await call('PATCH', `/api/leaves/${leave2Id}/cancel`, empA.token);
check('employee cancels pending leave', r.status === 200, JSON.stringify(r.json));
a = await AuditLog.findOne({ action: 'UPDATE', entity: 'LeaveRequest' }).sort({ createdAt: -1 });
check(
  'audit UPDATE LeaveRequest on cancel: after CANCELLED',
  !!a && a.after?.status === 'CANCELLED',
  JSON.stringify(a),
);

// --- Payroll: create, recompute (audit), finalize (audit + payslip notifications), delete draft (audit) ---
r = await call('POST', '/api/payroll/runs', hrToken2, { month: '2026-10' });
check('payroll run created', r.status === 201, JSON.stringify(r.json));
const runId = r.json.run._id;
r = await call('POST', '/api/payroll/runs', hrToken2, { month: '2026-09' });
const run2Id = r.json.run._id;
r = await call('POST', `/api/payroll/runs/${run2Id}/recompute`, hrToken2);
check('payroll recompute succeeds', r.status === 200, JSON.stringify(r.json));
a = await audit('UPDATE', 'PayrollRun');
check('audit UPDATE PayrollRun on recompute', !!a && a.before && a.after, JSON.stringify(a));
r = await call('POST', `/api/payroll/runs/${runId}/finalize`, adminToken);
check('admin finalizes payroll', r.status === 200, JSON.stringify(r.json));
a = await audit('FINALIZE', 'PayrollRun');
check(
  'audit FINALIZE PayrollRun: before DRAFT, after FINALIZED',
  !!a && a.before?.status === 'DRAFT' && a.after?.status === 'FINALIZED',
  JSON.stringify(a),
);
note = await Notification.findOne({ user: empA.userId, type: 'PAYSLIP_AVAILABLE' });
check(
  'notification created on payroll finalization (payslip)',
  !!note && note.message.includes('2026-10'),
  JSON.stringify(note),
);
r = await call('DELETE', `/api/payroll/runs/${run2Id}`, hrToken2);
check('draft payroll run deleted', r.status === 200, JSON.stringify(r.json));
a = await audit('DELETE', 'PayrollRun');
check('audit DELETE PayrollRun: before present, after null', !!a && a.before && a.after === null, JSON.stringify(a));

// --- Audit immutability + filters + non-admin read ---
const anyLog = await AuditLog.findOne();
r = await call('PATCH', `/api/audit-logs/${anyLog._id}`, adminToken, { action: 'FAKE' });
check('audit update attempt fails 404 (no route)', r.status === 404, String(r.status));
r = await call('DELETE', `/api/audit-logs/${anyLog._id}`, adminToken);
check('audit delete attempt fails 404 (no route)', r.status === 404, String(r.status));
r = await call('GET', '/api/audit-logs', hrToken2);
check('HR cannot read audit logs (403)', r.status === 403, String(r.status));
r = await call('GET', '/api/audit-logs?entity=Employee&action=CREATE', adminToken);
check(
  'audit filter entity+action: all match',
  r.status === 200 && r.json.logs.every((l) => l.entity === 'Employee' && l.action === 'CREATE'),
  JSON.stringify(r.json).slice(0, 200),
);
r = await call('GET', '/api/audit-logs?actor=admin@test.local', adminToken);
const adminUser = await User.findOne({ email: 'admin@test.local' });
check(
  'audit filter actor email: all by admin',
  r.status === 200 &&
    r.json.logs.length > 0 &&
    r.json.logs.every((l) => String(l.actor?._id || l.actor) === String(adminUser._id)),
  JSON.stringify(r.json).slice(0, 200),
);
const today = new Date().toISOString().slice(0, 10);
r = await call('GET', `/api/audit-logs?from=${today}&to=${today}`, adminToken);
check(
  'audit filter date range today: entries found',
  r.status === 200 && r.json.total > 0,
  JSON.stringify(r.json).slice(0, 200),
);
r = await call('GET', '/api/audit-logs?page=1&limit=2', adminToken);
check(
  'audit paging: limit honoured, pages reported',
  r.status === 200 && r.json.logs.length <= 2 && r.json.pages >= 1,
  JSON.stringify(r.json).slice(0, 200),
);

// --- Announcements ---
r = await call('POST', '/api/announcements', adminToken, { title: 'Office closed', body: 'Office closed Friday.' });
check('admin posts announcement', r.status === 201, JSON.stringify(r.json));
a = await audit('CREATE', 'Announcement');
check('audit CREATE Announcement', !!a && a.after?.title === 'Office closed', JSON.stringify(a));
r = await call('POST', '/api/announcements', hrToken2, { title: 'HR note', body: 'Submit leaves early.' });
check('HR posts announcement', r.status === 201, JSON.stringify(r.json));
const annHrId = r.json.announcement._id;
r = await call('POST', '/api/announcements', empA.token, { title: 'Nope', body: 'Should fail.' });
check('employee cannot post announcement (403)', r.status === 403, String(r.status));
for (const [label, tok] of [
  ['admin', adminToken],
  ['HR', hrToken2],
  ['employee', empA.token],
]) {
  r = await call('GET', '/api/announcements', tok);
  check(
    `${label} can read announcements`,
    r.status === 200 && r.json.announcements.length === 2,
    JSON.stringify(r.json).slice(0, 200),
  );
}
r = await call('GET', '/api/dashboards/employee', empA.token);
check(
  'employee dashboard includes announcements',
  r.status === 200 && Array.isArray(r.json.announcements) && r.json.announcements.length === 2,
  JSON.stringify(r.json.announcements),
);
r = await call('DELETE', `/api/announcements/${annHrId}`, hrToken2);
check('HR cannot delete announcement (403)', r.status === 403, String(r.status));
r = await call('DELETE', `/api/announcements/${annHrId}`, adminToken);
check('admin deletes announcement', r.status === 200, JSON.stringify(r.json));
a = await audit('DELETE', 'Announcement');
check('audit DELETE Announcement: before present, after null', !!a && a.before && a.after === null, JSON.stringify(a));
r = await call('GET', '/api/announcements', adminToken);
check(
  'deleted announcement no longer listed',
  r.status === 200 && r.json.announcements.every((x) => String(x._id) !== String(annHrId)),
  JSON.stringify(r.json),
);

// --- Notifications: own-only list and mark-read ---
r = await call('GET', '/api/notifications', empA.token);
check(
  'employee A notification list is own only',
  r.status === 200 && r.json.notifications.every((n) => String(n.user) === String(empA.userId)),
  JSON.stringify(r.json).slice(0, 300),
);
// B's notification id (B got a payslip notification from the finalized run)
const noteB = await Notification.findOne({ user: empB.userId, type: 'PAYSLIP_AVAILABLE' });
r = await call('PATCH', `/api/notifications/${noteB._id}/read`, empA.token);
check("employee A cannot mark B's notification read (403)", r.status === 403, String(r.status));
r = await call('PATCH', `/api/notifications/${noteB._id}/read`, empB.token);
check(
  'employee B marks own notification read',
  r.status === 200 && r.json.notification.isRead === true,
  JSON.stringify(r.json),
);

// --- Security: scope and unauthenticated ---
r = await call('GET', '/api/org/settings', empA.token);
check('employee cannot read org settings (403)', r.status === 403, String(r.status));
r = await call('GET', `/api/employees/${empB.id}/360`, empA.token);
check("employee cannot read another employee's 360 (403)", r.status === 403, String(r.status));
r = await call('GET', `/api/dashboards/employee?employeeId=${empB.id}`, empA.token);
check("employee cannot read another employee's dashboard (403)", r.status === 403, String(r.status));
r = await call('POST', '/api/auth/register', null, { name: 'x', email: 'x@test.local', password: 'Wrong123!' });
check('public register stays 404', r.status === 404, String(r.status));
for (const [label, method, path] of [
  ['announcements', 'GET', '/api/announcements'],
  ['audit-logs', 'GET', '/api/audit-logs'],
  ['dashboards/admin', 'GET', '/api/dashboards/admin'],
  ['employees', 'GET', '/api/employees'],
  ['notifications', 'GET', '/api/notifications'],
  ['announcement post', 'POST', '/api/announcements'],
]) {
  r = await call(method, path, null, method === 'POST' ? { title: 'x', body: 'y' } : undefined);
  check(`unauthenticated ${label} returns 401`, r.status === 401, `${label} -> ${r.status}`);
}

console.log(`\nP4: ${passed} passed, ${failed} failed`);
await mongoose.disconnect();
await mongod.stop();
server.close();
process.exit(failed ? 1 : 0);
