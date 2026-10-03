import { useEffect, useMemo } from 'react';
import { NEON_SERVER_Z, SERVER_X } from './boardLayout';
import { NeonGlassMaterial, NeonSeamMaterial } from './neonMaterials';
import { ServerEndCap } from './ServerLights';
import { GLASS_BEVEL, NEON_FRAME_TOP, closed, offsetOutline, slabGeometry, strokeGeometry, type TablePath } from './neonTableGeometry';

const HALF_WIDTH = 1.68;
const BASE_TOP = .24;
/** Each base runs from just inside the deck edge, past its tube, to the far side of the readout beyond it. */
const DEPTH = 1.5;
const LANE_MARGIN = .33;
const LANE_CUT = .14, OUTER_CUT = .3;
/**
 * The near bases' lane-side margin. The tubes stand above the bases and the camera tilt lifts them up the screen, so
 * this margin is wider than LANE_MARGIN to leave the same on-screen gap above the near tubes as below the far ones.
 */
const NEAR_LANE_MARGIN = .61;
/** Half width of the Neon stats panel (211 CSS px at 64 px per world unit, scaled 1.0915), whose sides carry end caps. */
const STATS_HALF = 1.646;

/** Chamfered footprint, wound like the deck outline so the edge strokes face up. */
function footprint(cx: number, zFar: number, zNear: number, farCut: number, nearCut: number): TablePath {
  const x0 = cx - HALF_WIDTH, x1 = cx + HALF_WIDTH;
  return [
    [x0 + farCut, zFar], [x1 - farCut, zFar], [x1, zFar + farCut],
    [x1, zNear - nearCut], [x1 - nearCut, zNear], [x0 + nearCut, zNear],
    [x0, zNear - nearCut], [x0, zFar + farCut],
  ];
}

const NEAR_LANE_Z = NEON_SERVER_Z[0] - NEAR_LANE_MARGIN, FAR_LANE_Z = NEON_SERVER_Z[1] + LANE_MARGIN;
const BASES = [-SERVER_X, SERVER_X].flatMap(x => [
  { owner: 0, outline: footprint(x, NEAR_LANE_Z, NEAR_LANE_Z + DEPTH, LANE_CUT, OUTER_CUT) },
  { owner: 1, outline: footprint(x, FAR_LANE_Z - DEPTH, FAR_LANE_Z, OUTER_CUT, LANE_CUT) },
]);

/**
 * Plinths under the four Server tubes, topped in the same finish as the deck inside the board, and the end caps where
 * each neon link meets its stats panel.
 */
export function NeonServerBases({ deck }: { deck: 'deck' | 'matte' }) {
  const parts = useMemo(() => BASES.map(b => ({
    ...b,
    slab: slabGeometry(offsetOutline(b.outline, -GLASS_BEVEL), BASE_TOP - NEON_FRAME_TOP - GLASS_BEVEL * 2, GLASS_BEVEL),
    edge: strokeGeometry([closed(offsetOutline(b.outline, -.035))], BASE_TOP + .002, .04),
    inner: strokeGeometry([closed(offsetOutline(b.outline, -.1))], BASE_TOP + .002, .014),
  })), []);
  useEffect(() => () => parts.forEach(p => [p.slab, p.edge, p.inner].forEach(g => g.dispose())), [parts]);

  return (
    <group name="neon-server-bases">
      {parts.map((p, i) => (
        <group key={i}>
          <mesh geometry={p.slab} position={[0, NEON_FRAME_TOP + GLASS_BEVEL, 0]} receiveShadow>
            <NeonGlassMaterial variant={deck} side={p.owner} outline={p.outline} />
          </mesh>
          <mesh geometry={p.edge} renderOrder={1}>
            <NeonSeamMaterial side={p.owner} strength={1.4} profile="laser" />
          </mesh>
          <mesh geometry={p.inner} renderOrder={1}>
            <NeonSeamMaterial side={p.owner} strength={.45} profile="solid" />
          </mesh>
        </group>
      ))}
      {[0, 1].flatMap(owner => ([-1, 1] as const).map(sign => (
        <group key={`${owner}${sign}`} position={[sign * (STATS_HALF + .065), .43, NEON_SERVER_Z[owner]]} rotation={[0, 0, -Math.PI / 2]}>
          <ServerEndCap ring={sign} />
        </group>
      )))}
    </group>
  );
}
