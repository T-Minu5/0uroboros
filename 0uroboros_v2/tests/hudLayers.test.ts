import { describe, expect, it } from 'vitest';
import { groupConcentric, stackDepths } from '../src/hudLayers';

describe('concentric HUD layers', () => {
  it('groups overlapping radial bands into layers, smallest first', () => {
    const bands = [
      { rmin: 49.6, rmax: 49.9 }, { rmin: 7.9, rmax: 9.5 }, { rmin: 49.7, rmax: 52.1 },
      { rmin: 9.8, rmax: 10.6 }, { rmin: 15.3, rmax: 16.3 }, { rmin: 14.8, rmax: 16.8 },
    ];
    expect(groupConcentric(bands).map(g => [g.rmin, g.rmax, g.members.sort()])).toEqual([
      [7.9, 9.5, [1]], [9.8, 10.6, [3]], [14.8, 16.8, [4, 5]], [49.6, 52.1, [0, 2]],
    ]);
  });

  it('spaces layers 2 apart at the front, widening evenly to 6 at the back', () => {
    const depths = stackDepths(11);
    const gaps = depths.slice(1).map((d, k) => +(d - depths[k]).toFixed(6));
    expect(depths[0]).toBe(0);
    expect(gaps[0]).toBe(2);
    expect(gaps.at(-1)).toBe(6);
    expect(gaps.every((g, k) => k === 0 || g > gaps[k - 1])).toBe(true);
  });
});
