import { weekday } from './dates';
import type { ISODate, Settings, Staff } from './types';

/**
 * Shift code format: HH + minute letter + work hours, e.g. 13C8.
 *   A = :00, B = :15, C = :30, D = :45
 * Work hours exclude the break, so 09A8 is 09:00–18:00 with a 1h break.
 */
const MINUTE_LETTERS: Record<string, number> = { A: 0, B: 15, C: 30, D: 45 };
const SHIFT_RE = /^(\d{1,2})([A-D])(\d{1,2})$/;

export interface ShiftInfo {
  start: number; // minutes from midnight
  end: number;
  hours: number;
}

export function parseShift(code: string, settings: Settings): ShiftInfo | null {
  const m = SHIFT_RE.exec(code.trim().toUpperCase());
  if (!m) return null;
  const start = Number(m[1]) * 60 + MINUTE_LETTERS[m[2]];
  const hours = Number(m[3]);
  const { breakMinutes, breakAfterHours } = settings.rules;
  const end = start + hours * 60 + (hours > breakAfterHours ? breakMinutes : 0);
  return { start, end, hours };
}

export function makeShiftCode(startMinutes: number, hours: number): string {
  const h = Math.floor(startMinutes / 60);
  const letter = 'ABCD'[Math.round((startMinutes % 60) / 15)] ?? 'A';
  return `${String(h).padStart(2, '0')}${letter}${hours}`;
}

export function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minutesToHHMM(n: number): string {
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

export type CodeKind = 'off' | 'shift' | 'training' | 'leave' | 'unknown';

/** What a cell code means for counting and rule checks. */
export interface CodeInfo {
  kind: CodeKind;
  /** Counts as a worked day (for off-day quota and weekly hours). */
  worked: boolean;
  /** Physically in this store (counts towards coverage). */
  present: boolean;
  /** Counts towards the "consecutive working days" limit. */
  consecutive: boolean;
  opens: boolean;
  closes: boolean;
  hours: number;
  shift?: ShiftInfo;
  branch?: string;
}

const OFF: CodeInfo = { kind: 'off', worked: false, present: false, consecutive: false, opens: false, closes: false, hours: 0 };

export function codeInfo(code: string, settings: Settings): CodeInfo {
  const c = code.trim().toUpperCase();
  if (!c) return OFF;
  const shift = parseShift(c, settings);
  if (shift) {
    return {
      kind: 'shift',
      worked: true,
      present: true,
      consecutive: true,
      opens: shift.start <= hhmmToMinutes(settings.storeOpen),
      closes: shift.end >= hhmmToMinutes(settings.storeClose),
      hours: shift.hours,
      shift,
    };
  }
  if (c.startsWith('TR')) {
    return { kind: 'training', worked: true, present: false, consecutive: true, opens: false, closes: false, hours: 8, branch: c.slice(2) };
  }
  const leave = settings.leaveTypes.find((l) => l.code.toUpperCase() === c);
  if (leave) {
    // Paid leave fills a working day but is rest, so it breaks a work streak.
    return { kind: 'leave', worked: true, present: false, consecutive: false, opens: false, closes: false, hours: leave.hours };
  }
  return { kind: 'unknown', worked: false, present: false, consecutive: false, opens: false, closes: false, hours: 0 };
}

/** The morning code this person works on this date. */
export function morningCodeFor(staff: Staff, date: ISODate, settings: Settings): string {
  const s = settings.shifts;
  return s.morningByWeekday[weekday(date)] ?? staff.morningCode ?? s.morningDefault;
}

/** The evening (closing) code this person works on this date. */
export function eveningCodeFor(staff: Staff, date: ISODate, settings: Settings): string {
  const s = settings.shifts;
  return (
    s.eveningByWeekday[weekday(date)] ??
    staff.eveningCode ??
    (staff.partTime ? s.eveningPartTime : s.eveningDefault)
  );
}
