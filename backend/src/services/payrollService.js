import { Attendance } from '../models/Attendance.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { LeaveType } from '../models/LeaveType.js';
import { computeAttendanceStatus } from './attendanceService.js';
import { dayStart, listWorkingDaysInMonth, workingDaysBetween } from './settingsService.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Tax on annualised gross (gross x 12), then divided by 12 for the month.
// Slabs (annual): 0% to 600k, 5% to 1.2M, 30k+15% to 2.4M,
// 210k+25% to 3.6M, 510k+35% above.
export function annualTax(annualGross) {
  if (annualGross <= 600000) return 0;
  if (annualGross <= 1200000) return (annualGross - 600000) * 0.05;
  if (annualGross <= 2400000) return 30000 + (annualGross - 1200000) * 0.15;
  if (annualGross <= 3600000) return 210000 + (annualGross - 2400000) * 0.25;
  return 510000 + (annualGross - 3600000) * 0.35;
}

export function monthlyTax(gross) {
  return round2(annualTax(gross * 12) / 12);
}

// Pure, hand-checkable core: given counts, produce the line. Tests use
// this directly as well as through the full run builder below.
export function computePayrollLine({ basicSalary, workingDays, effectiveWorkingDays, lateDays, halfDays, absentDays, unpaidLeaveDays, paidLeaveDays, presentDays }) {
  const gross = round2(basicSalary * 1.5);
  const hra = round2(basicSalary * 0.4);
  const medical = round2(basicSalary * 0.1);
  const perDay = workingDays > 0 ? gross / workingDays : 0;
  const deductionDays = round2(absentDays + unpaidLeaveDays + halfDays * 0.5);
  const payableDays = Math.max(0, effectiveWorkingDays - deductionDays);
  const grossPayable = round2(perDay * payableDays);
  const tax = monthlyTax(gross);
  const netPay = round2(grossPayable - tax);
  return {
    basicSalary, grossSalary: gross, hra, medical, workingDays, effectiveWorkingDays,
    presentDays, lateDays, halfDays, absentDays, unpaidLeaveDays, paidLeaveDays,
    deductionDays, grossPayable, tax, netPay,
  };
}

export async function buildPayrollLine(employee, year, month, setting, holidays) {
  const workingDaysList = listWorkingDaysInMonth(year, month, holidays, setting.weekendDays);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const join = employee.joiningDate ? dayStart(employee.joiningDate) : monthStart;
  const leave = employee.leavingDate ? dayStart(employee.leavingDate) : monthEnd;
  const effStart = join > monthStart ? join : monthStart;
  const effEnd = leave < monthEnd ? leave : monthEnd;
  const effectiveWorkingDays = effStart > effEnd ? 0 : workingDaysBetween(effStart, effEnd, holidays, setting.weekendDays);
  const effectiveDays = workingDaysList.filter((d) => d >= effStart && d <= effEnd);

  const attendance = await Attendance.find({
    employee: employee._id,
    date: { $gte: monthStart, $lte: monthEnd },
  });
  const attByKey = new Map(attendance.map((a) => [a.date.toISOString().slice(0, 10), a]));

  const approvedLeaves = await LeaveRequest.find({
    employee: employee._id, status: 'APPROVED',
    startDate: { $lte: monthEnd }, endDate: { $gte: monthStart },
  }).populate('leaveType');
  const unpaidTypeIds = new Set(
    (await LeaveType.find({ isUnlimited: true })).map((t) => String(t._id)),
  );
  const leaveDayType = new Map(); // dateKey -> 'UNPAID' | 'PAID'
  for (const lr of approvedLeaves) {
    const cur = dayStart(lr.startDate);
    const last = dayStart(lr.endDate);
    while (cur <= last) {
      const k = cur.toISOString().slice(0, 10);
      if (effectiveDays.some((d) => d.toISOString().slice(0, 10) === k)) {
        leaveDayType.set(k, unpaidTypeIds.has(String(lr.leaveType?._id)) || lr.leaveType?.code === 'UNPAID' ? 'UNPAID' : 'PAID');
      }
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  let presentDays = 0; let lateDays = 0; let halfDays = 0; let absentDays = 0;
  let unpaidLeaveDays = 0; let paidLeaveDays = 0;
  for (const day of effectiveDays) {
    const k = day.toISOString().slice(0, 10);
    if (leaveDayType.has(k)) {
      if (leaveDayType.get(k) === 'UNPAID') unpaidLeaveDays += 1; else paidLeaveDays += 1;
      continue;
    }
    const rec = attByKey.get(k);
    if (!rec) { absentDays += 1; continue; }
    const status = computeAttendanceStatus(rec, setting);
    if (status === 'HALF_DAY') halfDays += 1;
    else if (status === 'LATE') lateDays += 1;
    else presentDays += 1; // PRESENT and MISSING_CHECKOUT both count as a worked day
  }

  return {
    employee: employee._id,
    ...computePayrollLine({
      basicSalary: employee.basicSalary,
      workingDays: workingDaysList.length,
      effectiveWorkingDays,
      presentDays, lateDays, halfDays, absentDays, unpaidLeaveDays, paidLeaveDays,
    }),
  };
}
