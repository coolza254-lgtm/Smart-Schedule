import type { ISODate, Weekday } from './types';

// All date math is done in UTC so time zones and DST never shift a day.

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function weekday(s: ISODate): Weekday {
  return ((fromISO(s).getUTCDay() + 6) % 7) as Weekday;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function firstOfMonth(year: number, month: number): ISODate {
  return `${monthKey(year, month)}-01`;
}

export function lastOfMonth(year: number, month: number): ISODate {
  return `${monthKey(year, month)}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
}

export function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** ISO-8601 week number and week-year. */
export function isoWeek(s: ISODate): { year: number; week: number } {
  const d = fromISO(s);
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const year = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((thursday.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { year, week };
}

export function isoWeeksInYear(year: number): number {
  return isoWeek(`${year}-12-28`).week;
}

/**
 * Store week label such as "202636W". The store numbers weeks as the ISO
 * week plus an offset (−4 matches the October 2026 sheet). Weeks that fall
 * before week 1 roll back into the previous year's numbering.
 */
export function weekLabel(s: ISODate, offset: number): string {
  let { year, week } = isoWeek(s);
  week += offset;
  if (week < 1) {
    year -= 1;
    week += isoWeeksInYear(year);
  } else if (week > isoWeeksInYear(year)) {
    week -= isoWeeksInYear(year);
    year += 1;
  }
  return `${year}${String(week).padStart(2, '0')}W`;
}

export function rangeDates(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
