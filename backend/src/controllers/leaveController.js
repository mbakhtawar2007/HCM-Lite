import { asyncHandler } from '../utils/asyncHandler.js';
import { conflict, forbidden, notFoundError } from '../utils/errors.js';
import { ApiError } from '../utils/errors.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { LeaveType } from '../models/LeaveType.js';
import { Holiday } from '../models/Holiday.js';
import { getSetting, workingDaysBetween, workingDaysInYear, dayStart } from '../services/settingsService.js';
import { notifyUser, writeAudit } from '../services/attendanceService.js';
import { ownEmployee, scopedEmployee } from '../utils/scope.js';

// Phase 1 fix: previously every approved leave overlapping a year
// contributed its FULL workingDays to that year, so a leave spanning
// Dec–Jan was double-counted (and charged fully to the start year on
// apply). Now only the working days actually falling in that year count.
async function usedDays(employeeId, leaveTypeId, year, holidays, weekendDays) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  const approved = await LeaveRequest.find({
    employee: employeeId, leaveType: leaveTypeId, status: 'APPROVED',
    startDate: { $lte: end }, endDate: { $gte: start },
  });
  return approved.reduce(
    (sum, l) => sum + workingDaysInYear(l.startDate, l.endDate, year, holidays, weekendDays),
    0,
  );
}

async function pendingDays(employeeId, leaveTypeId, year, holidays, weekendDays) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  const pending = await LeaveRequest.find({
    employee: employeeId, leaveType: leaveTypeId, status: 'PENDING',
    startDate: { $lte: end }, endDate: { $gte: start },
  });
  return pending.reduce(
    (sum, l) => sum + workingDaysInYear(l.startDate, l.endDate, year, holidays, weekendDays),
    0,
  );
}

export const getBalances = asyncHandler(async (req, res) => {
  let employeeId = req.query.employeeId;
  if (req.user.role === 'EMPLOYEE') {
    const own = await ownEmployee(req.user._id);
    employeeId = String(own._id);
  } else if (!employeeId) {
    throw new ApiError(400, 'employeeId is required');
  }
  const year = parseInt(req.query.year, 10) || new Date().getUTCFullYear();
  const setting = await getSetting();
  const holidays = await Holiday.find();
  const types = await LeaveType.find().sort({ code: 1 });
  const balances = [];
  for (const t of types) {
    const used = await usedDays(employeeId, t._id, year, holidays, setting.weekendDays);
    const pending = await pendingDays(employeeId, t._id, year, holidays, setting.weekendDays);
    balances.push({
      leaveType: t,
      quota: t.isUnlimited ? null : t.yearlyQuota,
      used, pending,
      remaining: t.isUnlimited ? null : Math.max(0, t.yearlyQuota - used),
    });
  }
  res.status(200).json({ success: true, year, balances });
});

export const applyLeave = asyncHandler(async (req, res) => {
  const emp = await ownEmployee(req.user._id);
  const leaveType = await LeaveType.findById(req.body.leaveType);
  if (!leaveType) throw notFoundError('Leave type not found');
  const setting = await getSetting();
  const holidays = await Holiday.find();
  const start = dayStart(req.body.startDate);
  const end = dayStart(req.body.endDate);
  if (end < start) throw new ApiError(400, 'End date must be on or after start date');
  const workingDays = workingDaysBetween(start, end, holidays, setting.weekendDays);
  if (workingDays === 0) throw new ApiError(422, 'Selected dates contain no working days');
  const overlap = await LeaveRequest.findOne({
    employee: emp._id, status: { $in: ['PENDING', 'APPROVED'] },
    startDate: { $lte: end }, endDate: { $gte: start },
  });
  if (overlap) throw new ApiError(422, 'Leave overlaps an existing pending or approved leave');
  if (!leaveType.isUnlimited) {
    // Check each calendar year the range touches separately, using only
    // that year's portion of the range (cross-year leaves used to be
    // charged in full to the start year).
    const startYear = start.getUTCFullYear();
    const endYear = end.getUTCFullYear();
    for (let year = startYear; year <= endYear; year += 1) {
      const portion = workingDaysInYear(start, end, year, holidays, setting.weekendDays);
      if (portion === 0) continue;
      const used = await usedDays(emp._id, leaveType._id, year, holidays, setting.weekendDays);
      if (used + portion > leaveType.yearlyQuota) {
        throw new ApiError(422, 'Leave exceeds your remaining balance for this type');
      }
    }
  }
  const leave = await LeaveRequest.create({
    employee: emp._id, leaveType: leaveType._id, startDate: start, endDate: end, workingDays, reason: req.body.reason,
  });
  await writeAudit(req, 'CREATE', 'LeaveRequest', leave._id, null, { workingDays });
  res.status(201).json({ success: true, leave });
});

export const listLeaves = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === 'EMPLOYEE') {
    const own = await ownEmployee(req.user._id);
    filter.employee = own._id;
  } else if (req.query.employeeId) filter.employee = req.query.employeeId;
  if (req.query.status) filter.status = req.query.status;
  const leaves = await LeaveRequest.find(filter).sort({ createdAt: -1 }).populate('leaveType').populate('employee');
  res.status(200).json({ success: true, count: leaves.length, leaves });
});

export const cancelLeave = asyncHandler(async (req, res) => {
  const leave = await LeaveRequest.findById(req.params.id);
  if (!leave) throw notFoundError('Leave request not found');
  const own = await ownEmployee(req.user._id);
  if (String(leave.employee) !== String(own._id)) throw forbidden('You can only cancel your own leave');
  if (leave.status !== 'PENDING') throw conflict('Only pending leave can be cancelled');
  const beforeCancel = leave.toJSON();
  leave.status = 'CANCELLED';
  await leave.save();
  await writeAudit(req, 'UPDATE', 'LeaveRequest', leave._id, beforeCancel, leave.toJSON());
  res.status(200).json({ success: true, leave });
});

export const decideLeave = asyncHandler(async (req, res) => {
  const leave = await LeaveRequest.findById(req.params.id).populate('leaveType');
  if (!leave) throw notFoundError('Leave request not found');
  if (leave.status !== 'PENDING') throw conflict('Leave already decided');
  if (req.body.status === 'APPROVED' && !leave.leaveType.isUnlimited) {
    const setting = await getSetting();
    const holidays = await Holiday.find();
    const start = dayStart(leave.startDate);
    const end = dayStart(leave.endDate);
    for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year += 1) {
      const portion = workingDaysInYear(start, end, year, holidays, setting.weekendDays);
      if (portion === 0) continue;
      // usedDays here counts other approved leaves; this leave is still
      // PENDING at this point, so it is not double-counted.
      const used = await usedDays(leave.employee, leave.leaveType._id, year, holidays, setting.weekendDays);
      if (used + portion > leave.leaveType.yearlyQuota) {
        throw new ApiError(422, 'Approving this leave would exceed the employee balance');
      }
    }
  }
  const before = leave.toJSON();
  leave.status = req.body.status;
  leave.decidedBy = req.user._id;
  leave.decisionComment = req.body.comment || '';
  await leave.save();
  await writeAudit(req, 'DECIDE', 'LeaveRequest', leave._id, before, leave.toJSON());
  const { Employee } = await import('../models/Employee.js');
  const emp = await Employee.findById(leave.employee);
  if (emp) {
    await notifyUser(emp.user, 'LEAVE_DECISION', `Leave ${req.body.status.toLowerCase()}`,
      `Your ${leave.leaveType.name} leave (${leave.startDate.toISOString().slice(0, 10)} to ${leave.endDate.toISOString().slice(0, 10)}) was ${req.body.status.toLowerCase()}.${req.body.comment ? ` Comment: ${req.body.comment}` : ''}`,
      leave._id);
  }
  res.status(200).json({ success: true, leave });
});
