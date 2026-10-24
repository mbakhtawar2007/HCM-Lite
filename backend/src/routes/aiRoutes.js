import express from 'express';
import { z } from 'zod';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { aiChat, aiDashboardSummary, aiSmartLeave } from '../controllers/aiController.js';

// P3 — all roles may use the chat; role-appropriate behaviour comes
// from the backend tools and the salary guard, not from hiding buttons.
// Dashboard summary is staff-only (it summarizes company KPIs).
const router = express.Router();

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(2000) })).max(10).optional(),
  language: z.enum(['en', 'ur']).optional(),
});

// KPI JSON is validated as an object of plain numbers/strings only:
// the frontend sends the numbers already displayed on the dashboard,
// never a free database query. Nested objects/arrays are rejected.
const kpiValue = z.union([z.number(), z.string().max(200), z.boolean(), z.null()]);
const dashboardSchema = z.object({
  kpi: z.record(kpiValue).refine((k) => Object.keys(k).length > 0 && Object.keys(k).length <= 50, 'kpi must be a non-empty object'),
});

const smartLeaveSchema = z.object({
  text: z.string().trim().min(3).max(1000),
});

router.post('/chat', protect, requireRole('ADMIN', 'HR', 'EMPLOYEE'), validate(chatSchema), aiChat);
router.post('/dashboard-summary', protect, requireRole('ADMIN', 'HR'), validate(dashboardSchema), aiDashboardSummary);
router.post('/smart-leave', protect, requireRole('ADMIN', 'HR', 'EMPLOYEE'), validate(smartLeaveSchema), aiSmartLeave);

export default router;
