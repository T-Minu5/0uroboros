import { describe, expect, it } from 'vitest';
import { AUTHORED_NODE_X, FAR_SHIFT, LANE_MARGIN, LANE_SCALE, NODE_X, RAIL_INNER, boardZ, warpFarZ, warpX } from '../src/boardLayout';
import { boardDepth } from '../src/boardMaterials';

describe('board layout', () => {
  it('moves node centres to the new pitch and keeps the centre node', () => {
    expect(NODE_X[2]).toBe(0);
    AUTHORED_NODE_X.forEach((x, i) => expect(warpX(x, 0)).toBeCloseTo(NODE_X[i], 6));
  });

  it('keeps the margins and makes the padding 1.5 times the margin', () => {
    const edge = (x: number) => warpX(x, 1);
    expect(edge(1.525) - edge(1.275)).toBeCloseTo(LANE_MARGIN, 6);
    expect(edge(-1.275) - edge(-1.525)).toBeCloseTo(LANE_MARGIN, 6);
    expect(RAIL_INNER - edge(6.875)).toBeCloseTo(1.5 * LANE_MARGIN, 6);
    expect(edge(1.275) - edge(-1.275)).toBeCloseTo(2.55 * LANE_SCALE, 6);
  });

  it('leaves the rails, trims and frame band alone', () => {
    [7.47, 7.8, 7.92, 8.5].forEach(x => expect(warpX(x, 0)).toBe(x));
    [-5.6, 0, 3, 7].forEach(x => { expect(warpX(x, 4.3)).toBe(x); expect(warpX(x, -5)).toBe(x); });
  });

  it('is monotonic in x and in far z, so nothing folds over', () => {
    for (const z of [0, 2, 3.95, 4.05, -4.1]) {
      let last = -Infinity;
      for (let x = -9; x <= 9; x += .01) { const next = warpX(x, z); expect(next).toBeGreaterThanOrEqual(last); last = next; }
    }
    let last = Infinity;
    for (let z = 0; z >= -7; z -= .005) { const next = warpFarZ(z); expect(next).toBeLessThanOrEqual(last + 1e-12); last = next; }
  });

  it('never moves the near half in depth and shifts everything past the far lanes by FAR_SHIFT', () => {
    [0, .5, 1, 2.2, 4.75].forEach(z => expect(boardZ(1, z)).toBeCloseTo(z <= 1 ? z : boardDepth(z), 9));
    expect(warpFarZ(-3.83)).toBeCloseTo(-3.83 - FAR_SHIFT, 9);
    expect(warpFarZ(-4.75)).toBeCloseTo(-4.75 - FAR_SHIFT, 9);
    expect(boardZ(-9.5, -5)).toBe(-5);
  });
});
