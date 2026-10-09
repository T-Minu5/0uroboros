import { useSyncExternalStore } from 'react';

/** Which HUD design shows inside the end-of-game black hole; persists. */
export const CORE_HUDS = [{ id: 'rings', label: 'Rings' }, { id: 'stack', label: 'Circles' }] as const;
export type CoreHud = typeof CORE_HUDS[number]['id'];
export type HudTuning = { coreHud: CoreHud };
const STORAGE_KEY = 'ouroboros.hudTuning';

const isCoreHud = (value: unknown): value is CoreHud => CORE_HUDS.some(hud => hud.id === value);

/** Current settings; replaced (never mutated) on change so subscribers see a new snapshot. */
export let hudTuning: HudTuning = { coreHud: 'rings' };
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { coreHud?: unknown };
  if (isCoreHud(saved.coreHud)) hudTuning = { coreHud: saved.coreHud };
} catch { /* storage unavailable */ }

const listeners = new Set<() => void>();

function update(next: Partial<HudTuning>) {
  hudTuning = { ...hudTuning, ...next };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(hudTuning)); } catch { /* storage unavailable */ }
  listeners.forEach(listener => listener());
}
export const setCoreHud = (coreHud: CoreHud) => update({ coreHud });

export function useHudTuning() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => hudTuning);
}
