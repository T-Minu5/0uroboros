/** Etched line pattern on open lanes; `none` leaves the plain surface. */
export type LanePattern = 'hexagons' | 'maze' | 'none';

export const LANE_PATTERNS: { id: LanePattern; label: string }[] = [
  { id: 'hexagons', label: 'Hexagons' },
  { id: 'maze', label: 'Hex maze' },
  { id: 'none', label: 'Off' },
];
export const DEFAULT_LANE_PATTERN: LanePattern = 'hexagons';

const STORAGE_KEY = 'ouroboros.lanePattern';

export function loadLanePattern(): LanePattern {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return LANE_PATTERNS.some(option => option.id === saved) ? saved as LanePattern : DEFAULT_LANE_PATTERN;
  } catch {
    return DEFAULT_LANE_PATTERN;
  }
}

export function saveLanePattern(pattern: LanePattern) {
  try { localStorage.setItem(STORAGE_KEY, pattern); } catch { /* storage unavailable */ }
}
