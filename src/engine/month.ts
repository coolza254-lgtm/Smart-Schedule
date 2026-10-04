import {
  addDays,
  firstOfMonth,
  lastOfMonth,
  monthKey,
  prevMonth,
  rangeDates,
  weekday,
} from './dates';
import type { AppData, Cell, ISODate, MonthPlan, Staff } from './types';

/**
 * A month sheet starts on the Monday of the week containing the 1st (those
 * leading days belong to last month and are shown greyed out) and ends on
 * the last day of the month.
 */
export function windowStart(year: number, month: number): ISODate {
  const first = firstOfMonth(year, month);
  return addDays(first, -weekday(first));
}

export function windowDates(year: number, month: number): ISODate[] {
  return rangeDates(windowStart(year, month), lastOfMonth(year, month));
}

export function monthDates(year: number, month: number): ISODate[] {
  return rangeDates(firstOfMonth(year, month), lastOfMonth(year, month));
}

export function isInMonth(date: ISODate, year: number, month: number): boolean {
  return date.startsWith(monthKey(year, month));
}

/** Window dates grouped Mon–Sun. */
export function weeksOf(year: number, month: number): ISODate[][] {
  const weeks: ISODate[][] = [];
  for (const d of windowDates(year, month)) {
    if (weekday(d) === 0 || weeks.length === 0) weeks.push([]);
    weeks[weeks.length - 1].push(d);
  }
  return weeks;
}

export function scheduledStaff(data: AppData): Staff[] {
  return data.staff.filter((s) => s.active);
}

export function getCell(plan: MonthPlan, staffId: string, date: ISODate): Cell {
  return plan.cells[staffId]?.[date] ?? { code: '' };
}

export function setCell(plan: MonthPlan, staffId: string, date: ISODate, cell: Cell): void {
  (plan.cells[staffId] ??= {})[date] = cell;
}

/**
 * Cells from earlier plans for the days just before this sheet's window, so
 * streak and close→open checks can look across the month boundary.
 */
export function lookback(data: AppData, year: number, month: number, days = 14): Record<string, Record<ISODate, Cell>> {
  const start = windowStart(year, month);
  const out: Record<string, Record<ISODate, Cell>> = {};
  const p = prevMonth(year, month);
  const pp = prevMonth(p.year, p.month);
  const sources = [data.plans[monthKey(p.year, p.month)], data.plans[monthKey(pp.year, pp.month)]];
  for (let i = 1; i <= days; i++) {
    const d = addDays(start, -i);
    for (const plan of sources) {
      if (!plan) continue;
      for (const [sid, cells] of Object.entries(plan.cells)) {
        if (cells[d] && !(out[sid]?.[d])) (out[sid] ??= {})[d] = cells[d];
      }
    }
  }
  return out;
}

/** A fresh plan; carry days are copied (locked) from last month if it exists. */
export function createPlan(data: AppData, year: number, month: number): MonthPlan {
  const plan: MonthPlan = {
    year,
    month,
    cells: {},
    offQuota: {},
    requests: {},
    holidays: [],
    events: {},
    dayOverrides: {},
  };
  for (const s of data.staff) {
    plan.offQuota[s.id] = s.defaultOffDays;
    plan.requests[s.id] = [];
  }
  refreshCarry(data, plan);
  return plan;
}

/** Re-copy last month's cells into this sheet's leading (carry) days. */
export function refreshCarry(data: AppData, plan: MonthPlan): void {
  const p = prevMonth(plan.year, plan.month);
  const prev = data.plans[monthKey(p.year, p.month)];
  if (!prev) return;
  for (const d of windowDates(plan.year, plan.month)) {
    if (isInMonth(d, plan.year, plan.month)) break;
    for (const s of data.staff) {
      const c = prev.cells[s.id]?.[d];
      setCell(plan, s.id, d, { code: c?.code ?? '', locked: true, source: 'carry' });
    }
  }
}
