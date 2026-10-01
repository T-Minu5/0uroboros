/** Server tube look: a hex force-shield, Pulse Origami discs, or the original liquid column. */
export type ServerStyle = 'shield' | 'pulse' | 'classic';

export const SERVER_STYLES: { id: ServerStyle; label: string }[] = [
  { id: 'shield', label: 'Shield' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'classic', label: 'Classic' },
];
export const DEFAULT_SERVER_STYLE: ServerStyle = 'shield';

const STORAGE_KEY = 'ouroboros.serverStyle';

export function loadServerStyle(): ServerStyle {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return SERVER_STYLES.some(option => option.id === saved) ? saved as ServerStyle : DEFAULT_SERVER_STYLE;
  } catch {
    return DEFAULT_SERVER_STYLE;
  }
}

export function saveServerStyle(style: ServerStyle) {
  try { localStorage.setItem(STORAGE_KEY, style); } catch { /* storage unavailable */ }
}
