import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { createEmployee, exportEmployeesCsv, getEmployee, getEmployee360, getMyEmployee, importDryRun, listEmployees, updateEmployee } from '../controllers/employeeController.js';
import { createEmployeeSchema, importDryRunSchema, updateEmployeeSchema } from '../validation/p1Validation.js';

const router = express.Router();
router.use(protect);

router.get('/export/csv', requireRole('ADMIN', 'HR'), exportEmployeesCsv);
router.post('/import/dry-run', requireRole('ADMIN', 'HR'), validate(importDryRunSchema), importDryRun);
router.get('/me', requireRole('EMPLOYEE'), getMyEmployee);
router.get('/:id/360', requireRole('ADMIN', 'HR', 'EMPLOYEE'), getEmployee360);
router.get('/:id', requireRole('ADMIN', 'HR', 'EMPLOYEE'), getEmployee);
router.get('/', requireRole('ADMIN', 'HR'), listEmployees);
router.post('/', requireRole('ADMIN', 'HR'), validate(createEmployeeSchema), createEmployee);
router.patch('/:id', requireRole('ADMIN', 'HR', 'EMPLOYEE'), validate(updateEmployeeSchema), updateEmployee);

export default router;
