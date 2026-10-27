import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest, conflict, forbidden, notFoundError } from '../utils/errors.js';
import { Attendance } from '../models/Attendance.js';
import { AttendanceCorrection } from '../models/AttendanceCorrection.js';
import { Employee } from '../models/Employee.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { Holiday } from '../models/Holiday.js';
import { computeAttendanceStatus, todayDayStart, writeAudit } from '../services/attendanceService.js';
import { getSetting, dayStart, dateKey, isWeekend, isHoliday, haversineMeters } from '../services/settingsService.js';
import { ownEmployee, ownEmployeeForSelfService } from '../utils/scope.js';
import { assertDateQuery, assertObjectIdQuery } from '../utils/queryGuard.js';

// POST /api/attendance/check-in — server-stamped time, one record/day.
// Phase 1 geofence: if the office location (officeLat/officeLng) and a
// radius are set in Settings, the employee must send their location and
// be inside the radius. If no office location is set, check-in works
// exactly as before (no location required, nothing breaks).
// Only HR and Employees mark attendance. This guard is defence in
// depth behind the route roles: an Admin login linked to an employee
// record must still never create an attendance record.
const forbidAdminMarking = (role) => {
  if (role === 'ADMIN') throw forbidden('Admin accounts do not mark attendance — only HR and Employees check in.');
};

export const checkIn = asyncHandler(async (req, res) => {
  forbidAdminMarking(req.user.role);
  const emp = await ownEmployeeForSelfService(req.user._id, req.user.role);
  const setting = await getSetting();
  if (setting.officeLat != null && setting.officeLng != null && setting.officeRadiusMeters > 0) {
    const { latitude, longitude } = req.body || {};
    if (latitude == null || longitude == null) {
      throw badRequest('Office location check is enabled: please share your location to check in');
    }
    const distance = haversineMeters(setting.officeLat, setting.officeLng, latitude, longitude);
    if (distance > setting.officeRadiusMeters) {
      throw forbidden(
        `You are outside the office radius (${Math.round(distance)}m away, limit ${setting.officeRadiusMeters}m)`,
      );
    }
  }
  const today = todayDayStart();
  if (await Attendance.findOne({ employee: emp._id, date: today })) {
    throw conflict('Already checked in today');
  }
  let record;
  try {
    // Unique (employee, date) index is the backstop for a concurrent or
    // double-clicked check-in: without this catch it surfaced as a 500.
    record = await Attendance.create({ employee: emp._id, date: today, checkIn: new Date() });
  } catch (err) {
    if (err && err.code === 11000) throw conflict('Already checked in today');
    throw err;
  }
  await writeAudit(req, 'CREATE', 'Attendance', record._id, null, { employee: String(emp._id), date: today });
  res.status(201).json({ success: true, attendance: record });
});

export const checkOut = asyncHandler(async (req, res) => {
  forbidAdminMarking(req.user.role);
  const emp = await ownEmployeeForSelfService(req.user._id, req.user.role);
  const record = await Attendance.findOne({ employee: emp._id, date: todayDayStart() });
  if (!record) throw notFoundError('No check-in found for today');
  if (record.checkOut) throw conflict('Already checked out today');
  const before = record.toJSON();
  record.checkOut = new Date();
  await record.save();
  await writeAudit(req, 'UPDATE', 'Attendance', record._id, before, record.toJSON());
  res.status(200).json({ success: true, attendance: record });
});

export const myAttendance = asyncHandler(async (req, res) => {
  const emp = await ownEmployeeForSelfService(req.user._id, req.user.role);
  const setting = await getSetting();
  const records = await Attendance.find({ employee: emp._id }).sort({ date: -1 }).limit(200);
  res.status(200).json({
    success: true,
    attendance: records.map((r) => ({ ...r.toJSON(), status: computeAttendanceStatus(r, setting) })),
  });
});

export const listAttendance = asyncHandler(async (req, res) => {
  // HR/ADMIN: any employee. EMPLOYEE: only own (employeeId must be own).
  let employeeId = req.query.employeeId;
  assertObjectIdQuery(employeeId, 'employeeId');
  assertDateQuery(req.query.from, 'from');
  assertDateQuery(req.query.to, 'to');
  if (req.user.role === 'EMPLOYEE') {
    const own = await ownEmployee(req.user._id);
    if (employeeId && String(employeeId) !== String(own._id)) throw forbidden('You can only access your own records');
    employeeId = String(own._id);
  }
  const filter = {};
  if (employeeId) filter.employee = employeeId;
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = dayStart(req.query.from);
    if (req.query.to) filter.date.$lte = dayStart(req.query.to);
  }
  const setting = await getSetting();
  const records = await Attendance.find(filter).sort({ date: -1 }).populate('employee');
  res.status(200).json({
    success: true,
    count: records.length,
    attendance: records.map((r) => ({ ...r.toJSON(), status: computeAttendanceStatus(r, setting) })),
  });
});

// GET /api/attendance/board?date=YYYY-MM-DD — HR/ADMIN daily board.
export const dailyBoard = asyncHandler(async (req, res) => {
  assertDateQuery(req.query.date, 'date');
  const setting = await getSetting();
  const holidays = await Holiday.find();
  const day = req.query.date ? dayStart(req.query.date) : todayDayStart();
  const employees = await Employee.find({ isActive: true }).populate('user', 'name email');
  const records = await Attendance.find({ date: day });
  const recByEmp = new Map(records.map((r) => [String(r.employee), r]));
  const approvedLeaves = await LeaveRequest.find({
    status: 'APPROVED',
    startDate: { $lte: day },
    endDate: { $gte: day },
  });
  const leaveEmpIds = new Set(approvedLeaves.map((l) => String(l.employee)));
  const board = employees.map((e) => {
    const rec = recByEmp.get(String(e._id));
    let status;
    if (rec) status = computeAttendanceStatus(rec, setting);
    else if (leaveEmpIds.has(String(e._id))) status = 'ON_LEAVE';
    else if (isWeekend(day, setting.weekendDays) || isHoliday(day, holidays)) status = 'WEEKEND_OR_HOLIDAY';
    else status = 'ABSENT';
    return { employee: e, attendance: rec || null, status };
  });
  res.status(200).json({ success: true, date: dateKey(day), board });
});

export const requestCorrection = asyncHandler(async (req, res) => {
  forbidAdminMarking(req.user.role);
  const emp = await ownEmployeeForSelfService(req.user._id, req.user.role);
  const attendance = await Attendance.findById(req.body.attendanceId);
  if (!attendance || String(attendance.employee) !== String(emp._id))
    throw notFoundError('Attendance record not found');
  if (!req.body.requestedCheckIn && !req.body.requestedCheckOut)
    throw badRequest('Provide a requested check-in or check-out');
  // A correction must stay on the record's own day and stay sane: an
  // impossible date (2026-02-30) rolls over in new Date(), and a
  // check-out before the check-in would silently corrupt the record
  // when an approver later applies it. Reject both at request time.
  const requestedCheckIn = req.body.requestedCheckIn ? new Date(req.body.requestedCheckIn) : null;
  const requestedCheckOut = req.body.requestedCheckOut ? new Date(req.body.requestedCheckOut) : null;
  if (requestedCheckIn && Number.isNaN(requestedCheckIn.getTime()))
    throw badRequest('Requested check-in is not a valid date');
  if (requestedCheckOut && Number.isNaN(requestedCheckOut.getTime()))
    throw badRequest('Requested check-out is not a valid date');
  if (requestedCheckIn && dateKey(requestedCheckIn) !== dateKey(attendance.date))
    throw badRequest('Requested check-in must be on the same day as the attendance record');
  if (requestedCheckOut && dateKey(requestedCheckOut) !== dateKey(attendance.date))
    throw badRequest('Requested check-out must be on the same day as the attendance record');
  if (requestedCheckIn && requestedCheckOut && requestedCheckOut <= requestedCheckIn)
    throw badRequest('Requested check-out must be after the requested check-in');
  const correction = await AttendanceCorrection.create({
    employee: emp._id,
    attendance: attendance._id,
    requestedCheckIn,
    requestedCheckOut,
    reason: req.body.reason,
  });
  await writeAudit(req, 'CREATE', 'AttendanceCorrection', correction._id, null, {
    attendance: String(attendance._id),
    reason: req.body.reason,
  });
  res.status(201).json({ success: true, correction });
});

export const listCorrections = asyncHandler(async (req, res) => {
  assertObjectIdQuery(req.query.employeeId, 'employeeId');
  const filter = {};
  if (req.user.role === 'EMPLOYEE') {
    const own = await ownEmployee(req.user._id);
    filter.employee = own._id;
  } else if (req.query.employeeId) filter.employee = req.query.employeeId;
  const corrections = await AttendanceCorrection.find(filter)
    .sort({ createdAt: -1 })
    .populate('employee')
    .populate('attendance');
  res.status(200).json({ success: true, count: corrections.length, corrections });
});

export const decideCorrection = asyncHandler(async (req, res) => {
  const correction = await AttendanceCorrection.findById(req.params.id);
  if (!correction) throw notFoundError('Correction request not found');
  if (correction.status !== 'PENDING') throw conflict('Correction already decided');
  // Nobody decides their own correction: the requester is the linked
  // employee record's user, so an HR user cannot approve their own.
  const correctionEmployee = await Employee.findById(correction.employee);
  if (correctionEmployee && String(correctionEmployee.user) === String(req.user._id))
    throw forbidden('You cannot decide your own correction request');
  const before = correction.toJSON();
  correction.status = req.body.status;
  correction.decidedBy = req.user._id;
  correction.decisionComment = req.body.comment || '';
  await correction.save();
  if (req.body.status === 'APPROVED') {
    const att = await Attendance.findById(correction.attendance);
    if (att) {
      // Defence in depth for corrections created before the request-time
      // checks above: never apply a cross-day or backwards correction.
      if (
        (correction.requestedCheckIn && dateKey(correction.requestedCheckIn) !== dateKey(att.date)) ||
        (correction.requestedCheckOut && dateKey(correction.requestedCheckOut) !== dateKey(att.date)) ||
        (correction.requestedCheckIn &&
          correction.requestedCheckOut &&
          correction.requestedCheckOut <= correction.requestedCheckIn)
      )
        throw badRequest('This correction has invalid requested times and cannot be applied');
      if (correction.requestedCheckIn) att.checkIn = correction.requestedCheckIn;
      if (correction.requestedCheckOut) att.checkOut = correction.requestedCheckOut;
      await att.save();
    }
  }
  await writeAudit(req, 'DECIDE', 'AttendanceCorrection', correction._id, before, correction.toJSON());
  res.status(200).json({ success: true, correction });
});

// POST /api/attendance/check-in/camera — bonus G, optional.
// The browser must have detected exactly one face (faceCount === 1),
// must send GPS coordinates, and accuracy must be <= 100m. The server
// then applies the same office geofence as normal check-in (Haversine
// vs officeLat/officeLng/radius) and decides — the phone only sends
// data. No photo is stored; the record only carries source='camera'.
// Any failure here falls back to the normal web check-in / HR
// correction path (the caller simply does not get a camera record).
export const cameraCheckIn = asyncHandler(async (req, res) => {
  forbidAdminMarking(req.user.role);
  const emp = await ownEmployeeForSelfService(req.user._id, req.user.role);
  const { latitude, longitude, accuracy, faceCount } = req.body || {};
  if (faceCount !== 1) throw badRequest('Camera check-in requires exactly one face in the frame');
  if (accuracy == null || accuracy > 100) throw badRequest('Camera check-in requires GPS accuracy of 100m or better');
  const setting = await getSetting();
  if (setting.officeLat == null || setting.officeLng == null || !(setting.officeRadiusMeters > 0)) {
    throw badRequest('Camera check-in requires an office location and radius in Settings');
  }
  const distance = haversineMeters(setting.officeLat, setting.officeLng, latitude, longitude);
  if (distance > setting.officeRadiusMeters) {
    throw forbidden(
      `You are outside the office radius (${Math.round(distance)}m away, limit ${setting.officeRadiusMeters}m)`,
    );
  }
  const today = todayDayStart();
  if (await Attendance.findOne({ employee: emp._id, date: today })) {
    throw conflict('Already checked in today');
  }
  let record;
  try {
    record = await Attendance.create({ employee: emp._id, date: today, checkIn: new Date(), source: 'camera' });
  } catch (err) {
    if (err && err.code === 11000) throw conflict('Already checked in today');
    throw err;
  }
  await writeAudit(req, 'CREATE', 'Attendance', record._id, null, {
    employee: String(emp._id),
    date: today,
    source: 'camera',
  });
  res.status(201).json({ success: true, attendance: record });
});
