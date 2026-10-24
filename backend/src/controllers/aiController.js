import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/errors.js';
import { AiLog } from '../models/AiLog.js';
import {
  AiNotConfiguredError,
  FRIENDLY_FALLBACK,
  chatWithTools,
  dashboardSummary,
  salaryRefusal,
  smartLeave,
} from '../services/aiService.js';

export const AI_NOT_CONFIGURED_MESSAGE = 'AI is not configured yet. Ask your Admin to add the AI key in the hosting settings — the dashboards and leave pages still work without it.';

// Rate limit: read from env on EVERY request (default 20) so tests can
// lower it and redeploys can change it without a restart. Counted from
// AiLog rows for this user in the last hour, so it holds across
// serverless instances where in-memory counters would reset.
export function aiRateLimitPerHour() {
  const n = Number(process.env.AI_RATE_LIMIT_PER_HOUR);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
}

async function logAi(req, endpoint, toolsUsed, success, error, startedAt) {
  try {
    await AiLog.create({
      user: req.user._id,
      endpoint,
      toolsUsed: toolsUsed || [],
      success,
      error: error ? String(error).slice(0, 200) : null,
      latencyMs: Date.now() - startedAt,
    });
  } catch { /* logging must never break the response */ }
}

async function checkRateLimit(req) {
  const limit = aiRateLimitPerHour();
  const since = new Date(Date.now() - 3600 * 1000);
  const count = await AiLog.countDocuments({ user: req.user._id, createdAt: { $gte: since } });
  if (count >= limit) throw new ApiError(429, `AI limit reached: about ${limit} AI requests per hour. Please try again later.`);
}

function notConfigured(res, startedAt, req, endpoint) {
  logAi(req, endpoint, [], false, 'AI not configured', startedAt);
  return res.status(503).json({ success: false, aiAvailable: false, message: AI_NOT_CONFIGURED_MESSAGE });
}

export const aiChat = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const { message, history, language } = req.body;
  // Friendly 503 before anything else, so a missing key is never a 500
  // and never depends on how many requests the user already made.
  if (!process.env.AI_API_KEY) return notConfigured(res, startedAt, req, 'chat');
  await checkRateLimit(req);
  // Hard guard BEFORE any LLM call: another person's salary/pay detail
  // is refused here, logged, and never reaches the model.
  const refusal = salaryRefusal(message);
  if (refusal) {
    await logAi(req, 'chat', [], true, 'refused: salary guard', startedAt);
    return res.status(200).json({ success: true, answer: refusal, refused: true, aiGenerated: false, toolsUsed: [], toolResults: [] });
  }
  try {
    const result = await chatWithTools(req.user, message, history || [], { language });
    await logAi(req, 'chat', result.toolsUsed, true, null, startedAt);
    return res.status(200).json({ success: true, answer: result.answer, aiGenerated: true, toolsUsed: result.toolsUsed, toolResults: result.toolResults });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return notConfigured(res, startedAt, req, 'chat');
    await logAi(req, 'chat', [], false, err.code || 'provider error', startedAt);
    return res.status(200).json({ success: true, answer: FRIENDLY_FALLBACK, fallback: true, aiGenerated: false, toolsUsed: [], toolResults: [] });
  }
});

export const aiDashboardSummary = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  if (!process.env.AI_API_KEY) return notConfigured(res, startedAt, req, 'dashboard-summary');
  await checkRateLimit(req);
  try {
    const bullets = await dashboardSummary(req.body.kpi);
    await logAi(req, 'dashboard-summary', [], true, null, startedAt);
    return res.status(200).json({ success: true, aiGenerated: true, bullets });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return notConfigured(res, startedAt, req, 'dashboard-summary');
    await logAi(req, 'dashboard-summary', [], false, err.code || 'provider error', startedAt);
    // Never fabricated bullets: the unavailable state instead.
    return res.status(200).json({ success: true, aiAvailable: false, aiGenerated: false, bullets: [], message: FRIENDLY_FALLBACK });
  }
});

export const aiSmartLeave = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  if (!process.env.AI_API_KEY) return notConfigured(res, startedAt, req, 'smart-leave');
  await checkRateLimit(req);
  try {
    const result = await smartLeave(req.body.text);
    await logAi(req, 'smart-leave', [], !result.parseFailed, result.parseFailed ? result.error : null, startedAt);
    if (result.parseFailed) {
      // Frontend falls back to the normal leave form; nothing is ever
      // auto-created — the user confirms via POST /api/leaves.
      return res.status(200).json({ success: true, parseFailed: true, message: 'Could not understand that leave request — please use the leave form below.' });
    }
    return res.status(200).json({ success: true, aiGenerated: true, leave: result });
  } catch (err) {
    if (err instanceof AiNotConfiguredError) return notConfigured(res, startedAt, req, 'smart-leave');
    await logAi(req, 'smart-leave', [], false, err.code || 'provider error', startedAt);
    return res.status(200).json({ success: true, parseFailed: true, aiAvailable: false, message: FRIENDLY_FALLBACK });
  }
});
