import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { boardSideHealth, sideLightScale } from './boardMaterials';
import { usePlayerColors } from './playerTheme';
import { GLASS_OUTLINE } from './neonTableGeometry';
import { acquireNeonFrost, neonFrostTexture, releaseNeonFrost } from './neonFrost';
import { DEFAULT_GLASS_SCRATCH, GLASS_SCRATCH_ASPECT, glassScratch, glassScratchTexture } from './neonGlassScratch';
import { glintGlsl, glintUniforms } from './neonGlint';
import { liquidLookGlsl } from './neonLiquidLook';
import { useNeonRig } from './realLighting';

export const MAX_OUTLINE = 160;
/** Index of refraction of the Liquid surface's glass; LiquidGlass refracts the floor seen through it by the same amount. */
export const LIQUID_IOR = 1.5;
type Outline = readonly (readonly [number, number])[];
const NO_HOLE: Outline = [];
const NO_WALL = [0, -1] as const;

/** Signed distance to a table outline passed as uniforms (see outlineUniforms); negative inside. */
export const outlineGlsl = /* glsl */`
uniform vec2 uPoly[${MAX_OUTLINE}];
uniform int uPolyCount, uHoleStart;

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Outer contour [0, uHoleStart) and optional hole contour [uHoleStart, uPolyCount); negative inside.
float outlineDist(vec2 p) {
  float d = 1e6;
  bool inside = false;
  for (int i = 0; i < ${MAX_OUTLINE}; i++) {
    if (i >= uPolyCount) break;
    bool outer = i < uHoleStart;
    int last = outer ? uHoleStart - 1 : uPolyCount - 1;
    vec2 a = uPoly[i], b = uPoly[i == last ? (outer ? 0 : uHoleStart) : i + 1];
    d = min(d, sdSegment(p, a, b));
    if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside ? -d : d;
}`;

/** Uniforms for outlineGlsl: an outer contour and an optional hole. */
export function outlineUniforms(outline: Outline, hole: Outline = NO_HOLE) {
  return {
    uPoly: { value: outlineVectors([...outline, ...hole]) },
    uPolyCount: { value: Math.min(outline.length + hole.length, MAX_OUTLINE) },
    uHoleStart: { value: Math.min(outline.length, MAX_OUTLINE) },
  };
}

const glassVertex = /* glsl */`
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vModelXZ;
#ifdef REAL_LIGHTING
varying vec3 vViewPos, vViewNormal;
#endif
void main() {
  vModelXZ = position.xy;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
#ifdef REAL_LIGHTING
  vViewPos = (viewMatrix * world).xyz;
  vViewNormal = mat3(viewMatrix) * vNormal;
#endif
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

/**
 * Real lighting: the light arriving at a view-space point from the scene's own lights, read from three's light
 * uniforms. `facing` is the irradiance on a surface with normal N, area lights horizon-clipped exactly as three's
 * standard materials do, so the glass and the floor agree; `omni` is what arrives from every direction, for light
 * caught inside the glass.
 */
const rigLightGlsl = /* glsl */`
vec3 rigEdge(vec3 v1, vec3 v2) {
  float x = dot(v1, v2), y = abs(x);
  float a = .8543985 + (.4965155 + .0145206 * y) * y, b = 3.417594 + (4.1616724 + y) * y, v = a / b;
  return cross(v1, v2) * (x > 0.0 ? v : .5 * inversesqrt(max(1.0 - x * x, 1e-7)) - v);
}
void rigLight(vec3 P, vec3 N, out vec3 facing, out vec3 omni) {
  // Point-like lights carry three's Lambert 1/pi here; the area-light form factor below already includes it.
  facing = ambientLightColor;
  omni = ambientLightColor;
#if NUM_HEMI_LIGHTS > 0
  for (int i = 0; i < NUM_HEMI_LIGHTS; i++) {
    facing += getHemisphereLightIrradiance(hemisphereLights[i], N);
    omni += .5 * (hemisphereLights[i].skyColor + hemisphereLights[i].groundColor);
  }
#endif
#if NUM_DIR_LIGHTS > 0
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    facing += directionalLights[i].color * max(dot(N, directionalLights[i].direction), 0.0);
    omni += directionalLights[i].color * .5;
  }
#endif
#if NUM_POINT_LIGHTS > 0
  for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
    vec3 L = pointLights[i].position - P;
    float d = length(L);
    vec3 c = pointLights[i].color * getDistanceAttenuation(d, pointLights[i].distance, pointLights[i].decay);
    facing += c * max(dot(N, L / max(d, 1e-4)), 0.0);
    omni += c;
  }
#endif
  facing *= RECIPROCAL_PI;
  omni *= RECIPROCAL_PI;
#if NUM_RECT_AREA_LIGHTS > 0
  for (int i = 0; i < NUM_RECT_AREA_LIGHTS; i++) {
    RectAreaLight l = rectAreaLights[i];
    vec3 c0 = l.position + l.halfWidth - l.halfHeight, c1 = l.position - l.halfWidth - l.halfHeight;
    vec3 c2 = l.position - l.halfWidth + l.halfHeight, c3 = l.position + l.halfWidth + l.halfHeight;
    if (dot(cross(c1 - c0, c3 - c0), P - c0) < 0.0) continue;
    vec3 v0 = normalize(c0 - P), v1 = normalize(c1 - P), v2 = normalize(c2 - P), v3 = normalize(c3 - P);
    // Three evaluates in a left-handed frame, so its vector form factor is this one negated.
    vec3 f = -(rigEdge(v0, v1) + rigEdge(v1, v2) + rigEdge(v2, v3) + rigEdge(v3, v0));
    float len = length(f), z = dot(f, N);
    facing += l.color * max((len * len + z) / (len + 1.0), 0.0);
    omni += l.color * len;
  }
#endif
}`;

const glassFragment = /* glsl */`
#ifdef REAL_LIGHTING
#include <common>
#include <lights_pars_begin>
varying vec3 vViewPos, vViewNormal;
uniform float uGlassGlow, uGlassBody, uFloorArt, uFloorTone;
${rigLightGlsl}
#endif
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vModelXZ;
uniform sampler2D tFloor;
uniform sampler2D tFloorSharp;
uniform mat4 uFloorInverse;
uniform vec2 uFloorSize;
uniform vec3 uCameraPosition, uCameraDirection, uAccent0, uAccent1, uOwnerAccent;
uniform float uFloorY, uHasFloor, uOrtho, uVariant, uHealth0, uHealth1, uOwnerHealth, uGrain;
uniform float uModelSpace;
uniform sampler2D tScratch;
uniform float uScratch, uScratchScale, uScratchCut, uScratchAspect;
uniform vec2 uScratchRot;
uniform vec2 uWall;
uniform float uOpacity;
// Matte deck: linear albedo under real lighting plus a base shade so the grey still reads where the rig barely reaches
// the table's middle, and the unlit studio shade (all blue-leaning, so it reads cool).
const vec3 MATTE_ALBEDO = vec3(.28, .295, .325);
const vec3 MATTE_BASE = vec3(.011, .012, .0138);
const vec3 MATTE_STUDIO = vec3(.03, .034, .041);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

${outlineGlsl}

// Distance to the nearest corner of the outer contour.
float cornerDist(vec2 p) {
  float d = 1e6;
  for (int i = 0; i < ${MAX_OUTLINE}; i++) {
    if (i >= uHoleStart) break;
    d = min(d, length(p - uPoly[i]));
  }
  return d;
}

vec3 hueRotate(vec3 c, float a) {
  const vec3 k = vec3(.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

float tightLine(float x, float w) {
  float aa = max(fwidth(x), .0015);
  return 1.0 - smoothstep(w - aa, w + aa, abs(x));
}
${glintGlsl}

// Key light from the front left with a weaker fill from the right, as seen by edges facing \`outward\` (world x/z).
const vec2 KEY_DIR = vec2(-.92, .39), FILL_DIR = vec2(.8, .6);
const vec3 KEY_LIGHT = vec3(-.85, .45, .3) / 1.0234;
float edgeLight(vec2 outward) {
  return .22 + .78 * max(dot(outward, KEY_DIR), 0.0) + .3 * max(dot(outward, FILL_DIR), 0.0);
}

// Outward direction of the nearest pane edge: from the surface normal on bevels and walls, otherwise from how the
// distance to the edge changes across the pixel. Call from uniform control flow (it takes screen derivatives).
vec2 edgeOutward(vec2 p, float depth, vec3 normal) {
  vec2 dDepth = vec2(dFdx(depth), dFdy(depth));
  mat2 J = mat2(dFdx(p), dFdy(p));
  float tilt = length(normal.xz);
  if (tilt > .2) return normal.xz / tilt;
  vec2 g = abs(determinant(J)) > 1e-12 ? inverse(transpose(J)) * dDepth : vec2(0.0);
  return dot(g, g) > 1e-6 ? -normalize(g) : vec2(0.0, 1.0);
}

#ifdef LIQUID
${liquidLookGlsl(MAX_OUTLINE)}
// The Liquid surface's Apple glass look over the frame's bars and the walls' outer faces (not the flat cap). Called
// whatever the amount, as its strip takes screen derivatives; at amount 0 it returns c unchanged.
vec3 glassLiquid(vec3 c, vec3 normal, float faceSign, float variantFrame, float variantWall, vec3 accent) {
  float amount = variantFrame + variantWall * step(0.0, faceSign) * (1.0 - smoothstep(.5, .9, abs(normal.y)));
  return liquidLook(c, vWorld, uWall, variantWall, accent, amount, 1.0 / uOpacity);
}
#endif

void main() {
  // The hollow chassis is drawn double-sided, so its walls seen from inside, through the frame, shade by their inner face.
  float faceSign = gl_FrontFacing ? 1.0 : -1.0;
  vec3 normal = normalize(vNormal) * faceSign;
  vec3 ray = normalize(mix(vWorld - uCameraPosition, uCameraDirection, uOrtho));
#ifdef LIQUID
  // Refracted into the glass as the liquid glass material bends it, so the floor seen through the bevels and the
  // walls bends with their curve.
  vec3 seenRay = refract(ray, normal, ${(1 / LIQUID_IOR).toFixed(4)});
  if (dot(seenRay, seenRay) < .5) seenRay = ray;
#else
  vec3 seenRay = ray;
#endif
  float travel = (uFloorY - vWorld.y) / min(seenRay.y, -.025);
  vec2 floorWorld = (uFloorInverse * vec4(vWorld + seenRay * travel, 1.0)).xy / uFloorSize + .5;
  vec3 blurred = texture2D(tFloor, floorWorld).rgb * uHasFloor;
  vec3 sharp = texture2D(tFloorSharp, floorWorld).rgb * uHasFloor;

  float facing = clamp(normal.y, 0.0, 1.0);
  float broad = sin(vWorld.x * 1.55 + vWorld.z * .68) * sin(vWorld.z * 1.08 - vWorld.x * .41);
  float view = clamp(dot(normal, -ray), 0.0, 1.0);
  float glancing = pow(1.0 - view, 3.2);

  float variantLane = step(0.5, uVariant) * (1.0 - step(1.5, uVariant));
  float variantFrame = step(1.5, uVariant) * (1.0 - step(2.5, uVariant));
  float variantWall = step(2.5, uVariant) * (1.0 - step(3.5, uVariant));
  float variantDeck = 1.0 - step(0.5, uVariant);
  float edgeD = outlineDist(uModelSpace > .5 ? vModelXZ : vWorld.xz);
  float depth = max(-edgeD, 0.0);

  float zSide = step(0.0, vWorld.z);
  vec3 sideAccent = mix(uAccent1, uAccent0, zSide);
  float sideHealth = mix(uHealth1, uHealth0, zSide);

  if (uVariant > 3.5) {
    // Matte deck: flat dark cool grey, only a faint mottle and grain so the large field doesn't band.
    float mottle = (vnoise(vWorld.xz * 1.3) - .5) * .12 + (hash(floor(vWorld.xz * 90.0)) - .5) * .04;
#ifdef REAL_LIGHTING
    vec3 surfE, omniE;
    rigLight(vViewPos, normalize(vViewNormal) * faceSign, surfE, omniE);
    gl_FragColor = vec4(min((MATTE_ALBEDO * surfE + MATTE_BASE) * (1.0 + mottle), vec3(24.0)), 1.0);
#else
    vec3 matte = MATTE_STUDIO * (1.0 + mottle) + sideAccent * tightLine(depth - .02, .008) * .22 * sideHealth;
    gl_FragColor = vec4(min(matte, vec3(.42)), 1.0);
#endif
    return;
  }

  // Vertical edges of the wall, where its faces meet.
  float corner = variantWall > .5 ? exp(-cornerDist(vWorld.xz) * 45.0) * (1.0 - facing) : 0.0;
  // A wall's inner face, seen from inside through the frame (not the chassis floor).
  float innerWall = variantWall * (1.0 - step(0.0, faceSign)) * (1.0 - smoothstep(.3, .7, abs(normal.y)));

  vec3 pigment = mix(vec3(.018, .042, .058), vec3(.014, .022, .034) + uOwnerAccent * .012, variantLane);
  pigment = mix(pigment, vec3(.03, .035, .04), variantFrame);
  float frostMix = mix(mix(.18, .045, variantLane), .45, variantFrame);
  vec3 color = pigment + blurred * frostMix + sharp * .42 * variantFrame;
  color += vec3(.003, .009, .012) * broad * (1.0 + variantFrame);

  // Etched-glass frost: fine grain whose density and brightness drift in broad patches, sparse bright
  // points and faint scratches, lit by whatever shines up through the pane and by its glowing edges.
  // Walls run the grain along their face instead of smearing one xz sample down their height.
  vec2 w = variantWall > .5 ? vec2(vWorld.x - vWorld.z, vWorld.y * 1.5) : vWorld.xz;
  float patchy = vnoise(w * .8) * .6 + vnoise(w * 2.3 + 5.0) * .4;
  float fine = hash(floor(w * 52.0)) * .55 + hash(floor(w * 26.0 + 9.0)) * .45;
  float speck = step(.993 - patchy * .012, hash(floor(w * 70.0 + 3.0)));
  float scratch = smoothstep(.8, .97, vnoise(vec2(dot(w, vec2(.83, .56)) * 4.0, dot(w, vec2(-.56, .83)) * 60.0))) * smoothstep(.6, .85, vnoise(w * 2.1 + 11.0))
                + smoothstep(.82, .97, vnoise(vec2(dot(w, vec2(.31, -.95)) * 5.0, dot(w, vec2(.95, .31)) * 70.0))) * smoothstep(.65, .9, vnoise(w * 1.7 + 23.0));
  float through = .35 + dot(blurred, vec3(.3, .5, .2)) * 6.0 + exp(-depth * 6.0) * 1.2;
  float frostAmp = mix(mix(1.0, .8, variantLane), 1.6, variantFrame) * uGrain;
  vec3 grain = vec3(.6, .85, 1.0) * ((fine - .5) * .022 * (.35 + patchy * 1.3) + speck * .05 * patchy + scratch * .012) * through * frostAmp;

  // Scratched-glass photo, on the white frame glass only: its black ground is dropped below uScratchCut so only
  // the white marks add light.
  float marks = 0.0;
  if (uScratch > 0.0 && variantFrame > .5) {
    vec2 sw = mat2(uScratchRot.x, -uScratchRot.y, uScratchRot.y, uScratchRot.x) * w;
    vec2 suv = vec2(sw.x, sw.y * uScratchAspect) / uScratchScale + .5;
    marks = smoothstep(uScratchCut, 1.0, texture2D(tScratch, suv).r) * uScratch;
    grain += vec3(.82, .93, 1.0) * marks * .6 * (.6 + .25 * through);
  }
  color += grain;

#ifdef REAL_LIGHTING
  {
    vec3 surfE, omniE;
    rigLight(vViewPos, normalize(vViewNormal) * faceSign, surfE, omniE);
    // The steel floor seen through the pane: lit by the same tubes that light the pane, falling off over the drop to it.
    vec3 art = mix(blurred, sharp, .5 * variantFrame + .6 * variantWall);
    vec3 under = mix(vec3(.55), art, uFloorArt) * uFloorTone * omniE * .35 * uHasFloor;
    float t = clamp((uWall.x - vWorld.y) / (uWall.x - uWall.y), 0.0, 1.0);
    float crestD = (depth - .014) / .009;
    float crest = exp(-crestD * crestD);
    vec3 albedo = mix(mix(vec3(.05, .065, .08), vec3(.035, .045, .06) + uOwnerAccent * .015, variantLane), vec3(.4, .44, .48), variantFrame);
    albedo = mix(albedo, vec3(.22, .26, .3), variantWall);
    float transmit = mix(mix(mix(.55, .25, variantLane), .3, variantFrame), .4, variantWall);
    float frostSpark = max(((fine - .5) * .03 * (.35 + patchy * 1.3) + speck * .08 * patchy + scratch * .02) * uGrain + marks * .25, 0.0);
    // Lit-up glass: light caught inside the pane runs through it and escapes where the glass breaks (its edges, the
    // polished bevel crest, frost and scratches), so each pane glows with the neon that feeds it and stays dark away from it.
    float escape = uGlassBody * mix(.04, .12, max(variantFrame, variantWall))
      + exp(-depth * 14.0) * .25 * (1.0 - variantWall)
      + crest * .8 * variantFrame
      + (1.0 - facing) * .15
      + variantWall * (exp(-t * 30.0) * .5 + exp(-(1.0 - t) * 30.0) * .12 + uGlassBody * .1)
      + frostSpark * 3.0;
    vec3 lit = albedo * surfE + under * transmit + omniE * escape * uGlassGlow;
    // Light carried to the wall's bottom edge and its corners, compressed so a tube right beside them can't blow them out.
    vec3 caught = omniE * uGlassGlow;
    caught /= 1.0 + caught * .6;
    lit += caught * variantWall * (exp(-(1.0 - t) * 30.0) * .45 + corner * .35);
    // Light running along the glass escapes at both lips of the inner face, brightest along the bottom edge.
    lit += caught * innerWall * (.12 + exp(-t * 28.0) * .5 + exp(-(1.0 - t) * 22.0) * .9);
    vec3 sparkle = variantFrame > .5 ? glassGlint(vWorld.xz, min(marks + scratch * .5 + speck * .6, 1.0)) * .5 + edgeSparkles(vWorld.xz, depth, .014) : vec3(0.0);
    vec3 litOut = min(lit, vec3(24.0));
#ifdef LIQUID
    litOut = glassLiquid(litOut, normal, faceSign, variantFrame, variantWall, sideAccent);
#endif
    gl_FragColor = vec4(litOut + sparkle / uOpacity, uOpacity);
    return;
  }
#endif

  if (variantDeck > .5) {
    // Grade: 5% brighter, hue turned 5% of the wheel (18°) toward green, 10% less saturated.
    color = hueRotate(color * 1.05, -.314);
    color = mix(vec3(dot(color, vec3(.2126, .7152, .0722))), color, .9);
    // A single crisp owner-coloured line just inside the pane edge.
    color += sideAccent * tightLine(depth - .02, .008) * .22 * sideHealth;
  }

  if (variantFrame > .5) {
    // Milky, see-through white glass with a tight polished bevel: one narrow crest highlight that
    // falls off smoothly into the body; the outer edge sits flush on the wall with no dark seam.
    // The crest brightens on edges facing the key light and dims on those turned away, and the rounded bevel
    // throws a fine specular glint where it reflects that light.
    vec3 white = vec3(.88, .96, 1.0);
    float crestD = (depth - .014) / .009;
    float crest = exp(-crestD * crestD);
    float lit = edgeLight(edgeOutward(vWorld.xz, depth, normal));
    float onBevel = smoothstep(.02, .25, length(normal.xz));
    float glint = pow(max(dot(reflect(ray, normal), KEY_LIGHT), 0.0), 12.0) * onBevel;
    color += white * (.07 + exp(-depth * 30.0) * .08 + crest * .42 * mix(.45, 1.4, lit) + glint * .5);
    color += white * glancing * facing * .08;
  }

  if (variantLane > .5) {
    color = mix(color, pigment, smoothstep(-0.02, 0.12, edgeD));
  }

  color += vec3(.014, .042, .055) * glancing * facing * (1.0 - variantFrame);
  // Slab sides read as lit glass edges.
  vec3 sideFace = mix(mix(sideAccent * sideHealth, uOwnerAccent * uOwnerHealth, variantLane), vec3(.8, .9, 1.0), variantFrame);
  color += sideFace * (1.0 - facing) * (mix(.03, .16, variantFrame) + .04 * glancing);

  if (variantWall > .5) {
    // The table's thickness as one block of white glass under the frame: the floor shows through it,
    // slightly refracted and dimming with depth, light from the frame pools along the top, and the
    // bevels catch it as bright polished edges.
    float t = clamp((uWall.x - vWorld.y) / (uWall.x - uWall.y), 0.0, 1.0);
    vec3 seen = texture2D(tFloorSharp, floorWorld + normal.xz * .02).rgb * uHasFloor;
    vec3 white = vec3(.86, .95, 1.0);
    // Tinted through with the primary player's colour; the polished bevels stay whiter.
    vec3 tint = uAccent0 / max(max(uAccent0.r, uAccent0.g), max(uAccent0.b, .001));
    float slope = abs(normal.y);
    float bevel = smoothstep(.05, .55, slope) * (1.0 - smoothstep(.75, .99, slope));
    float upper = step(0.0, normal.y);
    color = (vec3(.03, .04, .05) + seen * .32 * (1.0 - .45 * t) + blurred * .3
          + white * (.06 + exp(-t * 7.0) * .12 + exp(-(1.0 - t) * 14.0) * .12)
          + white * glancing * .08) * mix(vec3(1.0), tint, .75)
          // Tight rounded edges: a narrow highlight where the top and bottom bevels catch the light.
          + white * (exp(-t * 40.0) * .28 + exp(-(1.0 - t) * 40.0) * .28 + corner * .3 + bevel * mix(.06, .14, upper)) * mix(vec3(1.0), tint, .35)
          + grain * 1.3;
    // Each face takes its own shade as the edge turns: faces toward the key light lighter and greyer, faces away
    // deeper in the tint; the top lip highlight follows the same light.
    float lit = edgeLight(edgeOutward(vWorld.xz, 1.0, normal));
    float rightSide = smoothstep(-.5, .5, vWorld.x);
    color *= mix(mix(.05, .2, rightSide), 1.7, pow(lit, 2.5)) * mix(mix(.52, 1.0, rightSide), 1.0, smoothstep(.5, .65, lit));
    color = mix(color, vec3(dot(color, vec3(.2126, .7152, .0722))), .3 * lit);
    color += white * exp(-t * 30.0) * .3 * lit * lit;
    // The ledge between the frame and the wall is a dark glass step, not another lit band.
    vec3 ledge = (vec3(.02, .03, .04) + seen * .16 + blurred * .18) * mix(vec3(1.0), tint, .6) + grain;
    color = mix(color, ledge, smoothstep(.97, .995, normal.y));
    color += white * innerWall * (.04 + exp(-t * 28.0) * .18 + exp(-(1.0 - t) * 22.0) * .32) * mix(vec3(1.0), tint, .5);
  }

  // Frame and wall stay under the bloom threshold so their edges read as polished glass, not light.
  float cap = variantLane > .5 ? .36 : (variantFrame + variantWall > .5 ? .85 : .42);
  // The passing glint lights only the white frame glass, and sits on top of the cap so it can just reach the bloom.
  // It is light on the pane rather than seen through it, so the frame's translucency doesn't dim it.
  vec3 glint = variantFrame > .5 ? glassGlint(vWorld.xz, min(marks + scratch * .5 + speck * .6, 1.0)) + edgeSparkles(vWorld.xz, depth, .014) : vec3(0.0);
  vec3 outColor = min(color, vec3(cap));
#ifdef LIQUID
  outColor = glassLiquid(outColor, normal, faceSign, variantFrame, variantWall, sideAccent);
#endif
  gl_FragColor = vec4(outColor + glint / uOpacity, uOpacity);
}`;

type NeonGlassProps = {
  /**
   * deck: field under the lanes; lane: lane bed; frame: the white glass table frame; wall: the table's thickness under it;
   * matte: the field under the lanes as dark cool-grey matte, with no frost, sheen or see-through.
   */
  variant?: 'deck' | 'lane' | 'frame' | 'wall' | 'matte';
  /** wall: world Y of the wall's top and bottom. */
  wall?: readonly [top: number, bottom: number];
  /** Lane owner; tints the lane bed. */
  side?: number;
  /** Polygon whose edges light the pane. World XZ by default, or the mesh's shape plane. */
  outline?: Outline;
  /** Cut-out contour inside `outline`, in the same space. */
  hole?: Outline;
  space?: 'world' | 'model';
  /** Strength of the frost grain, specks and scratches; 1 is the full etched look. */
  grain?: number;
  /** Under 1 the pane is see-through, so the real geometry beneath it (the chassis walls) shows. */
  opacity?: number;
  /** Shade both faces; back faces take their inner normal. */
  twoSided?: boolean;
  /**
   * Refract the floor seen through the pane as the Liquid surface's glass does (see neonLiquid), and lay its Apple
   * glass look over the frame and walls (see neonLiquidLook).
   */
  liquid?: boolean;
};

function outlineVectors(points: Outline) {
  if (points.length > MAX_OUTLINE) console.warn(`Neon glass outline has ${points.length} points; only ${MAX_OUTLINE} are used.`);
  return Array.from({ length: MAX_OUTLINE }, (_, i) => new THREE.Vector2(points[i]?.[0] ?? 0, points[i]?.[1] ?? 0));
}

type FloorSource = { mesh: THREE.Mesh | null; next: number; frame: number; inverse: THREE.Matrix4; y: number };
const floorSources = new WeakMap<THREE.Scene, FloorSource>();
const _floorPosition = new THREE.Vector3();
function floorSource(scene: THREE.Scene, now: number): FloorSource {
  let source = floorSources.get(scene);
  if (!source) {
    source = { mesh: null, next: 0, frame: -1, inverse: new THREE.Matrix4(), y: -.96 };
    floorSources.set(scene, source);
  }
  if (now >= source.next || (source.mesh && !source.mesh.parent)) {
    let mesh: THREE.Mesh | null = null;
    scene.traverse(object => {
      if (object.visible && object.userData?.scanBackground && (object as THREE.Mesh).isMesh) mesh = object as THREE.Mesh;
    });
    source.mesh = mesh;
    source.next = now + .5;
  }
  if (source.mesh && source.frame !== now) {
    source.mesh.updateWorldMatrix(true, false);
    source.inverse.copy(source.mesh.matrixWorld).invert();
    source.y = source.mesh.getWorldPosition(_floorPosition).y;
    source.frame = now;
  }
  return source;
}

const REAL_LIGHTING_DEFINES = { REAL_LIGHTING: '' };
const LIQUID_DEFINES = { LIQUID: '' };

function variantUniform(v: NeonGlassProps['variant']) {
  if (v === 'lane') return 1;
  if (v === 'frame') return 2;
  if (v === 'wall') return 3;
  if (v === 'matte') return 4;
  return 0;
}

export function NeonGlassMaterial({ variant = 'deck', side, outline = GLASS_OUTLINE, hole = NO_HOLE, space = 'world', wall = NO_WALL, grain = 1, opacity = 1, twoSided = false, liquid = false }: NeonGlassProps) {
  const { scene, camera, gl } = useThree();
  const colors = usePlayerColors();
  const rig = useNeonRig();
  const rigRef = useRef(rig);
  rigRef.current = rig;
  const lit = rig !== null;
  const transparent = opacity < 1;
  const frost = useRef<ReturnType<typeof acquireNeonFrost> | null>(null);
  const fallback = useMemo(() => {
    const texture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    texture.needsUpdate = true;
    return texture;
  }, []);
  const uniforms = useMemo(() => ({
    ...(lit ? THREE.UniformsUtils.clone(THREE.UniformsLib.lights) : {}),
    uGlassGlow: { value: 1 },
    uGlassBody: { value: .5 },
    uFloorArt: { value: .8 },
    uFloorTone: { value: .3 },
    tFloor: { value: fallback as THREE.Texture },
    tFloorSharp: { value: fallback as THREE.Texture },
    uFloorInverse: { value: new THREE.Matrix4() },
    uFloorSize: { value: new THREE.Vector2(16, 16 / (16 / 9)) },
    uFloorY: { value: -.96 },
    uHasFloor: { value: 0 },
    uCameraPosition: { value: new THREE.Vector3() },
    uCameraDirection: { value: new THREE.Vector3(0, -1, 0) },
    uOrtho: { value: 1 },
    uAccent0: { value: new THREE.Color('#24dbf4') },
    uAccent1: { value: new THREE.Color('#ff0ba1') },
    uHealth0: { value: 1 },
    uHealth1: { value: 1 },
    uVariant: { value: variantUniform(variant) },
    uGrain: { value: grain },
    ...outlineUniforms(outline, hole),
    uModelSpace: { value: space === 'model' ? 1 : 0 },
    uOwnerAccent: { value: new THREE.Color('#24dbf4') },
    uOwnerHealth: { value: 1 },
    tScratch: { value: fallback as THREE.Texture },
    uScratch: { value: 0 },
    uScratchScale: { value: DEFAULT_GLASS_SCRATCH.scale },
    uScratchCut: { value: DEFAULT_GLASS_SCRATCH.cutoff },
    uScratchAspect: { value: GLASS_SCRATCH_ASPECT },
    uScratchRot: { value: new THREE.Vector2(1, 0) },
    uWall: { value: new THREE.Vector2(wall[0], wall[1]) },
    uOpacity: { value: opacity },
    ...glintUniforms,
  }), [fallback, variant, outline, hole, space, wall, lit]);
  // Built here rather than as JSX: R3F would copy new uniforms onto the compiled material, swapping three's filled
  // light arrays for empty ones, so a prop change would crash the next upload. New uniforms get a new material.
  const glass = useMemo(() => new THREE.ShaderMaterial({
    uniforms, vertexShader: glassVertex, fragmentShader: glassFragment,
    lights: lit, defines: { ...(lit ? REAL_LIGHTING_DEFINES : {}), ...(liquid ? LIQUID_DEFINES : {}) },
    depthWrite: true, depthTest: true, toneMapped: false,
    transparent, side: twoSided ? THREE.DoubleSide : THREE.FrontSide,
  }), [uniforms, lit, transparent, twoSided, liquid]);
  useEffect(() => () => glass.dispose(), [glass]);
  useEffect(() => () => fallback.dispose(), [fallback]);
  useEffect(() => {
    const resource = acquireNeonFrost(scene, gl);
    frost.current = resource;
    return () => {
      if (frost.current === resource) frost.current = null;
      releaseNeonFrost(scene, resource);
    };
  }, [scene, gl]);
  useFrame(({ clock }) => {
    const u = uniforms;
    u.uVariant.value = variantUniform(variant);
    u.uGrain.value = grain;
    u.uOpacity.value = opacity;
    const source = floorSource(scene, clock.elapsedTime);
    const floor = source.mesh;
    const material = floor?.material;
    const floorMap = material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshStandardMaterial ? material.map : null;
    const blurred = frost.current ? neonFrostTexture(frost.current, floorMap, clock.elapsedTime) : null;
    u.tFloor.value = blurred ?? fallback;
    u.uHasFloor.value = blurred ? 1 : 0;
    u.tFloorSharp.value = (blurred && floorMap) || fallback;
    if (floor) {
      u.uFloorInverse.value.copy(source.inverse);
      u.uFloorY.value = source.y;
    }
    camera.getWorldDirection(u.uCameraDirection.value);
    u.uCameraPosition.value.copy(camera.position);
    u.uOrtho.value = camera instanceof THREE.OrthographicCamera ? 1 : 0;
    u.uAccent0.value.set(colors[0].accent);
    u.uAccent1.value.set(colors[1].accent);
    u.uHealth0.value = sideLightScale(boardSideHealth.x);
    u.uHealth1.value = sideLightScale(boardSideHealth.y);
    const owner = side ?? 0;
    u.uOwnerAccent.value.set(colors[owner].accent);
    u.uOwnerHealth.value = sideLightScale(owner === 0 ? boardSideHealth.x : boardSideHealth.y);
    const scratch = glassScratchTexture(glassScratch.texture);
    u.tScratch.value = scratch ?? fallback;
    u.uScratch.value = scratch ? glassScratch.strength : 0;
    u.uScratchScale.value = Math.max(glassScratch.scale, .1);
    u.uScratchCut.value = Math.min(glassScratch.cutoff, .98);
    const angle = THREE.MathUtils.degToRad(glassScratch.rotation);
    u.uScratchRot.value.set(Math.cos(angle), Math.sin(angle));
    const settings = rigRef.current;
    if (settings) {
      u.uGlassGlow.value = settings.glassGlow;
      u.uGlassBody.value = settings.glassBody;
      u.uFloorArt.value = settings.artMix;
      u.uFloorTone.value = settings.tone;
    }
  });
  return <primitive object={glass} attach="material" />;
}

const seamVertex = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const seamFragment = /* glsl */`
varying vec2 vUv;
uniform vec3 uColor;
uniform float uStrength, uTime, uProfile, uFlow, uEtch;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(vec2(i, 7.0)), hash(vec2(i + 1.0, 7.0)), f);
}

void main() {
  // Signed across the line: +-1 at its edges, beyond that over the etch pad.
  float s = (vUv.y - 0.5) * 2.0;
  float t = abs(s);
  float aa = max(fwidth(t), 0.002);
  float profile = uProfile;
  float alpha = 0.0;
  vec3 col = uColor;

  if (profile < 0.5) {
    float coreW = 0.30;
    float core = 1.0 - smoothstep(coreW - aa, coreW + aa, t);
    float halo = exp(-t * t * 5.5) * (1.0 - core) * 0.5;
    alpha = core + halo;
    col = mix(uColor, vec3(1.0), core * 0.42);
  } else if (profile < 1.5) {
    alpha = exp(-t * t * 3.2);
  } else {
    alpha = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, t);
  }

  float flow = 1.0;
  if (uFlow > 0.5) {
    flow = 1.0 + 0.1 * sin(vUv.x * 2.4 + uTime * 0.65);
  }

  // Etched groove: light scatters unevenly through the frosted cut, the wall facing up-left on screen
  // throws a thin shadow just outside the line, and the opposite lip catches a sliver of light.
  vec2 across = vec2(dFdx(vUv.y), dFdy(vUv.y));
  float shadowSide = step(0.0, dot(across, vec2(-0.35, 1.0)) * s);
  float edgePx = (t - 1.0) / max(fwidth(s), 1e-4);
  float frost = vnoise(vUv.x * 38.0) * 0.6 + hash(floor(vec2(vUv.x * 140.0, s * 2.0))) * 0.4;
  alpha *= mix(1.0, (0.62 + 0.7 * frost) * (1.0 - 0.35 * shadowSide * smoothstep(-2.5, 0.0, edgePx)), uEtch);
  float shadow = shadowSide * smoothstep(-1.0, 0.0, edgePx) * (1.0 - smoothstep(0.4, 1.9, edgePx));
  float lip = (1.0 - shadowSide) * exp(-(edgePx - 0.5) * (edgePx - 0.5) * 1.6);

  float luminance = dot(col, vec3(.2126, .7152, .0722));
  float chromaScale = clamp(.86 / max(luminance, .18), .85, 3.3);
  vec3 rgb = col * chromaScale * uStrength * flow * alpha + vec3(0.8, 0.92, 1.0) * lip * 0.16 * uEtch * min(uStrength, 1.0);
  gl_FragColor = vec4(rgb, shadow * 0.5 * uEtch);
}`;

type NeonEdgeProps = { side?: number; strength?: number; color?: string };
/** `etched` (default) cuts the line into the glass it sits on: uneven frost, a shadow wall and a lit lip. */
export type NeonSeamProps = NeonEdgeProps & { profile?: 'laser' | 'soft' | 'solid'; flow?: boolean; etched?: boolean };

function profileUniform(p: NeonSeamProps['profile']) {
  if (p === 'soft') return 1;
  if (p === 'solid') return 2;
  return 0;
}

function SeamShaderMaterial({ side, strength = 1, color, profile = 'laser', flow = false, etched = true }: NeonSeamProps) {
  const colors = usePlayerColors();
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const shader = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color('#27dbe9') },
    uStrength: { value: strength },
    uTime: { value: 0 },
    uProfile: { value: profileUniform(profile) },
    uFlow: { value: flow ? 1 : 0 },
    uEtch: { value: etched ? 1 : 0 },
  }), [strength, profile, flow, etched]);
  useFrame(({ clock }) => {
    if (!shader.current) return;
    const u = shader.current.uniforms as typeof uniforms;
    u.uColor.value.set(color ?? (side === undefined ? '#27dbe9' : colors[side].accent));
    const health = side === undefined ? 1 : sideLightScale(side === 0 ? boardSideHealth.x : boardSideHealth.y);
    u.uStrength.value = strength * health;
    u.uProfile.value = profileUniform(profile);
    u.uFlow.value = flow && !reduced ? 1 : 0;
    u.uTime.value = reduced ? 0 : clock.elapsedTime;
  });
  return (
    <shaderMaterial
      ref={shader}
      uniforms={uniforms}
      vertexShader={seamVertex}
      fragmentShader={seamFragment}
      transparent
      depthWrite={false}
      depthTest
      toneMapped={false}
      blending={THREE.CustomBlending}
      blendEquation={THREE.AddEquation}
      blendSrc={THREE.OneFactor}
      blendDst={THREE.OneMinusSrcAlphaFactor}
      blendSrcAlpha={THREE.ZeroFactor}
      blendDstAlpha={THREE.OneFactor}
    />
  );
}

export function NeonSeamMaterial(props: NeonSeamProps) {
  return <SeamShaderMaterial {...props} />;
}
