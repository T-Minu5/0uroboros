import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { SpotLight } from 'three';
import * as THREE from 'three';

import type { Atmosphere } from './tokens';

export function LightingRig({
  atmosphere,
  focusX,
}: {
  atmosphere: Atmosphere;
  focusX: number | null;
}) {
  const key = useRef<THREE.DirectionalLight>(null);
  const spot = useRef<SpotLight>(null);

  useFrame((_, delta) => {
    const play = atmosphere === 'play';
    const collapse = atmosphere === 'collapse';
    const draft = atmosphere === 'draft';
    if (key.current) {
      const target = play ? 0.92 : draft ? 0.34 : 0.26;
      key.current.intensity = THREE.MathUtils.damp(key.current.intensity, target, 4, delta);
    }
    if (spot.current) {
      const target = collapse ? 1.35 : play ? 0.22 : 0.08;
      spot.current.intensity = THREE.MathUtils.damp(spot.current.intensity, target, 5, delta);
      const x = focusX ?? 0;
      spot.current.position.x = THREE.MathUtils.damp(spot.current.position.x, x, 4, delta);
    }
  });

  return (
    <>
      <ambientLight intensity={atmosphere === 'play' ? 0.58 : 0.22} color="#d8c4d4" />
      <directionalLight
        ref={key}
        position={[1.6, 10.2, 3.4]}
        intensity={0.86}
        color="#e4e8f0"
        castShadow
      />
      <directionalLight position={[-5.2, 2.4, -3.2]} intensity={0.14} color="#e2187a" />
      <pointLight position={[0, 2.2, -5.4]} intensity={1.15} color="#e2187a" distance={22} />
      <pointLight position={[0, 1.4, 0]} intensity={atmosphere === 'collapse' ? 0.9 : 0.18} color="#c9a6ff" distance={10} />
      <spotLight
        ref={spot}
        position={[0, 7.2, 1.4]}
        angle={0.55}
        penumbra={0.85}
        intensity={0.22}
        color={atmosphere === 'collapse' ? '#c9a6ff' : '#9fd9ff'}
      />
    </>
  );
}
