import { loadPerPlayer, savePerPlayer, type PerPlayer } from './playerSettings';

/** Server tube look: a hex force-shield, Pulse Origami discs, or the original liquid column. */
export type ServerStyle = 'shield' | 'pulse' | 'classic';

export const SERVER_STYLES: { id: ServerStyle; label: string }[] = [
  { id: 'shield', label: 'Shield' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'classic', label: 'Classic' },
];
export const DEFAULT_SERVER_STYLE: ServerStyle = 'shield';

const STORAGE_KEY = 'ouroboros.serverStyles';
const LEGACY_KEY = 'ouroboros.serverStyle';

/** Each player's look for their own two Server tubes. */
export function loadServerStyles(): PerPlayer<ServerStyle> {
  return loadPerPlayer(STORAGE_KEY, SERVER_STYLES.map(option => option.id), [DEFAULT_SERVER_STYLE, DEFAULT_SERVER_STYLE], LEGACY_KEY);
}

export function saveServerStyles(styles: PerPlayer<ServerStyle>) {
  savePerPlayer(STORAGE_KEY, styles);
}
