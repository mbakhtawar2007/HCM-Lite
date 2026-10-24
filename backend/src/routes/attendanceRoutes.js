import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { checkIn, checkOut, dailyBoard, decideCorrection, listAttendance, listCorrections, myAttendance, requestCorrection } from '../controllers/attendanceController.js';
import { correctionDecisionSchema, correctionSchema } from '../validation/p1Validation.js';

const router = express.Router();
router.use(protect);

router.post('/check-in', requireRole('EMPLOYEE'), checkIn);
router.post('/check-out', requireRole('EMPLOYEE'), checkOut);
router.get('/me', requireRole('EMPLOYEE'), myAttendance);
router.get('/board', requireRole('ADMIN', 'HR'), dailyBoard);
router.get('/corrections', requireRole('ADMIN', 'HR', 'EMPLOYEE'), listCorrections);
router.post('/corrections', requireRole('EMPLOYEE'), validate(correctionSchema), requestCorrection);
router.patch('/corrections/:id', requireRole('ADMIN', 'HR'), validate(correctionDecisionSchema), decideCorrection);
router.get('/', requireRole('ADMIN', 'HR', 'EMPLOYEE'), listAttendance);

export default router;
