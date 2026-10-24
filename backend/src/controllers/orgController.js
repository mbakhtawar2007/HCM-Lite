import { asyncHandler } from '../utils/asyncHandler.js';
import { conflict, notFoundError } from '../utils/errors.js';
import { Setting } from '../models/Setting.js';
import { Department } from '../models/Department.js';
import { Designation } from '../models/Designation.js';
import { LeaveType } from '../models/LeaveType.js';
import { Holiday } from '../models/Holiday.js';
import { Employee } from '../models/Employee.js';
import { getSetting } from '../services/settingsService.js';
import { writeAudit } from '../services/attendanceService.js';

export const getSettingCtrl = asyncHandler(async (_req, res) => {
  res.status(200).json({ success: true, setting: await getSetting() });
});
export const updateSetting = asyncHandler(async (req, res) => {
  const setting = await getSetting();
  const before = setting.toJSON();
  Object.assign(setting, req.body);
  await setting.save();
  await writeAudit(req, 'UPDATE', 'Setting', setting._id, before, setting.toJSON());
  res.status(200).json({ success: true, setting });
});

const crud = (Model, name) => ({
  list: asyncHandler(async (_req, res) => {
    // Only populate department for models that actually have that path:
    // LeaveType has no department field, and populating it throws a
    // StrictPopulateError (this 500'd GET /org/leave-types in P1).
    const query = Model.find().sort({ createdAt: 1 });
    if (Model.schema.path('department')) query.populate('department');
    const items = await query;
    res.status(200).json({ success: true, count: items.length, items });
  }),
  create: asyncHandler(async (req, res) => {
    const item = await Model.create(req.body);
    await writeAudit(req, 'CREATE', name, item._id, null, item.toJSON());
    res.status(201).json({ success: true, item });
  }),
  update: asyncHandler(async (req, res) => {
    const item = await Model.findById(req.params.id);
    if (!item) throw notFoundError(`${name} not found`);
    const before = item.toJSON();
    Object.assign(item, req.body);
    await item.save();
    await writeAudit(req, 'UPDATE', name, item._id, before, item.toJSON());
    res.status(200).json({ success: true, item });
  }),
  remove: asyncHandler(async (req, res) => {
    const item = await Model.findById(req.params.id);
    if (!item) throw notFoundError(`${name} not found`);
    if (name === 'Department') {
      if (await Employee.countDocuments({ department: item._id })) throw conflict('Department is in use by employees');
      if (await Designation.countDocuments({ department: item._id })) throw conflict('Department is in use by designations');
    }
    if (name === 'Designation' && await Employee.countDocuments({ designation: item._id })) {
      throw conflict('Designation is in use by employees');
    }
    await item.deleteOne();
    await writeAudit(req, 'DELETE', name, item._id, item.toJSON(), null);
    res.status(200).json({ success: true, message: `${name} deleted` });
  }),
});

export const departments = crud(Department, 'Department');
export const designations = crud(Designation, 'Designation');
export const leaveTypes = crud(LeaveType, 'LeaveType');
export const holidays = crud(Holiday, 'Holiday');
