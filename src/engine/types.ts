// Core data model. Everything in src/engine is UI-free so the logic can be
// reused elsewhere (e.g. ported to Excel/VBA or Office Scripts).

/** Calendar date as 'YYYY-MM-DD'. */
export type ISODate = string;

/** 0 = Monday … 6 = Sunday (the schedule's weeks run Mon–Sun). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Section {
  id: string;
  name: string;
}

export interface Staff {
  id: string;
  name: string;
  /** Section ids this person is listed under (e.g. HFA, FURNITURE). */
  sections: string[];
  /** Section manager: every shift needs at least one of these. */
  isManager: boolean;
  partTime: boolean;
  active: boolean;
  canMorning: boolean;
  canEvening: boolean;
  /** Weekdays this person never works (part-time agreements). */
  unavailableWeekdays: Weekday[];
  /** Soft preference: the solver favours this shift when it can. */
  preferredShift?: 'morning' | 'evening';
  /** Personal shift codes used on normal days, e.g. '09A5' or '13A8'. */
  morningCode?: string;
  eveningCode?: string;
  /** Default number of days off per month (pre-fills the month quota). */
  defaultOffDays: number;
}

export interface LeaveType {
  code: string;
  hours: number;
}

export interface Branch {
  code: string;
  name: string;
}

export interface ShiftTemplates {
  morningDefault: string;
  eveningDefault: string;
  eveningPartTime: string;
  /** Weekday-specific codes that apply to everyone, e.g. Thu morning 08A8. */
  morningByWeekday: Partial<Record<Weekday, string>>;
  eveningByWeekday: Partial<Record<Weekday, string>>;
}

export interface Rules {
  maxConsecutiveDays: number;
  /** Hard minimum people at opening / closing, per weekday. */
  minOpen: number[];
  minClose: number[];
  /** Soft targets (the solver tries to reach these). */
  targetOpen: number[];
  targetClose: number[];
  /** Holidays use these targets instead of the weekday ones. */
  holidayTargetOpen: number;
  holidayTargetClose: number;
  managerEachShift: boolean;
  noCloseThenOpen: boolean;
  maxRequestsPerPerson: number;
  /** Paid break length added when a shift is longer than breakAfterHours. */
  breakMinutes: number;
  breakAfterHours: number;
}

export interface Settings {
  storeName: string;
  /** 'HH:MM' */
  storeOpen: string;
  storeClose: string;
  /** Week label = ISO week + offset (202636W for the week of 2026-09-28). */
  weekNumberOffset: number;
  sections: Section[];
  shifts: ShiftTemplates;
  rules: Rules;
  leaveTypes: LeaveType[];
  branches: Branch[];
}

export type CellSource = 'auto' | 'manual' | 'fixed' | 'request' | 'carry';

export interface Cell {
  /** '' = day off. Otherwise a shift code (09A8), leave (AL) or training (TRWG). */
  code: string;
  locked?: boolean;
  source?: CellSource;
}

export interface DayEvent {
  line1: string;
  line2?: string;
  color?: string;
}

/** What a person asked for on a date: a day off, or a particular shift. */
export type RequestKind = 'off' | 'morning' | 'evening';

export interface ShiftRequest {
  kind: RequestKind;
  note?: string;
}

export interface MonthPlan {
  year: number;
  /** 1–12 */
  month: number;
  /** staffId -> date -> cell (covers the whole window, including carry days). */
  cells: Record<string, Record<ISODate, Cell>>;
  /** staffId -> days off wanted inside the month. */
  offQuota: Record<string, number>;
  /** staffId -> date -> request (day off is a hard rule, shifts are strong wishes). */
  requests: Record<string, Record<ISODate, ShiftRequest>>;
  holidays: ISODate[];
  events: Record<ISODate, DayEvent>;
  /** Per-day overrides of the minimum open/close counts. */
  dayOverrides: Record<ISODate, { minOpen?: number; minClose?: number }>;
  generatedAt?: string;
}

export interface AppData {
  version: 1;
  settings: Settings;
  staff: Staff[];
  plans: Record<string, MonthPlan>;
}

export type Severity = 'error' | 'warning';

export type IssueKind =
  | 'noManagerMorning'
  | 'noManagerEvening'
  | 'openShort'
  | 'closeShort'
  | 'tooManyConsecutive'
  | 'closeThenOpen'
  | 'offQuota'
  | 'requestIgnored'
  | 'shiftRequestUnmet'
  | 'unavailable'
  | 'tooManyRequests'
  | 'unknownCode';

export interface Issue {
  kind: IssueKind;
  severity: Severity;
  date?: ISODate;
  staffId?: string;
  /** Values for the message template. */
  params?: Record<string, string | number>;
}
