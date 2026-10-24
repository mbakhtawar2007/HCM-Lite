import express from 'express';
import { z } from 'zod';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { adminDashboard, employeeDashboard, hrDashboard } from '../controllers/dashboardController.js';

// Query validation (the shared validate() middleware only covers bodies).
const dashboardQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD').optional(),
  department: z.string().regex(/^[0-9a-fA-F]{24}$/, 'department must be a valid id').optional(),
  employeeId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'employeeId must be a valid id').optional(),
});

const validateQuery = (req, _res, next) => {
  const result = dashboardQuerySchema.safeParse(req.query);
  if (!result.success) {
    return _res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'query',
        message: issue.message,
      })),
    });
  }
  req.query = result.data;
  next();
};

const router = express.Router();
router.get('/admin', protect, requireRole('ADMIN'), validateQuery, adminDashboard);
router.get('/hr', protect, requireRole('ADMIN', 'HR'), validateQuery, hrDashboard);
router.get('/employee', protect, validateQuery, employeeDashboard);

export default router;
