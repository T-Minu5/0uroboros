import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { usePlayerColors } from './playerTheme';
import { useNeonRig } from './realLighting';

type GlassSheenProps = {
  geometry: THREE.BufferGeometry;
  position: readonly [number, number, number];
  /** Surfaces flatter than this (sideways tilt of the world normal) show no sheen, so flat tops stay clear. */
  minTilt?: number;
  strength?: number;
  /** World-space top and bottom of a vertical wall; enables flat per-face lighting on its sides. */
  wall?: readonly [number, number];
};

/**
 * A clear-coat reflection pass laid over a glass mesh: black and additive, so it contributes only the scene's
 * environment and key light reflected in each face and bevel. Vertical walls only see the dark floor from this
 * camera, so with `wall` set their straight faces also get a flat stylised light that steps at every corner.
 */
export function GlassSheen({ geometry, position, minTilt = 0, strength = 1, wall }: GlassSheenProps) {
  const colors = usePlayerColors();
  // Under the neon rig the walls take their light from the scene like everything else, not the stylised faces.
  const rig = useNeonRig() !== null;
  const top = wall?.[0] ?? 0, bottom = wall?.[1] ?? 0, facets = wall && !rig ? 1 : 0;
  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      metalness: 0,
      roughness: rig ? .12 : .22,
      // Every area light costs a clear-coat evaluation per pixel, so under the neon rig the base layer alone reflects.
      clearcoat: rig ? 0 : 1,
      clearcoatRoughness: .06,
      envMapIntensity: 1.6,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    m.userData.uniforms = {
      uSheen: { value: strength },
      uMinTilt: { value: minTilt },
      uFacets: { value: facets },
      uWallSpan: { value: new THREE.Vector2(top, bottom) },
      uTint: { value: new THREE.Color('#24dbf4') },
    };
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, m.userData.uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float uSheen, uMinTilt, uFacets;
uniform vec2 uWallSpan;
uniform vec3 uTint;`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
  vec3 sheenWorldNormal = (vec4(normal, 0.0) * viewMatrix).xyz;
  gl_FragColor.rgb *= uSheen * smoothstep(uMinTilt, uMinTilt + .25, length(sheenWorldNormal.xz));
  if (uFacets > .5) {
    vec3 flatView = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    if (flatView.z < 0.0) flatView = -flatView;
    vec3 flatWorld = (vec4(flatView, 0.0) * viewMatrix).xyz;
    float side = 1.0 - smoothstep(.35, .6, abs(sheenWorldNormal.y));
    vec2 outward = length(flatWorld.xz) > 1e-4 ? normalize(flatWorld.xz) : vec2(0.0, 1.0);
    vec3 worldPos = (inverse(viewMatrix) * vec4(-vViewPosition, 1.0)).xyz;
    float worldY = worldPos.y;
    float rightSide = smoothstep(-.5, .5, worldPos.x);
    float t = clamp((uWallSpan.x - worldY) / max(uWallSpan.x - uWallSpan.y, 1e-4), 0.0, 1.0);
    float key = max(dot(outward, normalize(vec2(-.72, .69))), 0.0);
    float fill = max(dot(outward, normalize(vec2(.25, 1.0))), 0.0);
    float rim = max(dot(outward, normalize(vec2(.95, .3))), 0.0);
    vec3 tint = uTint / max(max(uTint.r, uTint.g), max(uTint.b, .001));
    vec3 face = vec3(.66, .78, .88) * pow(key, 2.0) * .75
              + mix(vec3(.5, .6, .68), tint * .6, .45) * pow(fill, 4.0) * mix(.045, .1, rightSide)
              + tint * pow(rim, 3.0) * mix(.07, .2, rightSide);
    face *= mix(1.35, .35, t);
    face += vec3(.75, .88, 1.0) * (exp(-t * 26.0) * (.04 + .7 * key * key + .08 * rim) + exp(-(1.0 - t) * 30.0) * .04 * key);
    gl_FragColor.rgb += face * side * uSheen;
  }`);
    };
    m.customProgramCacheKey = () => 'glass-sheen';
    return m;
  }, [minTilt, strength, facets, top, bottom, rig]);
  useEffect(() => { material.userData.uniforms.uTint.value.set(colors[0].accent); }, [material, colors]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometry} material={material} position={position as [number, number, number]} renderOrder={1} />;
}
