import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NEON_RAILS } from '../src/NeonSideRails';
import { NEON_RIG_LIGHT_COUNT, railLightPieces } from '../src/NeonLightRig';

describe('neon light rig', () => {
  it('keeps a straight run as one light', () => {
    const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0));
    const pieces = railLightPieces(curve);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].length).toBeCloseTo(4);
    expect(pieces[0].center.x).toBeCloseTo(2);
  });

  it('splits a corner and keeps every piece on the rail', () => {
    const curve = new THREE.CurvePath<THREE.Vector3>();
    curve.add(new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 0, 0)));
    curve.add(new THREE.LineCurve3(new THREE.Vector3(3, 0, 0), new THREE.Vector3(3, 0, 3)));
    const pieces = railLightPieces(curve);
    expect(pieces.length).toBe(2);
    expect(pieces.reduce((sum, p) => sum + p.length, 0)).toBeGreaterThan(5.5);
  });

  it('covers every rail with a modest light budget', () => {
    for (const rail of NEON_RAILS) {
      const pieces = railLightPieces(rail.curve);
      const covered = pieces.reduce((sum, p) => sum + p.length, 0);
      expect(covered / rail.curve.getLength()).toBeGreaterThan(.9);
    }
    expect(NEON_RIG_LIGHT_COUNT).toBeLessThanOrEqual(28);
  });
});
