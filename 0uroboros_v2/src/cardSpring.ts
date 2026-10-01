import { RELEASE_SPRING, restingTilt, stepTilt, tiltSettled, type DragTilt } from './depthArt/dragTilt';

type Point = { x: number; y: number };
/** A damped spring in screen space: position in px, velocity in px/ms. */
export type Spring2D = Point & { vx: number; vy: number };

/** Natural frequency (rad/s) and damping ratio of a released card's travel: a short, soft overshoot into place. */
const OMEGA = 18;
const ZETA = 0.72;
/** Fling speed carried into the release is capped, so a flick bends the path without throwing the card off the table. */
const MAX_THROW = 3;
/** The trip is fast, so the lean takes a share of its speed; the full drag response would pin the card at its limit. */
const TRAVEL_LEAN = 0.5;
const SUBSTEP_MS = 8;

/** Advance by `dtMs` toward `target` (F = -k·x - c·v), in short semi-implicit Euler substeps so a slow frame stays stable. */
export function stepSpring(spring: Spring2D, target: Point, dtMs: number): Spring2D {
  let { x, y } = spring, vx = spring.vx * 1000, vy = spring.vy * 1000;
  for (let left = Math.min(dtMs, 100); left > 0; left -= SUBSTEP_MS) {
    const dt = Math.min(left, SUBSTEP_MS) / 1000;
    vx += (-OMEGA * OMEGA * (x - target.x) - 2 * ZETA * OMEGA * vx) * dt;
    vy += (-OMEGA * OMEGA * (y - target.y) - 2 * ZETA * OMEGA * vy) * dt;
    x += vx * dt; y += vy * dt;
  }
  return { x, y, vx: vx / 1000, vy: vy / 1000 };
}

export const springSettled = (spring: Spring2D, target: Point) =>
  Math.hypot(spring.x - target.x, spring.y - target.y) < 0.5 && Math.hypot(spring.vx, spring.vy) < 0.02;

/** How a card was let go: its speed (px/ms) and lean at that instant. */
export type Release = { velocity: Point; tilt: DragTilt };
/** `progress` runs 0..1 along the trip, holding at 1 through any overshoot, for blending size and angle. */
export type ReleaseFrame = Point & { progress: number; tilt: DragTilt };

/**
 * Spring a released card from `from` to `to`. It keeps the momentum it was let go with, and its lean chases the
 * spring's own velocity, so it leans into the trip and swings back through flat as it settles. The first frame is
 * applied immediately. Returns a cancel function.
 */
export function springRelease(release: Release, from: Point, to: Point, frame: (state: ReleaseFrame) => void, done: () => void, maxMs = 1000) {
  const speed = Math.hypot(release.velocity.x, release.velocity.y), cap = speed > MAX_THROW ? MAX_THROW / speed : 1;
  let spring: Spring2D = { ...from, vx: release.velocity.x * cap, vy: release.velocity.y * cap };
  let tilt = release.tilt, last = performance.now(), elapsed = 0, id = 0;
  const ax = to.x - from.x, ay = to.y - from.y, length2 = ax * ax + ay * ay;
  const progress = () => length2 < 1 ? 1 : Math.max(0, Math.min(1, ((spring.x - from.x) * ax + (spring.y - from.y) * ay) / length2));
  const tick = (now: number) => {
    const dt = now - last; last = now; elapsed += dt;
    spring = stepSpring(spring, to, dt);
    tilt = stepTilt({ ...tilt, vx: spring.vx * TRAVEL_LEAN, vy: spring.vy * TRAVEL_LEAN }, dt, RELEASE_SPRING);
    frame({ x: spring.x, y: spring.y, progress: progress(), tilt });
    if ((springSettled(spring, to) && tiltSettled(tilt, 0.3)) || elapsed > maxMs) { frame({ ...to, progress: 1, tilt: restingTilt() }); done(); return; }
    id = requestAnimationFrame(tick);
  };
  frame({ x: spring.x, y: spring.y, progress: progress(), tilt });
  id = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(id);
}
