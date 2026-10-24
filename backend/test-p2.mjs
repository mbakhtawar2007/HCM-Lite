// P2 verification against in-memory MongoDB. No real secrets, no live DB.
// Run: node test-p2.mjs
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from './src/app.js';
import { LeaveType } from './src/models/LeaveType.js';
import { Employee } from './src/models/Employee.js';
import { Attendance } from './src/models/Attendance.js';
import { LeaveRequest } from './src/models/LeaveRequest.js';
import { PayrollRun } from './src/models/PayrollRun.js';

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
// 0.0051 tolerance: a ratio like 1/8 = 0.125 rounds to 0.13, exactly
// 0.005 away from the unrounded value.
const eq = (a, b) => Math.abs(a - b) <= 0.0051;
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
    /* ignore */
  }
  return { status: res.status, json, text };
};

// Setup + HR login
let r = await call('POST', '/api/setup', null, {
  companyName: 'Test Co',
  adminName: 'Admin',
  adminEmail: 'admin@test.local',
  adminPassword: 'Admin123!',
});
const adminToken = r.json.token;
r = await call('POST', '/api/users', adminToken, {
  name: 'HR One',
  email: 'hr@test.local',
  password: 'Hr123456!',
  role: 'HR',
});
r = await call('POST', '/api/auth/login', null, { email: 'hr@test.local', password: 'Hr123456!' });
const hrTempToken = r.json.token;
await call('POST', '/api/auth/change-password', hrTempToken, {
  currentPassword: 'Hr123456!',
  newPassword: 'HrNew123!',
});
r = await call('POST', '/api/auth/login', null, { email: 'hr@test.local', password: 'HrNew123!' });
const hrToken = r.json.token;

// --- Empty database dashboards: valid, no crashes, no NaN ---
r = await call('GET', '/api/dashboards/admin?from=2026-10-05&to=2026-10-09', adminToken);
check(
  'empty admin dashboard 200, headcount 0, attrition null',
  r.status === 200 &&
    r.json.headcount === 0 &&
    r.json.attritionYtd === null &&
    r.json.averageSalary === null &&
    !hasNaN(r.json),
  JSON.stringify(r.json),
);
r = await call('GET', '/api/dashboards/hr?from=2026-10-05&to=2026-10-09', hrToken);
check(
  'empty HR dashboard 200, rates null, no NaN',
  r.status === 200 &&
    r.json.attendanceRate === null &&
    r.json.lateRate === null &&
    r.json.topLateComers.length === 0 &&
    !hasNaN(r.json),
  JSON.stringify(r.json),
);
r = await call('GET', '/api/dashboards/admin', hrToken);
check('HR cannot read admin dashboard (403)', r.status === 403, String(r.status));
r = await call('GET', '/api/dashboards/hr', null);
check('dashboards require auth (401)', r.status === 401, String(r.status));
r = await call('GET', '/api/dashboards/admin?from=2026-10-09&to=2026-10-05', adminToken);
check('from after to is 400', r.status === 400, String(r.status));
r = await call('GET', '/api/dashboards/admin?department=not-an-id', adminToken);
check('bad department id is 400', r.status === 400, String(r.status));
r = await call('GET', '/api/dashboards/admin?department=000000000000000000000001', adminToken);
check('unknown department is 404', r.status === 404, String(r.status));

// --- Org + employees ---
r = await call('POST', '/api/org/departments', adminToken, { name: 'Engineering' });
const engId = r.json.item._id;
r = await call('POST', '/api/org/departments', adminToken, { name: 'Sales' });
const salesId = r.json.item._id;
r = await call('POST', '/api/org/designations', adminToken, { name: 'Engineer', department: engId });
const engDesig = r.json.item._id;
r = await call('POST', '/api/org/designations', adminToken, { name: 'SalesRep', department: salesId });
const salesDesig = r.json.item._id;

async function makeEmployee(code, email, dept, desig, joiningDate, salary) {
  const rr = await call('POST', '/api/employees', hrToken, {
    name: code,
    email,
    password: 'TempEmp123!',
    employeeCode: code,
    department: dept,
    designation: desig,
    joiningDate,
    basicSalary: salary,
  });
  check(`register ${code}`, rr.status === 201, JSON.stringify(rr.json));
  return rr.json.employee;
}
const e1 = await makeEmployee('EMP001', 'e1@test.local', engId, engDesig, '2026-01-05', 100000);
const e2 = await makeEmployee('EMP002', 'e2@test.local', engId, engDesig, '2026-10-06', 80000);
const e3 = await makeEmployee('EMP003', 'e3@test.local', salesId, salesDesig, '2026-01-05', 60000);
const e4 = await makeEmployee('EMP004', 'e4@test.local', salesId, salesDesig, '2026-01-05', 60000);
const e5 = await makeEmployee('EMP005', 'e5@test.local', engId, engDesig, '2026-01-05', 50000);
await makeEmployee('EMP006', 'e6@test.local', engId, engDesig, '2026-11-01', 50000);
// Leaver mid-range + inactive employee, via HR PATCH (job fields).
r = await call('PATCH', `/api/employees/${e4._id}`, hrToken, { leavingDate: '2026-10-07' });
check('leaver leavingDate set', r.status === 200, JSON.stringify(r.json));
r = await call('PATCH', `/api/employees/${e5._id}`, hrToken, { isActive: false });
check('inactive flag set', r.status === 200, JSON.stringify(r.json));

async function loginAs(email) {
  const rr = await call('POST', '/api/auth/login', null, { email, password: 'TempEmp123!' });
  await call('POST', '/api/auth/change-password', rr.json.token, {
    currentPassword: 'TempEmp123!',
    newPassword: 'NewEmp123!',
  });
  const rr2 = await call('POST', '/api/auth/login', null, { email, password: 'NewEmp123!' });
  return rr2.json.token;
}
const e1Token = await loginAs('e1@test.local');
const e3Token = await loginAs('e3@test.local');

// --- Attendance, Mon 2026-10-05 .. Fri 2026-10-09 (5 working days) ---
const att = (emp, day, h, m, h2, m2) => ({
  employee: emp._id,
  date: new Date(Date.UTC(2026, 9, day)),
  checkIn: new Date(Date.UTC(2026, 9, day, h, m)),
  ...(h2 === null ? {} : { checkOut: new Date(Date.UTC(2026, 9, day, h2, m2)) }),
});
await Attendance.insertMany([
  att(e1, 5, 9, 0, 17, 0),
  att(e1, 6, 9, 20, 17, 0),
  att(e1, 7, 9, 0, 13, 0),
  /* Thu absent */ att(e1, 9, 9, 0, 17, 0),
  att(e2, 6, 9, 0, 17, 0),
  att(e2, 7, 9, 0, 17, 0),
  att(e2, 8, 9, 0, 17, 0),
  att(e2, 9, 9, 0, 17, 0),
  att(e3, 5, 9, 0, 17, 0),
  att(e3, 6, 9, 0, 17, 0),
  att(e3, 7, 9, 0, 17, 0),
  att(e3, 8, 9, 0, 17, 0),
  att(e3, 9, 9, 0, null, null),
  att(e4, 5, 9, 0, 17, 0),
  att(e4, 6, 9, 0, 17, 0),
]);

// Headcount boundaries (range end 10-09: E1,E2,E3 = 3; E4 left 10-07,
// E5 inactive, E6 joins 11-01 — all excluded).
r = await call('GET', '/api/dashboards/admin?from=2026-10-05&to=2026-10-09', adminToken);
check('headcount at range end is 3', r.json.headcount === 3, JSON.stringify(r.json));
check(
  'headcount at range start is 3 (E2 not yet joined, E4 still here)',
  r.json.headcountAtPeriodStart === 3,
  JSON.stringify(r.json.headcountAtPeriodStart),
);
check(
  'attrition YTD = 1 exit / avg(0 at Jan 1, 3 at end) = 0.6667',
  eq(r.json.attritionYtd, 1 / 1.5),
  JSON.stringify(r.json.attritionYtd),
);
check(
  'headcount by department Eng 2 / Sales 1 (at end)',
  (() => {
    const m = new Map(r.json.headcountByDepartment.map((x) => [x.name, x.count]));
    return m.get('Engineering') === 2 && m.get('Sales') === 1;
  })(),
  JSON.stringify(r.json.headcountByDepartment),
);
check(
  'average salary at end = (100000+80000+60000)/3',
  eq(r.json.averageSalary, 80000),
  JSON.stringify(r.json.averageSalary),
);
r = await call('GET', `/api/dashboards/admin?from=2026-10-05&to=2026-10-09&department=${engId}`, adminToken);
check('department filter: Eng headcount at end is 2', r.json.headcount === 2, JSON.stringify(r.json.headcount));

// HR attendance formulas for the Oct range.
// Slots: Mon 3, Tue 4, Wed 3, Thu 3, Fri 3 = 16. Present 12, late 1,
// half 1, missing 1, absent 1 (E1 Thu), on-leave 0.
r = await call('GET', '/api/dashboards/hr?from=2026-10-05&to=2026-10-09', hrToken);
const t = r.json.attendanceTotals;
check(
  'attendance totals present12 late1 half1 missing1 absent1',
  t.present === 12 && t.late === 1 && t.halfDay === 1 && t.missingCheckout === 1 && t.absent === 1 && t.onLeave === 0,
  JSON.stringify(t),
);
check('attendance rate (12+1+1+0.5)/16 = 0.91', eq(r.json.attendanceRate, 0.91), JSON.stringify(r.json.attendanceRate));
check('late rate 1/(12+1) = 0.08', eq(r.json.lateRate, 0.08), JSON.stringify(r.json.lateRate));
check(
  'trend Monday present 3, Thursday absent 1',
  r.json.attendanceTrend[0].present === 3 && r.json.attendanceTrend[3].absent === 1,
  JSON.stringify(r.json.attendanceTrend),
);
check(
  'absenteeism Eng 1/9 = 0.11, Sales 0/7 = 0',
  (() => {
    const m = new Map(r.json.absenteeismByDepartment.map((x) => [x.department, x]));
    return (
      eq(m.get('Engineering').absenteeismRate, 1 / 9) &&
      m.get('Engineering').absentDays === 1 &&
      m.get('Sales').absenteeismRate === 0
    );
  })(),
  JSON.stringify(r.json.absenteeismByDepartment),
);
check(
  'top late-comer is EMP001 with 1 late day',
  r.json.topLateComers.length === 1 &&
    r.json.topLateComers[0].employeeCode === 'EMP001' &&
    r.json.topLateComers[0].lateDays === 1,
  JSON.stringify(r.json.topLateComers),
);
check(
  'HR AI summary is coming-soon, no fabricated text',
  r.json.aiSummary?.status === 'coming-soon' && r.json.aiSummary?.summary === null,
  JSON.stringify(r.json.aiSummary),
);

// --- Leave utilization, Nov range (approved leaves inserted directly) ---
const annual = await LeaveType.findOne({ code: 'ANNUAL' });
const sick = await LeaveType.findOne({ code: 'SICK' });
await LeaveRequest.create({
  employee: e1._id,
  leaveType: annual._id,
  startDate: new Date(Date.UTC(2026, 10, 2)),
  endDate: new Date(Date.UTC(2026, 10, 3)),
  workingDays: 2,
  reason: 'Trip',
  status: 'APPROVED',
});
await LeaveRequest.create({
  employee: e3._id,
  leaveType: sick._id,
  startDate: new Date(Date.UTC(2026, 10, 2)),
  endDate: new Date(Date.UTC(2026, 10, 2)),
  workingDays: 1,
  reason: 'Flu',
  status: 'APPROVED',
});
r = await call('GET', '/api/dashboards/hr?from=2026-11-02&to=2026-11-06', hrToken);
check(
  'leave by type ANNUAL 2 days, utilization 2/14',
  (() => {
    const row = r.json.leaveByType.find((x) => x.leaveType.code === 'ANNUAL');
    return row && row.approvedDays === 2 && eq(row.utilization, 2 / 14);
  })(),
  JSON.stringify(r.json.leaveByType),
);
check(
  'leave by type SICK 1 day, utilization 1/8',
  (() => {
    const row = r.json.leaveByType.find((x) => x.leaveType.code === 'SICK');
    return row && row.approvedDays === 1 && eq(row.utilization, 1 / 8);
  })(),
  JSON.stringify(r.json.leaveByType),
);
check(
  'leave by department Eng ANNUAL 2, Sales SICK 1',
  (() => {
    const rows = r.json.leaveByDepartment;
    return (
      rows.some((x) => x.department === 'Engineering' && x.leaveType.code === 'ANNUAL' && x.approvedDays === 2) &&
      rows.some((x) => x.department === 'Sales' && x.leaveType.code === 'SICK' && x.approvedDays === 1)
    );
  })(),
  JSON.stringify(r.json.leaveByDepartment),
);

// --- Payroll cost: draft counts 0, finalized run counts by department ---
r = await call('POST', '/api/payroll/runs', hrToken, { month: '2026-10' });
check('payroll draft created', r.status === 201, JSON.stringify(r.json));
const runId = r.json.run._id;
r = await call('GET', '/api/dashboards/admin?from=2026-10-01&to=2026-10-31', adminToken);
check(
  'draft payroll cost is 0 (drafts never count)',
  r.json.payrollCost === 0 && r.json.finalizedRunsInRange === 0,
  JSON.stringify({ cost: r.json.payrollCost, runs: r.json.finalizedRunsInRange }),
);
r = await call('POST', `/api/payroll/runs/${runId}/finalize`, adminToken);
check('admin finalizes payroll', r.status === 200, JSON.stringify(r.json));
const run = await PayrollRun.findById(runId);
const empDept = new Map(
  (await Employee.find().populate('department')).map((e) => [String(e._id), e.department?.name || 'Unassigned']),
);
let totalNet = 0;
const byDeptNet = {};
for (const line of run.lines) {
  totalNet += line.netPay;
  const dn = empDept.get(String(line.employee)) || 'Unassigned';
  byDeptNet[dn] = (byDeptNet[dn] || 0) + line.netPay;
}
r = await call('GET', '/api/dashboards/admin?from=2026-10-01&to=2026-10-31', adminToken);
check(
  'finalized payroll cost equals sum of line netPay',
  eq(r.json.payrollCost, totalNet),
  `${r.json.payrollCost} vs ${totalNet}`,
);
check(
  'payroll cost by department sums to total',
  (() => {
    const sum = r.json.payrollCostByDepartment.reduce((s, x) => s + x.payrollCost, 0);
    return (
      eq(sum, totalNet) && r.json.payrollCostByDepartment.every((x) => eq(x.payrollCost, byDeptNet[x.department] || 0))
    );
  })(),
  JSON.stringify(r.json.payrollCostByDepartment),
);

// --- Employee dashboard + scope ---
r = await call('GET', '/api/dashboards/employee?from=2026-10-05&to=2026-10-09', e1Token);
check(
  'employee own dashboard 200, week target 40, late count 1',
  r.status === 200 && r.json.week.targetHours === 40 && r.json.lateCount === 1,
  JSON.stringify({ week: r.json.week, late: r.json.lateCount }),
);
check(
  'employee dashboard balances include ANNUAL quota 14',
  r.json.leaveBalances.some((b) => b.leaveType.code === 'ANNUAL' && b.quota === 14),
  JSON.stringify(r.json.leaveBalances),
);
check(
  'employee last payslip is finalized Oct run',
  r.json.lastPayslip && r.json.lastPayslip.month === '2026-10',
  JSON.stringify(r.json.lastPayslip),
);
check(
  'employee dashboard announcements empty, assistant coming-soon',
  Array.isArray(r.json.announcements) &&
    r.json.announcements.length === 0 &&
    r.json.askAssistant?.status === 'coming-soon',
  JSON.stringify({ ann: r.json.announcements, ai: r.json.askAssistant }),
);
r = await call('GET', `/api/dashboards/employee?employeeId=${e1._id}`, e3Token);
check('employee cannot read another employee dashboard (403)', r.status === 403, String(r.status));
r = await call('GET', `/api/dashboards/employee?employeeId=${e1._id}`, hrToken);
check(
  'HR can read a specific employee dashboard via employeeId',
  r.status === 200 && String(r.json.employee._id) === String(e1._id),
  String(r.status),
);
r = await call('GET', '/api/dashboards/employee', hrToken);
check('staff without employeeId gets 403', r.status === 403, String(r.status));
r = await call('GET', '/api/dashboards/admin', e1Token);
check('employee cannot read admin dashboard (403)', r.status === 403, String(r.status));

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
server.close();
await mongoose.disconnect();
await mongod.stop();
process.exit(failed ? 1 : 0);
