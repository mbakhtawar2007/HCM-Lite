// Phase 2 verification (Security and RBAC hardening) against in-memory MongoDB.
// Tests by calling the API directly as the wrong role / another employee —
// never through the UI. Run: node test-phase2.mjs
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from './src/app.js';

let passed = 0; let failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.log(`FAIL ${name} ${detail}`); }
};

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, path, token, body, extraHeaders = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* non-json */ }
  return { status: res.status, json, text, headers: res.headers };
};
const login = async (email, pw) => (await call('POST', '/api/auth/login', null, { email, password: pw })).json.token;
async function loginChanged(email, tempPw, newPw = 'NewEmp123!') {
  const temp = await login(email, tempPw);
  await call('POST', '/api/auth/change-password', temp, { currentPassword: tempPw, newPassword: newPw });
  return login(email, newPw);
}

// --- Setup + HR + employees ---
let r = await call('POST', '/api/setup', null, { companyName: 'Phase2 Co', adminName: 'Admin', adminEmail: 'admin@test.local', adminPassword: 'Admin123!' });
check('setup 201', r.status === 201, JSON.stringify(r.json));
const adminToken = r.json.token;
r = await call('POST', '/api/users', adminToken, { name: 'HR One', email: 'hr@test.local', password: 'TempHr123!', role: 'HR' });
check('admin creates HR', r.status === 201, JSON.stringify(r.json));
const hrUserId = r.json.user._id;
const hrToken = await loginChanged('hr@test.local', 'TempHr123!', 'HrNew123!');
check('HR changed-password token works', !!hrToken, '');
r = await call('POST', '/api/org/departments', adminToken, { name: 'Engineering' });
const deptId = r.json.item._id;
r = await call('POST', '/api/org/designations', adminToken, { name: 'Engineer', department: deptId });
const desigId = r.json.item._id;
async function makeEmployee(code, email, name) {
  const rr = await call('POST', '/api/employees', hrToken, {
    name, email, password: 'TempEmp123!', employeeCode: code, department: deptId, designation: desigId,
    joiningDate: '2026-10-01', basicSalary: 100000,
  });
  check(`HR registers ${code}`, rr.status === 201, JSON.stringify(rr.json));
  return rr.json.employee;
}
const empA = await makeEmployee('EMP101', 'a@test.local', 'Emp A');
const empB = await makeEmployee('EMP102', 'b@test.local', 'Emp B');
const empAUserId = empA.user._id || empA.user;
const empBUserId = empB.user._id || empB.user;
const aToken = await loginChanged('a@test.local', 'TempEmp123!');
const bToken = await loginChanged('b@test.local', 'TempEmp123!');

// --- Unauthenticated ---
r = await call('GET', '/api/employees');
check('no token 401 on employees', r.status === 401, String(r.status));
r = await call('GET', '/api/audit-logs');
check('no token 401 on audit logs', r.status === 401, String(r.status));
r = await call('GET', '/api/org/settings');
check('no token 401 on settings', r.status === 401, String(r.status));

// --- Wrong-role 403s ---
r = await call('POST', '/api/users', hrToken, { name: 'Fake Admin', email: 'fake@test.local', password: 'Fake12345!', role: 'ADMIN' });
check('HR cannot create users (incl. Admin) 403', r.status === 403, String(r.status));
r = await call('PATCH', '/api/org/settings', hrToken, { companyName: 'Hijacked' });
check('HR cannot change settings 403', r.status === 403, String(r.status));
r = await call('POST', '/api/org/departments', hrToken, { name: 'Nope' });
check('HR cannot create departments 403', r.status === 403, String(r.status));
r = await call('GET', '/api/audit-logs', hrToken);
check('HR cannot read audit logs 403', r.status === 403, String(r.status));
r = await call('GET', '/api/dashboards/admin', aToken);
check('employee cannot read admin dashboard 403', r.status === 403, String(r.status));
r = await call('GET', '/api/employees', aToken);
check('employee cannot list employees 403', r.status === 403, String(r.status));
r = await call('GET', '/api/org/settings', aToken);
check('employee cannot read settings 403', r.status === 403, String(r.status));
r = await call('GET', '/api/payroll/runs', aToken);
check('employee cannot list payroll runs 403', r.status === 403, String(r.status));
r = await call('POST', '/api/payroll/runs', hrToken, { month: '2026-10' });
check('HR can create draft payroll run', r.status === 201, JSON.stringify(r.json));
const runId = r.json.run._id;
r = await call('POST', `/api/payroll/runs/${runId}/finalize`, hrToken);
check('HR cannot finalize payroll 403', r.status === 403, String(r.status));
r = await call('POST', `/api/payroll/runs/${runId}/finalize`, adminToken);
check('Admin finalizes payroll', r.status === 200, JSON.stringify(r.json));
r = await call('POST', `/api/payroll/runs/${runId}/recompute`, hrToken);
check('finalized run recompute locked 409', r.status === 409, String(r.status));
r = await call('POST', `/api/payroll/runs/${runId}/recompute`, adminToken);
check('Admin also cannot recompute finalized run 409', r.status === 409, String(r.status));
r = await call('DELETE', `/api/payroll/runs/${runId}`, hrToken);
check('finalized run delete locked 409', r.status === 409, String(r.status));
r = await call('POST', `/api/payroll/runs/${runId}/finalize`, adminToken);
check('finalized run re-finalize locked 409', r.status === 409, String(r.status));

// --- Cross-employee scope ---
r = await call('GET', `/api/employees/${empB._id}`, aToken);
check('employee cannot read another employee 403', r.status === 403, String(r.status));
r = await call('GET', `/api/employees/${empB._id}/360`, aToken);
check('employee cannot read another 360 403', r.status === 403, String(r.status));
r = await call('GET', `/api/employees/${empA._id}`, aToken);
check('employee can read own record 200', r.status === 200, String(r.status));
r = await call('GET', `/api/attendance?employeeId=${empB._id}`, aToken);
check('employee cannot list another attendance 403', r.status === 403, String(r.status));
r = await call('GET', `/api/dashboards/employee?employeeId=${empB._id}`, aToken);
check('employee dashboard for another 403', r.status === 403, String(r.status));
r = await call('GET', `/api/payroll/runs/${runId}/payslip/${empB._id}`, aToken);
check('employee cannot read another payslip 403', r.status === 403, String(r.status));
r = await call('GET', `/api/payroll/runs/${runId}/payslip/${empA._id}`, aToken);
check('employee can read own finalized payslip 200', r.status === 200, String(r.status));
r = await call('GET', '/api/leaves', aToken);
check('employee leave list is own only', r.status === 200 && (r.json.leaves || []).every((l) => String(l.employee._id || l.employee) === String(empA._id)), JSON.stringify(r.json).slice(0, 200));

// Leave + notification scope: B applies, HR approves, A must not mark B's notification read.
const types = (await call('GET', '/api/org/leave-types', hrToken)).json.items;
const annual = types.find((t) => t.code === 'ANNUAL');
r = await call('POST', '/api/leaves', bToken, { leaveType: annual._id, startDate: '2026-11-02', endDate: '2026-11-03', reason: 'Trip' });
const leaveId = r.json.leave._id;
r = await call('PATCH', `/api/leaves/${leaveId}/decision`, hrToken, { status: 'APPROVED', comment: 'OK' });
check('HR approves B leave', r.status === 200, JSON.stringify(r.json));
r = await call('PATCH', `/api/leaves/${leaveId}/decision`, aToken, { status: 'APPROVED' });
check('employee cannot decide leave 403', r.status === 403, String(r.status));
const bNotes = (await call('GET', '/api/notifications', bToken)).json.notifications;
const bNoteId = bNotes[0]._id;
r = await call('PATCH', `/api/notifications/${bNoteId}/read`, aToken);
check('employee cannot mark another notification read 403', r.status === 403, String(r.status));
r = await call('PATCH', `/api/notifications/${bNoteId}/read`, bToken);
check('owner can mark own notification read 200', r.status === 200, String(r.status));

// --- Audit immutability (no edit/delete routes) ---
const auditId = (await call('GET', '/api/audit-logs', adminToken)).json.logs[0]._id;
r = await call('PATCH', `/api/audit-logs/${auditId}`, adminToken, { action: 'FAKE' });
check('audit PATCH has no route 404', r.status === 404, String(r.status));
r = await call('DELETE', `/api/audit-logs/${auditId}`, adminToken);
check('audit DELETE has no route 404', r.status === 404, String(r.status));
r = await call('POST', '/api/audit-logs', adminToken, { action: 'FAKE' });
check('audit POST has no route 404', r.status === 404, String(r.status));

// --- Token invalidation after change-password ---
const empC = await makeEmployee('EMP103', 'c@test.local', 'Emp C');
const cTemp = await login('c@test.local', 'TempEmp123!');
r = await call('GET', '/api/attendance/me', cTemp);
check('temp token blocked from other endpoints 403', r.status === 403, String(r.status));
r = await call('GET', '/api/users/me', cTemp);
check('temp token may still call /users/me 200', r.status === 200, String(r.status));
await call('POST', '/api/auth/change-password', cTemp, { currentPassword: 'TempEmp123!', newPassword: 'NewC123!' });
r = await call('GET', '/api/users/me', cTemp);
check('old temp token invalid after change 401', r.status === 401, String(r.status));
r = await call('GET', '/api/attendance/me', cTemp);
check('old temp token invalid on attendance too 401', r.status === 401, String(r.status));
const cToken = await login('c@test.local', 'NewC123!');
r = await call('GET', '/api/attendance/me', cToken);
check('new token after change works 200', r.status === 200, String(r.status));

// --- Token invalidation after admin reset ---
r = await call('POST', `/api/users/${empAUserId}/reset-password`, adminToken, { password: 'ResetA123!' });
check('admin resets A password', r.status === 200, JSON.stringify(r.json));
r = await call('GET', '/api/users/me', aToken);
check('A old token invalid after reset 401', r.status === 401, String(r.status));
r = await call('POST', '/api/auth/login', null, { email: 'a@test.local', password: 'NewEmp123!' });
check('A old password rejected after reset 401', r.status === 401, String(r.status));
const aTemp2 = await login('a@test.local', 'ResetA123!');
r = await call('GET', '/api/users/me', aTemp2);
check('A temp token after reset can call /users/me', r.status === 200, String(r.status));
await call('POST', '/api/auth/change-password', aTemp2, { currentPassword: 'ResetA123!', newPassword: 'NewA123!' });
const aToken2 = await login('a@test.local', 'NewA123!');
r = await call('GET', '/api/attendance/me', aToken2);
check('A new token after reset+change works', r.status === 200, String(r.status));

// --- Must-change-password enforcement (fresh temp user) ---
const empD = await makeEmployee('EMP104', 'd@test.local', 'Emp D');
const dTemp = await login('d@test.local', 'TempEmp123!');
r = await call('GET', '/api/attendance/me', dTemp);
check('must-change blocks attendance 403', r.status === 403 && /change/i.test(r.json.message || ''), String(r.status));
r = await call('GET', '/api/leaves', dTemp);
check('must-change blocks leaves 403', r.status === 403, String(r.status));
r = await call('POST', '/api/auth/logout', dTemp);
check('must-change still allows logout 200', r.status === 200, String(r.status));
r = await call('POST', '/api/auth/change-password', dTemp, { currentPassword: 'TempEmp123!', newPassword: 'NewD123!' });
check('must-change allows change-password 200', r.status === 200, String(r.status));

// --- Deactivation / reactivation ---
r = await call('PATCH', `/api/users/${empBUserId}`, adminToken, { isActive: false });
check('admin deactivates B', r.status === 200, JSON.stringify(r.json));
r = await call('GET', '/api/users/me', bToken);
check('deactivated token rejected 401', r.status === 401, String(r.status));
r = await call('POST', '/api/auth/login', null, { email: 'b@test.local', password: 'NewEmp123!' });
check('deactivated login rejected 401', r.status === 401, String(r.status));
r = await call('PATCH', `/api/users/${empBUserId}`, adminToken, { isActive: true });
check('admin reactivates B', r.status === 200, JSON.stringify(r.json));
r = await call('GET', '/api/users/me', bToken);
check('reactivation does NOT revive old token 401', r.status === 401, String(r.status));
const bToken2 = await login('b@test.local', 'NewEmp123!');
r = await call('GET', '/api/users/me', bToken2);
check('fresh login after reactivation works 200', r.status === 200, String(r.status));

// --- Mass assignment ---
r = await call('PATCH', `/api/employees/${empA._id}`, aToken2, { basicSalary: 999999, role: 'ADMIN' });
check('employee setting role/salary rejected 403', r.status === 403, String(r.status));
r = await call('GET', `/api/employees/${empA._id}`, hrToken);
check('employee salary/role unchanged after attempt', r.status === 200 && r.json.employee.basicSalary === 100000 && r.json.employee.user.role === 'EMPLOYEE', JSON.stringify(r.json.employee).slice(0, 300));
r = await call('PATCH', `/api/employees/${empA._id}`, hrToken, { role: 'ADMIN', basicSalary: 123456 });
check('HR patch with role field: role stripped, salary applied (HR may set salary, not role)', r.status === 200 && r.json.employee.user.role === 'EMPLOYEE', JSON.stringify(r.json.employee).slice(0, 300));
r = await call('PATCH', `/api/employees/${empA._id}`, hrToken, { basicSalary: 100000 });
check('HR restores salary to 100000', r.status === 200, String(r.status));
r = await call('POST', '/api/auth/change-password', aToken2, { currentPassword: 'NewA123!', newPassword: 'NewA123!x', role: 'ADMIN' });
check('change-password with role field succeeds but role ignored', r.status === 200, String(r.status));
const aToken3 = await login('a@test.local', 'NewA123!x');
r = await call('GET', '/api/users/me', aToken3);
check('role still EMPLOYEE after change-password attempt', r.status === 200 && r.json.user.role === 'EMPLOYEE', JSON.stringify(r.json.user));

// --- NoSQL / injection attempts ---
r = await call('POST', '/api/auth/login', null, { email: { $gt: '' }, password: 'x' });
check('login with operator object rejected 400, never 200', r.status === 400, String(r.status));
r = await call('GET', '/api/employees?department=not-an-id', hrToken);
check('invalid department id rejected 400', r.status === 400, String(r.status));
r = await call('GET', '/api/attendance?employeeId=not-an-id', hrToken);
check('invalid attendance employeeId rejected 400', r.status === 400, String(r.status));
r = await call('GET', '/api/leaves?status=BOGUS', hrToken);
check('invalid leave status rejected 400', r.status === 400, String(r.status));
r = await call('GET', '/api/employees?q=.*', hrToken);
check('regex search ".*" is escaped: does not return all employees', r.status === 200 && r.json.employees.length === 0, JSON.stringify(r.json).slice(0, 200));
r = await call('GET', '/api/employees?q=(a+)+$', hrToken);
check('regex ReDoS-style search does not crash (200)', r.status === 200, String(r.status));
r = await call('GET', '/api/attendance?employeeId[$ne]=x', aToken3);
check('operator-shaped attendance query cannot leak others (own only)', r.status === 200 && (r.json.attendance || []).length >= 0 && !JSON.stringify(r.json).includes('EMP102'), JSON.stringify(r.json).slice(0, 200));

// --- Headers: CSP + CORS ---
const health = await call('GET', '/api/health');
const csp = health.headers.get('content-security-policy') || '';
check('CSP header present with self + frame-ancestors none', csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'"), csp);
const evil = await call('GET', '/api/health', null, null, { Origin: 'https://evil.example' });
check('CORS does not reflect evil origin', evil.headers.get('access-control-allow-origin') !== 'https://evil.example', evil.headers.get('access-control-allow-origin') || '(none)');

// --- Brute force (short window via env, read fresh per request) ---
process.env.LOGIN_MAX_FAILED_ATTEMPTS = '5';
process.env.LOGIN_LOCK_MS = '1500';
const empE = await makeEmployee('EMP105', 'e@test.local', 'Emp E');
await loginChanged('e@test.local', 'TempEmp123!', 'Brute123!');
for (let i = 1; i <= 4; i += 1) {
  r = await call('POST', '/api/auth/login', null, { email: 'e@test.local', password: 'Wrong123!' });
  check(`brute force attempt ${i} generic 401`, r.status === 401 && r.json.message === 'Invalid email or password', String(r.status));
}
r = await call('POST', '/api/auth/login', null, { email: 'e@test.local', password: 'Wrong123!' });
check('5th failed attempt locks account 429', r.status === 429, String(r.status));
r = await call('POST', '/api/auth/login', null, { email: 'e@test.local', password: 'Brute123!' });
check('correct password while locked still 429', r.status === 429, String(r.status));
for (let i = 1; i <= 5; i += 1) {
  await call('POST', '/api/auth/login', null, { email: 'nobody@test.local', password: 'Wrong123!' });
}
r = await call('POST', '/api/auth/login', null, { email: 'nobody@test.local', password: 'Wrong123!' });
check('unknown email also throttles to 429 (no enumeration)', r.status === 429, String(r.status));
await new Promise((res2) => setTimeout(res2, 1700));
r = await call('POST', '/api/auth/login', null, { email: 'e@test.local', password: 'Brute123!' });
check('lock self-clears: login works after window', r.status === 200, String(r.status));
delete process.env.LOGIN_MAX_FAILED_ATTEMPTS;
delete process.env.LOGIN_LOCK_MS;

console.log(`\nPhase 2: ${passed} passed, ${failed} failed`);
await mongoose.disconnect();
await mongod.stop();
server.close();
process.exit(failed ? 1 : 0);
