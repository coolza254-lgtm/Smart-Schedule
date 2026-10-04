import { describe, expect, test } from 'vitest';
import { buildWorkbook } from '../src/export/excel';
import { createPlan, dayCoverage, defaultAppData, hoursOf, setCell, solve, weeksOf } from '../src/engine';

describe('Excel export', () => {
  test('original layout keeps live formulas with correct cached values', async () => {
    const data = defaultAppData();
    const plan = createPlan(data, 2026, 10);
    setCell(plan, 'MAX', '2026-10-13', { code: 'TRIS', locked: true });
    setCell(plan, 'KHET', '2026-10-20', { code: 'AL', locked: true });
    plan.cells = solve(data, plan, { seed: 11, iterations: 40_000, restarts: 1 }).cells;
    plan.events['2026-10-12'] = { line1: 'WG', line2: 'Stock', color: '#ff0000' };

    const wb = await buildWorkbook(data, plan, 'en');
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Shift', 'Easy view']);
    const ws = wb.getWorksheet('Shift')!;

    expect(ws.getCell('A4').value).toBe('週');
    expect(ws.getCell('B4').value).toBe('202636W');
    expect(ws.getCell('A9').value).toBe('OPEN');
    expect(ws.getCell('A10').value).toBe('CLOSE');

    // Column E = Thu 1 Oct; OPEN/CLOSE formulas carry the app's counts.
    const cov = dayCoverage(data, plan, '2026-10-01');
    const open = ws.getCell('E9').value as { formula: string; result: number };
    const close = ws.getCell('E10').value as { formula: string; result: number };
    expect(open.formula).toContain('SUMPRODUCT');
    expect(open.result).toBe(cov.open);
    expect(close.result).toBe(cov.close);

    // First person row: JUNIOR, weekly total formula in the week's total column.
    expect(ws.getCell('A11').value).toBe('JUNIOR');
    const week1 = weeksOf(2026, 10)[0];
    const total = ws.getCell('I11').value as { formula: string; result: number };
    expect(total.formula).toBe('SUMPRODUCT((B11:H11<>"")*IFERROR((MID(B11:H11,4,2)*1),8))');
    expect(total.result).toBe(hoursOf(data, plan, 'JUNIOR', week1));

    // Repeated rows (a manager listed again under their section) reference the first row.
    let refFound = false;
    ws.eachRow((row) =>
      row.eachCell((cell) => {
        const v = cell.value as { formula?: string } | null;
        if (v && typeof v === 'object' && v.formula?.startsWith('IF(')) refFound = true;
      }),
    );
    expect(refFound).toBe(true);
  });
});
