import * as THREE from 'three';
import { LANE_RIM, LANE_RIM_HX } from './boardLayout';

/** Same outer footprint as the existing lane rim; only the outline inside it is authored. */
export function neonLaneDimensions(side: number) {
  const { z0, z1 } = LANE_RIM[side];
  return { halfWidth: LANE_RIM_HX, halfDepth: (z1 - z0) / 2, z: (z0 + z1) / 2 };
}
export const NEON_BEVEL = .014;
/** Extrusion depth that keeps the bevelled lane top at y .207, below closure plates and seals. */
export const NEON_LANE_DEPTH = .087 - NEON_BEVEL;
export const NEON_LANE_MAX_POINTS = 48;

/**
 * Outer-end chamfers: depth per unit of width, so they read at 45° on screen like the deck's corner
 * chamfers (the play camera foreshortens depth). The right one is a third the size of the left.
 */
export const NEON_LANE_CHAMFER = { slope: 1.3, left: .47, right: .157 } as const;

/**
 * HUD-frame lane outline in lane-local coordinates: u across the lane, o toward the
 * owner's outer end. Chamfered outer end, matching side notches by the Node, tight
 * Node-end corners. Every point stays inside the rectangular footprint.
 */
function laneFrame(w: number, d: number): [number, number][] {
  const { slope, left, right } = NEON_LANE_CHAMFER;
  return [
    [-w + .10, -d], [w - .10, -d], [w, -d + .10],
    [w, -d + .49], [w - .07, -d + .56], [w - .07, -d + .99], [w, -d + 1.06],
    [w, d - right * slope], [w - right, d],
    [-w + left, d], [-w, d - left * slope],
    [-w, -d + 1.06], [-w + .07, -d + .99], [-w + .07, -d + .56], [-w, -d + .49],
    [-w, -d + .10],
  ];
}

export function neonLanePolygon(side: number): [number, number][] {
  const { halfWidth, halfDepth } = neonLaneDimensions(side);
  return laneFrame(halfWidth - NEON_BEVEL, halfDepth - NEON_BEVEL)
    .map(([u, o]) => side === 0 ? [u, -o] : [-u, o]);
}

export function neonLaneShape(side: number) {
  const shape = new THREE.Shape();
  neonLanePolygon(side).forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y));
  shape.closePath();
  return shape;
}
