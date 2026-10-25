import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { applyLeave, cancelLeave, decideLeave, getBalances, listLeaves } from '../controllers/leaveController.js';
import { leaveApplySchema, leaveDecisionSchema } from '../validation/p1Validation.js';

const router = express.Router();
router.use(protect);

router.get('/balances', requireRole('ADMIN', 'HR', 'EMPLOYEE'), getBalances);
router.get('/', requireRole('ADMIN', 'HR', 'EMPLOYEE'), listLeaves);
router.post('/', requireRole('EMPLOYEE', 'HR', 'ADMIN'), validate(leaveApplySchema), applyLeave);
router.patch('/:id/cancel', requireRole('EMPLOYEE', 'HR', 'ADMIN'), cancelLeave);
router.patch('/:id/decision', requireRole('ADMIN', 'HR'), validate(leaveDecisionSchema), decideLeave);

export default router;
