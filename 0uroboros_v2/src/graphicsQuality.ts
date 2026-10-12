import { createContext, useContext } from 'react';

export type QualityLevel = 'high' | 'medium' | 'low';
export type QualityPreference = 'auto' | QualityLevel;
/** Best first; auto quality steps along this list. */
export const QUALITY_LEVELS: readonly QualityLevel[] = ['high', 'medium', 'low'];
export const QUALITY_LABELS: Record<QualityLevel, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export type QualitySettings = {
  /** Canvas device pixel ratio, fixed or a [min, max] range over the display's; the composer follows it. */
  dpr: number | [number, number];
  /** MSAA samples on the HDR scene target. */
  samples: number;
  shadows: boolean;
  bloom: boolean;
  /** The Neon board's area-light rig under Real lighting, the costliest single feature. */
  neonRig: boolean;
  /** Real lighting's lit, depth-mapped floor; without it Real lighting draws the same floor art as Studio does. */
  realFloor: boolean;
};

/** Ordered by cost: on the Neon board under Real lighting each level takes a third or less of the GPU time of the one above. */
export const QUALITY: Record<QualityLevel, QualitySettings> = {
  high: { dpr: [1, 1.6], samples: 4, shadows: true, bloom: true, neonRig: true, realFloor: true },
  medium: { dpr: 1, samples: 2, shadows: true, bloom: true, neonRig: false, realFloor: true },
  low: { dpr: .75, samples: 0, shadows: false, bloom: false, neonRig: false, realFloor: false },
};

const PREFERENCE_KEY = 'ouroboros.graphicsQuality';
/** The level auto quality last settled on, so the next session starts there instead of re-learning it. */
const AUTO_LEVEL_KEY = 'ouroboros.graphicsAutoLevel';

const isLevel = (value: unknown): value is QualityLevel => QUALITY_LEVELS.includes(value as QualityLevel);

export function loadQualityPreference(): QualityPreference {
  try {
    const saved = localStorage.getItem(PREFERENCE_KEY);
    return saved === 'auto' || isLevel(saved) ? saved : 'auto';
  } catch { return 'auto'; }
}
export function saveQualityPreference(preference: QualityPreference) {
  try { localStorage.setItem(PREFERENCE_KEY, preference); } catch { /* Session-only when storage is unavailable. */ }
}
export function loadAutoQuality(): QualityLevel {
  try {
    const saved = localStorage.getItem(AUTO_LEVEL_KEY);
    return isLevel(saved) ? saved : 'high';
  } catch { return 'high'; }
}
export function saveAutoQuality(level: QualityLevel) {
  try { localStorage.setItem(AUTO_LEVEL_KEY, level); } catch { /* Session-only when storage is unavailable. */ }
}

/** WebGL running on the CPU: Chrome with graphics acceleration off or its GPU blocklisted, a VM, or a missing driver. */
export function isSoftwareRenderer(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
}

/** Frame-time windows are judged by their median, so one-off hitches (a shader compile, GC) don't count. */
const WINDOW_S = 2;
/** A window whose median frame is slower than this (under ~45 fps) is slow. */
export const SLOW_FRAME_MS = 22;
/** A window whose median frame is faster than this (~57 fps or better) has room to try the level above. */
export const FAST_FRAME_MS = 17.5;
/** Consecutive slow windows before dropping a level, and fast ones before trying the level above. */
const DROP_AFTER = 2, RAISE_AFTER = 8;
/** Ignored after starting or changing level: programs compile and render targets reallocate. */
export const SETTLE_S = 3;
/** Longer frames are a hidden tab, a debugger pause or a stall, not the render cost; they restart the window. */
const MAX_FRAME_S = .25;

export type QualityMonitor = {
  level: QualityLevel;
  /** The best level auto quality may return to: a raise that drops straight back caps it there. */
  ceiling: QualityLevel;
  frames: number[];
  elapsed: number;
  settle: number;
  slow: number;
  fast: number;
  raised: boolean;
};

export function createQualityMonitor(level: QualityLevel, ceiling: QualityLevel = 'high'): QualityMonitor {
  return { level, ceiling, frames: [], elapsed: 0, settle: SETTLE_S, slow: 0, fast: 0, raised: false };
}

function median(values: number[]) {
  values.sort((a, b) => a - b);
  const mid = values.length >> 1;
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

function moveTo(monitor: QualityMonitor, level: QualityLevel, raised: boolean) {
  Object.assign(monitor, { level, raised, slow: 0, fast: 0, settle: SETTLE_S });
  return level;
}

/** Feeds one frame's duration in seconds; returns the level to switch to, or null to stay. */
export function sampleQuality(monitor: QualityMonitor, delta: number): QualityLevel | null {
  if (delta > MAX_FRAME_S) { monitor.frames.length = 0; monitor.elapsed = 0; return null; }
  if (monitor.settle > 0) { monitor.settle -= delta; return null; }
  monitor.frames.push(delta);
  monitor.elapsed += delta;
  if (monitor.elapsed < WINDOW_S) return null;
  const ms = median(monitor.frames) * 1000;
  monitor.frames.length = 0;
  monitor.elapsed = 0;
  monitor.slow = ms > SLOW_FRAME_MS ? monitor.slow + 1 : 0;
  monitor.fast = ms < FAST_FRAME_MS ? monitor.fast + 1 : 0;
  const at = QUALITY_LEVELS.indexOf(monitor.level);
  if (monitor.slow >= DROP_AFTER && at < QUALITY_LEVELS.length - 1) {
    const lower = QUALITY_LEVELS[at + 1];
    if (monitor.raised) monitor.ceiling = lower;
    return moveTo(monitor, lower, false);
  }
  if (monitor.fast >= RAISE_AFTER && at > QUALITY_LEVELS.indexOf(monitor.ceiling)) return moveTo(monitor, QUALITY_LEVELS[at - 1], true);
  return null;
}

const GraphicsQualityContext = createContext<QualitySettings>(QUALITY.high);
export const GraphicsQualityProvider = GraphicsQualityContext.Provider;
export const useGraphicsQuality = () => useContext(GraphicsQualityContext);
