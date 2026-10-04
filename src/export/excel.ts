import ExcelJS from 'exceljs';
import {
  codeInfo,
  dayCoverage,
  getCell,
  groupHours,
  hhmmToMinutes,
  hoursOf,
  isInMonth,
  minutesToHHMM,
  monthDates,
  personStats,
  scheduledStaff,
  sheetGroups,
  weekday,
  weekLabel,
  weeksOf,
  type AppData,
  type MonthPlan,
} from '../engine';
import { DICTS, type Lang } from '../i18n/dicts';
import { download } from './download';

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const argb = (hex: string) => 'FF' + hex.replace('#', '').toUpperCase();
const fill = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };
const dbl: Partial<ExcelJS.Border> = { style: 'double', color: { argb: 'FF000000' } };
const thick: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: 'FF000000' } };

function colName(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Excel formulas (Office 365) that mirror the app's counting rules, so the
 * exported sheet keeps working after someone edits a code by hand.
 */
function formulas(data: AppData) {
  const r = data.settings.rules;
  const open = hhmmToMinutes(data.settings.storeOpen);
  const close = hhmmToMinutes(data.settings.storeClose);
  const letter = (rg: string) => `MID(${rg},3,1)`;
  const start = (rg: string) =>
    `(LEFT(${rg},2)*60+(${letter(rg)}="B")*15+(${letter(rg)}="C")*30+(${letter(rg)}="D")*45)`;
  const hours = (rg: string) => `(MID(${rg},4,2)*1)`;
  return {
    hours: (rg: string) => `SUMPRODUCT((${rg}<>"")*IFERROR(${hours(rg)},8))`,
    open: (rg: string) => `SUMPRODUCT((IFERROR(${start(rg)},99999)<=${open})*1)`,
    close: (rg: string) =>
      `SUMPRODUCT((IFERROR(${start(rg)}+${hours(rg)}*60+(${hours(rg)}>${r.breakAfterHours})*${r.breakMinutes},0)>=${close})*1)`,
  };
}

function originalSheet(wb: ExcelJS.Workbook, data: AppData, plan: MonthPlan) {
  const ws = wb.addWorksheet('Shift', {
    pageSetup: { paperSize: 8 as ExcelJS.PaperSize, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    views: [{ state: 'frozen', xSplit: 1, ySplit: 9, showGridLines: false }],
  });
  const f = formulas(data);
  const weeks = weeksOf(plan.year, plan.month);
  const groups = sheetGroups(data);

  // Column layout: A = labels, then each week's days followed by a total column.
  const dayCol: Record<string, number> = {};
  const totalCol: number[] = [];
  let c = 2;
  ws.getColumn(1).width = 16;
  weeks.forEach((w, wi) => {
    for (const d of w) {
      dayCol[d] = c;
      ws.getColumn(c).width = 6.3;
      c++;
    }
    totalCol[wi] = c;
    ws.getColumn(c).width = 5.6;
    c++;
  });
  const lastCol = c - 1;
  const font = { name: 'Arial', size: 9 };

  // Rows 1–2: stamp and title
  ws.mergeCells(1, lastCol - 4, 1, lastCol);
  Object.assign(ws.getCell(1, lastCol - 4), { value: `出力日：${stamp()}`, alignment: { horizontal: 'right' }, font: { ...font, size: 10 } });
  const title = ws.getRow(2);
  title.height = 24;
  Object.assign(ws.getCell(2, 1), { value: data.settings.storeName, fill: fill('#ffff00'), font: { name: 'Arial', size: 10, bold: true, underline: true } });
  Object.assign(ws.getCell(2, 2), { value: 'year', font: { name: 'Arial', size: 10, bold: true } });
  ws.mergeCells(2, 3, 2, 4);
  Object.assign(ws.getCell(2, 3), { value: plan.year, font: { name: 'Arial', size: 16, bold: true }, alignment: { horizontal: 'center' } });
  Object.assign(ws.getCell(2, 5), { value: 'month', font: { name: 'Arial', size: 10, bold: true } });
  ws.mergeCells(2, 6, 2, 7);
  Object.assign(ws.getCell(2, 6), { value: MONTHS_EN[plan.month - 1], fill: fill('#ffff00'), font: { name: 'Arial', size: 16, bold: true } });

  const H = { week: 4, date: 5, wd: 6, ev1: 7, ev2: 8, open: 9, close: 10 };
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: H.close, showGridLines: false }];
  const labels: [number, string][] = [
    [H.week, '週'],
    [H.date, '日付'],
    [H.wd, '曜日'],
    [H.ev1, 'DAILY SCHEDULE'],
    [H.ev2, 'DAILY SCHEDULE'],
    [H.open, 'OPEN'],
    [H.close, 'CLOSE'],
  ];
  for (const [row, text] of labels) {
    Object.assign(ws.getCell(row, 1), { value: text, alignment: { horizontal: row >= H.ev1 && row <= H.ev2 ? 'left' : 'center' } });
  }

  // Person rows: first occurrence holds the code, repeats reference it.
  let row = H.close + 1;
  const firstRow: Record<string, number> = {};
  const personRows: { row: number; staffId: string; ref?: number }[] = [];
  const groupRows: { row: number; from: number; to: number; label: string; people: string[] }[] = [];
  for (const g of groups) {
    const from = row;
    for (const s of g.people) {
      const ref = firstRow[s.id];
      if (ref === undefined) firstRow[s.id] = row;
      personRows.push({ row, staffId: s.id, ref });
      row++;
    }
    groupRows.push({ row, from, to: row - 1, label: `${g.label} total`, people: g.people.map((p) => p.id) });
    row++;
  }
  const lastRow = row - 1;

  // Ranges of distinct people for OPEN/CLOSE counting.
  const distinct = Object.values(firstRow).sort((a, b) => a - b);
  const blocks: [number, number][] = [];
  for (const r0 of distinct) {
    const last = blocks[blocks.length - 1];
    if (last && last[1] === r0 - 1) last[1] = r0;
    else blocks.push([r0, r0]);
  }

  weeks.forEach((w, wi) => {
    const first = dayCol[w[0]];
    ws.mergeCells(H.week, first, H.week, first + w.length - 1);
    Object.assign(ws.getCell(H.week, first), { value: weekLabel(w[0], data.settings.weekNumberOffset), alignment: { horizontal: 'center' } });
    Object.assign(ws.getCell(H.week, totalCol[wi]), { value: 'total', alignment: { horizontal: 'center' } });
    ws.getCell(H.open, totalCol[wi]).value = '—';
    ws.getCell(H.close, totalCol[wi]).value = '—';

    for (const d of w) {
      const col = dayCol[d];
      const L = colName(col);
      const wd = weekday(d);
      const ev = plan.events[d];
      const holiday = plan.holidays.includes(d);
      const head = ev?.color ? fill(ev.color) : holiday ? fill('#ffccff') : undefined;
      const dateCell = ws.getCell(H.date, col);
      dateCell.value = Number(d.slice(8));
      const wdCell = ws.getCell(H.wd, col);
      wdCell.value = WD_EN[wd];
      if (head) {
        dateCell.fill = head;
        wdCell.fill = head;
      }
      wdCell.font = { ...font, color: { argb: wd === 5 ? 'FF0070C0' : wd === 6 ? 'FFFF0000' : 'FF000000' } };
      if (ev?.line1) Object.assign(ws.getCell(H.ev1, col), { value: ev.line1, fill: ev.color ? fill(ev.color) : undefined });
      if (ev?.line2) Object.assign(ws.getCell(H.ev2, col), { value: ev.line2, fill: ev.color ? fill(ev.color) : undefined });

      const cov = dayCoverage(data, plan, d);
      const openF = blocks.map(([a, b]) => f.open(`${L}${a}:${L}${b}`)).join('+');
      const closeF = blocks.map(([a, b]) => f.close(`${L}${a}:${L}${b}`)).join('+');
      ws.getCell(H.open, col).value = { formula: openF, result: cov.open };
      ws.getCell(H.close, col).value = { formula: closeF, result: cov.close };
      if (wd === 2) ws.getCell(H.close, col).fill = fill('#ffc000');

      for (const p of personRows) {
        const cell = ws.getCell(p.row, col);
        const code = getCell(plan, p.staffId, d).code;
        if (p.ref !== undefined) cell.value = { formula: `IF(${L}${p.ref}="","",${L}${p.ref})`, result: code };
        else cell.value = code || null;
        if (!isInMonth(d, plan.year, plan.month)) cell.fill = fill('#d9d9d9');
      }
      for (const g of groupRows) {
        const people = data.staff.filter((s) => g.people.includes(s.id));
        ws.getCell(g.row, col).value = { formula: f.hours(`${L}${g.from}:${L}${g.to}`), result: groupHours(data, plan, people, d) };
      }
    }
    const a = colName(dayCol[w[0]]);
    const b = colName(dayCol[w[w.length - 1]]);
    const tc = totalCol[wi];
    for (const p of personRows) {
      ws.getCell(p.row, tc).value = { formula: f.hours(`${a}${p.row}:${b}${p.row}`), result: hoursOf(data, plan, p.staffId, w) };
    }
    for (const g of groupRows) {
      const people = data.staff.filter((s) => g.people.includes(s.id));
      ws.getCell(g.row, tc).value = {
        formula: `SUM(${a}${g.row}:${b}${g.row})`,
        result: w.reduce((sum, d) => sum + groupHours(data, plan, people, d), 0),
      };
    }
  });

  for (const p of personRows) ws.getCell(p.row, 1).value = data.staff.find((s) => s.id === p.staffId)?.name ?? p.staffId;
  for (const g of groupRows) {
    ws.getCell(g.row, 1).value = g.label;
    for (let col = 1; col <= lastCol; col++) ws.getCell(g.row, col).fill = fill('#ccffcc');
  }

  // Training cells turn blue even when typed in later.
  ws.addConditionalFormatting({
    ref: `B${H.close + 1}:${colName(lastCol)}${lastRow}`,
    rules: [{ type: 'expression', priority: 1, formulae: [`LEFT(B${H.close + 1},2)="TR"`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FF00B0F0' } } } }],
  });

  // Fonts, alignment and borders.
  const totalSet = new Set(totalCol);
  for (let r0 = H.week; r0 <= lastRow; r0++) {
    ws.getRow(r0).height = 15;
    for (let col = 1; col <= lastCol; col++) {
      const cell = ws.getCell(r0, col);
      if (!cell.font || !cell.font.color) cell.font = font;
      if (col > 1 && !cell.alignment) cell.alignment = { horizontal: totalSet.has(col) && r0 > H.close ? 'right' : 'center', vertical: 'middle' };
      cell.border = {
        top: r0 === H.week ? thick : r0 === H.open ? thick : thin,
        bottom: r0 === lastRow ? thick : r0 === H.close ? thick : thin,
        left: col === 1 ? thick : thin,
        right: col === lastCol ? thick : col === 1 || totalSet.has(col) ? dbl : thin,
      };
    }
  }
}

function easySheet(wb: ExcelJS.Workbook, data: AppData, plan: MonthPlan, lang: Lang) {
  const t = DICTS[lang];
  const ws = wb.addWorksheet(t.viewEasy, {
    pageSetup: { paperSize: 8 as ExcelJS.PaperSize, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
    views: [{ state: 'frozen', xSplit: 1, ySplit: 4, showGridLines: false }],
  });
  const dates = monthDates(plan.year, plan.month);
  const staff = scheduledStaff(data);
  const font = { name: 'Arial', size: 10 };
  const border = { top: thin, bottom: thin, left: thin, right: thin } as ExcelJS.Borders;

  ws.getCell(1, 1).value = `${data.settings.storeName} — ${t.months[plan.month - 1]} ${plan.year}`;
  ws.getCell(1, 1).font = { name: 'Arial', size: 14, bold: true };
  ws.getColumn(1).width = 14;

  const kinds: Record<string, { fill: string; label: string }> = {
    morning: { fill: '#fdf0c4', label: t.morning },
    evening: { fill: '#dfe3ff', label: t.evening },
    training: { fill: '#cdeffc', label: t.training },
    leave: { fill: '#e3f5d8', label: t.leave },
  };
  let lc = 2;
  for (const k of Object.values(kinds)) {
    Object.assign(ws.getCell(2, lc), { value: k.label, fill: fill(k.fill), font, alignment: { horizontal: 'center' }, border });
    lc += 2;
  }

  const head = 3;
  ws.getCell(head, 1).value = '';
  dates.forEach((d, i) => {
    const col = i + 2;
    ws.getColumn(col).width = 7.2;
    const wd = weekday(d);
    const holiday = plan.holidays.includes(d);
    Object.assign(ws.getCell(head, col), {
      value: `${Number(d.slice(8))}\n${t.weekdaysShort[wd]}`,
      alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
      font: { ...font, bold: true, color: { argb: wd === 5 ? 'FF0070C0' : wd === 6 ? 'FFD92D20' : 'FF000000' } },
      fill: holiday ? fill('#ffccff') : fill('#f3f5f8'),
      border,
    });
    const cov = dayCoverage(data, plan, d);
    const bad = cov.open < cov.minOpen || cov.close < cov.minClose || cov.managerOpen === 0 || cov.managerClose === 0;
    Object.assign(ws.getCell(head + 1, col), {
      value: `☀${cov.open} ☾${cov.close}`,
      alignment: { horizontal: 'center' },
      font: { ...font, size: 8, bold: bad, color: { argb: bad ? 'FFD92D20' : 'FF1FA86A' } },
      border,
    });
  });
  ws.getRow(head).height = 28;
  const sumCols = [t.workDays, t.offDays, t.quota, t.hours];
  sumCols.forEach((label, i) => {
    const col = dates.length + 2 + i;
    ws.getColumn(col).width = 9;
    Object.assign(ws.getCell(head, col), { value: label, font: { ...font, bold: true }, alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }, fill: fill('#f3f5f8'), border });
  });
  Object.assign(ws.getCell(head + 1, 1), { value: `${t.open} / ${t.close}`, font: { ...font, size: 8 }, border });

  staff.forEach((s, si) => {
    const r0 = head + 2 + si;
    ws.getRow(r0).height = 28;
    Object.assign(ws.getCell(r0, 1), {
      value: `${s.name}${s.isManager ? ' (M)' : ''}${s.partTime ? ' PT' : ''}`,
      font: { ...font, bold: true },
      alignment: { vertical: 'middle' },
      border,
    });
    dates.forEach((d, i) => {
      const code = getCell(plan, s.id, d).code;
      const info = codeInfo(code, data.settings);
      const cell = ws.getCell(r0, i + 2);
      let text = code;
      let k: string | undefined;
      if (info.shift) {
        text = `${minutesToHHMM(info.shift.start)}\n${minutesToHHMM(info.shift.end)}`;
        k = info.opens ? 'morning' : info.closes ? 'evening' : undefined;
      } else if (info.kind === 'training') k = 'training';
      else if (info.kind === 'leave') k = 'leave';
      else if (!code && (plan.requests[s.id] ?? []).includes(d)) text = 'R';
      cell.value = text || null;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.font = { ...font, size: 8, color: { argb: text === 'R' ? 'FFD92D20' : 'FF000000' } };
      cell.border = border;
      if (k) cell.fill = fill(kinds[k].fill);
    });
    const st = personStats(data, plan, s.id);
    [st.workDays, st.offDays, plan.offQuota[s.id] ?? '', st.hours].forEach((v, i) => {
      Object.assign(ws.getCell(r0, dates.length + 2 + i), { value: v, font: { ...font, bold: true }, alignment: { horizontal: 'center', vertical: 'middle' }, border });
    });
  });
}

export async function buildWorkbook(data: AppData, plan: MonthPlan, lang: Lang): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Smart Schedule';
  wb.created = new Date();
  originalSheet(wb, data, plan);
  easySheet(wb, data, plan, lang);
  return wb;
}

export async function exportExcel(data: AppData, plan: MonthPlan, lang: Lang): Promise<void> {
  const wb = await buildWorkbook(data, plan, lang);
  const buf = await wb.xlsx.writeBuffer();
  const name = `Shift_${data.settings.storeName.replace(/\s+/g, '')}_${MONTHS_EN[plan.month - 1].toUpperCase()}_${plan.year}.xlsx`;
  await download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name);
}
