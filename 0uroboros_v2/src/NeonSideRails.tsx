import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { usePlayerColors } from './playerTheme';
import { useBoardLighting } from './boardLighting';
import { boardSideHealth, sideLightScale } from './boardMaterials';
import { NEON_SERVER_Z, SERVER_X } from './boardLayout';
import { GLASS_FAR_EDGE, GLASS_NEAR_LEDGE, GLASS_OUTLINE, GLASS_SERVER_CUT, offsetOutline, type TablePath } from './neonTableGeometry';
import { NEON_HALO_REACH, curveTubeAxis, neonGain, neonTubeGlsl, neonTubeVertex } from './neonTubeShading';

/** Tube diameter, a quarter of the Server tube's on-screen thickness. */
const TUBE_W = .135;
/** Tube axis height: the tube rests on top of the deck glass (top .045). */
const TUBE_Y = .045 + TUBE_W / 2;
/** Corner fillet radius along the deck edge: just enough to keep the tube from pinching, so corners read as sharp. */
const FILLET = .02;
/** The tube's inner edge hugs the deck glass and it lies over the gap before the white frame. */
const EDGE = offsetOutline(GLASS_OUTLINE, .015);
const edgeAt = (x: number, z: number) => EDGE[GLASS_OUTLINE.findIndex(p => p[0] === x && p[1] === z)];
/** Outer face of each Server tube's end cap, and the tube axis height. */
const SERVER_END_X = SERVER_X + 1.605;
const SERVER_TUBE_Y = .43;
/**
 * Tube centreline: `path` pushed half a tube width to the `outward` side and raised onto the glass, then straight from
 * its second-last point on to `end`, corners filleted. The last point only sets the direction the edge turns there.
 */
function centreline(path: TablePath, outward: number, end: THREE.Vector3) {
  const normals = path.slice(1).map(([x, z], i) => {
    const dx = x - path[i][0], dz = z - path[i][1], len = Math.hypot(dx, dz);
    return [outward * dz / len, -outward * dx / len] as const;
  });
  const points = path.map(([x, z], i) => {
    const a = normals[Math.max(0, i - 1)], b = normals[Math.min(normals.length - 1, i)];
    const mx = a[0] + b[0], mz = a[1] + b[1], ml = Math.hypot(mx, mz);
    const scale = TUBE_W / 2 / ((mx * a[0] + mz * a[1]) / ml);
    return new THREE.Vector3(x + mx / ml * scale, TUBE_Y, z + mz / ml * scale);
  }).slice(0, -1).concat(end);
  const curve = new THREE.CurvePath<THREE.Vector3>();
  let from = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], r = Math.min(FILLET, p.distanceTo(points[i - 1]) / 2, p.distanceTo(points[i + 1]) / 2);
    const a = p.clone().addScaledVector(points[i - 1].clone().sub(p).normalize(), r);
    const b = p.clone().addScaledVector(points[i + 1].clone().sub(p).normalize(), r);
    curve.add(new THREE.LineCurve3(from, a));
    curve.add(new THREE.QuadraticBezierCurve3(a, p, b));
    from = b;
  }
  curve.add(new THREE.LineCurve3(from, points[points.length - 1]));
  return curve;
}

/**
 * Each rail starts at the waist, runs down the side, wraps the deck corner and follows the deck edge toward its
 * Server. Near rails take the long corner chamfer and run straight along the ledge, climbing into the end cap as
 * they go: the ledge sits so the .32 rise exactly offsets the step toward the player on screen (camera tilt 52.5°), so
 * the run reads as one level line. Far rails turn up the deck's cut and climb straight into the end cap; the cut is
 * angled to match that climb on screen. Every run is straight, meeting the next at an angle.
 */
const SEGMENTS = ([-1, 1] as const).flatMap(side => ([0, 1] as const).map(owner => {
  const zSign = owner === 0 ? 1 : -1, outward = side * zSign;
  const end = new THREE.Vector3(side * SERVER_END_X, SERVER_TUBE_Y, NEON_SERVER_Z[owner]);
  if (owner === 0) {
    const corner = edgeAt(side * 7.74, GLASS_NEAR_LEDGE.cornerZ), turn = edgeAt(side * GLASS_NEAR_LEDGE.chamferX, GLASS_NEAR_LEDGE.z);
    const curve = centreline([[corner[0], .1], corner, turn, [0, turn[1]]], outward, end);
    return { side, owner, kind: 'rail' as const, curve };
  }
  const corner = edgeAt(side * 7.74, GLASS_FAR_EDGE.cornerZ), edge = edgeAt(side * 7.43, GLASS_FAR_EDGE.z);
  const cut = edgeAt(side * GLASS_SERVER_CUT.x, GLASS_FAR_EDGE.z), apex = edgeAt(side * GLASS_SERVER_CUT.apex[0], GLASS_SERVER_CUT.apex[1]);
  const curve = centreline([[corner[0], -.1], corner, edge, cut, apex], outward, end);
  return { side, owner, kind: 'rail' as const, curve };
}));
const line = (from: THREE.Vector3, to: THREE.Vector3) => {
  const curve = new THREE.CurvePath<THREE.Vector3>();
  curve.add(new THREE.LineCurve3(from, to));
  return curve;
};
/** Inner end cap of each Server tube; the two Servers of a player are joined through the stats panel's end caps. */
export const NEON_LINK_X = SERVER_X - 1.605;
/** The stats panel's end caps, where packets leave the panel. */
const STATS_CAP_X = 1.711;
/** Diameter of the thin neon core threaded through each Server tube. */
const CORE_W = .09;
/** The core is seen through the Server's glass and contents, so it burns brighter to read as the same neon. */
const CORE_GAIN = 1.8;
export type NeonRailKind = 'rail' | 'link' | 'core';
export type NeonRail = { side: number; owner: number; kind: NeonRailKind; curve: THREE.CurvePath<THREE.Vector3> };
const at = (x: number, owner: number) => new THREE.Vector3(x, SERVER_TUBE_Y, NEON_SERVER_Z[owner]);
/**
 * One chain per player and side, in the order a packet runs: out of the stats panel along the link, through the
 * Server's core, then down the side rail to the waist (the rail is built waist-first, so it runs reversed).
 */
const CHAINS = ([0, 1] as const).flatMap(owner => ([-1, 1] as const).map(side => {
  const parts: NeonRail[] = [
    { side, owner, kind: 'link', curve: line(at(0, owner), at(side * NEON_LINK_X, owner)) },
    { side, owner, kind: 'core', curve: line(at(side * NEON_LINK_X, owner), at(side * SERVER_END_X, owner)) },
    SEGMENTS.find(s => s.side === side && s.owner === owner)!,
  ];
  let offset = 0;
  const segments = parts.map(part => {
    const length = part.curve.getLength(), segment = { ...part, length, offset, reverse: part.kind === 'rail' };
    offset += length;
    return segment;
  });
  return { owner, side, segments, length: offset };
}));
export const NEON_RAIL_CHAINS = CHAINS;
/** Every neon tube's centreline, owner and kind, for lights that follow the tubes. */
export const NEON_RAILS: readonly NeonRail[] = CHAINS.flatMap(c => c.segments.map(({ side, owner, kind, curve }) => ({ side, owner, kind, curve })));
export const NEON_RAIL_TUBE_W = TUBE_W;
const PULSE_GAP_S = [4, 14] as const;
/** Packet travel time per world unit of chain. */
const PULSE_S_PER_UNIT = [.2, .3] as const;
const CHAIN_RUNS = CHAINS.map(c => c.length + .3 - (STATS_CAP_X - .1));
/** Random idle gap between packets and the range of packet travel times, for effects that keep the rails' rhythm. */
export const RAIL_PULSE_TIMING = {
  gap: PULSE_GAP_S,
  duration: [Math.min(...CHAIN_RUNS) * PULSE_S_PER_UNIT[0], Math.max(...CHAIN_RUNS) * PULSE_S_PER_UNIT[1]],
} as const;
const FOLLOW_CHANCE = .35;
const OFF = -99;

const pulseGlsl = /* glsl */`
uniform vec3 uColor;
uniform float uStrength, uLength, uOffset, uDir, uTime, uFade;
uniform vec2 uHead, uLevel;
${neonTubeGlsl}

// Comet tail trailing the head (p) and the white-hot head itself (hot).
vec2 pulseAt(float along) {
  float p = 0.0, hot = 0.0;
  for (int i = 0; i < 2; i++) {
    float d = (along - uHead[i]) * uDir;
    float tail = d / 1.05, front = d * 9.0, core = d * 7.0;
    p += exp(-(d < 0.0 ? tail * tail : front * front)) * uLevel[i];
    hot += exp(-core * core) * uLevel[i];
  }
  return vec2(min(p, 1.0), min(hot, 1.0));
}`;

// A round neon tube with a pale core saturating toward its edges; its open waist end fades in.
const tubeFragment = /* glsl */`
varying vec2 vUv;
varying vec3 vViewNormal, vViewTangent;
${pulseGlsl}

void main() {
  float along = uOffset + vUv.x * uLength;
  vec2 pulse = pulseAt(along);
  float q = neonTubeQ(vViewNormal, vViewTangent);
  vec3 rgb = neonTube(uColor, q, .95 * neonFlicker(along, uTime) * (1.0 + .7 * pulse.x))
    + vec3(1.0) * pulse.y * (1.0 - q * q) * 1.3 * uNeonGain;
  gl_FragColor = vec4(rgb * uStrength * mix(1.0, smoothstep(0.0, .03, along), uFade), 1.0);
}`;

// The tube's glow sheath: a larger shell whose silhouette distance maps to distance from the tube axis.
const haloFragment = /* glsl */`
varying vec2 vUv;
varying vec3 vViewNormal, vViewTangent;
${pulseGlsl}

void main() {
  float along = uOffset + vUv.x * uLength;
  vec2 pulse = pulseAt(along);
  float q = neonTubeQ(vViewNormal, vViewTangent) * ${NEON_HALO_REACH.toFixed(2)};
  vec3 rgb = neonHalo(uColor, q, ${NEON_HALO_REACH.toFixed(2)}, .3 * neonFlicker(along, uTime) * (1.0 + .8 * pulse.x));
  gl_FragColor = vec4(rgb * uStrength * mix(1.0, smoothstep(0.0, .03, along), uFade), 1.0);
}`;

type Packet = { start: number; duration: number; hold: number | null };
/** A player's packets, mirrored down both of their chains at once. */
type Run = { packets: (Packet | null)[] };

/**
 * Player-coloured neon tubes wrapping the deck from the waist into each Server, joined through the stats panel and
 * threaded through the Servers. Energy packets leave the stats panel and run out through both Servers to the waist,
 * at random and on every drain or restore.
 */
export function NeonSideRails() {
  const colors = usePlayerColors();
  const lighting = useBoardLighting();
  const accents = useMemo(() => colors.map(c => new THREE.Color(c.accent)), [colors]);
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const rails = useMemo(() => CHAINS.flatMap(chain => chain.segments.map(s => {
    const { length } = s, width = s.kind === 'core' ? CORE_W : TUBE_W;
    const material = (fragmentShader: string) => new THREE.ShaderMaterial({
      uniforms: { ...shared, uOffset: { value: 0 }, uLength: { value: length }, uFade: { value: s.kind === 'rail' ? 1 : 0 } },
      vertexShader: neonTubeVertex,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const shared = {
      uColor: { value: new THREE.Color() },
      uStrength: { value: 1 },
      uDir: { value: s.reverse ? -1 : 1 },
      uHead: { value: new THREE.Vector2(OFF, OFF) },
      uLevel: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uNeonGain: neonGain,
    };
    return {
      ...s,
      chainLength: chain.length,
      shared,
      geometry: curveTubeAxis(new THREE.TubeGeometry(s.curve, Math.ceil(length * 40), width / 2, 12, false)),
      material: material(tubeFragment),
      haloGeometry: curveTubeAxis(new THREE.TubeGeometry(s.curve, Math.ceil(length * 40), width / 2 * NEON_HALO_REACH, 16, false)),
      haloMaterial: material(haloFragment),
    };
  })), []);
  useEffect(() => () => rails.forEach(r => {
    r.geometry.dispose();
    r.material.dispose();
    r.haloGeometry.dispose();
    r.haloMaterial.dispose();
  }), [rails]);

  const runs = useRef<Run[]>([{ packets: [null, null] }, { packets: [null, null] }]);
  const next = useRef(-1), seenPulse = useRef<number | null>(lighting.current.pulse?.id ?? null);
  const gap = () => PULSE_GAP_S[0] + Math.random() * (PULSE_GAP_S[1] - PULSE_GAP_S[0]);
  const fire = (now: number, owner = Math.random() < .5 ? 0 : 1, hold: number | null = null) => {
    const run = Math.max(...CHAIN_RUNS.filter((_, i) => CHAINS[i].owner === owner));
    const duration = run * (PULSE_S_PER_UNIT[0] + Math.random() * (PULSE_S_PER_UNIT[1] - PULSE_S_PER_UNIT[0]));
    runs.current[owner].packets = [{ start: now, duration, hold }, hold === null && Math.random() < FOLLOW_CHANCE ? { start: now + .2 + Math.random() * .1, duration, hold: null } : null];
    next.current = hold === null ? Math.max(next.current, now + duration + .4 + gap()) : Infinity;
  };
  const clock = useRef(0);
  useEffect(() => {
    if (!(import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) return;
    const w = window as unknown as { __neonRailPulse?: (owner?: number, hold?: number) => void };
    w.__neonRailPulse = (owner, hold) => fire(clock.current, owner, hold ?? null);
    return () => { delete w.__neonRailPulse; };
  });

  useFrame(({ clock: c }) => {
    const now = c.elapsedTime;
    clock.current = now;
    if (next.current < 0) next.current = now + 1.5 + Math.random() * 3;
    if (!reduced && now >= next.current) fire(now);
    const pulse = lighting.current.pulse;
    if (pulse && pulse.id !== seenPulse.current) {
      seenPulse.current = pulse.id;
      if (!reduced) fire(now, pulse.owner);
    }
    rails.forEach(rail => {
      const u = rail.shared, packets = runs.current[rail.owner].packets;
      u.uColor.value.copy(accents[rail.owner]);
      u.uStrength.value = sideLightScale(rail.owner === 0 ? boardSideHealth.x : boardSideHealth.y) * (rail.kind === 'core' ? CORE_GAIN : 1);
      u.uTime.value = reduced ? 0 : now;
      for (let k = 0; k < 2; k++) {
        const packet = packets[k];
        const t = packet ? (packet.hold ?? (now - packet.start) / packet.duration) : -1;
        const live = packet !== null && t >= 0 && t < 1 && (packet.hold !== null || !reduced);
        const ease = t * t * (3 - 2 * t);
        const along = STATS_CAP_X - .1 + ease * (rail.chainLength + .3 - (STATS_CAP_X - .1)) - rail.offset;
        const head = live ? (rail.reverse ? rail.length - along : along) : OFF;
        const level = live ? Math.min(1, t / .08, (1 - t) / .12) : 0;
        if (k === 0) { u.uHead.value.x = head; u.uLevel.value.x = level; }
        else { u.uHead.value.y = head; u.uLevel.value.y = level; }
      }
    });
  });

  return (
    <group name="neon-side-rails">
      {rails.map((rail, i) => (
        <group key={i}>
          <mesh geometry={rail.haloGeometry} material={rail.haloMaterial} renderOrder={2} />
          <mesh geometry={rail.geometry} material={rail.material} renderOrder={2} />
        </group>
      ))}
    </group>
  );
}
