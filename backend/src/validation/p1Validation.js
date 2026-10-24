import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
const objectId = z.string().min(1);
const optionalId = z.string().nullable().optional();

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(50),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128),
  role: z.enum(['ADMIN', 'HR', 'EMPLOYEE']),
});
export const resetPasswordSchema = z.object({ password: z.string().min(8).max(128) });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});
export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  role: z.enum(['ADMIN', 'HR', 'EMPLOYEE']).optional(),
  isActive: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const settingSchema = z.object({
  companyName: z.string().trim().min(2).max(100).optional(),
  officeStartMinutes: z.number().int().min(0).max(1439).optional(),
  graceMinutes: z.number().int().min(0).optional(),
  weekendDays: z.array(z.enum(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'])).optional(),
  officeLat: z.number().min(-90).max(90).nullable().optional(),
  officeLng: z.number().min(-180).max(180).nullable().optional(),
  officeRadiusMeters: z.number().min(0).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const departmentSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().default(''),
});
export const designationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  department: optionalId,
});
export const leaveTypeSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(100),
  yearlyQuota: z.number().int().min(0).optional().default(0),
  isUnlimited: z.boolean().optional().default(false),
});
export const holidaySchema = z.object({
  date: isoDate,
  name: z.string().trim().min(2).max(100),
});

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(2).max(50),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(128).optional(),
  employeeCode: z.string().trim().min(1).max(30),
  department: objectId,
  designation: optionalId,
  phone: z.string().trim().max(30).optional().default(''),
  address: z.string().trim().max(500).optional().default(''),
  joiningDate: isoDate,
  basicSalary: z.number().positive('Salary must be greater than 0'),
});
export const updateEmployeeSchema = z.object({
  department: objectId.optional(),
  designation: optionalId,
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(500).optional(),
  leavingDate: isoDate.nullable().optional(),
  basicSalary: z.number().positive().optional(),
  isActive: z.boolean().optional(),
  name: z.string().trim().min(2).max(50).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const correctionSchema = z.object({
  attendanceId: objectId,
  requestedCheckIn: z.string().optional(),
  requestedCheckOut: z.string().optional(),
  reason: z.string().trim().min(3).max(500),
});
export const correctionDecisionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().trim().max(500).optional().default(''),
});

export const leaveApplySchema = z.object({
  leaveType: objectId,
  startDate: isoDate,
  endDate: isoDate,
  reason: z.string().trim().min(3).max(500),
});
export const leaveDecisionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().trim().max(500).optional().default(''),
});

export const payrollRunSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM'),
});
export const importDryRunSchema = z.object({ csv: z.string().min(1) });
