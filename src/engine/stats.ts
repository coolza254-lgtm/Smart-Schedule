import { getCell, monthDates, scheduledStaff } from './month';
import { codeInfo } from './shifts';
import type { AppData, ISODate, MonthPlan, Staff } from './types';

export function hoursOf(data: AppData, plan: MonthPlan, staffId: string, dates: ISODate[]): number {
  return dates.reduce((sum, d) => sum + codeInfo(getCell(plan, staffId, d).code, data.settings).hours, 0);
}

/** Sum of hours of a group of people on one day (leave and training included). */
export function groupHours(data: AppData, plan: MonthPlan, people: Staff[], date: ISODate): number {
  return people.reduce((sum, s) => sum + codeInfo(getCell(plan, s.id, date).code, data.settings).hours, 0);
}

export interface PersonMonthStats {
  workDays: number;
  offDays: number;
  hours: number;
  mornings: number;
  evenings: number;
  training: number;
  leave: number;
}

export function personStats(data: AppData, plan: MonthPlan, staffId: string): PersonMonthStats {
  const st: PersonMonthStats = { workDays: 0, offDays: 0, hours: 0, mornings: 0, evenings: 0, training: 0, leave: 0 };
  for (const d of monthDates(plan.year, plan.month)) {
    const info = codeInfo(getCell(plan, staffId, d).code, data.settings);
    if (info.worked) st.workDays++;
    else st.offDays++;
    st.hours += info.hours;
    if (info.kind === 'training') st.training++;
    if (info.kind === 'leave') st.leave++;
    if (info.present && info.opens) st.mornings++;
    else if (info.present && info.closes) st.evenings++;
  }
  return st;
}

/** Row groups of the original sheet: managers first, then each section. */
export function sheetGroups(data: AppData): { id: string; label: string; people: Staff[] }[] {
  const staff = scheduledStaff(data);
  return [
    { id: 'MANAGER', label: 'MANAGER', people: staff.filter((s) => s.isManager) },
    ...data.settings.sections.map((sec) => ({
      id: sec.id,
      label: sec.name,
      people: staff.filter((s) => s.sections.includes(sec.id)),
    })),
  ];
}
