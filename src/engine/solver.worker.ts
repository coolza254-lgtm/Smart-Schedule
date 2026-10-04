import { solve, type SolveOptions } from './solver';
import type { AppData, MonthPlan } from './types';

self.onmessage = (e: MessageEvent<{ id: number; data: AppData; plan: MonthPlan; opts: SolveOptions }>) => {
  const { id, data, plan, opts } = e.data;
  const result = solve(data, plan, opts);
  self.postMessage({ id, result });
};
