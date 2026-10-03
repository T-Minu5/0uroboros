/** Sentinel entry: no floor media, the board sits on the scene's clear colour. */
export const NO_BOARD_BACKGROUND = 'none';

/** Studio lighting: preview floor media under the board (assets/board/backgrounds/), drawn flat and unlit. */
export const BOARD_BACKGROUNDS = [
  '/assets/board/backgrounds/background-01.mp4',
  '/assets/board/backgrounds/back-01.png',
  '/assets/board/backgrounds/back-02.png',
  '/assets/board/backgrounds/back-03.png',
  '/assets/board/backgrounds/back-04.png',
  '/assets/board/backgrounds/back-05.png',
  '/assets/board/backgrounds/back-06.png',
  '/assets/board/backgrounds/back-07.png',
  NO_BOARD_BACKGROUND,
] as const;

/** Real lighting: floor art rendered as lit, depth-mapped steel. */
export const REAL_LIGHTING_FLOORS = [
  '/assets/board/backgrounds/back-01.png',
  '/assets/board/backgrounds/back-02.png',
  '/assets/board/backgrounds/back-07.png',
] as const;

export type LightingMode = 'real' | 'studio';
export const DEFAULT_LIGHTING_MODE: LightingMode = 'real';
const DEFAULT_BACKGROUND: Record<LightingMode, string> = {
  real: '/assets/board/backgrounds/back-07.png',
  studio: '/assets/board/backgrounds/back-02.png',
};

export function backgroundsFor(mode: LightingMode): readonly string[] {
  return mode === 'real' ? REAL_LIGHTING_FLOORS : BOARD_BACKGROUNDS;
}

/** The lighting mode and the background last chosen in each mode. */
export type BackgroundChoice = { mode: LightingMode; background: Record<LightingMode, string> };

const MODE_KEY = 'ouroboros.lightingMode';
const BACKGROUND_KEY = 'ouroboros.boardBackground';

export function loadBackgroundChoice(): BackgroundChoice {
  const choice: BackgroundChoice = { mode: DEFAULT_LIGHTING_MODE, background: { ...DEFAULT_BACKGROUND } };
  try {
    const mode = localStorage.getItem(MODE_KEY);
    if (mode === 'real' || mode === 'studio') choice.mode = mode;
    const saved = JSON.parse(localStorage.getItem(BACKGROUND_KEY) ?? '{}') as Partial<Record<LightingMode, unknown>>;
    for (const m of ['real', 'studio'] as const) {
      const url = saved?.[m];
      if (typeof url === 'string' && backgroundsFor(m).includes(url)) choice.background[m] = url;
    }
  } catch { /* storage unavailable or corrupt */ }
  return choice;
}

export function saveBackgroundChoice(choice: BackgroundChoice) {
  try {
    localStorage.setItem(MODE_KEY, choice.mode);
    localStorage.setItem(BACKGROUND_KEY, JSON.stringify(choice.background));
  } catch { /* storage unavailable */ }
}

/** The background `step` places after the current one in the active mode's list. */
export function stepBackground(choice: BackgroundChoice, step: number): BackgroundChoice {
  const list = backgroundsFor(choice.mode), at = Math.max(0, list.indexOf(choice.background[choice.mode]));
  return { ...choice, background: { ...choice.background, [choice.mode]: list[(at + step + list.length) % list.length] } };
}

export function boardBackgroundLabel(url: string): string {
  if (url === NO_BOARD_BACKGROUND) return 'None';
  const file = url.split('/').pop() ?? url;
  return file.replace(/\.[^.]+$/, '');
}

export function isBoardBackgroundVideo(url: string): boolean {
  return /\.mp4($|\?)/i.test(url);
}
