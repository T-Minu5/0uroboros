/** Side-to-side motion leans a quarter past the base response; up/down motion a further quarter on top. */
export const SIDE_GAIN = 1.25;
export const VERTICAL_GAIN = SIDE_GAIN * 1.25;
const BASE_MAX_TILT = 26;
/** Largest lean a dragged card takes about each axis, in degrees: rotateY from side-to-side motion, rotateX from up/down. */
export const MAX_SIDE_TILT = BASE_MAX_TILT * SIDE_GAIN;
export const MAX_VERTICAL_TILT = BASE_MAX_TILT * VERTICAL_GAIN;
/** Base degrees of lean per px/ms of pointer speed, before the axis gains. */
const TILT_PER_SPEED = 30;
/** In-plane swing, like a card hanging from the fingers: degrees per px/ms of sideways speed, and its limit. */
const SWING_PER_SPEED = 12;
const MAX_SWING = 10;
/** Pointer speed fades with this time constant once movement stops, in ms. */
const SPEED_DECAY_MS = 130;

/** Angular spring: stiffness in 1/s², and damping as a ratio of critical. */
export type TiltSpring = { stiffness: number; damping: number };
/** Held: slightly under critical, so a card that stops short rocks once before settling, like a held card does. */
export const HOLD_SPRING: TiltSpring = { stiffness: 240, damping: 0.62 };
/** Let go: looser, so the card visibly swings through flat a couple of times as it settles. */
export const RELEASE_SPRING: TiltSpring = { stiffness: 260, damping: 0.42 };

/** Velocity (px/ms), lean about each axis (deg) and the angular speed of each (deg/s). */
export type DragTilt = { vx: number; vy: number; rx: number; ry: number; rz: number; wx: number; wy: number; wz: number };
export const restingTilt = (): DragTilt => ({ vx: 0, vy: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0 });

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

/** Fold a pointer sample into the smoothed velocity (px/ms). */
export function sampleVelocity(tilt: DragTilt, dx: number, dy: number, dtMs: number): DragTilt {
  if (dtMs <= 0) return tilt;
  const k = 1 - Math.exp(-dtMs / 50);
  return { ...tilt, vx: tilt.vx + (dx / dtMs - tilt.vx) * k, vy: tilt.vy + (dy / dtMs - tilt.vy) * k };
}

/**
 * The card turns its face toward where it is heading: moving right swings its right edge away
 * (rotateY > 0), moving down swings its bottom edge away (rotateX < 0). Sideways motion also
 * swings it clockwise in the plane (rotateZ > 0), its lower edge trailing behind.
 */
export function tiltTarget(vx: number, vy: number) {
  return {
    rx: clamp(-vy * TILT_PER_SPEED * VERTICAL_GAIN, MAX_VERTICAL_TILT),
    ry: clamp(vx * TILT_PER_SPEED * SIDE_GAIN, MAX_SIDE_TILT),
    rz: clamp(vx * SWING_PER_SPEED, MAX_SWING),
  };
}

/** Advance one frame: velocity decays, and a damped spring (F = -k·x - c·v) chases the lean it implies. */
export function stepTilt(tilt: DragTilt, dtMs: number, spring: TiltSpring = HOLD_SPRING): DragTilt {
  const ms = Math.min(dtMs, 50), dt = ms / 1000, decay = Math.exp(-ms / SPEED_DECAY_MS);
  const vx = tilt.vx * decay, vy = tilt.vy * decay;
  const target = tiltTarget(vx, vy);
  const k = spring.stiffness, c = 2 * spring.damping * Math.sqrt(k);
  const wx = tilt.wx + (k * (target.rx - tilt.rx) - c * tilt.wx) * dt;
  const wy = tilt.wy + (k * (target.ry - tilt.ry) - c * tilt.wy) * dt;
  const wz = tilt.wz + (k * (target.rz - tilt.rz) - c * tilt.wz) * dt;
  return {
    vx, vy, wx, wy, wz,
    rx: clamp(tilt.rx + wx * dt, MAX_VERTICAL_TILT * 1.25),
    ry: clamp(tilt.ry + wy * dt, MAX_SIDE_TILT * 1.25),
    rz: clamp(tilt.rz + wz * dt, MAX_SWING * 1.5),
  };
}

export const tiltSettled = (tilt: DragTilt, tolerance = 0.05) =>
  Math.abs(tilt.rx) + Math.abs(tilt.ry) + Math.abs(tilt.rz) + (Math.abs(tilt.wx) + Math.abs(tilt.wy) + Math.abs(tilt.wz)) * 0.01 < tolerance;

/** How far the card leans toward each axis's limit, -1..1 (beyond while the spring overshoots). */
export function leanFraction(tilt: Pick<DragTilt, 'rx' | 'ry'>) {
  return { x: tilt.ry / MAX_SIDE_TILT, y: tilt.rx / MAX_VERTICAL_TILT };
}

/**
 * The eye offset for the art of a tilted card. The scene inside swings against the card's
 * turn: as the right edge swings away, the art turns the other way.
 */
export function tiltEye(tilt: Pick<DragTilt, 'rx' | 'ry'>) {
  const lean = leanFraction(tilt);
  return { x: lean.x, y: -lean.y };
}
