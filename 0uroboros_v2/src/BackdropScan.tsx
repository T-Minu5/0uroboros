import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BACKDROP_DEPTH_W, luminanceFromRgba, reliefFromLuminance } from './backdropDepth';

/**
 * Codrops "Scanning effect with depth map" (effect 3) on the backdrop floor art: a thin depth band sweeps near → far and
 * reveals a grid of small plus-sign crosses wherever the art's depth matches it, screen-blended ×10 so the band glows.
 * The art has no authored depth map, so one is built once per background from the art's relief (bright reads as near,
 * see backdropDepth.ts) and blended with the plate's own near/far ramp. Fires at random every 32–128 s.
 */
const SCAN_GAP_S = [32, 128] as const;
/** Codrops: progress 0 → .9 over 3 s, power1.out. The ends are padded here so the band fully enters and leaves. */
const SCAN_S = 3;
const SCAN_FROM = -.06, SCAN_TO = 1.04;
/** --green (#1fffb1) in linear light, over-driven (the example uses ×10 under a weaker bloom) so the band glows. */
const SCAN_TINT = new THREE.Color('#1fffb1').multiplyScalar(3.2);

const blankDepth = new THREE.DataTexture(new Uint8Array([128]), 1, 1, THREE.RedFormat);
blankDepth.needsUpdate = true;

const uniforms = {
  uScanProgress: { value: 0 },
  uScanStrength: { value: 0 },
  uScanTint: { value: SCAN_TINT },
  uScanDepth: { value: blankDepth as THREE.Texture },
};

const SCAN_GLSL = /* glsl */ `
uniform float uScanProgress, uScanStrength;
uniform vec3 uScanTint;
uniform sampler2D uScanDepth;
// iq sdCross: arm half-length b.x, half-thickness b.y.
float scanCross(vec2 p, vec2 b){
  p = abs(p); p = (p.y > p.x) ? p.yx : p.xy;
  vec2 q = p - b; float k = max(q.y, q.x);
  vec2 w = (k > 0.) ? q : vec2(b.y - p.x, -k);
  return sign(k) * length(max(w, 0.));
}
vec3 backdropScan(vec3 base, vec2 uv){
  // Plate uv.y = 1 is the far (screen-top) edge; relief pulls raised forms toward the viewer so the band wraps them.
  float depth = clamp(uv.y * .4 + (1. - texture2D(uScanDepth, uv).r) * .6, 0., 1.);
  float band = 1. - smoothstep(0., .025, abs(depth - uScanProgress));
  // Square cells on screen: the flat plate is 16:9 and foreshortened by the camera tilt (sin ≈ .81).
  vec2 cell = mod(vec2(uv.x * 2.19, uv.y) * 108., 2.) - 1.;
  float d = scanCross(cell, vec2(.42, .07));
  float mark = 1. - smoothstep(0., fwidth(d) * 1.2, d);
  vec3 glow = uScanTint * mark * band * uScanStrength;
  return base + glow * (1. - clamp(base, 0., 1.));
}
`;

/** Patch for the floor's MeshBasicMaterial (needs a map); keeps `.map` so the board scan can still read the art. */
function patchBackdropScan(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <map_pars_fragment>', `#include <map_pars_fragment>\n#ifdef USE_MAP\n${SCAN_GLSL}\n#endif`)
    .replace('#include <opaque_fragment>', `#ifdef USE_MAP\nif (uScanStrength > .001) outgoingLight = backdropScan(outgoingLight, vMapUv);\n#endif\n#include <opaque_fragment>`);
}

export const backdropScanMaterialProps = {
  onBeforeCompile: patchBackdropScan,
  customProgramCacheKey: () => 'backdrop-depth-scan',
} as const;

type MediaSource = CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number; videoWidth?: number; videoHeight?: number };

/** Builds the relief depth texture for the floor art; false while the art has no pixels yet (e.g. video warming up). */
function buildDepthTexture(map: THREE.Texture): THREE.DataTexture | null {
  const image = map.image as MediaSource | null;
  const iw = image?.naturalWidth || image?.videoWidth || image?.width || 0;
  const ih = image?.naturalHeight || image?.videoHeight || image?.height || 0;
  if (!image || !iw || !ih) return null;
  const w = BACKDROP_DEPTH_W, h = Math.max(1, Math.round(w * ih / iw));
  const ctx = Object.assign(document.createElement('canvas'), { width: w, height: h }).getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, w, h);
  const lum = luminanceFromRgba(ctx.getImageData(0, 0, w, h).data, w, h);
  if (lum.every(v => v < .05)) return null;
  const relief = reliefFromLuminance(lum, w, h);
  // Canvas rows run top-down; the floor map is flipY, so row 0 of the texture must be the art's bottom.
  const bytes = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bytes[(h - 1 - y) * w + x] = Math.round(relief[y * w + x] * 255);
  const texture = new THREE.DataTexture(bytes, w, h, THREE.RedFormat);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** Scheduler + depth-map builder: mount once alongside the floor. */
export function BackdropScan({ floorRef }: { floorRef: RefObject<THREE.Mesh | null> }) {
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const run = useRef({ next: -1, start: -1, hold: null as number | null });
  const depth = useRef({ map: null as THREE.Texture | null, texture: null as THREE.DataTexture | null, retryAt: 0 });
  const gap = () => SCAN_GAP_S[0] + Math.random() * (SCAN_GAP_S[1] - SCAN_GAP_S[0]);
  useEffect(() => {
    if (!(import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV) return;
    // Dev: `__backdropScan()` fires a sweep now; `__backdropScan(p)` holds the band at progress p; `__backdropScan(null)` releases it.
    const w = window as unknown as { __backdropScan?: (hold?: number | null) => void };
    w.__backdropScan = hold => { if (hold === undefined) run.current.next = 0; else run.current.hold = hold; };
    return () => { delete w.__backdropScan; };
  }, []);
  useEffect(() => () => {
    uniforms.uScanStrength.value = 0;
    uniforms.uScanDepth.value = blankDepth;
    depth.current.texture?.dispose();
  }, []);
  useFrame(({ clock }) => {
    const now = clock.elapsedTime, r = run.current, dm = depth.current;
    const map = (floorRef.current?.material as THREE.MeshBasicMaterial | undefined)?.map ?? null;
    if (map !== dm.map) {
      dm.map = map; dm.retryAt = 0;
      dm.texture?.dispose(); dm.texture = null;
      uniforms.uScanDepth.value = blankDepth;
    }
    if (map && !dm.texture && now >= dm.retryAt) {
      dm.texture = buildDepthTexture(map);
      if (dm.texture) uniforms.uScanDepth.value = dm.texture;
      else dm.retryAt = now + .5;
    }
    if (!dm.texture) { uniforms.uScanStrength.value = 0; return; }
    if (r.hold !== null) { uniforms.uScanProgress.value = r.hold; uniforms.uScanStrength.value = 1; return; }
    if (reduced) { uniforms.uScanStrength.value = 0; return; }
    if (r.next < 0) r.next = now + gap();
    if (now >= r.next && r.start < 0) {
      // The board's own Neon Horizon scan owns the screen while it runs.
      if (document.querySelector('.board-canvas.is-scanning')) r.next = now + 4;
      else { r.start = now; r.next = now + SCAN_S + gap(); }
    }
    if (r.start < 0) return;
    const t = (now - r.start) / SCAN_S;
    if (t >= 1) { r.start = -1; uniforms.uScanStrength.value = 0; return; }
    uniforms.uScanProgress.value = THREE.MathUtils.lerp(SCAN_FROM, SCAN_TO, 1 - (1 - t) * (1 - t));
    uniforms.uScanStrength.value = Math.min(1, t / .06, (1 - t) / .15);
  });
  return null;
}
