import { LANE_MARK_DX, LANE_MARK_HALF, LANE_MARK_Z, warpFarZ } from './boardLayout';

/** Lane seal on Node close: the plate slides over the lane in SEAL_SLIDE_S while the placed cards shrink to SEAL_CARD_SCALE. */
export const SEAL_SLIDE_S = 1.1, SEAL_SCALE_S = .9, SEAL_CARD_SCALE = .75;
/** Play surface inside the border strips, where sealed/closed plates sit; the power end tucks under the Node housing. */
export const LANE_FIT = [{ z0: .7, z1: 4.3 }, { z0: warpFarZ(-3.74), z1: warpFarZ(-.7) }] as const;
/** Just under the border strip tops (y .23) so the strips frame the plate. */
export const LANE_SEAL_Y = .215;
/**
 * The lane's engraving pattern spans its four milled bars: across from the outer end of a left bar to the outer end of
 * a right bar, and along from the inner edge of the chevron-end pair (`power`) to the inner edge of the outer pair.
 */
export const PATTERN_W = 2 * (LANE_MARK_DX + LANE_MARK_HALF.x);
export const PATTERN_LANES = LANE_MARK_Z.map(([power, outer]) => {
  const dir = Math.sign(outer - power), from = power + dir * LANE_MARK_HALF.z, to = outer - dir * LANE_MARK_HALF.z;
  return { z: (from + to) / 2, d: Math.abs(to - from), power: from };
});

const easeInOutCubic = (t: number) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
/** `t` seconds into a seal: how far the plate has slid (0..1) and the scale of the cards it covers. */
export function laneSealProgress(t: number) {
  return {
    slide: easeInOutCubic(Math.min(1, t / SEAL_SLIDE_S)),
    scale: 1 - (1 - SEAL_CARD_SCALE) * easeOutQuad(Math.min(1, t / SEAL_SCALE_S)),
  };
}

/** World z of the plate's leading edge; it starts at the power end and runs out to the lane's far end. */
export function laneSealEdgeZ(side: number, slide: number) {
  const { z0, z1 } = LANE_FIT[side];
  return side === 0 ? z0 + slide * (z1 - z0) : z1 - slide * (z1 - z0);
}

export const SINK_OPACITY = .65;
/**
 * The dark "sinking" layer under the cards, `t` seconds into a seal. It sits still on the pattern's starting footprint
 * and darkens with the plate's travel, reaching SINK_OPACITY as the plate covers its far edge. `clipZ` is the plate's
 * leading edge, where its visible part begins.
 */
export function laneSinkOverlay(side: number, t: number) {
  const { slide } = laneSealProgress(t), { power, d } = PATTERN_LANES[side], dir = side === 0 ? 1 : -1;
  const { z0, z1 } = LANE_FIT[side], coveredAt = Math.abs(power + dir * d - (side === 0 ? z0 : z1)) / (z1 - z0);
  return {
    clipZ: laneSealEdgeZ(side, slide),
    opacity: SINK_OPACITY * Math.min(1, slide / coveredAt),
    covered: slide >= coveredAt,
  };
}
