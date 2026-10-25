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

const section = (ctrl, schema) => {
  const r = express.Router();
  r.get('/', requireRole('ADMIN', 'HR'), ctrl.list);
  r.post('/', requireRole('ADMIN'), validate(schema), ctrl.create);
  r.patch('/:id', requireRole('ADMIN'), validate(schema.partial()), ctrl.update);
  r.delete('/:id', requireRole('ADMIN'), ctrl.remove);
  return r;
};
router.get('/settings', requireRole('ADMIN', 'HR'), getSettingCtrl);
router.patch('/settings', requireRole('ADMIN'), validate(settingSchema), updateSetting);
router.use('/departments', section(departments, departmentSchema));
router.use('/designations', section(designations, designationSchema));
router.use('/leave-types', section(leaveTypes, leaveTypeSchema));
router.use('/holidays', section(holidays, holidaySchema));

export default router;
