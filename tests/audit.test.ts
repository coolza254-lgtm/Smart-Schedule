import { describe, expect, test } from 'vitest';
import { audit, auditPlans, createPlan, defaultAppData, monthDates, monthKey, scoreFor, setCell, solve, statusFor } from '../src/engine';

function octoberWith(fill: (plan: ReturnType<typeof createPlan>) => void) {
  const data = defaultAppData();
  const plan = createPlan(data, 2026, 10);
  fill(plan);
  data.plans[monthKey(2026, 10)] = plan;
  return { data, plan };
}

describe('audit scoring', () => {
  test('status and score from deviation', () => {
    expect(statusFor(0.5)).toBe('good');
    expect(statusFor(1.5)).toBe('watch');
    expect(statusFor(3)).toBe('unfair');
    expect(scoreFor(0)).toBe(100);
    expect(scoreFor(4.5)).toBe(40);
  });
});

describe('audit', () => {
  test('flags a full-timer who works every weekend while another works none', () => {
    const { data, plan } = octoberWith((plan) => {
      for (const d of monthDates(2026, 10)) {
        const wd = (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7;
        // MIEW: all weekends, IT: weekdays only. Same number of days overall.
        setCell(plan, 'MIEW', d, { code: wd >= 5 || wd <= 2 ? '09A8' : '' });
        setCell(plan, 'IT', d, { code: wd >= 5 ? '' : '13C8' });
      }
    });
    const r = audit(data, [plan]);
    const miew = r.people.find((p) => p.staff.id === 'MIEW')!;
    const it = r.people.find((p) => p.staff.id === 'IT')!;
    expect(miew.weekendWorked).toBe(9);
    expect(it.weekendWorked).toBe(0);
    expect(miew.weekendsOff).toBe(0);
    expect(it.weekendsOff).toBe(4);
    expect(r.metrics.find((m) => m.id === 'weekend')!.status).toBe('unfair');
    expect(r.findings.some((f) => f.kind === 'weekendMore' && f.staffId === 'MIEW')).toBe(true);
    // Shift mix: MIEW only mornings, IT only evenings.
    expect(r.findings.some((f) => f.kind === 'mostlyMorning' && f.staffId === 'MIEW')).toBe(true);
    expect(r.findings.some((f) => f.kind === 'mostlyEvening' && f.staffId === 'IT')).toBe(true);
  });

  test('part-timers are listed but not scored', () => {
    const { data, plan } = octoberWith(() => {});
    const r = audit(data, [plan]);
    expect(r.partTime.map((p) => p.staff.id).sort()).toEqual(['AOM', 'ATT', 'PEEM', 'PLENG']);
    expect(r.people.every((p) => !p.staff.partTime)).toBe(true);
  });

  test('heavy shifts count Wednesday 23:00 and Thursday 08:00', () => {
    const { data, plan } = octoberWith((plan) => {
      setCell(plan, 'MAX', '2026-10-07', { code: '14A8' });
      setCell(plan, 'MAX', '2026-10-08', { code: '' });
      setCell(plan, 'MAX', '2026-10-15', { code: '08A8' });
    });
    const max = audit(data, [plan]).people.find((p) => p.staff.id === 'MAX')!;
    expect(max.heavy).toBe(2);
    expect(max.lateClose).toBe(1);
    expect(max.earlyOpen).toBe(1);
  });

  test('auto schedule comes out fair for full-timers', () => {
    const data = defaultAppData();
    const plan = createPlan(data, 2026, 10);
    plan.holidays = ['2026-10-13', '2026-10-23'];
    plan.cells = solve(data, plan, { seed: 21 }).cells;
    data.plans[monthKey(2026, 10)] = plan;
    const r = audit(data, auditPlans(data, 2026, 10, 1));
    for (const id of ['workload', 'weekend', 'shiftMix', 'heavy'] as const) {
      expect(r.metrics.find((m) => m.id === id)!.status, id).toBe('good');
    }
    expect(r.score).toBeGreaterThanOrEqual(85);
  });
});

describe('request conflicts', () => {
  test('too many managers off on one day is reported', async () => {
    const { requestConflicts } = await import('../src/engine');
    const data = defaultAppData();
    const plan = createPlan(data, 2026, 10);
    for (const id of ['JUNIOR', 'MAX', 'KHET']) plan.requests[id] = { '2026-10-09': { kind: 'off' } };
    const c = requestConflicts(data, plan);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ date: '2026-10-09', kind: 'managers', managersOff: 3, managersTotal: 4 });
  });
});

describe('free weekends', () => {
  test('only flagged when others get one', () => {
    const data = defaultAppData();
    const plan = createPlan(data, 2026, 10);
    for (const d of monthDates(2026, 10)) for (const s of data.staff) setCell(plan, s.id, d, { code: '09A8' });
    data.plans[monthKey(2026, 10)] = plan;
    expect(audit(data, [plan]).findings.some((f) => f.kind === 'noFullWeekendOff')).toBe(false);
    setCell(plan, 'IT', '2026-10-10', { code: '' });
    setCell(plan, 'IT', '2026-10-11', { code: '' });
    const flagged = audit(data, [plan]).findings.filter((f) => f.kind === 'noFullWeekendOff').map((f) => f.staffId);
    expect(flagged).toContain('MIEW');
    expect(flagged).not.toContain('IT');
  });
});
