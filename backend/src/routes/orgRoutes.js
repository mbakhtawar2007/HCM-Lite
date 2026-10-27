import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import {
  departments,
  designations,
  getSettingCtrl,
  holidays,
  leaveTypes,
  updateSetting,
} from '../controllers/orgController.js';
import {
  departmentSchema,
  designationSchema,
  holidaySchema,
  leaveTypeSchema,
  settingSchema,
} from '../validation/p1Validation.js';

const router = express.Router();
router.use(protect);

// Leave types are read-only policy data (names and yearly quotas) that
// employees already see as their own balances, and the employee leave
// form needs the list to offer a type dropdown. Without EMPLOYEE here,
// the form's orgList('leave-types') call 403'd and the dropdown was
// silently empty for every employee — the apply itself worked, so this
// was a broken UI flow, not a permission design. All other sections
// (departments, designations, holidays) stay ADMIN/HR for reads, and
// every write stays ADMIN-only.
const section = (ctrl, schema, getRoles = ['ADMIN', 'HR']) => {
  const r = express.Router();
  r.get('/', requireRole(...getRoles), ctrl.list);
  r.post('/', requireRole('ADMIN'), validate(schema), ctrl.create);
  r.patch('/:id', requireRole('ADMIN'), validate(schema.partial()), ctrl.update);
  r.delete('/:id', requireRole('ADMIN'), ctrl.remove);
  return r;
};
router.get('/settings', requireRole('ADMIN', 'HR'), getSettingCtrl);
router.patch('/settings', requireRole('ADMIN'), validate(settingSchema), updateSetting);
router.use('/departments', section(departments, departmentSchema));
router.use('/designations', section(designations, designationSchema));
router.use('/leave-types', section(leaveTypes, leaveTypeSchema, ['ADMIN', 'HR', 'EMPLOYEE']));
router.use('/holidays', section(holidays, holidaySchema));

export default router;
