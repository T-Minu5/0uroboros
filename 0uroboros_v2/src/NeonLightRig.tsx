import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { boardSideHealth, sideLightScale } from './boardMaterials';
import { NEON_SERVER_Z, SERVER_X } from './boardLayout';
import { NEON_LINK_X, NEON_RAILS, NEON_RAIL_TUBE_W } from './NeonSideRails';
import { usePlayerColors } from './playerTheme';
import { TUBE_LENGTH } from './pulseOrigami';
import { serverGlow, serverIndex } from './ServerLights';
import { useNeonRig } from './realLighting';

/** A rail piece may bow this far from its straight light before it is split. */
const RAIL_BOW = .4;
/** Shorter pieces (corner fillets) fold into their neighbour. */
const MIN_PIECE = .8;
/** Rail luminance per unit of Neon light; per unit length, so long and short pieces match. */
const RAIL_NITS = 9;
/** Server tube light: luminance at the idle glow strength, and the tube's lit thickness. */
const SERVER_NITS = 7, SERVER_TUBE_H = .3, SERVER_TUBE_Y = .43;

export type LightPiece = { center: THREE.Vector3; tangent: THREE.Vector3; length: number };

/** Splits a tube centreline into straight pieces that stay within `bow` of it; each becomes one area light. */
export function railLightPieces(curve: THREE.Curve<THREE.Vector3>, bow = RAIL_BOW, minPiece = MIN_PIECE): LightPiece[] {
  const length = curve.getLength();
  const points = curve.getSpacedPoints(Math.max(8, Math.ceil(length * 24)));
  const offChord = (a: number, b: number) => {
    const line = new THREE.Line3(points[a], points[b]), closest = new THREE.Vector3();
    let worst = 0;
    for (let i = a + 1; i < b; i++) worst = Math.max(worst, line.closestPointToPoint(points[i], true, closest).distanceTo(points[i]));
    return worst;
  };
  const cuts = [0];
  for (let start = 0, end = 1; end < points.length; end++) {
    if (offChord(start, end) > bow) { cuts.push(end - 1); start = end - 1; }
  }
  if (cuts[cuts.length - 1] !== points.length - 1) cuts.push(points.length - 1);
  // Fold short pieces into the following one (or the previous, at the end).
  for (let i = 1; i < cuts.length - 1;) {
    if (points[cuts[i]].distanceTo(points[cuts[i - 1]]) < minPiece) cuts.splice(i, 1);
    else i++;
  }
  if (cuts.length > 2 && points[cuts[cuts.length - 1]].distanceTo(points[cuts[cuts.length - 2]]) < minPiece) cuts.splice(cuts.length - 2, 1);
  return cuts.slice(1).map((end, i) => {
    const a = points[cuts[i]], b = points[end];
    return { center: a.clone().add(b).multiplyScalar(.5), tangent: b.clone().sub(a).normalize(), length: a.distanceTo(b) };
  });
}

const UP = new THREE.Vector3(0, 1, 0);
/** Orients a RectAreaLight so its width runs along `tangent` and it shines down, away from the side its back faces. */
function orient(light: THREE.RectAreaLight, tangent: THREE.Vector3) {
  const up = Math.abs(tangent.dot(UP)) > .999 ? new THREE.Vector3(0, 0, 1) : UP;
  const back = up.clone().addScaledVector(tangent, -tangent.dot(up)).normalize();
  light.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent, back.clone().cross(tangent), back));
}

type RailLight = LightPiece & { owner: number };
/** Side rails get pieces; each player's link is one straight light across both halves; the Server cores add none. */
const RAIL_LIGHTS: RailLight[] = [
  ...NEON_RAILS.filter(rail => rail.kind === 'rail').flatMap(rail => railLightPieces(rail.curve).map(piece => ({ ...piece, owner: rail.owner }))),
  ...[0, 1].map(owner => ({
    center: new THREE.Vector3(0, SERVER_TUBE_Y, NEON_SERVER_Z[owner]),
    tangent: new THREE.Vector3(1, 0, 0),
    length: NEON_LINK_X * 2,
    owner,
  })),
];
const SERVER_LIGHTS = [0, 1].flatMap(owner => (['backup', 'primary'] as const).map(target => ({
  index: serverIndex(owner, target),
  center: new THREE.Vector3(target === 'backup' ? -SERVER_X : SERVER_X, SERVER_TUBE_Y, NEON_SERVER_Z[owner]),
})));
/** Number of area lights the rig adds. */
export const NEON_RIG_LIGHT_COUNT = RAIL_LIGHTS.length + SERVER_LIGHTS.length;

/**
 * Real lighting on the Neon board: area lights laid along every neon rail and Server tube, so the glass, the floor and
 * the hardware are all lit by the same neon, in the players' colours, dimming with health and flaring on drain/restore.
 */
export function NeonLightRig() {
  const settings = useNeonRig();
  const colors = usePlayerColors();
  const rails = useRef<(THREE.RectAreaLight | null)[]>([]);
  const servers = useRef<(THREE.RectAreaLight | null)[]>([]);
  const accents = useMemo(() => colors.map(c => new THREE.Color(c.accent)), [colors]);
  useLayoutEffect(() => {
    RAIL_LIGHTS.forEach((piece, i) => { const l = rails.current[i]; if (l) orient(l, piece.tangent); });
    servers.current.forEach(l => l && orient(l, new THREE.Vector3(1, 0, 0)));
  }, []);
  useFrame(() => {
    const neon = settings?.neon ?? 0;
    RAIL_LIGHTS.forEach((piece, i) => {
      const l = rails.current[i];
      if (!l) return;
      l.color.copy(accents[piece.owner]);
      l.intensity = RAIL_NITS * neon * sideLightScale(piece.owner === 0 ? boardSideHealth.x : boardSideHealth.y);
    });
    SERVER_LIGHTS.forEach((server, i) => {
      const l = servers.current[i], g = serverGlow[server.index];
      if (!l) return;
      l.color.copy(g.color);
      l.intensity = SERVER_NITS * neon * g.strength;
    });
  });
  return (
    <group name="neon-light-rig">
      {RAIL_LIGHTS.map((piece, i) => (
        <rectAreaLight key={`rail-${i}`} ref={l => { rails.current[i] = l; }} position={piece.center} width={piece.length} height={NEON_RAIL_TUBE_W} intensity={0} />
      ))}
      {SERVER_LIGHTS.map((server, i) => (
        <rectAreaLight key={`server-${i}`} ref={l => { servers.current[i] = l; }} position={server.center} width={TUBE_LENGTH} height={SERVER_TUBE_H} intensity={0} />
      ))}
    </group>
  );
}
