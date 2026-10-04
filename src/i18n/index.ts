import { useStore } from '../store';
import { DICTS, type T } from './dicts';

export * from './dicts';

export function useT(): T {
  const lang = useStore((s) => s.lang);
  return DICTS[lang];
}
