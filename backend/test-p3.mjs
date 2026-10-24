// P3 verification against in-memory MongoDB. No real AI key, no real
// LLM call: global fetch is mocked for the provider URL only, and all
// other fetches (the test harness's own HTTP calls) pass through.
// Run: node test-p3.mjs
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from './src/app.js';
import { Attendance } from './src/models/Attendance.js';
import { LeaveRequest } from './src/models/LeaveRequest.js';
import { LeaveType } from './src/models/LeaveType.js';
import { AiLog } from './src/models/AiLog.js';

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
const eq = (a, b) => Math.abs(a - b) <= 0.0051;

// --- Mock provider ----------------------------------------------------
// The mocked dates for the smart-leave sentence are fixed here so the
// test is deterministic whatever day it runs: "next Monday and Tuesday"
// is mocked as Mon 2026-10-26 and Tue 2026-10-27 (both working days).
let mockCalls = 0;
let lastProviderBody = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('api.groq.com')) {
    mockCalls += 1;
    const body = JSON.parse(opts.body);
    lastProviderBody = body;
    const messages = body.messages || [];
    const system = messages[0]?.content || '';
    const userText = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
    const hasToolMsg = messages.some((m) => m.role === 'tool');
    const contentMsg = (content) => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { role: 'assistant', content } }] }),
    });
    const toolMsg = (name, args) => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{ id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } }],
            },
          },
        ],
      }),
    });
    if (system.includes('smart-leave request')) {
      if (userText.includes('INVALIDJSON')) return contentMsg('this is not json at all');
      return contentMsg('{"type": "CASUAL", "start": "2026-10-26", "end": "2026-10-27", "reason": "Wedding"}');
    }
    if (system.includes('dashboard insight bullets')) {
      return contentMsg('• Headcount is 42.\n• Attendance rate is 0.92.\n• Payroll cost is 123456.');
    }
    if (hasToolMsg) return contentMsg('Here is what I found in the company data.');
    if (/remote work/i.test(userText))
      return contentMsg("I don't know — the company policy rules I have do not cover remote work.");
    if (/sick/i.test(userText) && /left/i.test(userText)) return toolMsg('get_my_leave_balance', {});
    if (/late/i.test(userText)) return toolMsg('get_late_comers', { from: '2026-10-05', to: '2026-10-09', limit: 5 });
    if (/attendance rate/i.test(userText))
      return toolMsg('get_attendance_summary', { from: '2026-10-05', to: '2026-10-09' });
    if (/Engineering/i.test(userText)) return toolMsg('get_headcount', { department: 'Engineering' });
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
await call('POST', '/api/users', adminToken, {
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

r = await call('POST', '/api/org/departments', adminToken, { name: 'Engineering' });
const engId = r.json.item._id;
r = await call('POST', '/api/org/departments', adminToken, { name: 'Sales' });
const salesId = r.json.item._id;
r = await call('POST', '/api/org/designations', adminToken, { name: 'Engineer', department: engId });
const engDesig = r.json.item._id;
r = await call('POST', '/api/org/designations', adminToken, { name: 'SalesRep', department: salesId });
const salesDesig = r.json.item._id;

async function makeEmployee(code, email, dept, desig, salary) {
  const rr = await call('POST', '/api/employees', hrToken, {
    name: code,
    email,
    password: 'TempEmp123!',
    employeeCode: code,
    department: dept,
    designation: desig,
    joiningDate: '2026-01-05',
    basicSalary: salary,
  });
  check(`register ${code}`, rr.status === 201, JSON.stringify(rr.json));
  return rr.json.employee;
}
const e1 = await makeEmployee('EMP001', 'e1@test.local', engId, engDesig, 100000);
const e2 = await makeEmployee('EMP002', 'e2@test.local', engId, engDesig, 80000);
const e3 = await makeEmployee('EMP003', 'e3@test.local', salesId, salesDesig, 60000);
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

// Attendance Mon 2026-10-05 .. Fri 2026-10-09 (same shape as P2).
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
  att(e1, 9, 9, 0, 17, 0),
  att(e2, 5, 9, 0, 17, 0),
  att(e2, 6, 9, 0, 17, 0),
  att(e2, 7, 9, 0, 17, 0),
  att(e2, 8, 9, 0, 17, 0),
  att(e2, 9, 9, 0, 17, 0),
  att(e3, 5, 9, 0, 17, 0),
  att(e3, 6, 9, 0, 17, 0),
  att(e3, 7, 9, 0, 17, 0),
  att(e3, 8, 9, 0, 17, 0),
  att(e3, 9, 9, 0, null, null),
]);
const sick = await LeaveType.findOne({ code: 'SICK' });
await LeaveRequest.create({
  employee: e1._id,
  leaveType: sick._id,
  startDate: new Date(Date.UTC(2026, 10, 2)),
  endDate: new Date(Date.UTC(2026, 10, 3)),
  workingDays: 2,
  reason: 'Flu',
  status: 'APPROVED',
});

// --- HR tool answers equal the dashboard-service numbers -------------
r = await call('GET', `/api/dashboards/hr?from=2026-10-05&to=2026-10-09&department=${engId}`, hrToken);
const dashEngHeadcount = r.json.headcount;
r = await call('POST', '/api/ai/chat', hrToken, { message: 'How many active employees are in Engineering?' });
check(
  'HR headcount tool equals dashboard headcount (Eng)',
  r.status === 200 && r.json.aiGenerated === true && r.json.toolResults?.[0]?.result?.headcount === dashEngHeadcount,
  JSON.stringify(r.json),
);
check(
  'headcount tool result carries no salary field',
  !JSON.stringify(r.json.toolResults).includes('basicSalary'),
  JSON.stringify(r.json.toolResults),
);

r = await call('GET', '/api/dashboards/hr?from=2026-10-05&to=2026-10-09', hrToken);
const dashLate = r.json.topLateComers;
const dashRate = r.json.attendanceRate;
r = await call('POST', '/api/ai/chat', hrToken, { message: 'Who came late most often from 2026-10-05 to 2026-10-09?' });
check(
  'HR late-comers tool equals dashboard topLateComers',
  r.status === 200 && JSON.stringify(r.json.toolResults?.[0]?.result?.lateComers) === JSON.stringify(dashLate),
  JSON.stringify(r.json.toolResults),
);
r = await call('POST', '/api/ai/chat', hrToken, {
  message: 'What is the attendance rate from 2026-10-05 to 2026-10-09?',
});
check(
  'HR attendance-rate tool equals dashboard attendanceRate',
  r.status === 200 && eq(r.json.toolResults?.[0]?.result?.attendanceRate, dashRate),
  `${JSON.stringify(r.json.toolResults)} vs ${dashRate}`,
);

// --- Employee own sick balance only ---------------------------------
r = await call('POST', '/api/ai/chat', e1Token, { message: 'How many sick leaves do I have left this year?' });
const sickRow = r.json.toolResults?.[0]?.result?.balances?.find((b) => b.leaveType.code === 'SICK');
check(
  'employee own sick balance: quota 8, used 2, remaining 6',
  r.status === 200 && sickRow && sickRow.quota === 8 && sickRow.used === 2 && sickRow.remaining === 6,
  JSON.stringify(r.json.toolResults),
);
check(
  'balance tool result carries no salary field',
  !JSON.stringify(r.json.toolResults).includes('basicSalary'),
  JSON.stringify(r.json.toolResults),
);

// --- Salary guard: colleague salary refused, LLM NOT called ----------
const callsBeforeGuard = mockCalls;
r = await call('POST', '/api/ai/chat', e1Token, { message: "What is EMP002's salary?" });
check(
  'employee asking a colleague salary by code is refused, LLM not called, no salary leaked',
  r.status === 200 &&
    /can.t share another person/i.test(r.json.answer || '') &&
    mockCalls === callsBeforeGuard &&
    !JSON.stringify(r.json).includes('100000') &&
    !JSON.stringify(r.json).includes('80000'),
  JSON.stringify(r.json),
);
r = await call('POST', '/api/ai/chat', e1Token, { message: "What is my colleague's salary?" });
check(
  'employee asking a colleague salary by word is refused, LLM not called',
  r.status === 200 && /can.t share another person/i.test(r.json.answer || '') && mockCalls === callsBeforeGuard,
  JSON.stringify(r.json),
);
r = await call('POST', '/api/ai/chat', e1Token, { message: 'What are the salaries in Engineering?' });
check(
  'employee asking generic salaries is refused, LLM not called',
  r.status === 200 && /can.t share another person/i.test(r.json.answer || '') && mockCalls === callsBeforeGuard,
  JSON.stringify(r.json),
);

// --- Smart leave: mocked dates Mon 2026-10-26 / Tue 2026-10-27 -------
const leavesBefore = await LeaveRequest.countDocuments();
r = await call('POST', '/api/ai/smart-leave', e1Token, { text: 'I need next Monday and Tuesday off for a wedding' });
check(
  'smart leave parses mocked dates: CASUAL 2026-10-26 to 2026-10-27, wedding, 2 working days',
  r.status === 200 &&
    r.json.leave?.type === 'CASUAL' &&
    r.json.leave?.start === '2026-10-26' &&
    r.json.leave?.end === '2026-10-27' &&
    /wedding/i.test(r.json.leave?.reason || '') &&
    r.json.leave?.workingDays === 2,
  JSON.stringify(r.json),
);
check(
  'smart leave creates no leave request (user confirms via normal endpoint)',
  (await LeaveRequest.countDocuments()) === leavesBefore,
  String(await LeaveRequest.countDocuments()),
);

// --- Smart leave invalid JSON: retry once, then parse-failed ---------
r = await call('POST', '/api/ai/smart-leave', e1Token, { text: 'INVALIDJSON please take some leave' });
check(
  'smart leave invalid JSON returns parse-failed, no leave created',
  r.status === 200 && r.json.parseFailed === true && (await LeaveRequest.countDocuments()) === leavesBefore,
  JSON.stringify(r.json),
);

// --- Policy question outside the brief: does-not-know, passed through -
r = await call('POST', '/api/ai/chat', hrToken, { message: 'What is the company policy on remote work?' });
check(
  'policy question outside brief rules returns does-not-know answer, labelled AI-generated',
  r.status === 200 && r.json.aiGenerated === true && /don.t know/i.test(r.json.answer || ''),
  JSON.stringify(r.json),
);

// --- Dashboard summary uses ONLY the supplied KPI JSON ----------------
r = await call('POST', '/api/ai/dashboard-summary', hrToken, {
  kpi: { headcount: 42, attendanceRate: 0.92, payrollCost: 123456, lateComers: 3 },
});
const promptText = JSON.stringify(lastProviderBody?.messages || []);
check(
  'dashboard summary returns 3-5 bullets, labelled AI-generated',
  r.status === 200 &&
    r.json.aiGenerated === true &&
    Array.isArray(r.json.bullets) &&
    r.json.bullets.length >= 3 &&
    r.json.bullets.length <= 5,
  JSON.stringify(r.json),
);
check(
  'dashboard summary prompt contains exactly the supplied KPI numbers',
  promptText.includes('42') && promptText.includes('0.92') && promptText.includes('123456'),
  promptText,
);
r = await call('POST', '/api/ai/dashboard-summary', e1Token, { kpi: { headcount: 1 } });
check('employee cannot use dashboard summary (403)', r.status === 403, String(r.status));

// --- Rate limit (limit lowered via env for a fresh user) --------------
await call('POST', '/api/users', adminToken, {
  name: 'HR Two',
  email: 'hr2@test.local',
  password: 'Hr123456!',
  role: 'HR',
});
r = await call('POST', '/api/auth/login', null, { email: 'hr2@test.local', password: 'Hr123456!' });
const hr2TempToken = r.json.token;
await call('POST', '/api/auth/change-password', hr2TempToken, {
  currentPassword: 'Hr123456!',
  newPassword: 'Hr2New123!',
});
r = await call('POST', '/api/auth/login', null, { email: 'hr2@test.local', password: 'Hr2New123!' });
const hr2Token = r.json.token;
process.env.AI_RATE_LIMIT_PER_HOUR = '2';
r = await call('POST', '/api/ai/chat', hr2Token, { message: 'What is the office start time?' });
check('rate limit: 1st request ok', r.status === 200, String(r.status));
r = await call('POST', '/api/ai/chat', hr2Token, { message: 'What is the office start time?' });
check('rate limit: 2nd request ok', r.status === 200, String(r.status));
r = await call('POST', '/api/ai/chat', hr2Token, { message: 'What is the office start time?' });
check(
  'rate limit: 3rd request (N+1) returns 429 friendly',
  r.status === 429 && /limit/i.test(r.json.message || ''),
  JSON.stringify(r.json),
);
delete process.env.AI_RATE_LIMIT_PER_HOUR;

// --- Missing key: friendly 503, mock NOT called ------------------------
const callsBeforeMissing = mockCalls;
delete process.env.AI_API_KEY;
r = await call('POST', '/api/ai/chat', hrToken, { message: 'What is the office start time?' });
check(
  'missing AI_API_KEY returns 503 friendly, mock not called',
  r.status === 503 && /not configured/i.test(r.json.message || '') && mockCalls === callsBeforeMissing,
  JSON.stringify(r.json),
);
process.env.AI_API_KEY = 'test-fake-key-never-real';

// --- Auth, validation, logging ----------------------------------------
r = await call('POST', '/api/ai/chat', null, { message: 'hi' });
check('AI chat requires auth (401)', r.status === 401, String(r.status));
r = await call('POST', '/api/ai/chat', hrToken, { message: '' });
check('AI chat validates message (400)', r.status === 400, String(r.status));
const logCount = await AiLog.countDocuments({ user: { $exists: true } });
check('AiLog rows were written for AI calls', logCount >= 10, String(logCount));
const leaked = await AiLog.findOne({ error: /test-fake-key/ });
check('AiLog never stores the API key', !leaked, 'key found in AiLog');

console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
globalThis.fetch = realFetch;
server.close();
await mongoose.disconnect();
await mongod.stop();
process.exit(failed ? 1 : 0);
