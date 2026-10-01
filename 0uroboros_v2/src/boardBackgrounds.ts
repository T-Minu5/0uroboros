/** Sentinel entry: no floor media, the board sits on the scene's clear colour. */
export const NO_BOARD_BACKGROUND = 'none';

/** Preview floor media under the board (assets/board/backgrounds/). */
export const BOARD_BACKGROUNDS = [
  '/assets/board/backgrounds/background-01.mp4',
  '/assets/board/backgrounds/back-01.png',
  '/assets/board/backgrounds/back-02.png',
  '/assets/board/backgrounds/back-03.png',
  '/assets/board/backgrounds/back-04.png',
  '/assets/board/backgrounds/back-05.png',
  '/assets/board/backgrounds/back-06.png',
  NO_BOARD_BACKGROUND,
] as const;

export const DEFAULT_BOARD_BACKGROUND = BOARD_BACKGROUNDS.indexOf('/assets/board/backgrounds/back-02.png');

export function boardBackgroundLabel(url: string): string {
  if (url === NO_BOARD_BACKGROUND) return 'None';
  const file = url.split('/').pop() ?? url;
  return file.replace(/\.[^.]+$/, '');
}

export function isBoardBackgroundVideo(url: string): boolean {
  return /\.mp4($|\?)/i.test(url);
}
