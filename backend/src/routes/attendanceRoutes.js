import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import {
  cameraCheckIn,
  checkIn,
  checkOut,
  dailyBoard,
  decideCorrection,
  listAttendance,
  listCorrections,
  myAttendance,
  requestCorrection,
} from '../controllers/attendanceController.js';
import {
  cameraCheckInSchema,
  checkInSchema,
  correctionDecisionSchema,
  correctionSchema,
} from '../validation/p1Validation.js';

const router = express.Router();
router.use(protect);

// Marking attendance is HR + Employees only (user decision 2026-10-27):
// Admin accounts never check in, check out, or camera-check-in, even
// if an employee record happens to be linked to an Admin login.
router.post('/check-in', requireRole('EMPLOYEE', 'HR'), validate(checkInSchema), checkIn);
router.post('/check-in/camera', requireRole('EMPLOYEE', 'HR'), validate(cameraCheckInSchema), cameraCheckIn);
router.post('/check-out', requireRole('EMPLOYEE', 'HR'), checkOut);
router.get('/me', requireRole('EMPLOYEE', 'HR', 'ADMIN'), myAttendance);
router.get('/board', requireRole('ADMIN', 'HR'), dailyBoard);
router.get('/corrections', requireRole('ADMIN', 'HR', 'EMPLOYEE'), listCorrections);
router.post('/corrections', requireRole('EMPLOYEE', 'HR'), validate(correctionSchema), requestCorrection);
router.patch('/corrections/:id', requireRole('ADMIN', 'HR'), validate(correctionDecisionSchema), decideCorrection);
router.get('/', requireRole('ADMIN', 'HR', 'EMPLOYEE'), listAttendance);

export default router;
