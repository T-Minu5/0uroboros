import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LIQUID_IOR, MAX_OUTLINE, outlineGlsl, outlineUniforms } from './neonMaterials';
import { liquidLookGlsl } from './neonLiquidLook';
import { usePlayerColors } from './playerTheme';

type Outline = readonly (readonly [number, number])[];

const liquidPars = /* glsl */`
varying vec3 vLiquidWorld;
uniform vec2 uWall;
uniform float uLiquidWall;
uniform vec3 uAccent0, uAccent1;
${outlineGlsl}
${liquidLookGlsl(MAX_OUTLINE)}
`;

const liquidFinish = /* glsl */`
outgoingLight = liquidLook(outgoingLight, vLiquidWorld, uWall, uLiquidWall,
  mix(uAccent1, uAccent0, step(0.0, vLiquidWorld.z)), 1.0, 1.0);
#include <opaque_fragment>
`;

type LiquidShape = { outline?: Outline; hole?: Outline; wall?: readonly [top: number, bottom: number] };
const NO_OUTLINE: Outline = [];

/**
 * The glass material of Faraz Shaikh's demo (github.com/Faraz-Portfolio/demo-2025-raymarched-liquid-glass):
 * MeshPhysicalMaterial as clear glass, fully transmissive with a roughness of .2, so the scene behind it shows through
 * softly blurred and refracted by the glass's own surface. The demo's thickness of 1 is scaled to the table's glass.
 * Pass the frame's outline and hole, or a wall's outline and world top and bottom, for the Apple glass look over it.
 */
export function useNeonLiquid({ outline = NO_OUTLINE, hole = NO_OUTLINE, wall }: LiquidShape) {
  const scene = useThree(state => state.scene);
  const colors = usePlayerColors();
  const { material, uniforms } = useMemo(() => {
    const uniforms = {
      ...outlineUniforms(outline, hole),
      uWall: { value: new THREE.Vector2(wall?.[0] ?? 0, wall?.[1] ?? 0) },
      uLiquidWall: { value: wall ? 1 : 0 },
      uAccent0: { value: new THREE.Color() },
      uAccent1: { value: new THREE.Color() },
    };
    const liquid = new THREE.MeshPhysicalMaterial({ roughness: .2, transmission: 1, thickness: .3, ior: LIQUID_IOR });
    liquid.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `varying vec3 vLiquidWorld;\n${shader.vertexShader}`
        .replace('#include <project_vertex>', `#include <project_vertex>
vLiquidWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <clipping_planes_pars_fragment>', `#include <clipping_planes_pars_fragment>\n${liquidPars}`)
        .replace('#include <opaque_fragment>', liquidFinish);
    };
    liquid.customProgramCacheKey = () => 'neon-liquid-apple';
    return { material: liquid, uniforms };
  }, [outline, hole, wall]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    if (material.envMap !== scene.environment) { material.envMap = scene.environment; material.needsUpdate = true; }
    uniforms.uAccent0.value.set(colors[0].accent);
    uniforms.uAccent1.value.set(colors[1].accent);
  });
  return material;
}
