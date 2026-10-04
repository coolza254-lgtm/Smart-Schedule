import { getCell, monthDates, scheduledStaff } from './month';
import { codeInfo } from './shifts';
import { minCloseFor, minOpenFor } from './validate';
import type { AppData, ISODate, MonthPlan } from './types';

export interface RequestConflict {
  date: ISODate;
  kind: 'managers' | 'staff';
  /** People unavailable that day (requested off, training or leave). */
  off: number;
  available: number;
  need: number;
  managersOff: number;
  managersTotal: number;
}

/**
 * Days where requests (plus fixed training/leave) leave too few people to
 * cover the day: fewer than two section managers (one per shift), or fewer
 * people than the opening and closing minimums need together.
 */
export function requestConflicts(data: AppData, plan: MonthPlan): RequestConflict[] {
  const staff = scheduledStaff(data);
  const managers = staff.filter((s) => s.isManager);
  const out: RequestConflict[] = [];
  for (const d of monthDates(plan.year, plan.month)) {
    const away = (id: string) => {
      if (plan.requests[id]?.[d]?.kind === 'off') return true;
      const cell = getCell(plan, id, d);
      if (!cell.locked) return false;
      const info = codeInfo(cell.code, data.settings);
      return !info.present;
    };
    const off = staff.filter((s) => away(s.id)).length;
    const managersOff = managers.filter((s) => away(s.id)).length;
    const available = staff.length - off;
    const need = minOpenFor(data.settings, plan, d) + minCloseFor(data.settings, plan, d);
    const base = { date: d, off, available, need, managersOff, managersTotal: managers.length };
    if (data.settings.rules.managerEachShift && managers.length - managersOff < 2 && managersOff > 0) out.push({ ...base, kind: 'managers' });
    else if (available < need && off > 0) out.push({ ...base, kind: 'staff' });
  }
  return out;
}
