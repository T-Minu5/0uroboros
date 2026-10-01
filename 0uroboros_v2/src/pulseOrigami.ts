/**
 * Pulse Origami discs inside a server tube: the `EffectPulse` stack (radius 1, thickness .2, spacing .5) scaled down
 * to fill the tube. Each disc keeps its own clock, which only runs while the disc sits in the powered part of the tube.
 */
export const TUBE_LENGTH = 2.96;
export const DISC_RADIUS = .15;
export const DISC_THICKNESS = DISC_RADIUS * .2;
export const DISC_SPACING = DISC_RADIUS * .5;
export const DISC_COUNT = Math.floor(TUBE_LENGTH / DISC_SPACING);
const DISC_OFFSET = (TUBE_LENGTH - DISC_COUNT * DISC_SPACING) / 2;
/** Stagger between neighbouring discs and the length of one squeeze, in seconds, plus the squeezed radius. */
const DISC_DELAY = .25, DISC_SQUEEZE_S = 1, DISC_MIN_SCALE = .3;

/** Disc centre as a fraction of the tube length (0 = board-centre end). */
export const discAt = (i: number) => (DISC_OFFSET + (i + .5) * DISC_SPACING) / TUBE_LENGTH;

/** Advances each powered disc's clock; discs past the fill level (or every disc while unpowered) hold still. */
export function advanceDiscPhases(phases: Float32Array, fill: number, lit: boolean, dt: number) {
  if (!lit || dt <= 0) return;
  for (let i = 0; i < phases.length; i++) if (discAt(i) < fill) phases[i] += dt;
}

/** Radial scale for a disc: a sine-eased yoyo between 1 and DISC_MIN_SCALE, starting after its stagger delay. */
export function discScale(phase: number, i: number) {
  const t = phase - i * DISC_DELAY;
  if (t <= 0) return 1;
  const u = (t / DISC_SQUEEZE_S) % 2, tri = u < 1 ? u : 2 - u;
  const eased = (1 - Math.cos(Math.PI * tri)) / 2;
  return 1 + (DISC_MIN_SCALE - 1) * eased;
}
