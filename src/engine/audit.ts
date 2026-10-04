import { isWeekend, monthKey, prevMonth, weekday } from './dates';
import { getCell, monthDates, scheduledStaff, weeksOf } from './month';
import { codeInfo, isHeavyShift } from './shifts';
import { requestStatus, timeline } from './validate';
import type { AppData, ISODate, MonthPlan, Staff } from './types';

/**
 * Fairness audit. Full-timers should get the same amount of work, a fair
 * mix of morning and evening shifts, and a fair share of weekends, public
 * holidays and heavy shifts (Wed 23:00 / Thu 08:00). "Fair share" is
 * proportional to each person's working days, so someone with more days
 * off is not expected to cover as many weekends. Part-timers are listed
 * but not scored: their hours follow individual agreements.
 */

export type AuditStatus = 'good' | 'watch' | 'unfair';
export type MetricId = 'workload' | 'shiftMix' | 'weekend' | 'heavy' | 'holiday' | 'rest';

export interface PersonAudit {
  staff: Staff;
  workDays: number;
  offDays: number;
  quota: number;
  hours: number;
  mornings: number;
  evenings: number;
  training: number;
  leave: number;
  weekendWorked: number;
  weekendDays: number;
  weekendsOff: number;
  holidayWorked: number;
  heavy: number;
  lateClose: number;
  earlyOpen: number;
  longestStreak: number;
  sixDayRuns: number;
  weekHoursMin: number;
  weekHoursMax: number;
  requestsMet: number;
  requestsTotal: number;
  expected: { workDays: number; weekend: number; heavy: number; holiday: number };
}

export interface AuditMetric {
  id: MetricId;
  score: number;
  status: AuditStatus;
  /** Largest distance from a fair share, in days/shifts. */
  maxDeviation: number;
  applicable: boolean;
}

export interface AuditFinding {
  status: AuditStatus;
  metric: MetricId;
  kind:
    | 'workMore'
    | 'workLess'
    | 'quotaDiffers'
    | 'mostlyMorning'
    | 'mostlyEvening'
    | 'weekendMore'
    | 'weekendLess'
    | 'heavyMore'
    | 'heavyLess'
    | 'holidayMore'
    | 'holidayLess'
    | 'sixDayRuns'
    | 'noFullWeekendOff';
  staffId?: string;
  params: Record<string, string | number>;
}

export interface AuditReport {
  months: string[];
  people: PersonAudit[];
  partTime: PersonAudit[];
  metrics: AuditMetric[];
  findings: AuditFinding[];
  score: number;
  status: AuditStatus;
}

const METRIC_WEIGHT: Record<MetricId, number> = { workload: 2, weekend: 2, shiftMix: 1.5, heavy: 1, holiday: 1, rest: 0.5 };

export function statusFor(deviation: number): AuditStatus {
  if (deviation <= 1) return 'good';
  if (deviation <= 2) return 'watch';
  return 'unfair';
}

export function scoreFor(deviation: number): number {
  return Math.round(Math.max(0, Math.min(100, 100 - 15 * Math.max(0, deviation - 0.5))));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The plans an audit covers: this month, or this month plus up to two before it. */
export function auditPlans(data: AppData, year: number, month: number, span: 1 | 3): MonthPlan[] {
  const out: MonthPlan[] = [];
  let p = { year, month };
  for (let i = 0; i < span; i++) {
    const plan = data.plans[monthKey(p.year, p.month)];
    if (plan) out.unshift(plan);
    p = prevMonth(p.year, p.month);
  }
  return out;
}

function personAudit(data: AppData, plans: MonthPlan[], s: Staff): PersonAudit {
  const a: PersonAudit = {
    staff: s,
    workDays: 0,
    offDays: 0,
    quota: 0,
    hours: 0,
    mornings: 0,
    evenings: 0,
    training: 0,
    leave: 0,
    weekendWorked: 0,
    weekendDays: 0,
    weekendsOff: 0,
    holidayWorked: 0,
    heavy: 0,
    lateClose: 0,
    earlyOpen: 0,
    longestStreak: 0,
    sixDayRuns: 0,
    weekHoursMin: Infinity,
    weekHoursMax: 0,
    requestsMet: 0,
    requestsTotal: 0,
    expected: { workDays: 0, weekend: 0, heavy: 0, holiday: 0 },
  };
  const { settings } = data;
  const max = settings.rules.maxConsecutiveDays;
  for (const plan of plans) {
    a.quota += plan.offQuota[s.id] ?? 0;
    const days = monthDates(plan.year, plan.month);
    const off = new Set<ISODate>();
    for (const d of days) {
      const info = codeInfo(getCell(plan, s.id, d).code, settings);
      const working = info.present || info.kind === 'training';
      if (info.worked) a.workDays++;
      else {
        a.offDays++;
        off.add(d);
      }
      a.hours += info.hours;
      if (info.kind === 'training') a.training++;
      if (info.kind === 'leave') a.leave++;
      if (info.present && info.opens) a.mornings++;
      else if (info.present && info.closes) a.evenings++;
      if (isWeekend(d)) {
        a.weekendDays++;
        if (working) a.weekendWorked++;
      }
      if (working && plan.holidays.includes(d)) a.holidayWorked++;
      if (isHeavyShift(info, settings)) {
        a.heavy++;
        if (info.closes) a.lateClose++;
        else a.earlyOpen++;
      }
      const req = plan.requests[s.id]?.[d];
      if (req) {
        const st = requestStatus(info, req.kind);
        if (st !== 'other') {
          a.requestsTotal++;
          if (st === 'met') a.requestsMet++;
        }
      }
    }
    // A free weekend = both Saturday and Sunday off inside the month.
    for (const d of days) if (weekday(d) === 5 && off.has(d) && off.has(nextDay(d)) && days.includes(nextDay(d))) a.weekendsOff++;

    let run = 0;
    for (const t of timeline(data, plan, s.id)) {
      run = t.info.consecutive ? run + 1 : 0;
      if (t.inMonth) {
        a.longestStreak = Math.max(a.longestStreak, run);
        if (run === max) a.sixDayRuns++;
      }
    }
    for (const w of weeksOf(plan.year, plan.month)) {
      const inMonth = w.filter((d) => days.includes(d));
      if (inMonth.length < 7) continue; // only full weeks are comparable
      const h = inMonth.reduce((sum, d) => sum + codeInfo(getCell(plan, s.id, d).code, settings).hours, 0);
      a.weekHoursMin = Math.min(a.weekHoursMin, h);
      a.weekHoursMax = Math.max(a.weekHoursMax, h);
    }
  }
  if (a.weekHoursMin === Infinity) a.weekHoursMin = 0;
  return a;
}

function nextDay(d: ISODate): ISODate {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}

export function audit(data: AppData, plans: MonthPlan[]): AuditReport {
  const staff = scheduledStaff(data);
  const all = staff.map((s) => personAudit(data, plans, s));
  const people = all.filter((p) => !p.staff.partTime);
  const partTime = all.filter((p) => p.staff.partTime);
  const findings: AuditFinding[] = [];
  const metrics: AuditMetric[] = [];

  const totalWork = people.reduce((s, p) => s + p.workDays, 0);
  const share = (p: PersonAudit) => (totalWork ? p.workDays / totalWork : 0);
  const meanWork = people.length ? totalWork / people.length : 0;
  const sum = (f: (p: PersonAudit) => number) => people.reduce((s, p) => s + f(p), 0);
  const weekendTotal = sum((p) => p.weekendWorked);
  const heavyTotal = sum((p) => p.heavy);
  const holidayTotal = sum((p) => p.holidayWorked);
  for (const p of people) {
    p.expected = {
      workDays: round1(meanWork),
      weekend: round1(weekendTotal * share(p)),
      heavy: round1(heavyTotal * share(p)),
      holiday: round1(holidayTotal * share(p)),
    };
  }

  const metric = (id: MetricId, devs: number[], applicable = true) => {
    const maxDeviation = round1(devs.length ? Math.max(...devs) : 0);
    metrics.push({ id, maxDeviation, score: applicable ? scoreFor(maxDeviation) : 100, status: applicable ? statusFor(maxDeviation) : 'good', applicable });
  };
  const flag = (metric: MetricId, dev: number, kindHigh: AuditFinding['kind'], kindLow: AuditFinding['kind'], p: PersonAudit, actual: number, expected: number) => {
    const st = statusFor(dev);
    if (st === 'good') return;
    findings.push({ status: st, metric, kind: actual > expected ? kindHigh : kindLow, staffId: p.staff.id, params: { name: p.staff.name, actual, expected: round1(expected), diff: round1(Math.abs(actual - expected)) } });
  };

  // Workload: equal working days.
  const quotas = new Set(people.map((p) => p.quota));
  if (quotas.size > 1) {
    const min = Math.min(...quotas);
    const max = Math.max(...quotas);
    findings.push({ status: 'watch', metric: 'workload', kind: 'quotaDiffers', params: { min, max } });
  }
  metric('workload', people.map((p) => Math.abs(p.workDays - meanWork)));
  for (const p of people) flag('workload', Math.abs(p.workDays - meanWork), 'workMore', 'workLess', p, p.workDays, meanWork);

  // Shift mix: each person close to half mornings, half evenings (unless they asked for one).
  const mixPeople = people.filter((p) => !p.staff.preferredShift);
  metric('shiftMix', mixPeople.map((p) => Math.abs(p.mornings - p.evenings) / 2), mixPeople.length > 0);
  for (const p of mixPeople) {
    const dev = Math.abs(p.mornings - p.evenings) / 2;
    const st = statusFor(dev);
    if (st !== 'good') {
      findings.push({ status: st, metric: 'shiftMix', kind: p.mornings > p.evenings ? 'mostlyMorning' : 'mostlyEvening', staffId: p.staff.id, params: { name: p.staff.name, m: p.mornings, e: p.evenings } });
    }
  }

  // Weekends, heavy shifts, holidays: proportional to working days.
  metric('weekend', people.map((p) => Math.abs(p.weekendWorked - p.expected.weekend)));
  for (const p of people) flag('weekend', Math.abs(p.weekendWorked - p.expected.weekend), 'weekendMore', 'weekendLess', p, p.weekendWorked, p.expected.weekend);
  // Only unfair when some full-timers get a free weekend and others don't.
  const someoneFree = people.some((p) => p.weekendsOff > 0);
  for (const p of people) {
    if (someoneFree && p.weekendsOff === 0 && p.weekendDays >= 8) {
      findings.push({ status: 'watch', metric: 'weekend', kind: 'noFullWeekendOff', staffId: p.staff.id, params: { name: p.staff.name } });
    }
  }

  metric('heavy', people.map((p) => Math.abs(p.heavy - p.expected.heavy)), heavyTotal > 0);
  for (const p of people) flag('heavy', Math.abs(p.heavy - p.expected.heavy), 'heavyMore', 'heavyLess', p, p.heavy, p.expected.heavy);

  metric('holiday', people.map((p) => Math.abs(p.holidayWorked - p.expected.holiday)), holidayTotal > 0);
  if (holidayTotal > 0) for (const p of people) flag('holiday', Math.abs(p.holidayWorked - p.expected.holiday), 'holidayMore', 'holidayLess', p, p.holidayWorked, p.expected.holiday);

  // Rest: nobody should carry most of the maximum-length streaks.
  const meanRuns = people.length ? sum((p) => p.sixDayRuns) / people.length : 0;
  metric('rest', people.map((p) => Math.abs(p.sixDayRuns - meanRuns)));
  for (const p of people) {
    if (p.sixDayRuns - meanRuns > 1) {
      findings.push({ status: statusFor(p.sixDayRuns - meanRuns), metric: 'rest', kind: 'sixDayRuns', staffId: p.staff.id, params: { name: p.staff.name, count: p.sixDayRuns, max: data.settings.rules.maxConsecutiveDays } });
    }
  }

  const applicable = metrics.filter((m) => m.applicable);
  const weightSum = applicable.reduce((s, m) => s + METRIC_WEIGHT[m.id], 0);
  const score = weightSum ? Math.round(applicable.reduce((s, m) => s + m.score * METRIC_WEIGHT[m.id], 0) / weightSum) : 100;
  const order: Record<AuditStatus, number> = { unfair: 0, watch: 1, good: 2 };
  findings.sort((x, y) => order[x.status] - order[y.status]);
  const status: AuditStatus = applicable.some((m) => m.status === 'unfair') ? 'unfair' : applicable.some((m) => m.status === 'watch') ? 'watch' : 'good';

  return { months: plans.map((p) => monthKey(p.year, p.month)), people, partTime, metrics, findings, score, status };
}
