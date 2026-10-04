import { describe, expect, test } from 'vitest';
import {
  codeInfo,
  createPlan,
  defaultAppData,
  eveningCodeFor,
  getCell,
  migratePlan,
  monthDates,
  monthKey,
  morningCodeFor,
  parseShift,
  personStats,
  refreshCarry,
  setCell,
  solve,
  validate,
  weekLabel,
  windowDates,
  type AppData,
  type MonthPlan,
} from '../src/engine';

const settings = defaultAppData().settings;

describe('shift codes', () => {
  test('letter is the minute, number is work hours, break added', () => {
    expect(parseShift('13C8', settings)).toEqual({ start: 13 * 60 + 30, end: 22 * 60 + 30, hours: 8 });
    expect(parseShift('09A8', settings)).toEqual({ start: 9 * 60, end: 18 * 60, hours: 8 });
    expect(parseShift('14A8', settings)?.end).toBe(23 * 60);
    expect(parseShift('10B8', settings)?.start).toBe(10 * 60 + 15);
    expect(parseShift('10D8', settings)?.start).toBe(10 * 60 + 45);
    // 5 hours or less: no break
    expect(parseShift('09A5', settings)?.end).toBe(14 * 60);
    expect(parseShift('TRWG', settings)).toBeNull();
  });

  test('open / close classification', () => {
    expect(codeInfo('09A8', settings)).toMatchObject({ opens: true, closes: false });
    expect(codeInfo('08A8', settings)).toMatchObject({ opens: true, closes: false });
    expect(codeInfo('09A5', settings)).toMatchObject({ opens: true, closes: false });
    expect(codeInfo('13A8', settings)).toMatchObject({ opens: false, closes: true });
    expect(codeInfo('13C8', settings)).toMatchObject({ opens: false, closes: true });
    expect(codeInfo('TRIS', settings)).toMatchObject({ kind: 'training', worked: true, present: false, hours: 8 });
    expect(codeInfo('AL', settings)).toMatchObject({ kind: 'leave', worked: true, present: false, consecutive: false });
    expect(codeInfo('', settings)).toMatchObject({ kind: 'off', worked: false });
  });

  test('weekday templates: Wed close 14A8, Thu open 08A8, part-time close 13A8', () => {
    const data = defaultAppData();
    const ft = data.staff.find((s) => s.id === 'MIEW')!;
    const pt = data.staff.find((s) => s.id === 'PEEM')!;
    expect(morningCodeFor(ft, '2026-10-05', data.settings)).toBe('09A8'); // Mon
    expect(eveningCodeFor(ft, '2026-10-05', data.settings)).toBe('13C8');
    expect(eveningCodeFor(pt, '2026-10-05', data.settings)).toBe('13A8');
    expect(eveningCodeFor(pt, '2026-10-07', data.settings)).toBe('14A8'); // Wed
    expect(morningCodeFor(pt, '2026-10-08', data.settings)).toBe('08A8'); // Thu
  });
});

describe('calendar', () => {
  test('sheet window starts on the Monday before the 1st', () => {
    const w = windowDates(2026, 10);
    expect(w[0]).toBe('2026-09-28');
    expect(w[w.length - 1]).toBe('2026-10-31');
    expect(w.length).toBe(34);
  });

  test('week labels match the store numbering', () => {
    expect(weekLabel('2026-09-28', -4)).toBe('202636W');
    expect(weekLabel('2026-10-26', -4)).toBe('202640W');
    expect(weekLabel('2026-01-26', -4)).toBe('202601W');
    expect(weekLabel('2026-01-19', -4)).toBe('202552W');
  });
});

function emptyOctober(): { data: AppData; plan: MonthPlan } {
  const data = defaultAppData();
  const plan = createPlan(data, 2026, 10);
  return { data, plan };
}

describe('validator', () => {
  test('flags closing then opening the next day', () => {
    const { data, plan } = emptyOctober();
    setCell(plan, 'MIEW', '2026-10-05', { code: '13C8' });
    setCell(plan, 'MIEW', '2026-10-06', { code: '09A8' });
    const issues = validate(data, plan).filter((i) => i.kind === 'closeThenOpen');
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ staffId: 'MIEW', date: '2026-10-06' });
  });

  test('flags more than 6 consecutive days, training counts, leave breaks', () => {
    const { data, plan } = emptyOctober();
    const days = ['05', '06', '07', '08', '09', '10', '11'].map((d) => `2026-10-${d}`);
    days.forEach((d, i) => setCell(plan, 'IT', d, { code: i === 3 ? 'TRWG' : '09A8' }));
    expect(validate(data, plan).filter((i) => i.kind === 'tooManyConsecutive')).toHaveLength(1);
    setCell(plan, 'IT', days[3], { code: 'AL' });
    expect(validate(data, plan).filter((i) => i.kind === 'tooManyConsecutive')).toHaveLength(0);
  });

  test('streaks continue from the previous month', () => {
    const data = defaultAppData();
    const sep = createPlan(data, 2026, 9);
    for (const d of ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30']) {
      setCell(sep, 'IT', d, { code: '13C8' });
    }
    data.plans[monthKey(2026, 9)] = sep;
    const oct = createPlan(data, 2026, 10);
    expect(getCell(oct, 'IT', '2026-09-30')).toMatchObject({ code: '13C8', locked: true, source: 'carry' });
    setCell(oct, 'IT', '2026-10-01', { code: '13C8' });
    const issues = validate(data, oct).filter((i) => i.kind === 'tooManyConsecutive');
    expect(issues).toHaveLength(1);
    expect(issues[0].date).toBe('2026-10-01');
  });

  test('needs a manager in each shift and enough people; Wednesday close needs 3', () => {
    const { data, plan } = emptyOctober();
    const wed = '2026-10-07';
    setCell(plan, 'MIEW', wed, { code: '09A8' });
    setCell(plan, 'IT', wed, { code: '09A8' });
    setCell(plan, 'JUNIOR', wed, { code: '14A8' });
    setCell(plan, 'PEEM', wed, { code: '14A8' });
    const kinds = validate(data, plan).filter((i) => i.date === wed).map((i) => i.kind);
    expect(kinds).toContain('noManagerMorning');
    expect(kinds).not.toContain('noManagerEvening');
    expect(kinds).not.toContain('openShort');
    expect(kinds).toContain('closeShort');
    setCell(plan, 'PLENG', wed, { code: '14A8' });
    setCell(plan, 'MAX', wed, { code: '09A8' });
    const after = validate(data, plan).filter((i) => i.date === wed);
    expect(after).toHaveLength(0);
  });

  test('unmet shift request is a warning', () => {
    const { data, plan } = emptyOctober();
    plan.requests.IT = { '2026-10-12': { kind: 'evening' } };
    setCell(plan, 'IT', '2026-10-12', { code: '09A8' });
    const issue = validate(data, plan).find((i) => i.kind === 'shiftRequestUnmet');
    expect(issue).toMatchObject({ severity: 'warning', staffId: 'IT', date: '2026-10-12' });
  });

  test('old saves with request lists are migrated', () => {
    const { plan } = emptyOctober();
    (plan.requests as unknown as Record<string, string[]>).MIEW = ['2026-10-03'];
    migratePlan(plan);
    expect(plan.requests.MIEW).toEqual({ '2026-10-03': { kind: 'off' } });
  });

  test('requested day off that is worked is an error', () => {
    const { data, plan } = emptyOctober();
    plan.requests.MIEW = { '2026-10-10': { kind: 'off' } };
    setCell(plan, 'MIEW', '2026-10-10', { code: '09A8' });
    expect(validate(data, plan).some((i) => i.kind === 'requestIgnored' && i.staffId === 'MIEW')).toBe(true);
  });
});

describe('solver', () => {
  test('produces a schedule with no rule errors and exact off-day quotas', () => {
    const { data, plan } = emptyOctober();
    plan.requests.MIEW = { '2026-10-10': { kind: 'off' }, '2026-10-11': { kind: 'off' } };
    plan.requests.JUNIOR = { '2026-10-17': { kind: 'off' } };
    plan.requests.IT = { '2026-10-14': { kind: 'morning' }, '2026-10-15': { kind: 'evening' } };
    setCell(plan, 'MAX', '2026-10-13', { code: 'TRIS', locked: true, source: 'fixed' });
    setCell(plan, 'KHET', '2026-10-20', { code: 'AL', locked: true, source: 'fixed' });
    plan.cells = solve(data, plan, { seed: 42 }).cells;

    const errors = validate(data, plan);
    expect(errors).toEqual([]);
    expect(getCell(plan, 'MIEW', '2026-10-10').code).toBe('');
    expect(getCell(plan, 'MIEW', '2026-10-11').code).toBe('');
    expect(getCell(plan, 'JUNIOR', '2026-10-17').code).toBe('');
    expect(codeInfo(getCell(plan, 'IT', '2026-10-14').code, data.settings).opens).toBe(true);
    expect(codeInfo(getCell(plan, 'IT', '2026-10-15').code, data.settings).closes).toBe(true);
    expect(getCell(plan, 'MAX', '2026-10-13').code).toBe('TRIS');
    expect(getCell(plan, 'KHET', '2026-10-20').code).toBe('AL');
    for (const s of data.staff) expect(personStats(data, plan, s.id).offDays).toBe(plan.offQuota[s.id]);
  });

  test('respects availability and personal codes', () => {
    const { data, plan } = emptyOctober();
    const aom = data.staff.find((s) => s.id === 'AOM')!;
    aom.unavailableWeekdays = [6]; // never Sunday
    const att = data.staff.find((s) => s.id === 'ATT')!;
    att.morningCode = '09A5';
    plan.cells = solve(data, plan, { seed: 7 }).cells;
    for (const d of monthDates(2026, 10)) {
      const aomInfo = codeInfo(getCell(plan, 'AOM', d).code, data.settings);
      expect(aomInfo.closes).toBe(false);
      const code = getCell(plan, 'ATT', d).code;
      if (codeInfo(code, data.settings).opens && new Date(d).getUTCDay() !== 4) expect(code).toBe('09A5');
    }
    expect(['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'].every((d) => getCell(plan, 'AOM', d).code === '')).toBe(true);
  });

  test('same seed gives the same schedule; carry days stay untouched', () => {
    const data = defaultAppData();
    const sep = createPlan(data, 2026, 9);
    setCell(sep, 'IT', '2026-09-30', { code: '13C8' });
    data.plans[monthKey(2026, 9)] = sep;
    const a = createPlan(data, 2026, 10);
    refreshCarry(data, a);
    const b = structuredClone(a);
    const ra = solve(data, a, { seed: 3 });
    const rb = solve(data, b, { seed: 3 });
    expect(ra.cells).toEqual(rb.cells);
    expect(ra.cells.IT['2026-09-30'].code).toBe('13C8');
    // IT closed on the 30th so cannot open on the 1st.
    expect(codeInfo(ra.cells.IT['2026-10-01'].code, data.settings).opens).toBe(false);
  });
});
