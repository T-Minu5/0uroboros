import type { RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** 16:9 floor art — covers the whole canvas on screen at its own aspect (cropped, never stretched). */
export const FLOOR_ASPECT = 16 / 9;
export const FLOOR_BASE_W = 16;
export const FLOOR_BASE_D = FLOOR_BASE_W / FLOOR_ASPECT;
export const FLOOR_POSITION = [0, -0.96, 0.35] as const;
const FLOOR_BLEED = 1.04;

const _forward = new THREE.Vector3();

export function useFloorScale(floorRef: RefObject<THREE.Mesh | null>) {
  const { camera, size } = useThree();
  useFrame(() => {
    const mesh = floorRef.current;
    if (!mesh || !(camera instanceof THREE.OrthographicCamera) || camera.zoom <= 0) return;
    camera.getWorldDirection(_forward);
    // The tilted camera shortens the floor's depth on screen by the sine of its elevation.
    const foreshorten = Math.max(.2, -_forward.y);
    const viewW = size.width / camera.zoom, viewH = size.height / camera.zoom;
    const width = Math.max(viewW, viewH * FLOOR_ASPECT) * FLOOR_BLEED;
    const depth = width / FLOOR_ASPECT / foreshorten;
    mesh.scale.set(width / FLOOR_BASE_W, depth / FLOOR_BASE_D, 1);
    const reach = (mesh.position.y - camera.position.y) / _forward.y;
    mesh.position.x = camera.position.x + _forward.x * reach;
    mesh.position.z = camera.position.z + _forward.z * reach;
  });
}

export function configureFloorMap(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
}
