import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { listAuditLogs, listNotifications, markNotificationRead } from '../controllers/miscController.js';

const router = express.Router();

// Protect is applied per-route (not router-wide) so unmatched /api/*
// paths still fall through to the central 404 handler instead of 401.
router.get('/audit-logs', protect, requireRole('ADMIN'), listAuditLogs);
router.get('/notifications', protect, listNotifications);
router.patch('/notifications/:id/read', protect, markNotificationRead);

export default router;
