import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Shared look for lit neon tubes on both boards: a pale, nearly white core that saturates outward into deep colour,
 * a plasma column whose brightness swells unevenly along its length, and a thin saturated sheath of glow kept under
 * the bloom threshold so bloom stays tight and only the core blooms.
 */
export const neonTubeGlsl = /* glsl */`
uniform float uNeonGain;
const vec3 NT_LUMA = vec3(.2126, .7152, .0722);
float ntHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
float ntNoise(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(ntHash(i), ntHash(i + 1.0), f);
}

// Slow swells drifting along the tube with a faster buzz on top; dims to ~.5 and peaks near 1.5.
float neonFlicker(float along, float time) {
  float swell = ntNoise(along * .6 - time * .45);
  float drift = ntNoise(along * 2.9 + time * 1.6);
  return max(.62 + .75 * swell * swell + .22 * (drift - .5) + .05 * sin(time * 7.3 + along * 1.3), .3);
}

// Unit-luminance hue of the tube colour, pushed 35% more saturated.
vec3 neonDeep(vec3 color) {
  vec3 c = color / max(dot(color, NT_LUMA), .05);
  return max(mix(vec3(1.0), c, 1.35), 0.0);
}

// The tube across its width, q from 0 on its axis to 1 at its silhouette: a hair-thin, almost white centre line,
// colour deepening and darkening outward, then a narrow climb to a lighter, still saturated rim.
vec3 neonTube(vec3 color, float q, float level) {
  vec3 deep = neonDeep(color);
  float line = 1.0 - smoothstep(0.0, max(fwidth(q), .04), q);
  float outer = smoothstep(0.0, .6, q);
  vec3 body = mix(mix(deep, vec3(1.0), .4) * .7, deep * .17, outer);
  float rim = smoothstep(.6, .88, q) * (1.0 - .3 * smoothstep(.93, 1.0, q));
  return mix(body + deep * rim * .3, mix(deep, vec3(1.0), .9) * 1.5, line) * level * uNeonGain;
}

// On-screen distance from the tube axis in tube radii, under an orthographic camera.
float neonTubeQ(vec3 viewNormal, vec3 viewTangent) {
  vec3 across = cross(viewTangent, vec3(0.0, 0.0, 1.0));
  return dot(across, across) < 1e-6 ? 0.0 : abs(dot(normalize(viewNormal), normalize(across)));
}

// Glow sheath around a tube; q is the distance from the tube axis in tube radii, reach the sheath's outer radius.
vec3 neonHalo(vec3 color, float q, float reach, float level) {
  float glow = exp(-max(q - 1.0, 0.0) * 2.2) * smoothstep(.75, 1.05, q) * (1.0 - smoothstep(reach * .7, reach, q));
  return neonDeep(color) * glow * level * uNeonGain;
}`;

export const neonTubeVertex = /* glsl */`
attribute vec3 aTangent;
varying vec2 vUv;
varying vec3 vViewNormal, vViewTangent;
void main() {
  vUv = uv;
  vViewNormal = normalize(normalMatrix * normal);
  vViewTangent = mat3(modelViewMatrix) * aTangent;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Gives a tube geometry the per-vertex axis direction `neonTubeVertex` reads. */
export function withTubeAxis<G extends THREE.BufferGeometry>(geometry: G, axisAt: (vertex: number) => THREE.Vector3): G {
  const count = geometry.getAttribute('position').count, data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) axisAt(i).toArray(data, i * 3);
  geometry.setAttribute('aTangent', new THREE.BufferAttribute(data, 3));
  return geometry;
}

/** `TubeGeometry` axis: the curve tangent of the ring each vertex belongs to. */
export function curveTubeAxis(geometry: THREE.TubeGeometry) {
  const ring = geometry.parameters.radialSegments + 1;
  return withTubeAxis(geometry, i => geometry.tangents[Math.floor(i / ring)]);
}

/** How far the glow sheath reaches, in tube radii. */
export const NEON_HALO_REACH = 2.3;

/** Live brightness multiplier on every neon tube and trim, set from the board tuning panel. */
export const neonGain = { value: 1 };

const trimClock = { value: 0 };

/** Drives the brightness swells of every neon trim material. */
export function useNeonTrimClock() {
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  useFrame(({ clock }) => { trimClock.value = reduced ? 0 : clock.elapsedTime; });
}

/**
 * Gives an emissive trim material the neon look: paler where its surface faces the camera, deeper colour where it
 * turns away, and the same uneven brightness. Re-apply after `clone()`, which does not copy `onBeforeCompile`.
 */
export function neonTrimShading(material: THREE.MeshStandardMaterial) {
  material.userData.neonTrim = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.uNtTime = trimClock;
    shader.uniforms.uNeonGain = neonGain;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vNtWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvNtWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vNtWorld;\nuniform float uNtTime;\n${neonTubeGlsl}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float ntFacing = abs(normal.z);
    float ntLum = dot(totalEmissiveRadiance, NT_LUMA);
    vec3 ntDeep = max(mix(vec3(ntLum), totalEmissiveRadiance, 1.4), 0.0);
    float ntCore = smoothstep(.55, 1.0, ntFacing);
    totalEmissiveRadiance = mix(ntDeep, mix(ntDeep, vec3(ntLum), .5), ntCore * ntCore) * mix(.55, 1.15, ntFacing)
      * neonFlicker(vNtWorld.x + vNtWorld.z * .6, uNtTime) * uNeonGain;
  }`);
  };
  material.customProgramCacheKey = () => 'neon-trim';
}
