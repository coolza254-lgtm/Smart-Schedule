import type { AppData, Settings, Staff } from './types';

export const DEFAULT_SETTINGS: Settings = {
  storeName: 'Central Westgate',
  storeOpen: '10:00',
  storeClose: '22:00',
  weekNumberOffset: -4,
  sections: [
    { id: 'CASHIER', name: 'CASHIER' },
    { id: 'HFA', name: 'HFA' },
    { id: 'FURNITURE', name: 'FURNITURE' },
  ],
  shifts: {
    morningDefault: '09A8',
    eveningDefault: '13C8',
    eveningPartTime: '13A8',
    // Thursday: openers come at 08:00 to finish Wednesday night's restock.
    morningByWeekday: { 3: '08A8' },
    // Wednesday: closers stay until 23:00 for the after-hours delivery.
    eveningByWeekday: { 2: '14A8' },
  },
  rules: {
    maxConsecutiveDays: 6,
    //        Mon Tue Wed Thu Fri Sat Sun
    minOpen: [2, 2, 2, 2, 2, 2, 2],
    minClose: [2, 2, 3, 2, 2, 2, 2],
    targetOpen: [2, 2, 2, 2, 3, 3, 3],
    targetClose: [3, 3, 3, 3, 3, 4, 4],
    holidayTargetOpen: 3,
    holidayTargetClose: 4,
    managerEachShift: true,
    noCloseThenOpen: true,
    maxRequestsPerPerson: 3,
    breakMinutes: 60,
    breakAfterHours: 5,
  },
  leaveTypes: [{ code: 'AL', hours: 8 }],
  // Branch codes used in training codes (TR + code). Names can be edited in settings.
  branches: [
    { code: 'WG', name: 'Central Westgate' },
    { code: 'IS', name: '' },
    { code: 'OB', name: '' },
    { code: 'CP', name: '' },
    { code: 'FI', name: '' },
  ],
};

function person(
  id: string,
  sections: string[],
  opts: Partial<Staff> = {},
): Staff {
  return {
    id,
    name: id,
    sections,
    isManager: false,
    partTime: false,
    active: true,
    canMorning: true,
    canEvening: true,
    unavailableWeekdays: [],
    defaultOffDays: 10,
    ...opts,
  };
}

export const DEFAULT_STAFF: Staff[] = [
  person('JUNIOR', ['HFA'], { isManager: true }),
  person('MAX', ['FURNITURE'], { isManager: true }),
  person('KHET', ['FURNITURE'], { isManager: true }),
  person('MILD', ['FURNITURE'], { isManager: true }),
  person('ATT', ['CASHIER'], { partTime: true, defaultOffDays: 14 }),
  person('AOM', ['CASHIER'], { partTime: true, defaultOffDays: 15, canEvening: false }),
  person('MIEW', ['HFA']),
  person('IT', ['HFA']),
  person('PEEM', ['HFA'], { partTime: true, defaultOffDays: 11 }),
  person('PLENG', ['HFA'], { partTime: true, defaultOffDays: 7, preferredShift: 'evening' }),
];

export function defaultAppData(): AppData {
  return {
    version: 1,
    settings: structuredClone(DEFAULT_SETTINGS),
    staff: structuredClone(DEFAULT_STAFF),
    plans: {},
  };
}
