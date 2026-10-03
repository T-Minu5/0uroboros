import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LANE_RIM, LANE_RIM_HX } from '../src/boardLayout';
import { NEON_BEVEL, NEON_LANE_DEPTH, neonLaneDimensions, neonLaneShape } from '../src/neonGeometry';
import { boardMaterial } from '../src/boardMaterials';
import { LANE_SEAL_Y } from '../src/laneSeal';

describe('Neon lane footprint', () => {
  it.each([0, 1])('retains the existing lane bounds, including the bevel, on side %i', side => {
    const d = neonLaneDimensions(side);
    const geometry = new THREE.ExtrudeGeometry(neonLaneShape(side), { depth: NEON_LANE_DEPTH, bevelEnabled: true, bevelSegments: 2, bevelSize: NEON_BEVEL, bevelThickness: NEON_BEVEL });
    geometry.rotateX(-Math.PI / 2).translate(0, .12, d.z);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.min.x).toBeCloseTo(-LANE_RIM_HX, 5);
    expect(box.max.x).toBeCloseTo(LANE_RIM_HX, 5);
    expect(box.min.z).toBeCloseTo(LANE_RIM[side].z0, 5);
    expect(box.max.z).toBeCloseTo(LANE_RIM[side].z1, 5);
    // Closure plates and reward sweeps must render above the glass, without fighting for depth.
    expect(box.max.y).toBeLessThan(.208);
    expect(.208).toBeLessThan(LANE_SEAL_Y);
    geometry.dispose();
  });
});

describe('independent board materials', () => {
  it('does not mutate the imported source or the Classic finish when Neon is created', () => {
    const source = new THREE.MeshStandardMaterial({ color: '#654321', roughness: .62 });
    source.name = 'OB / wine-black field glass';
    const texture = new THREE.Texture();
    const classic = boardMaterial(source, texture) as THREE.MeshPhysicalMaterial;
    const before = classic.toJSON();
    const neon = boardMaterial(source, texture, 'neon') as THREE.MeshPhysicalMaterial;
    expect(neon.color.equals(classic.color)).toBe(false);
    expect(classic.toJSON()).toEqual(before);
    expect(source.color.getHexString()).toBe('654321');
    expect(source.roughness).toBe(.62);
    expect(classic.metalness).toBe(.48);
    expect(classic.roughness).toBe(.34);
    const restored = boardMaterial(source, texture, 'classic') as THREE.MeshPhysicalMaterial;
    expect(restored.color.equals(classic.color)).toBe(true);
    expect(restored.clearcoat).toBe(classic.clearcoat);
    [classic, neon, restored, source].forEach(material => material.dispose()); texture.dispose();
  });
});
