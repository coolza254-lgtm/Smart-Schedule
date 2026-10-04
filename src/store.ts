import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import SolverWorker from './engine/solver.worker.ts?worker&inline';
import {
  createPlan,
  defaultAppData,
  migratePlan,
  monthKey,
  refreshCarry,
  solve,
  type AppData,
  type SolveResult,
  type MonthPlan,
} from './engine';
import type { Lang } from './i18n/dicts';

/** Thai public holidays that fall on the same date every year. */
const FIXED_HOLIDAYS = ['01-01', '04-06', '04-13', '04-14', '04-15', '05-01', '05-04', '06-03', '07-28', '08-12', '10-13', '10-23', '12-05', '12-10', '12-31'];

export function defaultHolidays(year: number, month: number): string[] {
  const mm = String(month).padStart(2, '0');
  return FIXED_HOLIDAYS.filter((d) => d.startsWith(mm)).map((d) => `${year}-${d}`);
}

export type ScheduleView = 'original' | 'easy';
export type EasyMode = 'table' | 'days';

interface State {
  data: AppData;
  year: number;
  month: number;
  lang: Lang;
  view: ScheduleView;
  easyMode: EasyMode;
  zoom: number;
  generating: boolean;
  setLang: (l: Lang) => void;
  setView: (v: ScheduleView) => void;
  setEasyMode: (m: EasyMode) => void;
  setZoom: (z: number) => void;
  goMonth: (year: number, month: number) => void;
  /** Mutate a copy of the data and save it. */
  update: (fn: (d: AppData) => void) => void;
  /** Mutate a copy of the current month's plan and save it. */
  updatePlan: (fn: (p: MonthPlan, d: AppData) => void) => void;
  generate: (seed?: number) => Promise<void>;
  replaceData: (d: AppData) => void;
}

function withPlan(data: AppData, year: number, month: number): AppData {
  const key = monthKey(year, month);
  const next = structuredClone(data);
  if (!next.plans[key]) {
    const plan = createPlan(next, year, month);
    plan.holidays = defaultHolidays(year, month);
    next.plans[key] = plan;
  } else {
    refreshCarry(next, next.plans[key]);
  }
  for (const p of Object.values(next.plans)) migratePlan(p);
  // People added after the plan was created get their default quota.
  const plan = next.plans[key];
  for (const st of next.staff) {
    plan.offQuota[st.id] ??= st.defaultOffDays;
    plan.requests[st.id] ??= {};
  }
  return next;
}

let worker: Worker | null = null;
let jobId = 0;

/** Runs the solver in a Web Worker so the screen stays responsive. */
function solveAsync(data: AppData, plan: MonthPlan, seed: number): Promise<SolveResult> {
  if (typeof Worker === 'undefined') return Promise.resolve(solve(data, plan, { seed }));
  worker ??= new SolverWorker();
  const id = ++jobId;
  const w = worker;
  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent<{ id: number; result: SolveResult }>) => {
      if (e.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      resolve(e.data.result);
    };
    w.addEventListener('message', onMessage);
    w.postMessage({ id, data, plan, opts: { seed } });
  });
}

const today = new Date();

const STORAGE_KEY = 'smart-schedule-v1';

/** localStorage that never throws (private mode, blocked storage, previews). */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // Not saved; the app keeps working for this visit.
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};

/** True on the very first launch (nothing saved yet). */
export const isFirstRun = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === null;
  } catch {
    return false;
  }
})();

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      data: withPlan(defaultAppData(), today.getFullYear(), today.getMonth() + 1),
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      lang: 'th',
      view: 'original',
      easyMode: typeof window !== 'undefined' && window.innerWidth < 760 ? 'days' : 'table',
      zoom: 1,
      generating: false,
      setLang: (lang) => set({ lang }),
      setView: (view) => set({ view }),
      setEasyMode: (easyMode) => set({ easyMode }),
      setZoom: (zoom) => set({ zoom }),
      goMonth: (year, month) => set({ year, month, data: withPlan(get().data, year, month) }),
      update: (fn) => {
        const data = structuredClone(get().data);
        fn(data);
        set({ data: withPlan(data, get().year, get().month) });
      },
      updatePlan: (fn) => {
        const { year, month } = get();
        const data = withPlan(get().data, year, month);
        fn(data.plans[monthKey(year, month)], data);
        set({ data });
      },
      generate: async (seed) => {
        const { year, month } = get();
        const key = monthKey(year, month);
        const data = withPlan(get().data, year, month);
        set({ generating: true });
        try {
          const result = await solveAsync(data, data.plans[key], seed ?? Date.now());
          // Apply to the latest state (the user may have navigated meanwhile).
          const latest = structuredClone(get().data);
          const plan = latest.plans[key];
          if (plan) {
            plan.cells = result.cells;
            plan.generatedAt = new Date().toISOString();
          }
          set({ data: latest });
        } finally {
          set({ generating: false });
        }
      },
      replaceData: (d) => set({ data: withPlan(d, get().year, get().month) }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ data: s.data, year: s.year, month: s.month, lang: s.lang, view: s.view, easyMode: s.easyMode, zoom: s.zoom }),
      onRehydrateStorage: () => (state) => {
        if (state) state.data = withPlan(state.data, state.year, state.month);
      },
    },
  ),
);

export function useCurrentPlan(): MonthPlan {
  const { data, year, month } = useStore();
  return data.plans[monthKey(year, month)];
}
