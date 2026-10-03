import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { glintGlsl, glintUniforms } from './neonGlint';
import { MAX_OUTLINE, outlineGlsl, outlineUniforms } from './neonMaterials';
import { liquidLookGlsl } from './neonLiquidLook';
import { usePlayerColors } from './playerTheme';
import { psrdNoiseGlsl } from './psrdNoise';

/**
 * Car paint after Faraz Shaikh's demo (github.com/Faraz-Portfolio/demo-2025-car-paint): a metallic base coat
 * broken by procedural 3D Voronoi flakes that shift its roughness, metalness and colour, a pearl tint at grazing
 * angles, and a clear coat rippled with "orange peel" simplex noise so the neon and the studio lights reflect in it.
 * Over it lies the Liquid surface's Apple glass look (see neonLiquidLook): dark top band, gloss and glowing lower rim.
 */
export const DEFAULT_CAR_PAINT = {
  color: '#f4f6ff',
  flakeColor: '#c9ced8',
  pearlColor: '#bfe0ff',
  brightness: .8,
  /** Metalness of the base coat; flakes are its non-metallic sparkles. */
  metallic: .6,
  /** How strongly the flakes show. */
  flakes: 1,
  /** Flake cells per world unit, in units of FLAKE_CELLS. */
  flakeScale: 1,
  /** Base coat roughness between flakes. */
  roughness: .3,
  clearcoat: 1,
  coatRoughness: .03,
  /** Ripple of the clear coat's reflections. */
  orangePeel: .4,
  /** Strength of the pearl tint at grazing angles. */
  pearl: .5,
  /** Strength of the studio environment reflected in the paint. */
  reflections: 1,
  /** Strength of the Liquid surface's glass look laid over the paint. */
  liquid: 1,
};
export type CarPaintSettings = typeof DEFAULT_CAR_PAINT;
export type CarPaintColorKey = 'color' | 'flakeColor' | 'pearlColor';
export type CarPaintKey = Exclude<keyof CarPaintSettings, CarPaintColorKey>;

export const CAR_PAINT_COLORS: { key: CarPaintColorKey; label: string }[] = [
  { key: 'color', label: 'Paint' },
  { key: 'flakeColor', label: 'Flakes' },
  { key: 'pearlColor', label: 'Pearl' },
];

export const CAR_PAINT_SLIDERS: { key: CarPaintKey; label: string; min: number; max: number; step: number }[] = [
  { key: 'brightness', label: 'Brightness', min: 0, max: 1, step: .01 },
  { key: 'metallic', label: 'Metallic', min: 0, max: 1, step: .01 },
  { key: 'flakes', label: 'Flakes', min: 0, max: 1, step: .01 },
  { key: 'flakeScale', label: 'Flake density', min: .25, max: 3, step: .05 },
  { key: 'roughness', label: 'Roughness', min: .02, max: 1, step: .01 },
  { key: 'clearcoat', label: 'Clear coat', min: 0, max: 1, step: .01 },
  { key: 'coatRoughness', label: 'Coat rough', min: 0, max: .5, step: .01 },
  { key: 'orangePeel', label: 'Orange peel', min: 0, max: 1, step: .01 },
  { key: 'pearl', label: 'Pearl', min: 0, max: 1, step: .01 },
  { key: 'reflections', label: 'Reflections', min: 0, max: 3, step: .05 },
  { key: 'liquid', label: 'Liquid', min: 0, max: 1, step: .01 },
];

/** Flake cells per world unit at density 1: a flake spans a pixel or two at the board's zoom. */
const FLAKE_CELLS = 40;
/** Orange-peel ripples per world unit, and the clear-coat tilt at full strength. */
const PEEL_FREQUENCY = 24, PEEL_TILT = .05;

const STORAGE_KEY = 'ouroboros.carPaint.v2';
const DEFAULTS_KEY = 'ouroboros.carPaint.defaults';
const HEX = /^#[0-9a-f]{6}$/i;

/** `value`'s known settings, each clamped to its slider, over the factory look; anything invalid keeps the default. */
export function clampCarPaint(value: unknown): CarPaintSettings {
  const settings = { ...DEFAULT_CAR_PAINT }, saved = (value ?? {}) as Partial<Record<keyof CarPaintSettings, unknown>>;
  for (const { key } of CAR_PAINT_COLORS) {
    const v = saved[key];
    if (typeof v === 'string' && HEX.test(v)) settings[key] = v.toLowerCase();
  }
  for (const { key, min, max } of CAR_PAINT_SLIDERS) {
    const v = saved[key];
    if (typeof v === 'number' && Number.isFinite(v)) settings[key] = Math.min(max, Math.max(min, v));
  }
  return settings;
}

export const sameCarPaint = (a: CarPaintSettings, b: CarPaintSettings) => (Object.keys(DEFAULT_CAR_PAINT) as (keyof CarPaintSettings)[]).every(k => a[k] === b[k]);

/** The player's saved look, which Reset returns to; the factory look until they save one. */
export const carPaintDefaults: CarPaintSettings = { ...DEFAULT_CAR_PAINT };
try {
  const saved = localStorage.getItem(DEFAULTS_KEY);
  if (saved) Object.assign(carPaintDefaults, clampCarPaint(JSON.parse(saved)));
} catch { /* storage unavailable */ }

/** The live paint: the last settings used, else the saved look. */
export const carPaint: CarPaintSettings = { ...carPaintDefaults };
try {
  const live = localStorage.getItem(STORAGE_KEY);
  if (live) Object.assign(carPaint, clampCarPaint(JSON.parse(live)));
} catch { /* storage unavailable */ }

export function setCarPaint(next: Partial<CarPaintSettings>) {
  Object.assign(carPaint, clampCarPaint({ ...carPaint, ...next }));
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(carPaint)); } catch { /* storage unavailable */ }
}

/** Keeps the live paint as the saved look. */
export function saveCarPaintDefaults() {
  Object.assign(carPaintDefaults, carPaint);
  try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify(carPaintDefaults)); } catch { /* storage unavailable */ }
}

const paintPars = /* glsl */`
varying vec3 vPaintWorld;
uniform vec3 uFlakeColor, uPearlColor;
uniform float uFlakes, uFlakeCells, uPeel, uPearl, uLiquid, uLiquidWall;
uniform vec2 uWall;
uniform vec3 uAccent0, uAccent1;
${psrdNoiseGlsl}
${outlineGlsl}
${liquidLookGlsl(MAX_OUTLINE)}

vec3 paintHash3(vec3 p) {
  return fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))) * 43758.5453);
}

// 3D Voronoi: a random grey for the cell whose jittered centre is nearest.
float paintFlakes(vec3 p) {
  vec3 i = floor(p), f = fract(p), cell = i;
  float best = 9.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z)), d = o + paintHash3(i + o) - f;
    float dd = dot(d, d);
    if (dd < best) { best = dd; cell = i + o; }
  }
  return fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

vec3 paintOverlay(vec3 base, vec3 blend, float k) {
  return mix(mix(base, blend, k), 2.0 * base * blend, k);
}

#ifdef PAINT_GLINTS
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
${glintGlsl}
#endif
`;

// Flakes fade out where a cell shrinks below a pixel, so they never alias into noise.
const paintSurface = /* glsl */`
vec3 paintN = normalize(vNormal);
vec3 paintV = normalize(vViewPosition);
float paintEdge = 1.0 - clamp(abs(dot(paintV, paintN)), 0.0, 1.0);
paintEdge *= paintEdge;
vec3 flakeP = vPaintWorld * uFlakeCells;
float flakeLod = 1.0 - smoothstep(.8, 1.6, length(fwidth(flakeP)));
float flake = smoothstep(.2, 1.0, paintFlakes(flakeP)) * mix(.45, 1.0, smoothstep(-.2, .7, paintEdge)) * flakeLod * uFlakes;
float roughnessFactor = clamp(roughness * mix(1.0, .67, flake), .02, 1.0);
float metalnessFactor = metalness * (1.0 - flake);
diffuseColor.rgb = mix(diffuseColor.rgb, paintOverlay(uFlakeColor, diffuseColor.rgb, .5), smoothstep(0.0, .3, flake));
diffuseColor.rgb = mix(diffuseColor.rgb, paintOverlay(uPearlColor, diffuseColor.rgb, .2), smoothstep(.1, .4, paintEdge) * uPearl);
`;

const paintClearcoat = /* glsl */`
#include <clearcoat_normal_fragment_begin>
#ifdef USE_CLEARCOAT
{
  vec3 peelGradient;
  psrdnoise(vPaintWorld * ${PEEL_FREQUENCY.toFixed(1)}, vec3(0.0), 0.0, peelGradient);
  vec3 peel = mat3(viewMatrix) * peelGradient;
  clearcoatNormal = normalize(clearcoatNormal - uPeel * (peel - dot(peel, clearcoatNormal) * clearcoatNormal));
}
#endif
`;

const paintLiquid = /* glsl */`
outgoingLight = liquidLook(outgoingLight, vPaintWorld, uWall, uLiquidWall, mix(uAccent1, uAccent0, step(0.0, vPaintWorld.z)), uLiquid, 1.0);
#include <opaque_fragment>
`;

// The passing band of shine and the diamond glints along the frame's bevel, as on the glass frame.
const paintGlints = /* glsl */`
#include <tonemapping_fragment>
#ifdef PAINT_GLINTS
gl_FragColor.rgb += glassGlint(vPaintWorld.xz, flake) * .5 + edgeSparkles(vPaintWorld.xz, max(-outlineDist(vPaintWorld.xz), 0.0), .014);
#endif
`;

/**
 * Under the board's orthographic camera every point of a flat panel reflects the same direction, so the paint would
 * mirror one flat patch of the studio. Reflections are taken from the camera's actual position instead, as a lens
 * there would see them, so the studio lights and the neon sweep across the panels as real reflections.
 */
const paintLightsBegin = THREE.ShaderChunk.lights_fragment_begin.replace(
  'vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );',
  'vec3 geometryViewDir = normalize( vViewPosition );',
);

type Outline = readonly (readonly [number, number])[];
const NO_OUTLINE: Outline = [];

/**
 * The live car paint material. Pass the frame's outline and hole for the glass look across its bars, plus `glints` for
 * the frame's passing glints, or a wall's outline and world top and bottom for the look down its faces.
 */
export function useNeonCarPaint(
  { outline = NO_OUTLINE, hole = NO_OUTLINE, wall, glints = false }: { outline?: Outline; hole?: Outline; wall?: readonly [top: number, bottom: number]; glints?: boolean },
) {
  const scene = useThree(state => state.scene);
  const colors = usePlayerColors();
  const { material, uniforms } = useMemo(() => {
    const uniforms = {
      uFlakeColor: { value: new THREE.Color() },
      uPearlColor: { value: new THREE.Color() },
      uFlakes: { value: 1 },
      uFlakeCells: { value: FLAKE_CELLS },
      uPeel: { value: 0 },
      uPearl: { value: 0 },
      uLiquid: { value: 1 },
      uLiquidWall: { value: wall ? 1 : 0 },
      uWall: { value: new THREE.Vector2(wall?.[0] ?? 0, wall?.[1] ?? 0) },
      uAccent0: { value: new THREE.Color() },
      uAccent1: { value: new THREE.Color() },
      ...outlineUniforms(outline, hole),
      ...(glints ? glintUniforms : {}),
    };
    const paint = new THREE.MeshPhysicalMaterial({ ior: 1.5, specularIntensity: 1 });
    if (glints) paint.defines = { PAINT_GLINTS: '' };
    paint.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `varying vec3 vPaintWorld;\n${shader.vertexShader}`
        .replace('#include <project_vertex>', '#include <project_vertex>\nvPaintWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <clipping_planes_pars_fragment>', `#include <clipping_planes_pars_fragment>\n${paintPars}`)
        .replace('#include <roughnessmap_fragment>', paintSurface)
        .replace('#include <metalnessmap_fragment>', '')
        .replace('#include <clearcoat_normal_fragment_begin>', paintClearcoat)
        .replace('#include <lights_fragment_begin>', paintLightsBegin)
        .replace('#include <opaque_fragment>', paintLiquid)
        .replace('#include <tonemapping_fragment>', paintGlints);
    };
    paint.customProgramCacheKey = () => glints ? 'neon-car-paint-glints' : 'neon-car-paint';
    return { material: paint, uniforms };
  }, [outline, hole, wall, glints]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    const s = carPaint, u = uniforms;
    material.color.set(s.color).multiplyScalar(s.brightness);
    material.metalness = s.metallic;
    material.roughness = s.roughness;
    material.clearcoat = s.clearcoat;
    material.clearcoatRoughness = s.coatRoughness;
    // Set explicitly: a material that only inherits scene.environment takes the scene's intensity, not its own.
    if (material.envMap !== scene.environment) { material.envMap = scene.environment; material.needsUpdate = true; }
    material.envMapIntensity = s.reflections;
    u.uFlakeColor.value.set(s.flakeColor);
    u.uPearlColor.value.set(s.pearlColor);
    u.uFlakes.value = s.flakes;
    u.uFlakeCells.value = FLAKE_CELLS * s.flakeScale;
    u.uPeel.value = PEEL_TILT * s.orangePeel;
    u.uPearl.value = s.pearl;
    u.uLiquid.value = s.liquid;
    u.uAccent0.value.set(colors[0].accent);
    u.uAccent1.value.set(colors[1].accent);
  });
  return material;
}
