// P5 demo rehearsal: the brief's 5-minute demo, end to end, on a fresh
// in-memory database. No live DB, no real AI key, no real LLM call:
// global fetch is mocked for the provider URL only (as in test-p3.mjs),
// and every demo record is created by this script through the real
// endpoints — nothing is seeded as dummy data.
// Run: node test-demo.mjs
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from './src/app.js';
import { LeaveType } from './src/models/LeaveType.js';

let passed = 0; let failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.log(`FAIL ${name} ${detail}`); }
};
const iso = (d) => d.toISOString().slice(0, 10);
const fmt = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const today = new Date();
// Next Monday and the Tuesday after it (UTC), so smart leave always
// lands on two future working days whatever day the script runs.
const nextMonday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
while (nextMonday.getUTCDay() !== 1) nextMonday.setUTCDate(nextMonday.getUTCDate() + 1);
const nextTuesday = new Date(nextMonday); nextTuesday.setUTCDate(nextTuesday.getUTCDate() + 1);
const leaveStart = iso(nextMonday); const leaveEnd = iso(nextTuesday);
const month = fmt(today);
const monthStart = `${month}-01`;

// --- Mock provider (Groq URL only; harness HTTP passes through) -----
let mockCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('api.groq.com')) {
    mockCalls += 1;
    const body = JSON.parse(opts.body);
    const messages = body.messages || [];
    const system = messages[0]?.content || '';
    const userText = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const contentMsg = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { role: 'assistant', content } }] }) });
    if (system.includes('smart-leave request')) {
      return contentMsg(JSON.stringify({ type: 'CASUAL', start: leaveStart, end: leaveEnd, reason: 'Wedding' }));
    }
    if (system.includes('dashboard insight bullets')) {
      // Phase 3 wraps the KPI JSON in <kpi-data> markers; extract the
      // balanced JSON object (first { to last }) instead of slicing to
      // the end of the prompt. The assertion below (bullets contain the
      // supplied numbers) is unchanged.
      const kpiMatch = userText.match(/\{[\s\S]*\}/);
      let kpi = {};
      try { kpi = JSON.parse(kpiMatch ? kpiMatch[0] : '{}'); } catch { /* fall through with empty kpi */ }
      return contentMsg(`• Headcount is ${kpi.headcount ?? 'unknown'}.\n• Employees on leave: ${kpi.onLeave ?? 0}.\n• Attendance rate is ${kpi.attendanceRate ?? 'unknown'}.`);
    }
    return contentMsg('Office starts at 09:00 with 15 minutes of grace.');
  }
  return realFetch(url, opts);
};
process.env.AI_API_KEY = 'test-fake-key-never-real';

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
  let json = null; try { json = JSON.parse(text); } catch { /* non-json (pdf) */ }
  return { status: res.status, json, text, headers: res.headers };
};

// --- 0. Fresh-install first view: empty DB, honest states -----------
let r = await call('GET', '/api/health');
check('fresh install: health 200', r.status === 200 && r.json.success === true, JSON.stringify(r.json));
r = await call('GET', '/api/setup/status');
check('fresh install: needsSetup true', r.status === 200 && r.json.needsSetup === true, JSON.stringify(r.json));
r = await call('POST', '/api/auth/register', null, { name: 'x', email: 'x@test.local', password: 'Wrong123!' });
check('fresh install: public register 404', r.status === 404, String(r.status));
r = await call('GET', '/api/dashboards/admin');
check('fresh install: dashboards require auth (401, not a crash)', r.status === 401, String(r.status));

// --- 1. Admin first-run setup ---------------------------------------
r = await call('POST', '/api/setup', null, { companyName: 'Demo Co', adminName: 'Demo Admin', adminEmail: 'admin@demo.local', adminPassword: 'Admin123!' });
check('demo 1: admin setup 201', r.status === 201 && r.json.user?.role === 'ADMIN', JSON.stringify(r.json));
const adminToken = r.json.token;
r = await call('POST', '/api/setup', null, { companyName: 'Again Co', adminName: 'Second Admin', adminEmail: 'second@demo.local', adminPassword: 'Admin123!' });
check('demo 1: setup again 403', r.status === 403, String(r.status));
r = await call('GET', '/api/setup/status');
check('demo 1: needsSetup false after setup', r.json.needsSetup === false, JSON.stringify(r.json));

// --- 2. Admin creates an HR login ------------------------------------
r = await call('POST', '/api/users', adminToken, { name: 'Demo HR', email: 'hr@demo.local', password: 'TempHr123!', role: 'HR' });
check('demo 2: admin creates HR login', r.status === 201 && r.json.user.mustChangePassword === true, JSON.stringify(r.json));
r = await call('POST', '/api/auth/login', null, { email: 'hr@demo.local', password: 'TempHr123!' });
check('demo 2: HR signs in with temp password', r.status === 200 && r.json.user.mustChangePassword === true, JSON.stringify(r.json));
const hrTempToken = r.json.token;
r = await call('POST', '/api/auth/change-password', hrTempToken, { currentPassword: 'TempHr123!', newPassword: 'HrNew123!' });
check('demo 2: HR changes temp password', r.status === 200, JSON.stringify(r.json));
r = await call('POST', '/api/auth/login', null, { email: 'hr@demo.local', password: 'HrNew123!' });
check('demo 2: HR signs in with new password', r.status === 200 && r.json.user.mustChangePassword === false, JSON.stringify(r.json));
const hrToken = r.json.token;

// Empty dashboards before any employees: honest empty states, no NaN.
r = await call('GET', '/api/dashboards/hr', hrToken);
check('demo 2b: HR dashboard empty but valid (headcount 0, no NaN)', r.status === 200 && r.json.headcount === 0 && !JSON.stringify(r.json).includes('NaN'), JSON.stringify(r.json).slice(0, 200));
r = await call('GET', '/api/dashboards/admin', adminToken);
check('demo 2b: Admin dashboard empty but valid', r.status === 200 && r.json.headcount === 0, JSON.stringify(r.json).slice(0, 200));

// --- 3. HR registers 3 employees --------------------------------------
r = await call('POST', '/api/org/departments', adminToken, { name: 'Engineering' });
const deptId = r.json.item._id;
r = await call('POST', '/api/org/designations', adminToken, { name: 'Engineer', department: deptId });
const desigId = r.json.item._id;
async function registerEmployee(code, email, name) {
  const rr = await call('POST', '/api/employees', hrToken, {
    name, email, password: 'TempEmp123!', employeeCode: code, department: deptId, designation: desigId,
    joiningDate: monthStart, basicSalary: 100000,
  });
  check(`demo 3: HR registers ${code}`, rr.status === 201, JSON.stringify(rr.json));
  return rr.json.employee;
}
const emp1 = await registerEmployee('EMP101', 'emp1@demo.local', 'Demo One');
const emp2 = await registerEmployee('EMP102', 'emp2@demo.local', 'Demo Two');
await registerEmployee('EMP103', 'emp3@demo.local', 'Demo Three');
r = await call('GET', '/api/employees', hrToken);
check('demo 3: directory lists 3 employees', r.status === 200 && r.json.employees.length === 3, JSON.stringify(r.json).slice(0, 200));

// --- 4. One employee signs in, changes temp password, checks in -------
r = await call('POST', '/api/auth/login', null, { email: 'emp1@demo.local', password: 'TempEmp123!' });
check('demo 4: employee signs in with temp password', r.status === 200 && r.json.user.mustChangePassword === true, JSON.stringify(r.json));
const emp1TempToken = r.json.token;
r = await call('POST', '/api/auth/change-password', emp1TempToken, { currentPassword: 'TempEmp123!', newPassword: 'EmpNew123!' });
check('demo 4: employee changes temp password', r.status === 200, JSON.stringify(r.json));
r = await call('POST', '/api/auth/login', null, { email: 'emp1@demo.local', password: 'EmpNew123!' });
check('demo 4: employee signs in with new password', r.status === 200 && r.json.user.mustChangePassword === false, JSON.stringify(r.json));
const emp1Token = r.json.token;
r = await call('POST', '/api/attendance/check-in', emp1Token);
check('demo 4: employee checks in (server-stamped)', r.status === 201, JSON.stringify(r.json));
r = await call('POST', '/api/attendance/check-in', emp1Token);
check('demo 4: second check-in 409', r.status === 409, String(r.status));
r = await call('POST', '/api/attendance/check-out', emp1Token);
check('demo 4: employee checks out', r.status === 200, JSON.stringify(r.json));

// --- 5. Smart leave (mocked LLM) → pre-filled form, then apply --------
r = await call('GET', `/api/leaves`, emp1Token);
const leavesBefore = r.json.leaves?.length ?? 0;
r = await call('POST', '/api/ai/smart-leave', emp1Token, { text: 'need next Monday and Tuesday off for a wedding' });
check('demo 5: smart leave returns validated CASUAL prefill', r.status === 200 && r.json.leave?.type === 'CASUAL' && r.json.leave?.start === leaveStart && r.json.leave?.end === leaveEnd && r.json.leave?.reason === 'Wedding', JSON.stringify(r.json));
const casual = await LeaveType.findOne({ code: 'CASUAL' });
r = await call('GET', `/api/leaves`, emp1Token);
check('demo 5: smart leave created nothing yet (form only)', r.json.leaves?.length === leavesBefore, JSON.stringify(r.json));
r = await call('POST', '/api/leaves', emp1Token, { leaveType: casual._id, startDate: leaveStart, endDate: leaveEnd, reason: 'Wedding' });
check('demo 5: employee applies the pre-filled leave', r.status === 201 && r.json.leave.status === 'PENDING' && r.json.leave.workingDays === 2, JSON.stringify(r.json));
const leaveId = r.json.leave._id;

// --- 6. HR approves ----------------------------------------------------
r = await call('PATCH', `/api/leaves/${leaveId}/decision`, hrToken, { status: 'APPROVED', comment: 'Enjoy!' });
check('demo 6: HR approves leave', r.status === 200 && r.json.leave.status === 'APPROVED', JSON.stringify(r.json));
r = await call('GET', '/api/notifications', emp1Token);
check('demo 6: approval creates employee notification', r.status === 200 && r.json.notifications.some((n) => n.type === 'LEAVE_DECISION'), JSON.stringify(r.json));

// --- 7. Dashboard summary + who is on leave ---------------------------
r = await call('GET', `/api/leaves?status=APPROVED`, hrToken);
check('demo 7: HR sees who is on leave (approved list)', r.status === 200 && r.json.leaves.some((l) => String(l._id) === String(leaveId)), JSON.stringify(r.json).slice(0, 200));
r = await call('GET', '/api/dashboards/hr', hrToken);
check('demo 7: HR dashboard shows 3 headcount', r.status === 200 && r.json.headcount === 3, JSON.stringify(r.json).slice(0, 200));
r = await call('POST', '/api/ai/dashboard-summary', hrToken, { kpi: { headcount: 3, onLeave: 1, attendanceRate: 0.95 } });
check('demo 7: AI dashboard summary uses only supplied KPIs', r.status === 200 && Array.isArray(r.json.bullets) && r.json.bullets.length >= 3 && r.json.bullets.join(' ').includes('3'), JSON.stringify(r.json));

// --- 8. Payroll: HR draft → Admin finalizes ---------------------------
r = await call('POST', '/api/payroll/runs', hrToken, { month });
check('demo 8: HR creates payroll draft', r.status === 201 && r.json.run.status === 'DRAFT' && r.json.run.lines.length === 3, JSON.stringify(r.json));
const runId = r.json.run._id;
const line1 = r.json.run.lines.find((l) => String(l.employee) === String(emp1._id));
check('demo 8: draft has a line for the checked-in employee', !!line1 && typeof line1.netPay === 'number' && line1.netPay > 0, JSON.stringify(line1));
r = await call('GET', `/api/payroll/runs/${runId}/payslip/${emp1._id}`, emp1Token);
check('demo 8: payslip blocked while draft', r.status === 403, String(r.status));
r = await call('POST', `/api/payroll/runs/${runId}/finalize`, adminToken);
check('demo 8: Admin finalizes (run locked)', r.status === 200 && r.json.run.status === 'FINALIZED', JSON.stringify(r.json));

// --- 9. Employee downloads payslip, asks a colleague's salary ---------
r = await call('GET', `/api/payroll/runs/${runId}/payslip/${emp1._id}`, emp1Token);
check('demo 9: employee downloads own payslip after finalize', r.status === 200 && typeof r.json.payslip?.netPay === 'number', JSON.stringify(r.json).slice(0, 200));
{
  const res = await fetch(`${base}/api/payroll/runs/${runId}/payslip/${emp1._id}/pdf`, { headers: { Authorization: `Bearer ${emp1Token}` } });
  const buf = Buffer.from(await res.arrayBuffer());
  check('demo 9: payslip PDF downloads', res.status === 200 && res.headers.get('content-type')?.includes('pdf') && buf.slice(0, 4).toString() === '%PDF', `${res.status} ${buf.slice(0, 4)}`);
}
const callsBeforeSalary = mockCalls;
r = await call('POST', '/api/ai/chat', emp1Token, { message: "What is EMP102's salary?" });
check('demo 9: colleague salary politely refused, no LLM call, no data', r.status === 200 && !JSON.stringify(r.json).includes('100000') && /sorry|can\'t share|cannot share|not able/i.test(JSON.stringify(r.json)) && mockCalls === callsBeforeSalary, JSON.stringify(r.json).slice(0, 300));

// --- 10. Admin shows the audit log ------------------------------------
r = await call('GET', '/api/audit-logs', adminToken);
const actions = (r.json.logs || []).map((l) => `${l.action}:${l.entity}`);
check('demo 10: audit log shows setup/payroll/leave actions', r.status === 200 && actions.some((a) => a.startsWith('FINALIZE:PayrollRun')) && actions.some((a) => a.includes('LeaveRequest')), actions.join(', ').slice(0, 300));
r = await call('GET', '/api/audit-logs', hrToken);
check('demo 10: audit log forbidden for HR', r.status === 403, String(r.status));

console.log(`\nDEMO RESULT: ${passed} passed, ${failed} failed`);
server.close();
await mongoose.disconnect();
await mongod.stop();
process.exit(failed ? 1 : 0);
