import { Setting } from '../models/Setting.js';

// Settings are read from the DB, never hard-coded in controllers.
// If no Setting row exists yet (tests / pre-setup calls), a default row
// is created so attendance/leave rules always have a source of truth.
export async function getSetting() {
  let setting = await Setting.findOne();
  if (!setting) {
    setting = await Setting.create({ companyName: 'HCM Lite' });
  }
  return setting;
}

export const WEEKDAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function dayStart(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function dateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

export function isWeekend(date, weekendDays) {
  return weekendDays.includes(WEEKDAY_CODES[new Date(date).getUTCDay()]);
}

export function isHoliday(date, holidays) {
  const key = dateKey(date);
  return holidays.some((h) => dateKey(h.date) === key);
}

// Working days between two dates inclusive, skipping weekends + holidays.
export function workingDaysBetween(start, end, holidays, weekendDays) {
  let count = 0;
  const cur = dayStart(start);
  const last = dayStart(end);
  while (cur <= last) {
    if (!isWeekend(cur, weekendDays) && !isHoliday(cur, holidays)) count += 1;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

export function workingDaysInMonth(year, month, holidays, weekendDays) {
  // month is 1-12
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return workingDaysBetween(start, end, holidays, weekendDays);
}

export function listWorkingDaysInMonth(year, month, holidays, weekendDays) {
  const days = [];
  const cur = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  while (cur <= last) {
    if (!isWeekend(cur, weekendDays) && !isHoliday(cur, holidays)) days.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}
