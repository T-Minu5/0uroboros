import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NEON_LINK_X, NEON_RAIL_CHAINS, NEON_RAILS } from '../src/NeonSideRails';
import { NEON_SERVER_Z } from '../src/boardLayout';

/** A segment's start and end in the direction packets travel. */
const ends = (s: (typeof NEON_RAIL_CHAINS)[number]['segments'][number]) => {
  const a = s.curve.getPoint(0), b = s.curve.getPoint(1);
  return s.reverse ? [b, a] : [a, b];
};

describe('neon rail chains', () => {
  it('runs one chain per player and side: link, Server core, then side rail', () => {
    expect(NEON_RAIL_CHAINS).toHaveLength(4);
    for (const chain of NEON_RAIL_CHAINS) {
      expect(chain.segments.map(s => s.kind)).toEqual(['link', 'core', 'rail']);
      expect(chain.segments.every(s => s.owner === chain.owner && s.side === chain.side)).toBe(true);
    }
    expect(new Set(NEON_RAIL_CHAINS.map(c => `${c.owner}${c.side}`)).size).toBe(4);
  });

  it('starts at the stats panel centre line and joins every segment end to end', () => {
    for (const chain of NEON_RAIL_CHAINS) {
      const [start] = ends(chain.segments[0]);
      expect(start.x).toBeCloseTo(0);
      expect(start.z).toBeCloseTo(NEON_SERVER_Z[chain.owner]);
      for (let i = 1; i < chain.segments.length; i++) {
        expect(ends(chain.segments[i])[0].distanceTo(ends(chain.segments[i - 1])[1])).toBeLessThan(1e-6);
      }
      expect(Math.sign(ends(chain.segments[1])[1].x)).toBe(chain.side);
    }
  });

  it('lays segment offsets along the chain', () => {
    for (const chain of NEON_RAIL_CHAINS) {
      let offset = 0;
      for (const s of chain.segments) {
        expect(s.offset).toBeCloseTo(offset);
        expect(s.length).toBeCloseTo(s.curve.getLength());
        offset += s.length;
      }
      expect(chain.length).toBeCloseTo(offset);
      expect(chain.segments[0].length).toBeCloseTo(NEON_LINK_X);
    }
  });

  it('lists every tube once for the light rig', () => {
    expect(NEON_RAILS).toHaveLength(12);
    expect(NEON_RAILS.filter(r => r.kind === 'core').every(r => r.curve.getPoint(.5).y === r.curve.getPoint(0).y)).toBe(true);
    const links = NEON_RAILS.filter(r => r.kind === 'link');
    for (const owner of [0, 1]) expect(links.filter(r => r.owner === owner).map(r => r.curve.getPoint(1).x).sort()).toEqual([-NEON_LINK_X, NEON_LINK_X]);
    expect(links.every(r => r.curve.getPoint(0).equals(new THREE.Vector3(0, r.curve.getPoint(0).y, NEON_SERVER_Z[r.owner])))).toBe(true);
  });
});
