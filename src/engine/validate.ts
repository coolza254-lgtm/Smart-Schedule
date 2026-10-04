import { addDays, weekday } from './dates';
import { getCell, isInMonth, lookback, monthDates, offRequests, scheduledStaff, windowDates } from './month';
import { codeInfo, type CodeInfo } from './shifts';
import type { AppData, ISODate, Issue, MonthPlan, RequestKind, Settings } from './types';

export interface DayCoverage {
  date: ISODate;
  open: number;
  close: number;
  managerOpen: number;
  managerClose: number;
  minOpen: number;
  minClose: number;
  targetOpen: number;
  targetClose: number;
}

export function minOpenFor(settings: Settings, plan: MonthPlan, date: ISODate): number {
  return plan.dayOverrides[date]?.minOpen ?? settings.rules.minOpen[weekday(date)];
}

export function minCloseFor(settings: Settings, plan: MonthPlan, date: ISODate): number {
  return plan.dayOverrides[date]?.minClose ?? settings.rules.minClose[weekday(date)];
}

export function targetsFor(settings: Settings, plan: MonthPlan, date: ISODate): { open: number; close: number } {
  const r = settings.rules;
  const holiday = plan.holidays.includes(date);
  const open = holiday ? r.holidayTargetOpen : r.targetOpen[weekday(date)];
  const close = holiday ? r.holidayTargetClose : r.targetClose[weekday(date)];
  // A target is never below the hard minimum.
  return {
    open: Math.max(open, minOpenFor(settings, plan, date)),
    close: Math.max(close, minCloseFor(settings, plan, date)),
  };
}

export function dayCoverage(data: AppData, plan: MonthPlan, date: ISODate): DayCoverage {
  const cov: DayCoverage = {
    date,
    open: 0,
    close: 0,
    managerOpen: 0,
    managerClose: 0,
    minOpen: minOpenFor(data.settings, plan, date),
    minClose: minCloseFor(data.settings, plan, date),
    ...(() => {
      const t = targetsFor(data.settings, plan, date);
      return { targetOpen: t.open, targetClose: t.close };
    })(),
  };
  for (const s of scheduledStaff(data)) {
    const info = codeInfo(getCell(plan, s.id, date).code, data.settings);
    if (!info.present) continue;
    if (info.opens) {
      cov.open++;
      if (s.isManager) cov.managerOpen++;
    }
    if (info.closes) {
      cov.close++;
      if (s.isManager) cov.managerClose++;
    }
  }
  return cov;
}

/** Codes for one person from the lookback period through the end of the month. */
export function timeline(
  data: AppData,
  plan: MonthPlan,
  staffId: string,
  back = lookback(data, plan.year, plan.month),
): { date: ISODate; code: string; info: CodeInfo; inMonth: boolean }[] {
  const dates = windowDates(plan.year, plan.month);
  const out: { date: ISODate; code: string; info: CodeInfo; inMonth: boolean }[] = [];
  const earlier = Object.keys(back[staffId] ?? {}).sort();
  // Only use contiguous earlier history that ends right before the window.
  const firstWindow = dates[0];
  let cursor = addDays(firstWindow, -1);
  const prefix: ISODate[] = [];
  while (earlier.includes(cursor)) {
    prefix.unshift(cursor);
    cursor = addDays(cursor, -1);
  }
  for (const d of prefix) {
    const code = back[staffId][d].code;
    out.push({ date: d, code, info: codeInfo(code, data.settings), inMonth: false });
  }
  for (const d of dates) {
    const code = getCell(plan, staffId, d).code;
    out.push({ date: d, code, info: codeInfo(code, data.settings), inMonth: isInMonth(d, plan.year, plan.month) });
  }
  return out;
}

export function offDaysUsed(data: AppData, plan: MonthPlan, staffId: string): number {
  let off = 0;
  for (const d of monthDates(plan.year, plan.month)) {
    if (!codeInfo(getCell(plan, staffId, d).code, data.settings).worked) off++;
  }
  return off;
}

/**
 * Whether a cell satisfies a request. Training or leave on a requested
 * shift day counts as 'other' (not the person's choice, not a violation).
 */
export function requestStatus(info: CodeInfo, kind: RequestKind): 'met' | 'unmet' | 'other' {
  if (kind === 'off') return info.worked ? 'unmet' : 'met';
  if (!info.present) return info.kind === 'off' ? 'unmet' : 'other';
  if (kind === 'morning') return info.opens ? 'met' : 'unmet';
  return info.closes ? 'met' : 'unmet';
}

export function validate(data: AppData, plan: MonthPlan): Issue[] {
  const { settings } = data;
  const rules = settings.rules;
  const issues: Issue[] = [];
  const staff = scheduledStaff(data);
  const back = lookback(data, plan.year, plan.month);

  for (const date of monthDates(plan.year, plan.month)) {
    const c = dayCoverage(data, plan, date);
    if (rules.managerEachShift && c.managerOpen === 0) issues.push({ kind: 'noManagerMorning', severity: 'error', date });
    if (rules.managerEachShift && c.managerClose === 0) issues.push({ kind: 'noManagerEvening', severity: 'error', date });
    if (c.open < c.minOpen) issues.push({ kind: 'openShort', severity: 'error', date, params: { count: c.open, min: c.minOpen } });
    if (c.close < c.minClose) issues.push({ kind: 'closeShort', severity: 'error', date, params: { count: c.close, min: c.minClose } });
  }

  for (const s of staff) {
    const line = timeline(data, plan, s.id, back);

    let run = 0;
    let reported = false;
    for (let i = 0; i < line.length; i++) {
      const t = line[i];
      if (t.info.consecutive) {
        run++;
        if (run > rules.maxConsecutiveDays && t.inMonth && !reported) {
          issues.push({ kind: 'tooManyConsecutive', severity: 'error', staffId: s.id, date: t.date, params: { days: run, max: rules.maxConsecutiveDays } });
          reported = true;
        }
      } else {
        run = 0;
        reported = false;
      }
      if (rules.noCloseThenOpen && i > 0 && t.inMonth) {
        const prev = line[i - 1];
        if (prev.info.present && prev.info.closes && t.info.present && t.info.opens) {
          issues.push({ kind: 'closeThenOpen', severity: 'error', staffId: s.id, date: t.date, params: { prev: prev.code, code: t.code } });
        }
      }
      if (t.inMonth && t.info.kind === 'unknown') {
        issues.push({ kind: 'unknownCode', severity: 'warning', staffId: s.id, date: t.date, params: { code: t.code } });
      }
      if (t.inMonth && t.info.kind === 'shift') {
        const wd = weekday(t.date);
        const unavailable =
          s.unavailableWeekdays.includes(wd) ||
          (t.info.opens && !s.canMorning) ||
          (t.info.closes && !s.canEvening);
        if (unavailable) issues.push({ kind: 'unavailable', severity: 'warning', staffId: s.id, date: t.date, params: { code: t.code } });
      }
    }

    const quota = plan.offQuota[s.id];
    if (quota !== undefined) {
      const off = offDaysUsed(data, plan, s.id);
      if (off !== quota) issues.push({ kind: 'offQuota', severity: 'warning', staffId: s.id, params: { off, quota } });
    }

    for (const [d, req] of Object.entries(plan.requests[s.id] ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      if (!isInMonth(d, plan.year, plan.month)) continue;
      const code = getCell(plan, s.id, d).code;
      const status = requestStatus(codeInfo(code, settings), req.kind);
      if (status === 'unmet') {
        issues.push(
          req.kind === 'off'
            ? { kind: 'requestIgnored', severity: 'error', staffId: s.id, date: d, params: { code } }
            : { kind: 'shiftRequestUnmet', severity: 'warning', staffId: s.id, date: d, params: { code: code || '—', kind: req.kind } },
        );
      }
    }
    const offs = offRequests(plan, s.id).length;
    if (offs > rules.maxRequestsPerPerson) {
      issues.push({ kind: 'tooManyRequests', severity: 'warning', staffId: s.id, params: { count: offs, max: rules.maxRequestsPerPerson } });
    }
  }
  return issues;
}
