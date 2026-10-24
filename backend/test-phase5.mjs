// Phase 5 — Code quality and tests: gap coverage only (no duplication of
// P1/P2/P3/P4/Phase1/Phase2/Phase3 suites).
// Covered here: payroll tax-slab boundaries, joiner/leaver proration via
// a real payroll run, working-day math across weekends + holidays +
// year boundaries, the Phase 5 AI leave-balance bug fix (cross-year and
// pending leaves must match the REST balances endpoint), and the
// consistent API response shape (JSON {success:true,...}; CSV export and
// PDF payslips are the documented non-JSON exceptions).
// Already covered elsewhere and deliberately NOT duplicated here:
// attendance half-day boundary (exactly 5h = PRESENT, under 5h = HALF_DAY,
// test-p1), payroll lock after finalize (test-p1), leave overlap + balance
// 422 (test-p1), cross-year REST balances (test-phase1), RBAC + data scope
// per role (test-phase2 — Phase 4 was frontend-only, so no new backend
// RBAC surface exists to test), AI tool permission scoping (test-phase3).
// Run: node test-phase5.mjs  (or: npm test, which runs every suite)
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from './src/app.js';
import { Holiday } from './src/models/Holiday.js';
import { LeaveType } from './src/models/LeaveType.js';
import { User } from './src/models/User.js';
import { annualTax, monthlyTax } from './src/services/payrollService.js';
import { workingDaysBetween, workingDaysInYear, listWorkingDaysInMonth } from './src/services/settingsService.js';
import { runAiTool } from './src/services/aiTools.js';

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
const eq = (a, b) => Math.abs(a - b) < 0.005;

// --- Pure tax-slab boundaries (annual gross) ---
check('tax: 600k annual = 0', annualTax(600000) === 0, String(annualTax(600000)));
check('tax: just above 600k = 5% of excess', eq(annualTax(600001), 0.05), String(annualTax(600001)));
check('tax: 1.2M annual = 30000', annualTax(1200000) === 30000, String(annualTax(1200000)));
check('tax: just above 1.2M', eq(annualTax(1200001), 30000.15), String(annualTax(1200001)));
check('tax: 2.4M annual = 210000', annualTax(2400000) === 210000, String(annualTax(2400000)));
check('tax: 3.6M annual = 510000', annualTax(3600000) === 510000, String(annualTax(3600000)));
check('tax: 4.8M annual = 930000', annualTax(4800000) === 930000, String(annualTax(4800000)));
check('monthly tax: 50k/mo gross = 0', monthlyTax(50000) === 0, String(monthlyTax(50000)));
check('monthly tax: 100k/mo gross = 2500', monthlyTax(100000) === 2500, String(monthlyTax(100000)));
check('monthly tax: 200k/mo gross = 17500', monthlyTax(200000) === 17500, String(monthlyTax(200000)));
check('monthly tax: 300k/mo gross = 42500', monthlyTax(300000) === 42500, String(monthlyTax(300000)));
check('monthly tax: 400k/mo gross = 77500', monthlyTax(400000) === 77500, String(monthlyTax(400000)));

// --- DB-backed checks ---
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

let r = await call('POST', '/api/setup', null, {
  companyName: 'Test Co',
  adminName: 'Admin',
  adminEmail: 'admin@test.local',
  adminPassword: 'Admin123!',
});
const adminToken = r.json.token;
await call('POST', '/api/users', adminToken, {
  name: 'HR One',
  email: 'hr@test.local',
  password: 'TempHr123!',
  role: 'HR',
});
r = await call('POST', '/api/auth/login', null, { email: 'hr@test.local', password: 'TempHr123!' });
await call('POST', '/api/auth/change-password', r.json.token, {
  currentPassword: 'TempHr123!',
  newPassword: 'NewHr123!',
});
r = await call('POST', '/api/auth/login', null, { email: 'hr@test.local', password: 'NewHr123!' });
const hrToken = r.json.token;
r = await call('POST', '/api/org/departments', adminToken, { name: 'Engineering' });
const deptId = r.json.item._id;
r = await call('POST', '/api/org/designations', adminToken, { name: 'Engineer', department: deptId });
const desigId = r.json.item._id;

// A holiday inside the working-day test window (a Friday).
r = await call('POST', '/api/org/holidays', adminToken, { date: '2026-12-25', name: 'Christmas' });
check('holiday created for working-day test', r.status === 201, JSON.stringify(r.json));
const holidays = await Holiday.find();
const weekendDays = ['Sat', 'Sun'];

// Working days: Mon–Fri week = 5; a Sat–Sun weekend = 0; a window with a
// Friday holiday (Dec 24 Thu, 25 Fri holiday, 26 Sat, 27 Sun, 28 Mon) = 2.
check(
  'working days: Mon-Fri week = 5',
  workingDaysBetween(new Date('2026-10-26'), new Date('2026-10-30'), holidays, weekendDays) === 5,
);
check(
  'working days: Sat-Sun weekend = 0',
  workingDaysBetween(new Date('2026-10-24'), new Date('2026-10-25'), holidays, weekendDays) === 0,
);
check(
  'working days: window with Friday holiday = 2',
  workingDaysBetween(new Date('2026-12-24'), new Date('2026-12-28'), holidays, weekendDays) === 2,
);

// Cross-year portion: Dec 30 2026 – Jan 4 2027 is 4 working days total,
// 2 in 2026 and 2 in 2027 (no holiday inside the range).
const crossStart = new Date('2026-12-30');
const crossEnd = new Date('2027-01-04');
check('working days: cross-year total = 4', workingDaysBetween(crossStart, crossEnd, holidays, weekendDays) === 4);
check(
  'working days in year: 2026 portion = 2',
  workingDaysInYear(crossStart, crossEnd, 2026, holidays, weekendDays) === 2,
);
check(
  'working days in year: 2027 portion = 2',
  workingDaysInYear(crossStart, crossEnd, 2027, holidays, weekendDays) === 2,
);

async function makeEmployee(code, email, name, joiningDate, salary = 100000) {
  const rr = await call('POST', '/api/employees', hrToken, {
    name,
    email,
    password: 'TempEmp123!',
    employeeCode: code,
    department: deptId,
    designation: desigId,
    joiningDate,
    basicSalary: salary,
  });
  return rr.json.employee;
}
const annual = await LeaveType.findOne({ code: 'ANNUAL' });
const casual = await LeaveType.findOne({ code: 'CASUAL' });

// --- Joiner / leaver proration via a real October 2026 payroll run ---
const full = await makeEmployee('P5FULL', 'full@test.local', 'Full Month', '2026-10-01');
const joiner = await makeEmployee('P5JOIN', 'join@test.local', 'Mid Joiner', '2026-10-12');
const leaver = await makeEmployee('P5LEAV', 'leav@test.local', 'Mid Leaver', '2026-10-01');
r = await call('PATCH', `/api/employees/${leaver._id}`, hrToken, { leavingDate: '2026-10-15' });
check('leaver leavingDate set', r.status === 200, JSON.stringify(r.json));
r = await call('POST', '/api/payroll/runs', hrToken, { month: '2026-10' });
check('payroll run 2026-10 created', r.status === 201, JSON.stringify(r.json));
const lines = r.json.run.lines;
const byEmp = (id) => lines.find((l) => String(l.employee) === String(id));
const octWorking = listWorkingDaysInMonth(2026, 10, holidays, weekendDays).length;
const octJoin = workingDaysBetween(new Date('2026-10-12'), new Date('2026-10-31'), holidays, weekendDays);
const octLeave = workingDaysBetween(new Date('2026-10-01'), new Date('2026-10-15'), holidays, weekendDays);
check(
  'proration: full-month effective = full working days',
  byEmp(full._id)?.effectiveWorkingDays === octWorking,
  JSON.stringify(byEmp(full._id)),
);
check(
  'proration: mid-month joiner effective = days from joining date',
  byEmp(joiner._id)?.effectiveWorkingDays === octJoin,
  JSON.stringify(byEmp(joiner._id)),
);
check(
  'proration: mid-month leaver effective = days to leaving date',
  byEmp(leaver._id)?.effectiveWorkingDays === octLeave,
  JSON.stringify(byEmp(leaver._id)),
);

// --- Phase 5 AI balance bug fix: cross-year + pending leaves ---
// Balance employee joins in October, takes an approved cross-year ANNUAL
// leave (Dec 30 2026 – Jan 4 2027) and a PENDING CASUAL leave entirely in
// January 2027. REST balances for 2026 must show only the 2026 portion
// (2 days) and zero pending for 2026; the AI tool must match exactly.
const balEmp = await makeEmployee('P5BAL', 'bal@test.local', 'Balance Check', '2026-10-01');
const balUser = await User.findOne({ email: 'bal@test.local' });
r = await call('POST', '/api/auth/login', null, { email: 'bal@test.local', password: 'TempEmp123!' });
await call('POST', '/api/auth/change-password', r.json.token, {
  currentPassword: 'TempEmp123!',
  newPassword: 'BalNew123!',
});
r = await call('POST', '/api/auth/login', null, { email: 'bal@test.local', password: 'BalNew123!' });
const balToken = r.json.token;
r = await call('POST', '/api/leaves', balToken, {
  leaveType: annual._id,
  startDate: '2026-12-30',
  endDate: '2027-01-04',
  reason: 'Year-end break',
});
check('cross-year leave applied', r.status === 201, JSON.stringify(r.json));
const crossLeaveId = r.json.leave._id;
r = await call('PATCH', `/api/leaves/${crossLeaveId}/decision`, hrToken, { status: 'APPROVED', comment: 'OK' });
check('cross-year leave approved', r.status === 200, JSON.stringify(r.json));
r = await call('POST', '/api/leaves', balToken, {
  leaveType: casual._id,
  startDate: '2027-01-05',
  endDate: '2027-01-06',
  reason: 'Next year plan',
});
check('next-year pending leave applied', r.status === 201, JSON.stringify(r.json));
r = await call('GET', `/api/leaves/balances?employeeId=${balEmp._id}&year=2026`, hrToken);
const restAnnual = r.json.balances.find((b) => b.leaveType.code === 'ANNUAL');
const restCasual = r.json.balances.find((b) => b.leaveType.code === 'CASUAL');
check('REST balances 2026: cross-year annual used = 2 (not 4)', restAnnual?.used === 2, JSON.stringify(restAnnual));
check('REST balances 2026: next-year casual pending = 0', restCasual?.pending === 0, JSON.stringify(restCasual));
// AI tool uses the current year; the test environment runs in 2026, so
// the AI balance must equal the REST 2026 balance. (If this suite ever
// runs in a different year, the AI tool still uses that year by design;
// the REST cross-check above is the year-explicit proof.)
const aiBal = await runAiTool(balUser, 'get_my_leave_balance', {});
const aiAnnual = aiBal.result.balances.find((b) => b.leaveType.code === 'ANNUAL');
const aiCasual = aiBal.result.balances.find((b) => b.leaveType.code === 'CASUAL');
check(
  'AI balance: cross-year annual used matches REST (2)',
  aiAnnual?.used === restAnnual?.used,
  JSON.stringify(aiAnnual),
);
check(
  'AI balance: next-year casual pending matches REST (0)',
  aiCasual?.pending === restCasual?.pending,
  JSON.stringify(aiCasual),
);
const aiSummary = await runAiTool(balUser, 'get_leave_summary', { from: '2026-12-01', to: '2026-12-31' });
check(
  'AI leave summary: December portion = 2 (not full 4)',
  aiSummary.result.approvedDaysByType?.ANNUAL === 2,
  JSON.stringify(aiSummary.result),
);

// --- Consistent API response shape ---
r = await call('GET', '/api/org/settings', hrToken);
check(
  'shape: settings returns {success:true}',
  r.status === 200 && r.json.success === true && !!r.json.setting,
  JSON.stringify(r.json),
);
r = await call('GET', `/api/employees/${full._id}`, hrToken);
check(
  'shape: employee returns {success:true}',
  r.status === 200 && r.json.success === true && !!r.json.employee,
  JSON.stringify(r.json),
);
r = await call('GET', '/api/employees/export/csv', hrToken);
check(
  'shape exception: CSV export is text/csv, not JSON (by design)',
  r.status === 200 && (r.headers.get('content-type') || '').includes('csv') && r.text.startsWith('employeeCode,'),
  r.text.slice(0, 80),
);

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
server.close();
await mongoose.disconnect();
await mongod.stop();
process.exit(failed ? 1 : 0);
