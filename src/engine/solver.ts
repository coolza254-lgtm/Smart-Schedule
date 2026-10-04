import { weekday } from './dates';
import { getCell, isInMonth, lookback, scheduledStaff, windowDates } from './month';
import { codeInfo, eveningCodeFor, morningCodeFor, type CodeInfo } from './shifts';
import { minCloseFor, minOpenFor, targetsFor } from './validate';
import type { AppData, Cell, ISODate, MonthPlan } from './types';

/**
 * Automatic scheduler.
 *
 * Every free (unlocked) cell in the month is one of OFF / MORNING / EVENING.
 * A cost function scores a whole schedule: hard rules carry a huge weight,
 * preferences a small one. Simulated annealing then keeps changing cells
 * (or swapping two of one person's days) and keeps changes that lower the
 * cost, occasionally accepting worse ones early on to escape dead ends.
 * Several restarts run and the best schedule wins.
 */

export const WEIGHTS = {
  hard: 1000,
  /** Each person short of the soft target. */
  belowTarget: 20,
  /** Squared distance from the target, spreads extra people evenly. */
  spread: 3,
  /** Full-timers: difference between morning and evening count. */
  balance: 2,
  /** A run that reaches the maximum consecutive days. */
  longRun: 4,
  /** Each shift that is not the person's preferred one. */
  preference: 3,
};

const OFF = 0;
const MORNING = 1;
const EVENING = 2;

export interface SolveOptions {
  seed?: number;
  iterations?: number;
  restarts?: number;
}

export interface SolveResult {
  cells: Record<string, Record<ISODate, Cell>>;
  cost: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Var {
  /** Allowed values for a free cell; fixed cells have none. */
  domain: number[];
  /** Info per value (index = OFF/MORNING/EVENING); for fixed cells only [0] is used. */
  infos: CodeInfo[];
  codes: string[];
  fixed: boolean;
}

export function solve(data: AppData, plan: MonthPlan, opts: SolveOptions = {}): SolveResult {
  const { settings } = data;
  const rules = settings.rules;
  const staff = scheduledStaff(data);
  const dates = windowDates(plan.year, plan.month);
  const D = dates.length;
  const S = staff.length;
  const inMonth = dates.map((d) => isInMonth(d, plan.year, plan.month));
  const back = lookback(data, plan.year, plan.month);
  const offInfo = codeInfo('', settings);

  // ---- Variables -------------------------------------------------------
  const vars: Var[][] = staff.map((s) => {
    const requested = new Set(plan.requests[s.id] ?? []);
    return dates.map((d, di) => {
      const cell = getCell(plan, s.id, d);
      if (!inMonth[di] || cell.locked) {
        return { domain: [], infos: [codeInfo(cell.code, settings)], codes: [cell.code], fixed: true };
      }
      if (requested.has(d)) {
        return { domain: [], infos: [offInfo], codes: [''], fixed: true };
      }
      const m = morningCodeFor(s, d, settings);
      const e = eveningCodeFor(s, d, settings);
      const domain = [OFF];
      if (!s.unavailableWeekdays.includes(weekday(d))) {
        if (s.canMorning) domain.push(MORNING);
        if (s.canEvening) domain.push(EVENING);
      }
      return {
        domain,
        infos: [offInfo, codeInfo(m, settings), codeInfo(e, settings)],
        codes: ['', m, e],
        fixed: false,
      };
    });
  });

  // Days before the window (from older plans) for streak/close→open checks.
  const history: CodeInfo[][] = staff.map((s) => {
    const cells = back[s.id] ?? {};
    const out: CodeInfo[] = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date(Date.UTC(+dates[0].slice(0, 4), +dates[0].slice(5, 7) - 1, +dates[0].slice(8, 10) - i));
      const c = cells[d.toISOString().slice(0, 10)];
      if (!c) break;
      out.unshift(codeInfo(c.code, settings));
    }
    return out;
  });

  const minOpen = dates.map((d) => minOpenFor(settings, plan, d));
  const minClose = dates.map((d) => minCloseFor(settings, plan, d));
  const target = dates.map((d) => targetsFor(settings, plan, d));
  const quota = staff.map((s) => plan.offQuota[s.id]);

  const value: number[][] = staff.map(() => new Array(D).fill(OFF));
  const info = (si: number, di: number): CodeInfo => {
    const v = vars[si][di];
    return v.fixed ? v.infos[0] : v.infos[value[si][di]];
  };

  // ---- Cost ------------------------------------------------------------
  function dayCost(di: number): number {
    if (!inMonth[di]) return 0;
    let open = 0;
    let close = 0;
    let mOpen = 0;
    let mClose = 0;
    for (let si = 0; si < S; si++) {
      const x = info(si, di);
      if (!x.present) continue;
      if (x.opens) {
        open++;
        if (staff[si].isManager) mOpen++;
      }
      if (x.closes) {
        close++;
        if (staff[si].isManager) mClose++;
      }
    }
    let hard = Math.max(0, minOpen[di] - open) + Math.max(0, minClose[di] - close);
    if (rules.managerEachShift) hard += (mOpen === 0 ? 1 : 0) + (mClose === 0 ? 1 : 0);
    const t = target[di];
    const below = Math.max(0, t.open - open) + Math.max(0, t.close - close);
    const spread = (open - t.open) ** 2 + (close - t.close) ** 2;
    return hard * WEIGHTS.hard + below * WEIGHTS.belowTarget + spread * WEIGHTS.spread;
  }

  function staffCost(si: number): number {
    let hard = 0;
    let soft = 0;
    const hist = history[si];
    let run = 0;
    for (const h of hist) run = h.consecutive ? run + 1 : 0;
    let prev: CodeInfo | undefined = hist[hist.length - 1];
    let off = 0;
    let mornings = 0;
    let evenings = 0;
    for (let di = 0; di < D; di++) {
      const x = info(si, di);
      if (x.consecutive) {
        run++;
        if (inMonth[di]) {
          if (run > rules.maxConsecutiveDays) hard++;
          else if (run === rules.maxConsecutiveDays) soft += WEIGHTS.longRun;
        }
      } else run = 0;
      if (inMonth[di]) {
        if (rules.noCloseThenOpen && prev && prev.present && prev.closes && x.present && x.opens) hard++;
        if (!x.worked) off++;
        if (x.present && x.opens) mornings++;
        else if (x.present && x.closes) evenings++;
      }
      prev = x;
    }
    if (quota[si] !== undefined) hard += Math.abs(off - quota[si]);
    const pref = staff[si].preferredShift;
    if (pref === 'morning') soft += evenings * WEIGHTS.preference;
    else if (pref === 'evening') soft += mornings * WEIGHTS.preference;
    else if (!staff[si].partTime) soft += Math.abs(mornings - evenings) * WEIGHTS.balance;
    return hard * WEIGHTS.hard + soft;
  }

  function totalCost(): number {
    let c = 0;
    for (let di = 0; di < D; di++) c += dayCost(di);
    for (let si = 0; si < S; si++) c += staffCost(si);
    return c;
  }

  // ---- Search ----------------------------------------------------------
  const free: [number, number][] = [];
  const freeByStaff: number[][] = staff.map(() => []);
  for (let si = 0; si < S; si++) {
    for (let di = 0; di < D; di++) {
      if (!vars[si][di].fixed && vars[si][di].domain.length > 1) {
        free.push([si, di]);
        freeByStaff[si].push(di);
      }
    }
  }

  const rand = mulberry32(opts.seed ?? Date.now());
  const iterations = opts.iterations ?? 120_000;
  const restarts = opts.restarts ?? 4;
  const pick = <T,>(a: T[]): T => a[Math.floor(rand() * a.length)];

  function initialise(): void {
    for (let si = 0; si < S; si++) {
      let fixedOff = 0;
      for (let di = 0; di < D; di++) {
        value[si][di] = OFF;
        const v = vars[si][di];
        if (inMonth[di] && (v.fixed || v.domain.length === 1) && !info(si, di).worked) fixedOff++;
      }
      const days = [...freeByStaff[si]];
      for (let i = days.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [days[i], days[j]] = [days[j], days[i]];
      }
      const wantOff = Math.max(0, Math.min(days.length, (quota[si] ?? 0) - fixedOff));
      days.forEach((di, k) => {
        value[si][di] = k < wantOff ? OFF : pick(vars[si][di].domain.filter((x) => x !== OFF));
      });
    }
  }

  let best: number[][] | null = null;
  let bestCost = Infinity;

  for (let r = 0; r < restarts && free.length > 0; r++) {
    initialise();
    let cost = totalCost();
    let localBest = cost;
    let localBestValue = value.map((row) => [...row]);
    const t0 = 200;
    const t1 = 0.2;
    for (let it = 0; it < iterations; it++) {
      const temp = t0 * Math.pow(t1 / t0, it / iterations);
      const [si, d1] = pick(free);
      const before1 = value[si][d1];
      let d2 = -1;
      let before2 = 0;
      let after1: number;
      if (rand() < 0.5 && freeByStaff[si].length > 1) {
        // Swap two days of the same person (keeps their off-day count).
        d2 = pick(freeByStaff[si]);
        before2 = value[si][d2];
        if (d2 === d1 || before2 === before1) continue;
        if (!vars[si][d1].domain.includes(before2) || !vars[si][d2].domain.includes(before1)) continue;
        after1 = before2;
      } else {
        const options = vars[si][d1].domain.filter((x) => x !== before1);
        after1 = pick(options);
      }
      const old = staffCost(si) + dayCost(d1) + (d2 >= 0 ? dayCost(d2) : 0);
      value[si][d1] = after1;
      if (d2 >= 0) value[si][d2] = before1;
      const neu = staffCost(si) + dayCost(d1) + (d2 >= 0 ? dayCost(d2) : 0);
      const delta = neu - old;
      if (delta <= 0 || rand() < Math.exp(-delta / temp)) {
        cost += delta;
        if (cost < localBest) {
          localBest = cost;
          localBestValue = value.map((row) => [...row]);
        }
      } else {
        value[si][d1] = before1;
        if (d2 >= 0) value[si][d2] = before2;
      }
    }
    if (localBest < bestCost) {
      bestCost = localBest;
      best = localBestValue;
    }
  }

  if (best) for (let si = 0; si < S; si++) value[si] = best[si];
  else initialise();
  const finalCost = totalCost();

  // ---- Output ----------------------------------------------------------
  const cells: Record<string, Record<ISODate, Cell>> = structuredClone(plan.cells);
  for (let si = 0; si < S; si++) {
    const sid = staff[si].id;
    cells[sid] ??= {};
    for (let di = 0; di < D; di++) {
      const v = vars[si][di];
      const d = dates[di];
      if (!inMonth[di]) continue;
      if (v.fixed) {
        // Requested days off are stored so they show up as requests.
        if (!getCell(plan, sid, d).locked) cells[sid][d] = { code: '', source: 'request' };
        continue;
      }
      cells[sid][d] = { code: v.codes[value[si][di]], source: 'auto' };
    }
  }
  return { cells, cost: finalCost };
}
