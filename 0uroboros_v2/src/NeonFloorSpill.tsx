import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { boardSideHealth, sideLightScale } from './boardMaterials';
import { TABLE_OUTLINE, type TablePath } from './neonTableGeometry';
import { usePlayerColors } from './playerTheme';

/** World xz rectangle the spill covers, centred on the table. */
const SPAN = { x: 25, z: 20, cz: .5 };
/** Distance from the table edge stored in the field, either side, in world units. */
const REACH = 3;
const FIELD_W = 320, FIELD_H = 256;
const SPILL_Y = -.942;

/**
 * Signed distance in world units from each texel's world xz to `outline`: negative inside, clamped to ±`reach`.
 * Being signed, it interpolates smoothly across the edge, so the edge can be resolved finer than a texel.
 */
export function outlineDistanceField(outline: TablePath, width: number, height: number, span = SPAN, reach = REACH) {
  const data = new Float32Array(width * height);
  const n = outline.length;
  for (let j = 0; j < height; j++) {
    // Rows run with the plane's v, which points to world -z once it is laid flat.
    const z = span.cz + (.5 - (j + .5) / height) * span.z;
    for (let i = 0; i < width; i++) {
      const x = ((i + .5) / width - .5) * span.x;
      let d = Infinity, inside = false;
      for (let k = 0; k < n; k++) {
        const [ax, az] = outline[k], [bx, bz] = outline[(k + 1) % n];
        const ex = bx - ax, ez = bz - az, px = x - ax, pz = z - az;
        const h = Math.min(1, Math.max(0, (px * ex + pz * ez) / (ex * ex + ez * ez || 1)));
        d = Math.min(d, Math.hypot(px - ex * h, pz - ez * h));
        if ((az > z) !== (bz > z) && x < ex * (z - az) / (bz - az) + ax) inside = !inside;
      }
      data[j * width + i] = Math.min(d, reach) * (inside ? -1 : 1);
    }
  }
  return data;
}

const fragment = /* glsl */`
uniform sampler2D tField;
uniform vec3 uNear, uFar;
uniform float uGlow;
varying vec2 vUv;
void main() {
  float sd = texture2D(tField, vUv).r, d = max(sd, 0.0);
  // The edge fades over one screen pixel.
  float outside = smoothstep(-.5, .5, sd / max(fwidth(sd), 1e-5));
  // A tight bright lip against the glass and a soft pool spreading out over the floor.
  float spill = (exp(-d * 5.0) * .55 + exp(-d * 1.3) * .45) * outside;
  float z = ${SPAN.cz.toFixed(2)} + (.5 - vUv.y) * ${SPAN.z.toFixed(1)};
  vec3 color = mix(uFar, uNear, smoothstep(-1.2, 1.2, z));
  gl_FragColor = vec4(color, spill * uGlow * .35);
}`;
const vertex = /* glsl */`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

/** Real lighting on Neon: each player's neon spilling onto the floor around the table, dimming with their Servers. */
export function NeonFloorSpill({ glow }: { glow: number }) {
  const colors = usePlayerColors();
  const field = useMemo(() => {
    const half = Uint16Array.from(outlineDistanceField(TABLE_OUTLINE, FIELD_W, FIELD_H), THREE.DataUtils.toHalfFloat);
    const texture = new THREE.DataTexture(half, FIELD_W, FIELD_H, THREE.RedFormat, THREE.HalfFloatType);
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  }, []);
  useEffect(() => () => field.dispose(), [field]);
  const uniforms = useMemo(() => ({ tField: { value: field }, uNear: { value: new THREE.Color() }, uFar: { value: new THREE.Color() }, uGlow: { value: 0 } }), [field]);
  const shader = useRef<THREE.ShaderMaterial>(null);
  const tubes = useMemo(() => colors.map(c => new THREE.Color(c.tube)), [colors]);
  useFrame(() => {
    if (!shader.current) return;
    const u = shader.current.uniforms as typeof uniforms;
    u.uNear.value.copy(tubes[0]).multiplyScalar(sideLightScale(boardSideHealth.x));
    u.uFar.value.copy(tubes[1]).multiplyScalar(sideLightScale(boardSideHealth.y));
    u.uGlow.value = glow;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, SPILL_Y, SPAN.cz]} userData={{ skipScanDepth: true }}>
      <planeGeometry args={[SPAN.x, SPAN.z]} />
      <shaderMaterial ref={shader} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} vertexShader={vertex} fragmentShader={fragment} />
    </mesh>
  );
}
