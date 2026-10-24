import { dayStart } from './settingsService.js';

// Shared by attendance display, the daily board and payroll — one
// definition of every status, so payroll can never disagree with the board.
export function minutesOfDay(date) {
  const d = new Date(date);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// checkIn at exactly officeStart+grace is ON TIME (late only AFTER it).
// Duration under 5h (300 min) with a checkout is a HALF_DAY, even if late.
export function computeAttendanceStatus(record, setting) {
  if (!record) return 'ABSENT';
  if (!record.checkOut) return 'MISSING_CHECKOUT';
  const durationMin = (new Date(record.checkOut) - new Date(record.checkIn)) / 60000;
  if (durationMin < 300) return 'HALF_DAY';
  const lateAfter = setting.officeStartMinutes + setting.graceMinutes;
  if (minutesOfDay(record.checkIn) > lateAfter) return 'LATE';
  return 'PRESENT';
}

export function todayDayStart() {
  return dayStart(new Date());
}

export async function writeAudit(req, action, entity, entityId, before, after) {
  try {
    const { AuditLog } = await import('../models/AuditLog.js');
    await AuditLog.create({
      actor: req?.user?._id || null,
      action,
      entity,
      entityId: String(entityId || ''),
      before: before ?? null,
      after: after ?? null,
    });
  } catch {
    // Audit must never break the business operation it records.
  }
}

export async function notifyUser(userId, type, title, message, relatedId = '') {
  const { Notification } = await import('../models/Notification.js');
  return Notification.create({ user: userId, type, title, message, relatedId: String(relatedId || '') });
}
