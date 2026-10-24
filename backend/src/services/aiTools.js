import mongoose from 'mongoose';
import { Attendance } from '../models/Attendance.js';
import { Department } from '../models/Department.js';
import { Employee } from '../models/Employee.js';
import { Holiday } from '../models/Holiday.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { LeaveType } from '../models/LeaveType.js';
import { PayrollRun } from '../models/PayrollRun.js';
import { User } from '../models/User.js';
import { computeAttendanceStatus } from './attendanceService.js';
import {
  analyseAttendance,
  analyseLeave,
  analysePayroll,
  headcountAt,
  parseRange,
  resolveDepartment,
} from './dashboardService.js';
import {
  dateKey,
  dayStart,
  getSetting,
  isHoliday,
  isWeekend,
  workingDaysBetween,
  workingDaysInYear,
  yearBounds,
} from './settingsService.js';
import { ownEmployee } from '../utils/scope.js';
import { escapeRegExp } from '../utils/escapeRegExp.js';

// P3 — AI tools. Every tool reuses the same dashboard/leave/payroll
// services and the same role scope as the REST API; there are no new
// unscoped queries here, and no tool ever returns a salary field.
// (HR/Admin still manage salaries through the REST API, not the chat.)
// Results are plain JSON the model turns into prose; the database is
// the only source of truth and the model never queries it directly.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isStaff = (user) => ['ADMIN', 'HR'].includes(user.role);

async function resolveDeptArg(department) {
  if (!department) return null;
  if (mongoose.Types.ObjectId.isValid(department)) {
    const byId = await Department.findById(department);
    if (byId) return byId;
  }
  const byName = await Department.findOne({ name: new RegExp(`^${escapeRegExp(String(department).trim())}$`, 'i') });
  return byName || null;
}

function rangeFrom(args) {
  const from = args.from && DATE_RE.test(args.from) ? dayStart(args.from) : dayStart(new Date());
  const to = args.to && DATE_RE.test(args.to) ? dayStart(args.to) : dayStart(new Date());
  if (from > to) throw new Error('from must be on or before to');
  return { from, to };
}

async function ownDeptScoped(user, departmentArg) {
  // EMPLOYEE: only their own department, whatever they asked for.
  if (user.role === 'EMPLOYEE') {
    const own = await ownEmployee(user._id);
    return { dept: own.department ? await Department.findById(own.department) : null, scopedToOwn: true };
  }
  const dept = await resolveDeptArg(departmentArg);
  return { dept, scopedToOwn: false };
}

export const AI_TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'get_headcount',
      description: 'Number of active employees, optionally in one department. Employees only see their own department.',
      parameters: {
        type: 'object',
        properties: { department: { type: 'string', description: 'Department id or name (optional)' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_attendance_summary',
      description:
        'Attendance totals and attendance rate for a date range, optionally one department. Employees only see their own record.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
          to: { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
          department: { type: 'string', description: 'Department id or name (optional, staff only)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_late_comers',
      description: 'Employees with the most late days in a date range. HR and ADMIN only; refused for employees.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          limit: { type: 'number', description: 'Top N, default 5, max 10' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_leave_summary',
      description: 'Approved leave days by type (and department for staff). Employees only see their own leave.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          department: { type: 'string', description: 'Department id or name (optional, staff only)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_leave_balance',
      description:
        "The requesting user's own leave balances for the current year: quota, used, pending, remaining per type.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_payroll_summary',
      description:
        'Staff: aggregate payroll cost from FINALIZED runs only (never individual salaries). Employees: only their own last finalized payslip summary.',
      parameters: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_employees',
      description:
        'Directory search by name, email or employee code. Never returns salary fields. Employees only ever get their own record.',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    },
  },
];

const stripSalary = (emp) => {
  const o = emp.toObject ? emp.toObject() : { ...emp };
  delete o.basicSalary;
  return o;
};

// Phase 5 bug fix: balances must match the REST balances endpoint and the
// dashboard. Previously this summed each leave's FULL stored workingDays
// (so a cross-year leave was charged in full to the current year) and
// counted PENDING leaves from every year. Now only the working days
// actually falling in `year` count, for both approved and pending.
async function balancesFor(employeeId, year, setting, holidays) {
  const { start, end } = yearBounds(year);
  const types = await LeaveType.find().sort({ code: 1 });
  const out = [];
  for (const t of types) {
    const approved = await LeaveRequest.find({
      employee: employeeId,
      leaveType: t._id,
      status: 'APPROVED',
      startDate: { $lte: end },
      endDate: { $gte: start },
    });
    const used = approved.reduce(
      (s, l) => s + workingDaysInYear(l.startDate, l.endDate, year, holidays, setting.weekendDays),
      0,
    );
    const pendingReqs = await LeaveRequest.find({
      employee: employeeId,
      leaveType: t._id,
      status: 'PENDING',
      startDate: { $lte: end },
      endDate: { $gte: start },
    });
    const pending = pendingReqs.reduce(
      (s, l) => s + workingDaysInYear(l.startDate, l.endDate, year, holidays, setting.weekendDays),
      0,
    );
    out.push({
      leaveType: { code: t.code, name: t.name },
      quota: t.isUnlimited ? null : t.yearlyQuota,
      used,
      pending,
      remaining: t.isUnlimited ? null : Math.max(0, t.yearlyQuota - used),
    });
  }
  return { year, balances: out };
}

async function ownAttendanceSummary(emp, from, to, setting, holidays) {
  const records = await Attendance.find({ employee: emp._id, date: { $gte: from, $lte: to } });
  const approved = await LeaveRequest.find({
    employee: emp._id,
    status: 'APPROVED',
    startDate: { $lte: to },
    endDate: { $gte: from },
  });
  const leaveDays = new Set();
  for (const lr of approved) {
    const cur = dayStart(lr.startDate);
    const last = dayStart(lr.endDate);
    while (cur <= last) {
      if (cur >= from && cur <= to && !isWeekend(cur, setting.weekendDays) && !isHoliday(cur, holidays))
        leaveDays.add(dateKey(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  const totals = { present: 0, late: 0, halfDay: 0, missingCheckout: 0, absent: 0, onLeave: 0, slots: 0 };
  const recByDay = new Map(records.map((r) => [dateKey(r.date), r]));
  const cur = dayStart(from);
  const last = dayStart(to);
  while (cur <= last) {
    if (!isWeekend(cur, setting.weekendDays) && !isHoliday(cur, holidays)) {
      totals.slots += 1;
      const k = dateKey(cur);
      if (leaveDays.has(k)) totals.onLeave += 1;
      else {
        const rec = recByDay.get(k);
        if (!rec) totals.absent += 1;
        else {
          const s = computeAttendanceStatus(rec, setting);
          if (s === 'LATE') totals.late += 1;
          else if (s === 'HALF_DAY') totals.halfDay += 1;
          else if (s === 'MISSING_CHECKOUT') totals.missingCheckout += 1;
          else totals.present += 1;
        }
      }
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  const due = totals.slots - totals.onLeave;
  const rate =
    due > 0
      ? Math.round(((totals.present + totals.late + totals.missingCheckout + totals.halfDay * 0.5) / due) * 100) / 100
      : null;
  return { scope: 'own', ...totals, attendanceRate: rate };
}

// Runs one tool with the caller's scope. Returns { name, result } where
// result is JSON-safe data for the model — never salary fields, and a
// polite refusal object (not other people's data) for staff-only tools
// asked by an employee.
export async function runAiTool(user, name, args = {}) {
  const setting = await getSetting();
  const holidays = await Holiday.find();
  switch (name) {
    case 'get_headcount': {
      const { dept, scopedToOwn } = await ownDeptScoped(user, args.department);
      const today = dayStart(new Date());
      return {
        name,
        result: {
          headcount: await headcountAt(today, dept?._id || null),
          asOf: dateKey(today),
          department: dept ? dept.name : null,
          scopedToOwnDepartment: scopedToOwn,
        },
      };
    }
    case 'get_attendance_summary': {
      const { from, to } = rangeFrom(args);
      if (user.role === 'EMPLOYEE') {
        const own = await ownEmployee(user._id);
        return {
          name,
          result: {
            from: dateKey(from),
            to: dateKey(to),
            ...(await ownAttendanceSummary(own, from, to, setting, holidays)),
          },
        };
      }
      const dept = await resolveDeptArg(args.department);
      const a = await analyseAttendance(from, to, dept?._id || null, setting, holidays);
      return {
        name,
        result: {
          from: dateKey(from),
          to: dateKey(to),
          department: dept ? dept.name : null,
          present: a.present,
          late: a.late,
          halfDay: a.halfDay,
          missingCheckout: a.missingCheckout,
          absent: a.absent,
          onLeave: a.onLeave,
          workingDays: a.workingDays,
          attendanceRate: a.attendanceRate,
          lateRate: a.lateRate,
        },
      };
    }
    case 'get_late_comers': {
      if (!isStaff(user)) {
        return {
          name,
          result: {
            refused: true,
            message: "I can only show you your own attendance, not other employees' late records.",
          },
        };
      }
      const { from, to } = rangeFrom(args);
      const dept = await resolveDeptArg(args.department);
      const a = await analyseAttendance(from, to, dept?._id || null, setting, holidays);
      const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));
      return {
        name,
        result: {
          from: dateKey(from),
          to: dateKey(to),
          department: dept ? dept.name : null,
          lateComers: a.topLateComers.slice(0, limit),
        },
      };
    }
    case 'get_leave_summary': {
      const { from, to } = rangeFrom(args);
      if (user.role === 'EMPLOYEE') {
        const own = await ownEmployee(user._id);
        const approved = await LeaveRequest.find({
          employee: own._id,
          status: 'APPROVED',
          startDate: { $lte: to },
          endDate: { $gte: from },
        }).populate('leaveType', 'code name');
        const byType = {};
        for (const lr of approved) {
          const code = lr.leaveType?.code || 'UNKNOWN';
          // Phase 5 bug fix: count only the working days inside the
          // requested range (staff analyseLeave already did this); the
          // stored full workingDays over-counted range-spanning leaves.
          const rangeStart = dayStart(lr.startDate) > from ? dayStart(lr.startDate) : from;
          const rangeEnd = dayStart(lr.endDate) < to ? dayStart(lr.endDate) : to;
          byType[code] =
            (byType[code] || 0) +
            (rangeEnd < rangeStart ? 0 : workingDaysBetween(rangeStart, rangeEnd, holidays, setting.weekendDays));
        }
        return { name, result: { scope: 'own', from: dateKey(from), to: dateKey(to), approvedDaysByType: byType } };
      }
      const dept = await resolveDeptArg(args.department);
      const l = await analyseLeave(from, to, dept?._id || null, setting, holidays);
      return {
        name,
        result: {
          from: dateKey(from),
          to: dateKey(to),
          department: dept ? dept.name : null,
          byType: l.byType.map((b) => ({
            code: b.leaveType.code,
            name: b.leaveType.name,
            approvedDays: b.approvedDays,
            utilization: b.utilization,
          })),
        },
      };
    }
    case 'get_my_leave_balance': {
      const own = await ownEmployee(user._id);
      return { name, result: await balancesFor(own._id, new Date().getUTCFullYear(), setting, holidays) };
    }
    case 'get_payroll_summary': {
      const { from, to } = rangeFrom(args);
      if (user.role === 'EMPLOYEE') {
        const own = await ownEmployee(user._id);
        const lastRun = await PayrollRun.findOne({ status: 'FINALIZED', 'lines.employee': own._id }).sort({
          month: -1,
        });
        if (!lastRun) return { name, result: { scope: 'own', lastFinalizedPayslip: null } };
        const line = lastRun.lines.find((l) => String(l.employee) === String(own._id));
        return {
          name,
          result: {
            scope: 'own',
            lastFinalizedPayslip: line
              ? { month: lastRun.month, grossPayable: line.grossPayable, tax: line.tax, netPay: line.netPay }
              : null,
          },
        };
      }
      const p = await analysePayroll(from, to, null);
      return {
        name,
        result: {
          from: dateKey(from),
          to: dateKey(to),
          payrollCost: p.payrollCost,
          grossPayable: p.grossPayable,
          finalizedRuns: p.finalizedRuns,
          byDepartment: p.byDepartment,
        },
      };
    }
    case 'search_employees': {
      const q = String(args.query || '').trim();
      if (user.role === 'EMPLOYEE') {
        const own = await ownEmployee(user._id);
        const populated = await Employee.findById(own._id)
          .populate('department', 'name')
          .populate('designation', 'name')
          .populate('user', 'name email role');
        return { name, result: { scope: 'own', employees: [stripSalary(populated)] } };
      }
      const safe = new RegExp(escapeRegExp(q), 'i');
      const users = await User.find({ $or: [{ name: safe }, { email: safe }] }).select('_id');
      const emps = await Employee.find({ $or: [{ employeeCode: safe }, { user: { $in: users.map((u) => u._id) } }] })
        .populate('department', 'name')
        .populate('designation', 'name')
        .populate('user', 'name email role')
        .limit(20);
      return { name, result: { employees: emps.map(stripSalary) } };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Re-exported for the chat route: validates a range the same way the
// dashboard routes do, so tool errors stay 400-style, not 500s.
export { parseRange, resolveDepartment };
