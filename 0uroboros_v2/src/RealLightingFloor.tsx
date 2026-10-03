import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { boxBlur, luminanceFromRgba, reliefFromLuminance } from './backdropDepth';
import { backdropScanMaterialProps } from './BackdropScan';
import { FLOOR_BASE_D, FLOOR_BASE_W, FLOOR_POSITION, configureFloorMap, useFloorScale } from './floorPlane';
import type { RealLightingSettings } from './realLighting';

/** Width the floor art is sampled at for its height map; height follows the art's aspect. */
const HEIGHT_W = 1536;
/** World depth of the relief at Depth = 1. */
const MAX_DEPTH = .6;
const STEEL = new THREE.Color(.55, .56, .58);

type ImageSource = CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };

/** Height (1 = raised) from the art: smooth relief for the large forms, plus high-passed luminance for scratches and seams. */
function buildHeightTexture(map: THREE.Texture): THREE.DataTexture | null {
  const image = map.image as ImageSource | null;
  const iw = image?.naturalWidth || image?.width || 0, ih = image?.naturalHeight || image?.height || 0;
  if (!image || !iw || !ih) return null;
  const w = HEIGHT_W, h = Math.max(1, Math.round(w * ih / iw));
  const ctx = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, w, h);
  const lum = luminanceFromRgba(ctx.getImageData(0, 0, w, h).data, w, h);
  const relief = reliefFromLuminance(lum, w, h);
  const local = boxBlur(lum, w, h, 3);
  // Canvas rows run top-down; the floor map is flipY, so row 0 of the texture must be the art's bottom.
  const bytes = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const detail = Math.min(1, Math.max(0, .5 + (lum[i] - local[i]) * 3));
    bytes[(h - 1 - y) * w + x] = Math.round((relief[i] * .7 + detail * .3) * 255);
  }
  const texture = new THREE.DataTexture(bytes, w, h, THREE.RedFormat);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

const FLOOR_PARS = /* glsl */ `
uniform sampler2D uHeight;
uniform vec2 uHeightTexel, uParallax;
uniform float uBump, uArtMix, uBrush, uTone;
uniform vec3 uSteel;
float floorHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float floorNoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(floorHash(i), floorHash(i + vec2(1., 0.)), f.x), mix(floorHash(i + vec2(0., 1.)), floorHash(i + vec2(1.)), f.x), f.y);
}
// Grain runs along the floor's width, like steel brushed side to side.
float floorBrush(vec2 uv){ return floorNoise(vec2(uv.x * 5., uv.y * 420.)) * .6 + floorNoise(vec2(uv.x * 24., uv.y * 1300.)) * .4; }
float floorDepthAt(vec2 uv){ return 1. - texture2D(uHeight, uv).r; }
// Parallax occlusion: march into the height field along the view ray, then interpolate the crossing.
vec2 floorParallax(vec2 uv){
  if (dot(uParallax, uParallax) < 1e-12) return uv;
  const float LAYERS = 28.;
  vec2 delta = uParallax / LAYERS;
  float layer = 0., layerStep = 1. / LAYERS;
  vec2 p = uv; float d = floorDepthAt(p);
  for (int i = 0; i < 28; i++) { if (layer >= d) break; p -= delta; layer += layerStep; d = floorDepthAt(p); }
  vec2 prev = p + delta;
  float after = d - layer, before = floorDepthAt(prev) - layer + layerStep;
  return mix(p, prev, clamp(after / min(after - before, -1e-5), 0., 1.));
}
`;

const FLOOR_ALBEDO = /* glsl */ `
vec2 floorUv = floorParallax(vMapUv);
float floorH = texture2D(uHeight, floorUv).r;
float floorBrushed = floorBrush(floorUv);
vec3 floorSteel = uSteel * mix(1., .8 + .4 * floorBrushed, uBrush);
diffuseColor.rgb *= mix(floorSteel, texture2D(map, floorUv).rgb, uArtMix) * (.72 + .28 * floorH) * uTone;
`;

const FLOOR_ROUGHNESS = /* glsl */ `
roughnessFactor = clamp(roughnessFactor + (floorBrushed - .5) * uBrush * .5 + (1. - floorH) * .12, .03, 1.);
`;

// The plane's tangent frame is fixed: uv x is world +x, uv y is world -z (far), the normal is world +y.
const FLOOR_NORMAL = /* glsl */ `
{
  vec2 e = uHeightTexel * 1.5;
  float hx = texture2D(uHeight, floorUv + vec2(e.x, 0.)).r - texture2D(uHeight, floorUv - vec2(e.x, 0.)).r;
  float hy = texture2D(uHeight, floorUv + vec2(0., e.y)).r - texture2D(uHeight, floorUv - vec2(0., e.y)).r;
  vec3 nT = normalize(vec3(-hx * uBump, -hy * uBump, 1.));
  vec3 fT = normalize((viewMatrix * vec4(1., 0., 0., 0.)).xyz);
  vec3 fB = normalize((viewMatrix * vec4(0., 0., -1., 0.)).xyz);
  vec3 fN = normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz);
  normal = normalize(fT * nT.x + fB * nT.y + fN * nT.z);
}
`;

const _toEye = new THREE.Vector3();

/** The Real lighting floor: floor art as lit, brushed, depth-mapped steel. */
export function RealLightingFloor({ url, settings, floorRef }: { url: string; settings: RealLightingSettings; floorRef: RefObject<THREE.Mesh | null> }) {
  const map = useTexture(url);
  useEffect(() => configureFloorMap(map), [map]);
  useFloorScale(floorRef);
  const height = useMemo(() => buildHeightTexture(map), [map]);
  useEffect(() => () => height?.dispose(), [height]);

  const uniforms = useMemo(() => ({
    uHeight: { value: height as THREE.Texture | null },
    uHeightTexel: { value: new THREE.Vector2(1 / ((height?.image.width as number) || 1), 1 / ((height?.image.height as number) || 1)) },
    uParallax: { value: new THREE.Vector2() },
    uBump: { value: 0 },
    uArtMix: { value: 0 },
    uBrush: { value: 0 },
    uTone: { value: 1 },
    uSteel: { value: STEEL },
  }), [height]);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map });
    m.onBeforeCompile = shader => {
      backdropScanMaterialProps.onBeforeCompile(shader);
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\n${FLOOR_PARS}`)
        .replace('#include <map_fragment>', FLOOR_ALBEDO)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FLOOR_ROUGHNESS}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FLOOR_NORMAL}`);
    };
    m.customProgramCacheKey = () => 'real-lighting-floor';
    return m;
  }, [map, uniforms]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    material.metalness = settings.metalness;
    material.roughness = settings.roughness;
    material.envMapIntensity = settings.reflections;
    uniforms.uBump.value = settings.bump;
    uniforms.uArtMix.value = settings.artMix;
    uniforms.uBrush.value = settings.brushing;
    uniforms.uTone.value = settings.tone;
  }, [material, uniforms, settings]);

  const depth = useRef(settings.depth);
  depth.current = settings.depth;
  useFrame(({ camera, scene }) => {
    // Assigned rather than inherited: the renderer replaces a material's envMapIntensity with the scene's when it
    // inherits scene.environment, which would ignore the Reflections setting.
    if (material.envMap !== scene.environment) { material.envMap = scene.environment; material.needsUpdate = true; }
    const mesh = floorRef.current;
    if (!mesh) return;
    camera.getWorldDirection(_toEye).negate();
    const vz = Math.max(.2, _toEye.y), world = depth.current * MAX_DEPTH;
    uniforms.uParallax.value.set(
      _toEye.x / vz / (FLOOR_BASE_W * mesh.scale.x) * world,
      -_toEye.z / vz / (FLOOR_BASE_D * mesh.scale.y) * world,
    );
  });

  return (
    <mesh ref={floorRef} rotation={[-Math.PI / 2, 0, 0]} position={[...FLOOR_POSITION]} material={material} receiveShadow userData={{ skipScanDepth: true, scanBackground: true }}>
      <planeGeometry args={[FLOOR_BASE_W, FLOOR_BASE_D]} />
    </mesh>
  );
}
