import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glintUniforms } from './neonGlint';
import { RAIL_PULSE_TIMING } from './NeonSideRails';

/** The glint keeps the rails' random rhythm, 5% slower. */
const SLOWER = 1.05;
const GAP_S = RAIL_PULSE_TIMING.gap.map(s => s * SLOWER) as [number, number];
const DURATION_S = RAIL_PULSE_TIMING.duration.map(s => s * SLOWER) as [number, number];
/** The band crosses the table left to right, turning from 75° to 105° on screen (90° is vertical). */
const START_X = -10.5, END_X = 10.5, BAND_Z = -.2;
const SCREEN_ANGLE = [THREE.MathUtils.degToRad(75), THREE.MathUtils.degToRad(105)] as const;
/** On-screen height of one world unit of depth under the board camera's tilt. */
const DEPTH_FORESHORTEN = .81;

type Sweep = { start: number; duration: number; hold: number | null };

const between = ([lo, hi]: readonly [number, number]) => lo + Math.random() * (hi - lo);

/** A band of shine crossing the Neon table's white glass frame now and then, with diamond glints along its edges. */
export function NeonGlassGlint() {
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  useEffect(() => () => { glintUniforms.uGlintB.value.x = 0; }, []);

  const sweep = useRef<Sweep | null>(null);
  const next = useRef(-1);
  const clock = useRef(0);
  const fire = (now: number, hold: number | null = null) => {
    const duration = between(DURATION_S);
    sweep.current = { start: now, duration, hold };
    next.current = hold === null ? now + duration + .4 * SLOWER + between(GAP_S) : Infinity;
  };
  useEffect(() => {
    if (!(import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) return;
    const w = window as unknown as { __neonGlint?: (hold?: number) => void };
    w.__neonGlint = hold => fire(clock.current, hold ?? null);
    return () => { delete w.__neonGlint; };
  });

  useFrame(({ clock: c }) => {
    const now = c.elapsedTime;
    clock.current = now;
    if (next.current < 0) next.current = now + between([1.5, 4.5]) * SLOWER;
    if (!reduced && now >= next.current) fire(now);
    const s = sweep.current, u = glintUniforms;
    const t = s ? (s.hold ?? (now - s.start) / s.duration) : -1;
    if (!s || t < 0 || t >= 1 || (s.hold === null && reduced)) {
      u.uGlintB.value.x = 0;
      return;
    }
    const ease = t * t * (3 - 2 * t);
    const angle = SCREEN_ANGLE[0] + (SCREEN_ANGLE[1] - SCREEN_ANGLE[0]) * ease;
    const normal = new THREE.Vector2(Math.sin(angle) / DEPTH_FORESHORTEN, Math.cos(angle)).normalize();
    u.uGlint.value.set(START_X + (END_X - START_X) * ease, BAND_Z, normal.x, normal.y);
    u.uGlintB.value.set(Math.min(1, t / .1, (1 - t) / .1), now);
  });

  return null;
}
