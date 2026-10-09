import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { loadConcentricLayers, stackDepths, type HudLayers } from './hudLayers';
import { LAYER_DEPTH, type HudLook } from './hudLook';

export const HUD_CIRCLES_URL = '/assets/HUDs/circles.svg';

/** Raster density per drawing unit: crisp at the black hole's size on a high-DPI screen. */
const PIXELS_PER_UNIT = 8;
/** Within the stack, three sorts the layers back to front as it turns. */
const RENDER_ORDER = 1000;

/**
 * A straight-on drawing of concentric shapes, pulled apart into a 3D stack: the largest layer, of radius `radius`,
 * stays on z = 0 and the smaller ones stand out in front of it, the smallest nearest, with gaps widening from 2 to 6
 * drawing units. Each layer spins about the shared centre; `look` turns the stack and sets its spread, so at spread 0
 * it is the flat drawing.
 */
export function HudStack({ url = HUD_CIRCLES_URL, radius, look }: { url?: string; radius: number; look: HudLook }) {
  const [loaded, setLoaded] = useState<HudLayers | null>(null);
  useEffect(() => {
    let live = true;
    loadConcentricLayers(url, PIXELS_PER_UNIT).then(result => { if (live) setLoaded(result); }, error => console.warn(`HUD ${url} failed to load`, error));
    return () => { live = false; };
  }, [url]);

  const built = useMemo(() => {
    if (!loaded?.layers.length) return null;
    const { layers } = loaded;
    const scale = radius / layers.at(-1)!.rmax;
    const depths = stackDepths(layers.length), deepest = depths.at(-1)! || 1;
    return layers.map((layer, k) => {
      const texture = new THREE.CanvasTexture(layer.canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      const side = 2 * layer.reach * scale;
      return {
        texture,
        geometry: new THREE.PlaneGeometry(side, side),
        material: new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
        z: (deepest - depths[k]) / deepest * LAYER_DEPTH * radius,
        // Smaller layers turn faster; neighbours alternate direction.
        speed: (k % 2 ? -1 : 1) * (.12 + 2.4 / (layer.rmax + 6)),
      };
    });
  }, [loaded, radius]);
  useEffect(() => () => built?.forEach(p => { p.texture.dispose(); p.geometry.dispose(); p.material.dispose(); }), [built]);

  const root = useRef<THREE.Group>(null);
  const spins = useRef<(THREE.Mesh | null)[]>([]);
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, .05);
    root.current?.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
    built?.forEach((p, k) => {
      const mesh = spins.current[k];
      if (!mesh) return;
      mesh.position.z = p.z * look.spread;
      if (!reduced) mesh.rotation.z += p.speed * dt;
    });
  });

  return <group ref={root}>
   {built?.map((p, k) => <mesh key={k} ref={el => { spins.current[k] = el; }} geometry={p.geometry} material={p.material} renderOrder={RENDER_ORDER}/>)}
  </group>;
}
