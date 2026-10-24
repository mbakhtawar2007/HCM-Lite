// P2 — server-computed dashboards. Every KPI here is computed on the
// server (MongoDB aggregation where the value does not depend on the
// attendance-status rules, plain queries + the shared attendanceService
// where it does). Status-dependent numbers MUST NOT be re-implemented
// inside an aggregation pipeline: computeAttendanceStatus() in
// attendanceService.js is the single definition, so dashboards can never
// disagree with the attendance board or payroll.
//
// Formulas (brief, documented once here and used everywhere below):
// - Headcount at a date = employees with isActive true, joined on/before
//   that date, and leavingDate null or AFTER that date. There is no
//   gender field and no probation/exit-status field on Employee, so no
//   gender breakdown is computed (see the admin response).
// - Attrition = exits in period / average headcount, where average
//   headcount = (headcount at period start + headcount at period end) / 2.
//   Null when the average is 0 (no denominator, not 0% insight). All
//   rates in API responses are ratios (0-1); the UI displays them as
//   percentages (x 100), so attrition matches the brief's "x 100" form
//   once displayed.
// - Attendance rate = (present + late + missing_checkout + 0.5 x half_day)
//   / (working-day slots - on-leave slots). Working-day slots = one slot
//   per employee active on each working day in the range.
// - Late % = late / (present + late). Null when present + late is 0.
// - Absenteeism by department = absent days / expected working days,
//   where expected working days = working-day slots minus on-leave slots
//   for that department (days the employee was actually due in).
// - Leave utilization = approved days in the range / yearly quota for the
//   type. For a partial range this is still measured against the full
//   yearly quota (documented in the response); unlimited types get null.
// - Payroll cost = sum of netPay over FINALIZED runs in the range (the
//   amount actually payable). grossPayable is reported alongside it;
//   draft runs are never counted as cost.
// - Tenure buckets are measured from joiningDate to the range end date:
//   <1 year, 1-3 years, 3-5 years, 5+ years.
// - Rates with no denominator are null ("No data yet" in the UI), never
//   NaN and never a dressed-up 0.
import mongoose from 'mongoose';
import { ApiError } from '../utils/errors.js';
import { Attendance } from '../models/Attendance.js';
import { AttendanceCorrection } from '../models/AttendanceCorrection.js';
import { AuditLog } from '../models/AuditLog.js';
import { Department } from '../models/Department.js';
import { Employee } from '../models/Employee.js';
import { Holiday } from '../models/Holiday.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { Announcement } from '../models/Announcement.js';
import { LeaveType } from '../models/LeaveType.js';
import { PayrollRun } from '../models/PayrollRun.js';
import { computeAttendanceStatus } from './attendanceService.js';
import {
  dateKey,
  dayStart,
  getSetting,
  isHoliday,
  isWeekend,
  workingDaysInYear,
  yearBounds,
} from './settingsService.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const rate = (num, den) => (den > 0 ? round2(num / den) : null);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Parse ?from/&to (YYYY-MM-DD). Defaults: to = today (UTC), from = the
// first day of to's month. A single bound gets the matching default.
export function parseRange(query) {
  const { from, to } = query;
  if (from && !DATE_RE.test(from)) throw new ApiError(400, 'from must be YYYY-MM-DD');
  if (to && !DATE_RE.test(to)) throw new ApiError(400, 'to must be YYYY-MM-DD');
  const toDate = to ? dayStart(to) : dayStart(new Date());
  const fromDate = from ? dayStart(from) : new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1));
  if (fromDate > toDate) throw new ApiError(400, 'from must be on or before to');
  return { from: fromDate, to: toDate };
}

export async function resolveDepartment(departmentId) {
  if (!departmentId) return null;
  if (!mongoose.Types.ObjectId.isValid(departmentId)) throw new ApiError(400, 'department must be a valid id');
  const dept = await Department.findById(departmentId);
  if (!dept) throw new ApiError(404, 'Department not found');
  return dept;
}

// Active-on-date rule, applied identically everywhere (see header).
export function isActiveOn(emp, date) {
  if (!emp.isActive) return false;
  if (emp.joiningDate && dayStart(emp.joiningDate) > date) return false;
  if (emp.leavingDate && dayStart(emp.leavingDate) <= date) return false;
  return true;
}

function activeMatch(date, departmentId) {
  const match = {
    isActive: true,
    joiningDate: { $lte: date },
    $or: [{ leavingDate: null }, { leavingDate: { $gt: date } }],
  };
  if (departmentId) match.department = new mongoose.Types.ObjectId(departmentId);
  return match;
}

// Headcount via aggregation ($match + $count), not a JS filter.
export async function headcountAt(date, departmentId) {
  const rows = await Employee.aggregate([{ $match: activeMatch(date, departmentId) }, { $count: 'n' }]);
  return rows[0]?.n || 0;
}

async function employeesActiveInRange(departmentId) {
  // Everyone who could appear in the range (active flag + department);
  // the per-day activeOn check is then applied in JS.
  const filter = { isActive: true };
  if (departmentId) filter.department = departmentId;
  return Employee.find(filter)
    .populate('department', 'name')
    .populate('designation', 'name')
    .populate('user', 'name email');
}

function listWorkingDays(from, to, holidays, weekendDays) {
  const days = [];
  const cur = dayStart(from);
  const last = dayStart(to);
  while (cur <= last) {
    if (!isWeekend(cur, weekendDays) && !isHoliday(cur, holidays)) days.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

// Status-dependent attendance analysis. Records and approved leaves are
// fetched once; statuses come only from computeAttendanceStatus().
export async function analyseAttendance(from, to, departmentId, setting, holidays) {
  const workingDays = listWorkingDays(from, to, holidays, setting.weekendDays);
  const employees = await employeesActiveInRange(departmentId);
  const empById = new Map(employees.map((e) => [String(e._id), e]));
  const records = await Attendance.find({ date: { $gte: dayStart(from), $lte: dayStart(to) } });
  const recByEmpDay = new Map();
  for (const r of records) {
    if (!empById.has(String(r.employee))) continue;
    recByEmpDay.set(`${r.employee}|${dateKey(r.date)}`, r);
  }
  const approvedLeaves = await LeaveRequest.find({
    status: 'APPROVED',
    startDate: { $lte: dayStart(to) },
    endDate: { $gte: dayStart(from) },
  });
  const leaveDays = new Map(); // employeeId -> Set<dateKey> (working days only)
  for (const lr of approvedLeaves) {
    if (!empById.has(String(lr.employee))) continue;
    const cur = dayStart(lr.startDate);
    const last = dayStart(lr.endDate);
    while (cur <= last) {
      const k = dateKey(cur);
      if (
        cur >= dayStart(from) &&
        cur <= dayStart(to) &&
        !isWeekend(cur, setting.weekendDays) &&
        !isHoliday(cur, holidays)
      ) {
        if (!leaveDays.has(String(lr.employee))) leaveDays.set(String(lr.employee), new Set());
        leaveDays.get(String(lr.employee)).add(k);
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  const totals = { present: 0, late: 0, halfDay: 0, missingCheckout: 0, absent: 0, onLeave: 0, slots: 0 };
  const byDept = new Map(); // deptName -> { department, present, late, halfDay, missingCheckout, absent, onLeave, slots }
  const lateCounts = new Map(); // employeeId -> { employee, lateDays }
  const trend = [];
  for (const day of workingDays) {
    const k = dateKey(day);
    const dayTotals = { date: k, present: 0, late: 0, halfDay: 0, missingCheckout: 0, absent: 0, onLeave: 0 };
    for (const emp of employees) {
      if (!isActiveOn(emp, day)) continue;
      const deptName = emp.department?.name || 'Unassigned';
      if (!byDept.has(deptName)) {
        byDept.set(deptName, {
          department: deptName,
          present: 0,
          late: 0,
          halfDay: 0,
          missingCheckout: 0,
          absent: 0,
          onLeave: 0,
          slots: 0,
        });
      }
      const d = byDept.get(deptName);
      totals.slots += 1;
      d.slots += 1;
      if (leaveDays.get(String(emp._id))?.has(k)) {
        totals.onLeave += 1;
        d.onLeave += 1;
        dayTotals.onLeave += 1;
        continue;
      }
      const rec = recByEmpDay.get(`${emp._id}|${k}`);
      if (!rec) {
        totals.absent += 1;
        d.absent += 1;
        dayTotals.absent += 1;
        continue;
      }
      const status = computeAttendanceStatus(rec, setting);
      if (status === 'LATE') {
        totals.late += 1;
        d.late += 1;
        dayTotals.late += 1;
        if (!lateCounts.has(String(emp._id))) lateCounts.set(String(emp._id), { employee: emp, lateDays: 0 });
        lateCounts.get(String(emp._id)).lateDays += 1;
      } else if (status === 'HALF_DAY') {
        totals.halfDay += 1;
        d.halfDay += 1;
        dayTotals.halfDay += 1;
      } else if (status === 'MISSING_CHECKOUT') {
        totals.missingCheckout += 1;
        d.missingCheckout += 1;
        dayTotals.missingCheckout += 1;
      } else {
        totals.present += 1;
        d.present += 1;
        dayTotals.present += 1;
      }
    }
    trend.push(dayTotals);
  }

  const dueSlots = totals.slots - totals.onLeave;
  const absenteeism = [...byDept.values()]
    .map((d) => {
      const due = d.slots - d.onLeave;
      return {
        department: d.department,
        absentDays: d.absent,
        expectedWorkingDays: due,
        absenteeismRate: rate(d.absent, due),
      };
    })
    .sort((a, b) => a.department.localeCompare(b.department));

  const topLateComers = [...lateCounts.values()]
    .map(({ employee, lateDays }) => ({
      employeeId: String(employee._id),
      employeeCode: employee.employeeCode,
      name: employee.user?.name || '',
      department: employee.department?.name || 'Unassigned',
      lateDays,
    }))
    .sort((a, b) => b.lateDays - a.lateDays || a.employeeCode.localeCompare(b.employeeCode))
    .slice(0, 5);

  return {
    ...totals,
    workingDays: workingDays.length,
    attendanceRate: rate(totals.present + totals.late + totals.missingCheckout + totals.halfDay * 0.5, dueSlots),
    lateRate: rate(totals.late, totals.present + totals.late),
    absenteeismByDepartment: absenteeism,
    trend,
    topLateComers,
  };
}

// Leave in range: approved working days overlapping [from, to], grouped
// by type and by (department, type). Utilization is vs the full yearly
// quota even for partial ranges (see header).
export async function analyseLeave(from, to, departmentId, setting, holidays) {
  const types = await LeaveType.find().sort({ code: 1 });
  const employees = await employeesActiveInRange(departmentId);
  const empById = new Map(employees.map((e) => [String(e._id), e]));
  const approved = await LeaveRequest.find({
    status: 'APPROVED',
    startDate: { $lte: dayStart(to) },
    endDate: { $gte: dayStart(from) },
  });
  const byType = new Map(types.map((t) => [String(t._id), { leaveType: t, approvedDays: 0 }]));
  const byDeptType = new Map();
  for (const lr of approved) {
    const emp = empById.get(String(lr.employee));
    if (!emp) continue;
    let days = 0;
    const cur = dayStart(lr.startDate);
    const last = dayStart(lr.endDate);
    while (cur <= last) {
      if (
        cur >= dayStart(from) &&
        cur <= dayStart(to) &&
        !isWeekend(cur, setting.weekendDays) &&
        !isHoliday(cur, holidays)
      )
        days += 1;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    if (!byType.has(String(lr.leaveType))) byType.set(String(lr.leaveType), { leaveType: null, approvedDays: 0 });
    byType.get(String(lr.leaveType)).approvedDays += days;
    const deptName = emp.department?.name || 'Unassigned';
    const key = `${deptName}|${lr.leaveType}`;
    if (!byDeptType.has(key))
      byDeptType.set(key, { department: deptName, leaveTypeId: String(lr.leaveType), approvedDays: 0 });
    byDeptType.get(key).approvedDays += days;
  }
  const typeById = new Map(types.map((t) => [String(t._id), t]));
  const byTypeOut = [...byType.values()]
    .filter((b) => b.leaveType)
    .map((b) => ({
      leaveType: b.leaveType,
      quota: b.leaveType.isUnlimited ? null : b.leaveType.yearlyQuota,
      approvedDays: b.approvedDays,
      utilization: b.leaveType.isUnlimited ? null : rate(b.approvedDays, b.leaveType.yearlyQuota),
    }));
  const byDeptOut = [...byDeptType.values()]
    .map((b) => {
      const t = typeById.get(b.leaveTypeId);
      return {
        department: b.department,
        leaveType: t || null,
        approvedDays: b.approvedDays,
        utilization: !t || t.isUnlimited ? null : rate(b.approvedDays, t.yearlyQuota),
      };
    })
    .sort(
      (a, b) =>
        a.department.localeCompare(b.department) ||
        String(a.leaveType?.code || '').localeCompare(String(b.leaveType?.code || '')),
    );
  return { byType: byTypeOut, byDepartment: byDeptOut };
}

// Payroll cost via aggregation over embedded lines of FINALIZED runs
// whose month (YYYY-MM) falls in the range. Draft runs never count.
export async function analysePayroll(from, to, departmentId) {
  const fromMonth = from.toISOString().slice(0, 7);
  const toMonth = to.toISOString().slice(0, 7);
  const runCount = await PayrollRun.countDocuments({ status: 'FINALIZED', month: { $gte: fromMonth, $lte: toMonth } });
  const base = [
    { $match: { status: 'FINALIZED', month: { $gte: fromMonth, $lte: toMonth } } },
    { $unwind: '$lines' },
    { $lookup: { from: 'employees', localField: 'lines.employee', foreignField: '_id', as: 'emp' } },
    { $unwind: '$emp' },
  ];
  if (departmentId) base.push({ $match: { 'emp.department': new mongoose.Types.ObjectId(departmentId) } });
  const [totals] = await PayrollRun.aggregate([
    ...base,
    {
      $group: {
        _id: null,
        payrollCost: { $sum: '$lines.netPay' },
        grossPayable: { $sum: '$lines.grossPayable' },
        lines: { $sum: 1 },
      },
    },
  ]);
  const byDepartment = await PayrollRun.aggregate([
    ...base,
    { $lookup: { from: 'departments', localField: 'emp.department', foreignField: '_id', as: 'dept' } },
    { $unwind: { path: '$dept', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ['$dept.name', 'Unassigned'] },
        payrollCost: { $sum: '$lines.netPay' },
        grossPayable: { $sum: '$lines.grossPayable' },
        employees: { $sum: 1 },
      },
    },
    { $sort: { payrollCost: -1 } },
  ]).then((rows) =>
    rows.map((r) => ({
      department: r._id,
      payrollCost: round2(r.payrollCost),
      grossPayable: round2(r.grossPayable),
      employees: r.employees,
    })),
  );
  const byDesignation = await PayrollRun.aggregate([
    ...base,
    { $lookup: { from: 'designations', localField: 'emp.designation', foreignField: '_id', as: 'des' } },
    { $unwind: { path: '$des', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ['$des.name', 'Unassigned'] },
        payrollCost: { $sum: '$lines.netPay' },
        grossPayable: { $sum: '$lines.grossPayable' },
        employees: { $sum: 1 },
      },
    },
    { $sort: { payrollCost: -1 } },
  ]).then((rows) =>
    rows.map((r) => ({
      designation: r._id,
      payrollCost: round2(r.payrollCost),
      grossPayable: round2(r.grossPayable),
      employees: r.employees,
    })),
  );
  return {
    payrollCost: round2(totals?.payrollCost || 0),
    grossPayable: round2(totals?.grossPayable || 0),
    finalizedRuns: runCount,
    lines: totals?.lines || 0,
    byDepartment,
    byDesignation,
  };
}

async function headcountByGroup(date, departmentId, groupField, collection, labelKey) {
  const rows = await Employee.aggregate([
    { $match: activeMatch(date, departmentId) },
    { $lookup: { from: collection, localField: groupField, foreignField: '_id', as: 'g' } },
    { $unwind: { path: '$g', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: [`$g.${labelKey}`, 'Unassigned'] },
        count: { $sum: 1 },
        averageBasicSalary: { $avg: '$basicSalary' },
      },
    },
    { $sort: { count: -1 } },
  ]);
  return rows.map((r) => ({ name: r._id, count: r.count, averageBasicSalary: round2(r.averageBasicSalary || 0) }));
}

function tenureBuckets(employees, end) {
  const buckets = [
    { bucket: '<1 year', count: 0 },
    { bucket: '1–3 years', count: 0 },
    { bucket: '3–5 years', count: 0 },
    { bucket: '5+ years', count: 0 },
  ];
  for (const e of employees) {
    if (!e.joiningDate) continue;
    const years = (end - dayStart(e.joiningDate)) / (365.25 * 86400000);
    if (years < 1) buckets[0].count += 1;
    else if (years < 3) buckets[1].count += 1;
    else if (years < 5) buckets[2].count += 1;
    else buckets[3].count += 1;
  }
  return buckets;
}

export async function getAdminDashboard(query) {
  const { from, to } = parseRange(query);
  const dept = await resolveDepartment(query.department);
  const departmentId = dept?._id || null;
  // getSetting() is kept for its default-row side effect only; this
  // dashboard does not use setting/holidays (analysePayroll fetches its
  // own). The unused Holiday fetch was removed in Phase 5.
  await getSetting();
  const headcountEnd = await headcountAt(to, departmentId);
  const headcountStart = await headcountAt(from, departmentId);
  const { start: yearStart } = yearBounds(to.getUTCFullYear());
  const exitsMatch = {
    leavingDate: { $gte: yearStart, $lte: to },
    ...(departmentId ? { department: departmentId } : {}),
  };
  const exitsYtd = await Employee.countDocuments(exitsMatch);
  // Attrition is year-to-date, so its average headcount spans Jan 1 to
  // the end date — not the (possibly much shorter) query range.
  const headcountYearStart = await headcountAt(yearStart, departmentId);
  const avgHeadcount = (headcountYearStart + headcountEnd) / 2;
  const payroll = await analysePayroll(from, to, departmentId);
  const activeAtEnd = await Employee.find(activeMatch(to, departmentId))
    .populate('department', 'name')
    .populate('designation', 'name');
  const avgSalaryRows = await Employee.aggregate([
    { $match: activeMatch(to, departmentId) },
    { $group: { _id: null, avg: { $avg: '$basicSalary' } } },
  ]);
  const auditFeed = await AuditLog.find().sort({ createdAt: -1 }).limit(20).populate('actor', 'name email role');
  return {
    filters: { from: dateKey(from), to: dateKey(to), department: dept ? { _id: dept._id, name: dept.name } : null },
    headcount: headcountEnd,
    headcountAtPeriodStart: headcountStart,
    exitsYtd,
    attritionYtd: rate(exitsYtd, avgHeadcount),
    averageHeadcountYtd: round2(avgHeadcount),
    payrollCost: payroll.payrollCost,
    grossPayable: payroll.grossPayable,
    finalizedRunsInRange: payroll.finalizedRuns,
    averageSalary: avgSalaryRows[0] ? round2(avgSalaryRows[0].avg) : null,
    headcountByDepartment: await headcountByGroup(to, departmentId, 'department', 'departments', 'name'),
    payrollCostByDepartment: payroll.byDepartment,
    headcountByDesignation: await headcountByGroup(to, departmentId, 'designation', 'designations', 'name'),
    payrollCostByDesignation: payroll.byDesignation,
    tenureDistribution: tenureBuckets(activeAtEnd, to),
    announcements: await Announcement.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('postedBy', 'name email role'),
    announcementsAvailable: true,
    // Employee has no gender field: a gender breakdown would be invented
    // data, so it is honestly reported as not collected.
    genderBreakdown: { available: false, reason: 'Employee records do not collect gender.' },
    auditFeed,
    aiSummary: { available: false, status: 'coming-soon', summary: null },
  };
}

export async function getHrDashboard(query) {
  const { from, to } = parseRange(query);
  const dept = await resolveDepartment(query.department);
  const departmentId = dept?._id || null;
  const setting = await getSetting();
  const holidays = await Holiday.find();
  const today = dayStart(new Date());
  const headcount = await headcountAt(today, departmentId);
  const attendance = await analyseAttendance(from, to, departmentId, setting, holidays);
  const leave = await analyseLeave(from, to, departmentId, setting, holidays);
  // Today: record statuses + on-leave + absent (working days only).
  const todayEmployees = (await employeesActiveInRange(departmentId)).filter((e) => isActiveOn(e, today));
  const todayRecords = await Attendance.find({ date: today });
  const recByEmp = new Map(todayRecords.map((r) => [String(r.employee), r]));
  const todayLeaves = await LeaveRequest.find({
    status: 'APPROVED',
    startDate: { $lte: today },
    endDate: { $gte: today },
  });
  const todayLeaveIds = new Set(todayLeaves.map((l) => String(l.employee)));
  const isWorkingToday = !isWeekend(today, setting.weekendDays) && !isHoliday(today, holidays);
  const todaySummary = { present: 0, late: 0, halfDay: 0, missingCheckout: 0, onLeave: 0, absent: 0, checkedIn: 0 };
  for (const emp of todayEmployees) {
    if (todayLeaveIds.has(String(emp._id))) {
      todaySummary.onLeave += 1;
      continue;
    }
    const rec = recByEmp.get(String(emp._id));
    if (!rec) {
      if (isWorkingToday) todaySummary.absent += 1;
      continue;
    }
    todaySummary.checkedIn += 1;
    const status = computeAttendanceStatus(rec, setting);
    if (status === 'LATE') todaySummary.late += 1;
    else if (status === 'HALF_DAY') todaySummary.halfDay += 1;
    else if (status === 'MISSING_CHECKOUT') todaySummary.missingCheckout += 1;
    else todaySummary.present += 1;
  }
  const pendingLeaves = await LeaveRequest.find({ status: 'PENDING' })
    .populate('leaveType', 'name code')
    .populate({ path: 'employee', populate: { path: 'user', select: 'name email' } })
    .sort({ createdAt: -1 })
    .limit(20);
  const pendingLeavesFiltered = departmentId
    ? pendingLeaves.filter((l) => String(l.employee?.department) === String(departmentId))
    : pendingLeaves;
  const pendingCorrections = await AttendanceCorrection.find({ status: 'PENDING' })
    .populate({ path: 'employee', populate: { path: 'user', select: 'name email' } })
    .sort({ createdAt: -1 })
    .limit(20);
  const pendingCorrectionsFiltered = departmentId
    ? pendingCorrections.filter((c) => String(c.employee?.department) === String(departmentId))
    : pendingCorrections;
  return {
    filters: { from: dateKey(from), to: dateKey(to), department: dept ? { _id: dept._id, name: dept.name } : null },
    headcount,
    today: { date: dateKey(today), isWorkingDay: isWorkingToday, ...todaySummary },
    pendingLeaveApprovals: pendingLeavesFiltered.length,
    pendingLeaves: pendingLeavesFiltered,
    pendingAttendanceCorrections: pendingCorrectionsFiltered.length,
    pendingCorrections: pendingCorrectionsFiltered,
    attendanceTrend: attendance.trend,
    attendanceRate: attendance.attendanceRate,
    lateRate: attendance.lateRate,
    attendanceTotals: {
      present: attendance.present,
      late: attendance.late,
      halfDay: attendance.halfDay,
      missingCheckout: attendance.missingCheckout,
      absent: attendance.absent,
      onLeave: attendance.onLeave,
      workingDays: attendance.workingDays,
    },
    absenteeismByDepartment: attendance.absenteeismByDepartment,
    leaveByType: leave.byType,
    leaveByDepartment: leave.byDepartment,
    topLateComers: attendance.topLateComers,
    announcements: await Announcement.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('postedBy', 'name email role'),
    announcementsAvailable: true,
    aiSummary: { available: false, status: 'coming-soon', summary: null },
  };
}

export async function getEmployeeDashboard(employee, query) {
  const { from, to } = parseRange(query);
  const setting = await getSetting();
  const holidays = await Holiday.find();
  const today = dayStart(new Date());
  const todayRecord = await Attendance.findOne({ employee: employee._id, date: today });
  let todayStatus;
  if (todayRecord) todayStatus = computeAttendanceStatus(todayRecord, setting);
  else if (
    await LeaveRequest.findOne({
      employee: employee._id,
      status: 'APPROVED',
      startDate: { $lte: today },
      endDate: { $gte: today },
    })
  )
    todayStatus = 'ON_LEAVE';
  else if (isWeekend(today, setting.weekendDays) || isHoliday(today, holidays)) todayStatus = 'WEEKEND_OR_HOLIDAY';
  else todayStatus = 'ABSENT';
  // Week hours: Monday–Sunday (UTC) week containing today; only
  // completed check-in/out durations count.
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const weekRecords = await Attendance.find({ employee: employee._id, date: { $gte: monday, $lte: sunday } });
  let weekMinutes = 0;
  for (const r of weekRecords) {
    if (r.checkOut) weekMinutes += (new Date(r.checkOut) - new Date(r.checkIn)) / 60000;
  }
  const rangeRecords = await Attendance.find({ employee: employee._id, date: { $gte: from, $lte: to } });
  const lateCount = rangeRecords.filter((r) => computeAttendanceStatus(r, setting) === 'LATE').length;
  // Balances use the same method as the P1 balances endpoint: only the
  // working days actually falling in the current year count (Phase 1
  // fix — a cross-year leave was previously charged in full here too).
  const year = today.getUTCFullYear();
  const { start: yearStart, end: yearEnd } = yearBounds(year);
  const types = await LeaveType.find().sort({ code: 1 });
  const balances = [];
  for (const t of types) {
    const approved = await LeaveRequest.find({
      employee: employee._id,
      leaveType: t._id,
      status: 'APPROVED',
      startDate: { $lte: yearEnd },
      endDate: { $gte: yearStart },
    });
    const used = approved.reduce(
      (s, l) => s + workingDaysInYear(l.startDate, l.endDate, year, holidays, setting.weekendDays),
      0,
    );
    const pendingReqs = await LeaveRequest.find({
      employee: employee._id,
      leaveType: t._id,
      status: 'PENDING',
      startDate: { $lte: yearEnd },
      endDate: { $gte: yearStart },
    });
    const pending = pendingReqs.reduce(
      (s, l) => s + workingDaysInYear(l.startDate, l.endDate, year, holidays, setting.weekendDays),
      0,
    );
    balances.push({
      leaveType: t,
      quota: t.isUnlimited ? null : t.yearlyQuota,
      used,
      pending,
      remaining: t.isUnlimited ? null : Math.max(0, t.yearlyQuota - used),
    });
  }
  const lastRun = await PayrollRun.findOne({ status: 'FINALIZED', 'lines.employee': employee._id }).sort({ month: -1 });
  const lastPayslip = lastRun
    ? {
        month: lastRun.month,
        runId: lastRun._id,
        ...(lastRun.lines.find((l) => String(l.employee) === String(employee._id))?.toObject() || {}),
      }
    : null;
  return {
    filters: { from: dateKey(from), to: dateKey(to) },
    employee,
    today: {
      date: dateKey(today),
      status: todayStatus,
      checkIn: todayRecord?.checkIn || null,
      checkOut: todayRecord?.checkOut || null,
    },
    week: { start: dateKey(monday), end: dateKey(sunday), hours: round2(weekMinutes / 60), targetHours: 40 },
    lateCount,
    leaveBalances: balances,
    lastPayslip,
    announcements: await Announcement.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('postedBy', 'name email role'),
    announcementsAvailable: true,
    askAssistant: { available: false, status: 'coming-soon' },
  };
}
