import { boardDepth, isBoardDepth } from './boardMaterials';

/**
 * Board layout: the GLB is authored on a 2.8-unit lane pitch with a compact Node housing. At load it is widened and the
 * opponent half is grown away from the player, so every lane gets more room while nothing with z >= 0 moves in depth.
 */
export const AUTHORED_NODE_X = [-5.6, -2.8, 0, 2.8, 5.6] as const;
const AUTHORED_PITCH = 2.8;
/** Authored lane border: outer edge of the side strips from the node centre. */
const LANE_HALF = 1.275;
/** Gap between neighbouring lane borders; kept as authored. */
export const LANE_MARGIN = AUTHORED_PITCH - LANE_HALF * 2;
/** Inner edge of the magenta side rail, which stays fixed. */
export const RAIL_INNER = 7.781;
/** Authored padding outside Nodes 1 and 5 shrinks to this multiple of the margin. */
const PADDING_RATIO = 1.5;
const AUTHORED_OUTER_EDGE = AUTHORED_NODE_X[4] + LANE_HALF;
/** Extra width per lane. */
export const LANE_GROW = 2 * (RAIL_INNER - AUTHORED_OUTER_EDGE - PADDING_RATIO * LANE_MARGIN) / AUTHORED_NODE_X.length;
export const LANE_SCALE = (LANE_HALF * 2 + LANE_GROW) / (LANE_HALF * 2);
export const LANE_PITCH = AUTHORED_PITCH + LANE_GROW;
export const NODE_X = AUTHORED_NODE_X.map(x => x / AUTHORED_PITCH * LANE_PITCH);
/** Authored side trims start here; from this x outward nothing moves. */
const TRIM_X = 7.47;
const OUTER_EDGE = NODE_X[4] + LANE_HALF * LANE_SCALE;
/** The width warp holds over the lane field and fades out across the frame lip, leaving the frame, server bars and banks alone. */
const X_WARP_FULL_Z = 3.95, X_WARP_NONE_Z = 4.2;

/**
 * Opponent half, from the Node centre outward: the housing's flat middle stretches by NODE_GROW, its far edge detail
 * slides rigidly, the opponent lanes stretch by FAR_LANE_GROW and everything past them shifts by FAR_SHIFT.
 */
export const NODE_GROW = .6;
export const FAR_LANE_GROW = .21;
export const FAR_SHIFT = NODE_GROW + FAR_LANE_GROW;
const HOUSING_FLAT = .45, HOUSING_EDGE = .75, LANE_END = 3.83;

const smoothstep = (a: number, b: number, t: number) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

function widenedX(ax: number) {
  if (ax >= AUTHORED_OUTER_EDGE) return OUTER_EDGE + (ax - AUTHORED_OUTER_EDGE) * (TRIM_X - OUTER_EDGE) / (TRIM_X - AUTHORED_OUTER_EDGE);
  const i = Math.round(ax / AUTHORED_PITCH), c = i * AUTHORED_PITCH, next = i * LANE_PITCH, off = ax - c;
  if (Math.abs(off) <= LANE_HALF) return next + off * LANE_SCALE;
  const edge = Math.sign(off) * LANE_HALF;
  return next + edge * LANE_SCALE + off - edge;
}

/** Authored x → world x: each lane scales about its centre, margins slide over unchanged, the padding takes up the difference. */
export function warpX(x: number, z: number) {
  const ax = Math.abs(x);
  if (ax >= TRIM_X) return x;
  const w = 1 - smoothstep(X_WARP_FULL_Z, X_WARP_NONE_Z, Math.abs(z));
  if (w <= 0) return x;
  return x + w * (Math.sign(x) * widenedX(ax) - x);
}

/** Authored opponent-side z → world z; z >= 0 is returned unchanged. */
export function warpFarZ(z: number) {
  if (z >= 0) return z;
  const u = -z;
  if (u <= HOUSING_FLAT) return -u * (HOUSING_FLAT + NODE_GROW) / HOUSING_FLAT;
  if (u <= HOUSING_EDGE) return -(u + NODE_GROW);
  if (u <= LANE_END) return -(HOUSING_EDGE + NODE_GROW + (u - HOUSING_EDGE) * (LANE_END - HOUSING_EDGE + FAR_LANE_GROW) / (LANE_END - HOUSING_EDGE));
  return -(u + FAR_SHIFT);
}

/** Authored Server tube centres (±x, ±z) and the Server mounting beds around them. */
export const AUTHORED_SERVER = { x: 4.6, z: 4.75, bedHalfX: 1.74, bedZ: [4.35, 5.15] } as const;
/**
 * Servers move halfway toward the Stats housings; the near pair lifts 16px and the far pair drops 24px
 * on screen at 1920x1080 (56.5px per world unit of depth).
 */
export const SERVER_SHIFT = { x: -.67, near: -16 / 56.5, far: 24 / 56.5 } as const;
export const SERVER_X = AUTHORED_SERVER.x + SERVER_SHIFT.x;
/** World z of the near and far Server tube centres. */
export const SERVER_Z = [boardDepth(AUTHORED_SERVER.z) + SERVER_SHIFT.near, warpFarZ(-AUTHORED_SERVER.z) + SERVER_SHIFT.far] as const;
/**
 * Neon only: the near Servers sit out past the deck edge like the far pair. The tubes stand .43 above the glass, which
 * the camera tilt pushes up the screen, so the near pair moves further out than the far pair to read the same.
 */
export const NEON_SERVER_DROP = .5;
/** Neon only: the far Servers, stats panel and the table edge behind them sit 12px further up the screen. */
export const NEON_FAR_RAISE = 12 / 56.5;
export const NEON_SERVER_Z = [SERVER_Z[0] + NEON_SERVER_DROP, SERVER_Z[1] - NEON_FAR_RAISE] as const;
export const serverZ = (owner: number, neon: boolean) => (neon ? NEON_SERVER_Z : SERVER_Z)[owner === 1 ? 1 : 0];

/** Neon only: lanes, Nodes and their HUD slide toward the player, 8px past the point where the deck margin is equal above and below them (56.5px per world unit along z). */
export const NEON_FIELD_SHIFT = .14 + 8 / 56.5;
/** Neon only: the local stats chassis (housing, readout and its HUD) sits 10px nearer the player, clear of the lane. */
export const NEON_STATS_DROP = 10 / 56.5;

/** Lane engraving panels (shared by the idle engraving and the reward glow): width, and each owner's centre and depth. */
export const ENGRAVING_W = 2.29 * LANE_SCALE;
export const ENGRAVING_LANES = [
  { z: boardDepth(2.4), d: 3.3 },
  { z: (warpFarZ(-3.795) + warpFarZ(-1.005)) / 2, d: warpFarZ(-1.005) - warpFarZ(-3.795) },
] as const;

/**
 * Centreline of each lane's authored gunmetal border (world units): side strips at node ± RIM_HX, z0 → z1 along the lane.
 * The side strips run on under the Node housing (which starts at |z| .71), so the power edge sits just inside it and the housing half-hides that line.
 */
export const LANE_RIM_HX = 1.24 * LANE_SCALE;
export const LANE_RIM = [{ z0: .69, z1: 4.34 }, { z0: warpFarZ(-3.775), z1: warpFarZ(-.69) }] as const;
/** Radii of the border's rounded outer corners and the tight power-edge corners. */
export const LANE_RIM_RADIUS = { outer: .12, power: .04 } as const;

/**
 * The four milled bars inside each lane: world x offset from the node, each owner's [chevron-end, outer-end] z, and the
 * bar's half extents. The local near pair is authored at z 1.504 and moved at load so its top lines up on screen with
 * the raised chevron's top.
 */
export const LANE_MARK_DX = 1.02 * LANE_SCALE;
export const LANE_MARK_Z = [[1.003, 4], [warpFarZ(-1.42), warpFarZ(-3.5)]] as const;
export const LANE_MARK_HALF = { x: .088, z: .014 } as const;

/** Authored board z → world z for either half (near-side depth plus the opponent growth). */
export function boardZ(x: number, z: number) {
  if (z < 0) return Math.abs(x) <= 8.5 ? warpFarZ(z) : z;
  return isBoardDepth(x, z) ? boardDepth(z) : z;
}
