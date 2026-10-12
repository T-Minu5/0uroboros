import { loadPerPlayer, savePerPlayer, type PerPlayer } from './playerSettings';

/** Server tube look: the original liquid column (shown as Digital), a hex force-shield, or Pulse Origami discs. */
export type ServerStyle = 'shield' | 'pulse' | 'classic';

export const SERVER_STYLES: { id: ServerStyle; label: string }[] = [
  { id: 'classic', label: 'Digital' },
  { id: 'shield', label: 'Shield' },
  { id: 'pulse', label: 'Pulse' },
];
export const DEFAULT_SERVER_STYLE: ServerStyle = 'classic';

/** v2: the pair was saved on every load, so everyone moves to the Digital default once. */
const STORAGE_KEY = 'ouroboros.serverStyles.v2';

/** Each player's look for their own two Server tubes. */
export function loadServerStyles(): PerPlayer<ServerStyle> {
  return loadPerPlayer(STORAGE_KEY, SERVER_STYLES.map(option => option.id), [DEFAULT_SERVER_STYLE, DEFAULT_SERVER_STYLE]);
}

export function saveServerStyles(styles: PerPlayer<ServerStyle>) {
  savePerPlayer(STORAGE_KEY, styles);
}
