import { AI_TOOL_DEFS, runAiTool } from './aiTools.js';
import { getSetting, workingDaysBetween, dayStart } from './settingsService.js';
import { Holiday } from '../models/Holiday.js';
import { LeaveType } from '../models/LeaveType.js';

// P3 — provider-agnostic AI service, OpenAI-compatible chat completions.
// The API key lives ONLY in backend env (AI_API_KEY); it is never sent
// to the frontend, never logged, and never stored. Env is read fresh on
// every call (not snapshotted at import) so tests and redeploys can
// change it without a restart, and so a missing key is a clean 503.
// Uses global fetch so tests can mock the provider without a real key
// or a real network call. The model never queries the database: it
// only sees tool results the backend computed with the user's scope.

export const AI_TIMEOUT_MS = 15000;
export const AI_DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Default model: openai/gpt-oss-120b. Groq shut llama-3.3-70b-versatile
// down on its free/developer plans (now enterprise-only), and the
// current free-tier roster is gpt-oss-120b / gpt-oss-20b / qwen3.8-27b;
// gpt-oss-120b is the most capable of those, supports tool calling,
// and is free with no card. Override with AI_MODEL if it changes.
export const AI_DEFAULT_MODEL = 'openai/gpt-oss-120b';

export function aiConfig() {
  return {
    apiKey: process.env.AI_API_KEY || null,
    baseUrl: process.env.AI_BASE_URL || AI_DEFAULT_BASE_URL,
    model: process.env.AI_MODEL || AI_DEFAULT_MODEL,
  };
}

export class AiNotConfiguredError extends Error {
  constructor() { super('AI is not configured'); this.code = 'AI_NOT_CONFIGURED'; }
}
export class AiTimeoutError extends Error {
  constructor() { super('AI request timed out'); this.code = 'AI_TIMEOUT'; }
}
export class AiProviderError extends Error {
  constructor(status) { super(`AI provider error (${status})`); this.code = 'AI_PROVIDER_ERROR'; this.status = status; }
}

export async function callLlm({ messages, tools = null, temperature = 0.2 }) {
  const { apiKey, baseUrl, model } = aiConfig();
  if (!apiKey) throw new AiNotConfiguredError();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  let res;
  try {
    res = await globalThis.fetch(baseUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        ...(tools ? { tools, tool_choice: 'auto' } : {}),
        temperature,
      }),
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw new AiTimeoutError();
    throw new AiProviderError(0);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new AiProviderError(res.status);
  const data = await res.json();
  const choice = data?.choices?.[0]?.message;
  if (!choice) throw new AiProviderError(0);
  return choice;
}

// Policy rules, SUMMARISED from the hackathon brief (section 3) —
// short paraphrases, not copied passages. Policy questions are
// answered only from these rules; anything else gets "I don't know".
export const SYSTEM_PROMPT = `You are the HCM Lite HR assistant. Answer from the company data tools and the policy rules below, or say you do not know. Never invent numbers, dates, salaries or policies.

POLICY RULES (summarised):
- Roles: Admin runs company setup and users and finalizes payroll; HR registers employees, manages attendance corrections and leave decisions, and drafts payroll; Employees use self-service only (own attendance, own leave, own payslips, own profile phone/address). Server checks every request; hiding a button is not permission.
- Attendance: office starts 09:00 with 15 minutes grace, so late is after 09:15. Under 5 hours with a check-out is a half day. No record and no approved leave means absent. No check-out means missing check-out. Times are stamped by the server, one record per employee per day.
- Weekends are Saturday and Sunday. Leave counts working days only, skipping weekends and public holidays.
- Leave quotas per year: Annual 14 days, Sick 8, Casual 10, Unpaid unlimited. Overlapping leave or leave beyond the remaining balance is refused.
- Payroll: gross is 1.5x basic salary (40% housing allowance, 10% medical). A day's pay is gross divided by working days; absent, unpaid-leave and half of half-days are deducted. Joiners and leavers are prorated. Tax is computed on annualized gross in illustrative slabs (0% up to 600k, then rising rates). Only Admin can finalize a run, and finalized runs are locked and cannot be edited.
- Nobody may see another employee's data or salary, approve their own requests, edit their own salary, role or attendance, or change the audit log. HR may not change company settings, create Admin users, or finalize payroll. Admin may not edit a finalized payroll run.
- Privacy: never reveal one person's salary, pay or payroll detail to anyone else, and never reveal salary figures unless the person asked about their own payslip.

DATA RULES:
- Use the tools for any question about people, attendance, leave or payroll. If a tool refuses or returns no data, say so plainly instead of guessing.
- Keep answers short, in plain language, and based only on the tool results you received.`;

const SALARY_WORDS = /\b(salar(?:y|ies)|pay|payroll|wage(?:s)?|compensation|remuneration|earnings|take[-\s]?home|net\s*pay|gross\s*pay|basic\s*salary)\b/i;
const OTHER_PERSON = /\b(colleague|co-?worker|teammate|team[- ]mate|another\s+employee|other\s+employee|other\s+person|someone\s+else|somebody\s+else|staff\s+member)\b/i;
const EMPLOYEE_CODE = /\b[A-Z]{2,}\d{2,}\b/;

// Hard guard, checked BEFORE any LLM call. Returns a refusal string, or
// null when the message may go to the model. Rule: any salary/pay/
// payroll-detail request that is not clearly about the requester's own
// pay is refused for every role — a name, an employee code, a word like
// "colleague", or simply no "my"/"own" in the message all count as
// "not your own". "What is my salary?" / "my payslip" pass through and
// are answered only from the requester's own payslip tool result.
export function salaryGuard(message, _role) {
  if (!SALARY_WORDS.test(message)) return null;
  if (OTHER_PERSON.test(message)) {
    return 'I can\'t share another person\'s salary or payroll details — I can only help with your own payslip and leave information.';
  }
  const selfWord = /\b(my|own)\b/i.test(message);
  if (!selfWord) {
    return 'I can\'t share another person\'s salary or payroll details — I can only help with your own payslip and leave information.';
  }
  // "My colleague's ..." is caught above; a bare name or code plus a
  // self word (e.g. "Ali's and my salary") is still another person.
  const rest = message.replace(/^\s*\w+\s*/, '');
  if (EMPLOYEE_CODE.test(message) || /\b[A-Z][a-z]{2,}\s*['’]s\b/.test(rest)) {
    return 'I can\'t share another person\'s salary or payroll details — I can only help with your own payslip and leave information.';
  }
  return null;
}

export const FRIENDLY_FALLBACK = 'The AI assistant is unavailable right now. Please try again in a moment, or use the dashboards and leave pages directly — they show the same data.';

export async function chatWithTools(user, message, history = []) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-10).map((h) => ({ role: h.role, content: String(h.content).slice(0, 2000) })),
    { role: 'user', content: message },
  ];
  const toolsUsed = [];
  const toolResults = [];
  // Max 2 tool rounds, then a final answer call without tools.
  for (let round = 0; round < 2; round += 1) {
    const choice = await callLlm({ messages, tools: AI_TOOL_DEFS });
    const toolCalls = choice.tool_calls || [];
    if (toolCalls.length === 0) {
      return { answer: choice.content || '', toolsUsed, toolResults, aiGenerated: true };
    }
    messages.push({ role: 'assistant', content: choice.content || '', tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let parsed = {};
      try { parsed = JSON.parse(tc.function.arguments || '{}'); } catch { parsed = {}; }
      toolsUsed.push(tc.function.name);
      let result;
      try {
        const run = await runAiTool(user, tc.function.name, parsed);
        result = run.result;
      } catch (err) {
        result = { error: err.message || 'Tool failed' };
      }
      toolResults.push({ tool: tc.function.name, result });
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
  }
  const finalChoice = await callLlm({ messages });
  return { answer: finalChoice.content || '', toolsUsed, toolResults, aiGenerated: true };
}

export async function dashboardSummary(kpi) {
  const prompt = `You are summarizing an HCM Lite dashboard. Use ONLY the numbers in this KPI JSON — do not invent, estimate or add any other figures. Return 3 to 5 short insight bullets, one per line, each starting with "• ".\n\nKPI JSON:\n${JSON.stringify(kpi)}`;
  const choice = await callLlm({ messages: [{ role: 'system', content: 'You write dashboard insight bullets using only the numbers supplied. Never invent figures.' }, { role: 'user', content: prompt }] });
  const text = choice.content || '';
  const bullets = text.split('\n').map((l) => l.trim()).filter((l) => /^([•\-*]|\d+[.)])\s+/.test(l)).map((l) => l.replace(/^([•\-*]|\d+[.)])\s+/, '').trim()).filter(Boolean).slice(0, 5);
  if (bullets.length === 0) {
    const fallback = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5);
    return fallback;
  }
  return bullets;
}

function parseSmartLeaveJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function resolveLeaveType(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const byCode = await LeaveType.findOne({ code: s.toUpperCase().replace(/\s+LEAVE$/i, '') });
  if (byCode) return byCode;
  const byName = await LeaveType.findOne({ name: new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (byName) return byName;
  const loose = await LeaveType.findOne({ name: new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
  return loose || null;
}

export async function smartLeave(text) {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getUTCDay()];
  const setting = await getSetting();
  const holidays = await Holiday.find();
  const system = `You extract a smart-leave request. Today is ${todayKey} (${weekday}). Resolve relative dates like "next Monday" against today. Return ONLY a JSON object with exactly these fields and no other text: {"type": "<leave type code or name, e.g. CASUAL>", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "reason": "<short reason>"}. If no leave type is mentioned, use CASUAL. If only one day is mentioned, start and end are that day.`;
  let lastError = 'parse failed';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const choice = await callLlm({ messages: [{ role: 'system', content: system }, { role: 'user', content: text }], temperature: 0 });
    const parsed = parseSmartLeaveJson(choice.content || '');
    if (!parsed) { lastError = 'parse failed'; continue; }
    const typeDoc = await resolveLeaveType(parsed.type);
    const start = parsed.start && /^\d{4}-\d{2}-\d{2}$/.test(parsed.start) ? dayStart(parsed.start) : null;
    const end = parsed.end && /^\d{4}-\d{2}-\d{2}$/.test(parsed.end) ? dayStart(parsed.end) : null;
    if (!typeDoc) { lastError = 'unknown leave type'; continue; }
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) { lastError = 'invalid dates'; continue; }
    if (workingDaysBetween(start, end, holidays, setting.weekendDays) < 1) { lastError = 'no working days in range'; continue; }
    return {
      type: typeDoc.code,
      leaveTypeId: String(typeDoc._id),
      leaveTypeName: typeDoc.name,
      start: parsed.start,
      end: parsed.end,
      reason: String(parsed.reason || '').slice(0, 500),
      workingDays: workingDaysBetween(start, end, holidays, setting.weekendDays),
    };
  }
  return { parseFailed: true, error: lastError };
}
