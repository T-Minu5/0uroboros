/**
 * Central presentation timing. Player-facing defaults favor reading, not speed.
 * Fast is an explicit override for experienced play and developer checks.
 */

export type PresentationSpeed = 'normal' | 'fast';

export interface PresentationTiming {
  effectMinimumReadMs: number;
  locationMinimumReadMs: number;
  nodeResultMinimumReadMs: number;
  collapseTitleMs: number;
  collapseNodeGapMs: number;
  collapseFinalSelectionMs: number;
  collapseWinnerMs: number;
  phaseAnnouncementMs: number;
  cardDeployMs: number;
  cardRevealMs: number;
  returnToHandMs: number;
}

export const PRESENTATION_TIMING: Record<PresentationSpeed, PresentationTiming> = {
  // Snap sequencing: longer holds + explicit Node gaps so one Node finishes
  // before the next Location beat begins.
  normal: {
    effectMinimumReadMs: 1800,
    locationMinimumReadMs: 2200,
    nodeResultMinimumReadMs: 2000,
    collapseTitleMs: 1600,
    // Snap: readable beat after each Node before the next Location fires.
    collapseNodeGapMs: 800,
    collapseFinalSelectionMs: 3200,
    collapseWinnerMs: 2400,
    phaseAnnouncementMs: 1200,
    // Hearthstone weight: deploy needs windup room, not a snap teleport.
    cardDeployMs: 1080,
    cardRevealMs: 780,
    returnToHandMs: 560,
  },
  fast: {
    effectMinimumReadMs: 700,
    locationMinimumReadMs: 750,
    nodeResultMinimumReadMs: 650,
    collapseTitleMs: 600,
    collapseNodeGapMs: 120,
    collapseFinalSelectionMs: 900,
    collapseWinnerMs: 700,
    phaseAnnouncementMs: 500,
    cardDeployMs: 420,
    cardRevealMs: 300,
    returnToHandMs: 240,
  },
};

export const REDUCED_MOTION_MS = 180;

export function resolveTiming(speed: PresentationSpeed, reducedMotion: boolean): PresentationTiming {
  if (!reducedMotion) return PRESENTATION_TIMING[speed];
  const full = PRESENTATION_TIMING[speed];
  const reduced = { ...full };
  (Object.keys(reduced) as Array<keyof PresentationTiming>).forEach((key) => {
    reduced[key] = Math.min(full[key], REDUCED_MOTION_MS);
  });
  return reduced;
}

export const SPEED_STORAGE_KEY = 'ouroboros.presentationSpeed';

export function parsePresentationSpeed(value: string | null | undefined): PresentationSpeed {
  return value === 'fast' ? 'fast' : 'normal';
}
