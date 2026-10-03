import { loadPerPlayer, savePerPlayer, type PerPlayer } from './playerSettings';

/** Etched line pattern on open lanes; `none` leaves the plain surface. */
export type LanePattern = 'hexagons' | 'maze' | 'none';

export const LANE_PATTERNS: { id: LanePattern; label: string }[] = [
  { id: 'hexagons', label: 'Hexagons' },
  { id: 'maze', label: 'Hex maze' },
  { id: 'none', label: 'Off' },
];
export const DEFAULT_LANE_PATTERN: LanePattern = 'hexagons';

const STORAGE_KEY = 'ouroboros.lanePatterns';
const LEGACY_KEY = 'ouroboros.lanePattern';

/** Each player's pattern on their own half of every lane. */
export function loadLanePatterns(): PerPlayer<LanePattern> {
  return loadPerPlayer(STORAGE_KEY, LANE_PATTERNS.map(option => option.id), [DEFAULT_LANE_PATTERN, DEFAULT_LANE_PATTERN], LEGACY_KEY);
}

export function saveLanePatterns(patterns: PerPlayer<LanePattern>) {
  savePerPlayer(STORAGE_KEY, patterns);
}
