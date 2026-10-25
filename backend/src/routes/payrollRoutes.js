import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import {
  createRun,
  deleteRun,
  finalizeRun,
  getPayslip,
  getPayslipPdf,
  getRun,
  listRuns,
  myPayslips,
  recomputeRun,
} from '../controllers/payrollController.js';
import { payrollRunSchema } from '../validation/p1Validation.js';

const router = express.Router();
router.use(protect);

router.get('/my-payslips', requireRole('EMPLOYEE', 'HR', 'ADMIN'), myPayslips);
router.get('/runs/:id/payslip/:employeeId/pdf', requireRole('ADMIN', 'HR', 'EMPLOYEE'), getPayslipPdf);
router.get('/runs/:id/payslip/:employeeId', requireRole('ADMIN', 'HR', 'EMPLOYEE'), getPayslip);
router.get('/runs/:id', requireRole('ADMIN', 'HR'), getRun);
router.get('/runs', requireRole('ADMIN', 'HR'), listRuns);
router.post('/runs', requireRole('ADMIN', 'HR'), validate(payrollRunSchema), createRun);
router.post('/runs/:id/recompute', requireRole('ADMIN', 'HR'), recomputeRun);
router.post('/runs/:id/finalize', requireRole('ADMIN'), finalizeRun);
router.delete('/runs/:id', requireRole('ADMIN', 'HR'), deleteRun);

export default router;
