/**
 * Table-surface wave field.
 *
 * Inspired by the Resource Library wavy-cubes / ScanEffect technique notes
 * (vertex displacement + scan lines). Original GLSL. Not EffectComposer
 * wholesale, and not a copy of any effect webp.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ShaderMaterial } from 'three';
import * as THREE from 'three';

import { COLOR } from './tokens';

const vertex = `
uniform float uTime;
uniform float uAmp;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  float wave = sin(p.x * 1.8 + uTime * 1.35) * uAmp;
  wave += sin(p.y * 2.4 - uTime * 0.9) * uAmp * 0.55;
  p.z += wave * 0.07;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const fragment = `
uniform float uTime;
uniform float uAmp;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float scan = 0.5 + 0.5 * sin((vUv.y + vUv.x * 0.2) * 36.0 - uTime * 3.2);
  float ring = abs(sin(length(vUv - 0.5) * 18.0 - uTime * 1.4));
  /* Singularity pull: brighter core when amp is high (weighted selection). */
  float core = smoothstep(0.55, 0.0, length(vUv - 0.5)) * uAmp;
  float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  edge *= smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
  float a = (0.06 + scan * 0.12 + ring * 0.1 + core * 0.28) * uAmp * edge;
  gl_FragColor = vec4(uColor, a);
}
`;

export function WaveField({
  width,
  depth,
  active,
}: {
  width: number;
  depth: number;
  active: boolean;
}) {
  const material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAmp: { value: 0 },
      uColor: { value: new THREE.Color(COLOR.chance) },
    }),
    [],
  );

  useFrame((_, delta) => {
    uniforms.uTime.value += delta;
    uniforms.uAmp.value = THREE.MathUtils.damp(uniforms.uAmp.value, active ? 0.85 : 0, 4, delta);
    if (material.current) material.current.uniformsNeedUpdate = true;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]} renderOrder={2}>
      <planeGeometry args={[width * 0.92, depth * 0.72, 48, 28]} />
      <shaderMaterial
        ref={material}
        vertexShader={vertex}
        fragmentShader={fragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
