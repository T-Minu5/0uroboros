/** Pose of the black hole HUD: rotation about Y and X in radians, and how far its layers stand apart (0 is flat). */
export type HudLook = { yaw: number; pitch: number; spread: number };

/** Furthest the HUD turns toward the cursor, reached at the screen's edge. */
export const MAX_LOOK = .6;
/** Spread with the cursor in a screen corner. */
export const MAX_SPREAD = 1.5;
/** At spread 1, the depth from a design's nearest layer to its deepest, in largest-ring radii. Each design keeps its
 *  largest ring on the event horizon and sets the other layers in front of or behind it in the drawing's own order. */
export const LAYER_DEPTH = 1.2;

export const FLAT_LOOK: HudLook = { yaw: 0, pitch: 0, spread: 0 };

/**
 * Pose facing a cursor at (dx, dy) from the hole's centre, each a fraction of the half-screen on its axis (y up).
 * The turn is the angle to a point that far off at a fixed viewing distance; spread grows with the cursor's distance,
 * from flat at the centre to MAX_SPREAD in a corner.
 */
export function mouseLook(dx: number, dy: number): HudLook {
  const x = Math.max(-1, Math.min(1, dx)), y = Math.max(-1, Math.min(1, dy));
  const reach = Math.min(Math.hypot(x, y) / Math.SQRT2, 1);
  return { yaw: Math.atan(x * Math.tan(MAX_LOOK)), pitch: -Math.atan(y * Math.tan(MAX_LOOK)), spread: reach * MAX_SPREAD };
}

/** Eases `look` toward `target`; `rate` is the fraction of the gap closed this frame. */
export function easeLook(look: HudLook, target: HudLook, rate: number) {
  look.yaw += (target.yaw - look.yaw) * rate;
  look.pitch += (target.pitch - look.pitch) * rate;
  look.spread += (target.spread - look.spread) * rate;
}
