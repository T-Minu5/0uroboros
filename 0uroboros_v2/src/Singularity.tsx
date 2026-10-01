import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { toCanvas } from 'html-to-image';
import gsap from 'gsap';
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { warpFarZ } from './boardLayout';
/** Collapse ramp: the horizon opens slowly, then the board falls in. */
export const SINGULARITY_MS = { open: 2600, hold: 1400 } as const;

/** World-space extent the hole is sized against — the playable board, front rail to back rail. */
const BOARD_Z = { near: 4.34, far: warpFarZ(-3.775) } as const;
const BOARD_Y = 0.22;

/** Overall scale against the board's half-height. */
const SIZE = 2.7;
/** Horizon radius as a fraction of the board's on-screen half-height. */
const HORIZON = 0.36;

/** Ripple bursts mirror the server tubes: solo 50%, pair 30%, triple 20%, never more
 *  than three back-to-back. The gap between bursts is tightened here because the whole
 *  collapse only runs a few seconds. */
const RIPPLE_SLOTS = 4;
const RIPPLE_OFF = -1;
/** Slot age sentinel for a ripple that is neither swelling nor travelling. */
const RIPPLE_IDLE = -99;
const RIPPLE_SPEED = 0.55;
const burstSize = () => { const r = Math.random(); return r < 0.5 ? 1 : r < 0.8 ? 2 : 3; };
const burstGap = (more: boolean) => (more ? 0.16 + Math.random() * 0.12 : 0.8 + Math.random() * 1.2);
/** The horizon swells for PULSE_CHARGE_S, releases a ripple from its edge at the peak, then settles over
 *  PULSE_DECAY_S while the ring travels out. PULSE_AMP is the peak growth. */
const PULSE_AMP = 0.07;
const PULSE_CHARGE_S = 0.22;
const PULSE_DECAY_S = 0.16;
/** Pulse contribution of one ripple by age in seconds; negative ages are the swell before release. */
const pulseEnvelope = (age: number) => {
  if(age < 0){ const t = Math.max(0, 1 + age / PULSE_CHARGE_S); return t * t * (3 - 2 * t); }
  return Math.exp(-age / PULSE_DECAY_S);
};
/** Accretion palette sampled from the reference render: cream core, tan arcs, rust dust, umber shadow. */
const DUST = { hot: '#f4e7ca', rim: '#c39767', deep: '#8a5937', base: '#492918' } as const;
/** Light the hole throws off (glow, ripple crests, halo) when there's no winner to tint it. */
const GLOW_GOLD = new THREE.Color(DUST.rim).lerp(new THREE.Color(DUST.hot), 0.5);
const luminance = (c: THREE.Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
/** Winner's accent at the gold glow's luminance, so dim hues (blue, violet) glow as strongly as bright ones. */
function glowTint(hex?: string){
  if(!hex) return GLOW_GOLD.clone();
  const c = new THREE.Color(hex);
  return c.multiplyScalar(Math.min(luminance(GLOW_GOLD) / Math.max(luminance(c), 1e-4), 4));
}
/** Seconds to ease into a tint that changes while the hole is already open. */
const TINT_EASE_S = 0.35;
/** Deflection law, shared by the shader and the CSS stand-in so the two never drift apart. */
const DEFLECT = 2.2;
const PULL_CAP = 0.55;
/** Radius at which the deflection starts fading out, so nothing past the board edge moves. */
const INFLUENCE_IN = 0.55;
/** Disk inner edge, in horizon radii. Just outside the shadow, so the lensed far side hugs the hole
 *  and the band reaches the rim at the equator. */
const DISK_INNER = 1.05;
/** Lens strength of the direct image (far disk bent over the top) and of the secondary image (far
 *  disk's underside wrapped under the hole), in the first-order orbit below. */
const LENS_DIRECT = 1.0;
const LENS_SECONDARY = 1.65;
/** The shadow edge sits at an impact parameter of 3√3 M. */
const B_CRIT = 5.196;
/** Cloud-top height above the disk midplane, in horizon radii, and the share of it kept on the
 *  lensed arcs above the hole (seen nearly face-on through the lens). */
const DISK_LIFT = 0.26;
const LIFT_TOP = 0.1;
/** Static spiral wind of the cloud pattern (radians per horizon radius) and its rigid spin (rad/s).
 *  Rigid spin never winds the noise up, however long the hole stays open. */
const DISK_TWIST = 0.7;
const DISK_SPIN = 0.22;

/** Volumetric disk ported from the singularity.misterprada.com raymarcher, in its object space: the march
 *  starts on a unit sphere round the hole, the disk lies in z = 0 and anything inside `core` is swallowed.
 *  Steps are the reference's; halving them (and doubling `step`) covers the same depth but turns the disk grainy. */
const RM = { steps: 160, step: 0.0071, power: 0.3, core: 0.13 } as const;
/** Radius of the marched volume. The reference stops at 1; the disk here runs further out so it spans the
 *  screen, and past 1 rays run straight, so that shell is crossed in long steps. */
const RM_EXTENT = 1.6;
/** Camera distance. Further out than the reference's |(1, 0.5, 3)| so the wider disk doesn't balloon
 *  towards the camera. */
const RM_CAM_DIST = 5;
/** Tangent of the volume's angular radius from the camera: rays wider than this miss it entirely. */
const RM_SPHERE_TAN = RM_EXTENT / Math.sqrt(RM_CAM_DIST * RM_CAM_DIST - RM_EXTENT * RM_EXTENT);

export type SingularityQuality = 'raymarch' | 'lite';
/** Touch devices and small screens get the closed-form disk; the raymarch is too heavy for them. */
const defaultQuality = (): SingularityQuality =>
  window.matchMedia('(pointer: coarse)').matches || Math.min(window.screen.width, window.screen.height) < 600 ? 'lite' : 'raymarch';
function applyQuality(material: THREE.ShaderMaterial, quality: SingularityQuality){
  if(quality === 'raymarch') material.defines.SINGULARITY_RAYMARCH = 1;
  else delete material.defines.SINGULARITY_RAYMARCH;
  material.needsUpdate = true;
}

/**
 * Soft tileable RGB fbm the raymarch samples in place of the reference's noise texture: three independent
 * value-noise channels matched to its statistics (mean 0.733, sd 0.046, features ~0.06 uv across).
 */
function makeDiskNoise(size = 256){
  let seed = 0x2f6b1d;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const data = new Uint8Array(size * size * 4).fill(255);
  const field = new Float32Array(size * size);
  const ease = (f: number) => f * f * (3 - 2 * f);
  for(let ch = 0; ch < 3; ch++){
    field.fill(0);
    let amp = 1;
    for(let cells = 8; cells <= 64; cells *= 2, amp *= 0.6){
      const g = Float32Array.from({ length: cells * cells }, rand);
      for(let y = 0; y < size; y++){
        const fy = y * cells / size, iy = Math.floor(fy), v = ease(fy - iy);
        const y0 = iy * cells, y1 = ((iy + 1) % cells) * cells;
        for(let x = 0; x < size; x++){
          const fx = x * cells / size, ix = Math.floor(fx), u = ease(fx - ix), x1 = (ix + 1) % cells;
          const top = g[y0 + ix] + (g[y0 + x1] - g[y0 + ix]) * u;
          const bottom = g[y1 + ix] + (g[y1 + x1] - g[y1 + ix]) * u;
          field[y * size + x] += amp * (top + (bottom - top) * v);
        }
      }
    }
    let mean = 0, sq = 0;
    for(const f of field){ mean += f; sq += f * f; }
    mean /= field.length;
    const sd = Math.sqrt(sq / field.length - mean * mean) || 1;
    for(let i = 0; i < field.length; i++) data[i * 4 + ch] = Math.round(Math.min(Math.max(0.733 + 0.046 * (field[i] - mean) / sd, 0), 1) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const SINGULARITY_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    /** Rasterised Html HUD, warped alongside the scene so cards bend rather than just slide. */
    tHud: { value: null as THREE.Texture | null },
    uHudAmount: { value: 0 },
    /** Board centre in screen UV. */
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    /** Board half-height in screen UV-Y units; the whole effect is scaled against this. */
    uRadius: { value: 0.3 },
    uAspect: { value: 1 },
    /** Camera elevation above the disk plane, as its sine. Small values are near edge-on, which is what
     *  puts the dust band across the middle of the hole; 1.0 would be face-on with no band at all. */
    uSquash: { value: 0.2 },
    /** How much the cloud noise ruffles the disk silhouette. */
    uThickness: { value: 0.45 },
    uProgress: { value: 0 },
    uTime: { value: 0 },
    /** Horizon radius in board-half-height units. */
    uHorizon: { value: HORIZON },
    /** Emission of the direct image (near band and the far disk lensed over the top). */
    uDiskGain: { value: 0.9 },
    uRingGain: { value: 1.0 },
    /** Emission of the secondary image (the crescent under the hole). */
    uArcGain: { value: 1.0 },
    uHaloGain: { value: 0.3 },
    /** Extra emission on the near side of the disk only. */
    uDustGain: { value: 1.0 },
    uStreakGain: { value: 0.2 },
    /** Relativistic beaming: how much brighter the approaching side runs. */
    uDoppler: { value: 0.15 },
    /** Expanding ripple radii in screen units (half-screen-height = 0.5); negative is idle. */
    uRipples: { value: new THREE.Vector4(RIPPLE_OFF, RIPPLE_OFF, RIPPLE_OFF, RIPPLE_OFF) },
    uRippleAmp: { value: 0.02 },
    uRippleFreq: { value: 62 },
    uRippleWidth: { value: 0.05 },
    uRippleGain: { value: 0.09 },
    uHot: { value: new THREE.Color(DUST.hot) },
    uRim: { value: new THREE.Color(DUST.rim) },
    uDeep: { value: new THREE.Color(DUST.deep) },
    uBase: { value: new THREE.Color(DUST.base) },
    uTint: { value: GLOW_GOLD.clone() },
    /** How far the disk itself is recoloured into shades of `uTint`: 0 keeps the gold, as on a tie. */
    uTintMix: { value: 0 },
    tNoise: { value: null as THREE.Texture | null },
    /** Raymarch camera elevation above the disk plane and azimuth round it, in radians. */
    uElevation: { value: 0.2 },
    uAzimuth: { value: Math.atan2(1, 3) },
    /** Tangent of the shadow's angular radius from the raymarch camera; maps rh onto the virtual view. */
    uShadowTan: { value: 0.057 },
    /** Raymarch colour-ramp stops (cream, then umber, then black) and the flat emission floor. */
    uRamp1: { value: new THREE.Color(1.0, 0.84, 0.64) },
    uRamp2: { value: new THREE.Color(0.34, 0.17, 0.08) },
    uRampGain: { value: 2.0 },
    uEmission: { value: new THREE.Color(0.14, 0.129, 0.09) },
    /** Ramp positions of uRamp1 and uRamp2. */
    uRampPos: { value: new THREE.Vector2(0.04, 0.33) },
    /** Disk half-thickness at the inner edge, and how much it flares per unit of radius beyond 0.3. */
    uDiskWidth: { value: 0.018 },
    uFlare: { value: 0.6 },
    /** Radial range over which the disk's density fades out. */
    uFade: { value: new THREE.Vector2(0.12, 1.3) },
    /** Radius past which the colour ramp slows, and its rate beyond it, so the outer disk stays rust
     *  instead of running out to the ramp's black end. */
    uRampKnee: { value: new THREE.Vector2(0.35, 0.15) },
    /** Cloud lookup repeats round the orbit (integer, or the wrap seams) and frequency across it. */
    uNoiseScale: { value: new THREE.Vector2(1, 5) },
    /** How far dim cloud thins out rather than blocking what lies behind it, and the luminance at which
     *  it turns fully opaque. Edge-on, the rust outer disk would otherwise hide the hot inner edge. */
    uLitAlpha: { value: 0.72 },
    /** How far the cloud noise shifts the colour ramp, directly and through its local slope (the
     *  reference's emboss: 1.5, 19.75). Lower is smoother and less grainy. */
    uGrain: { value: new THREE.Vector2(1.0, 8.0) },
    /** Strength of the cloud-scale clumps laid along the streaks, which keep them from reading as rings. */
    uClump: { value: 0.5 },
    /** White-hot boost on the innermost disk. */
    uHotCore: { value: 0.6 },
    /** Strength of the second ripple train running out along the disk plane, relative to the round one,
     *  how much it lights the disk as it passes, and how far it heaves the disk out of its plane. */
    uPlaneRipple: { value: 1.0 },
    uDiskRipGlow: { value: 1.0 },
    uDiskRipLift: { value: 0.01 },
    uLitLevel: { value: 0.8 },
    /** Display-space gain on the raymarched disk; stands in for the reference's 1.2 exposure and bloom. */
    uMarchGain: { value: 1.25 },
    /** Glow gathered along the bent rays round the inner disk: the lensed halo bloom would give, and the
     *  brown haze over the shadow. */
    uGlow: { value: 2.5 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tHud;
    uniform float uHudAmount;
    uniform vec2 uCenter;
    uniform float uRadius;
    uniform float uAspect;
    uniform float uSquash;
    uniform float uThickness;
    uniform float uProgress;
    uniform float uTime;
    uniform float uHorizon;
    uniform float uDiskGain;
    uniform float uRingGain;
    uniform float uArcGain;
    uniform float uHaloGain;
    uniform float uDustGain;
    uniform float uStreakGain;
    uniform float uDoppler;
    uniform vec4 uRipples;
    uniform float uRippleAmp;
    uniform float uRippleFreq;
    uniform float uRippleWidth;
    uniform float uRippleGain;
    uniform vec3 uHot;
    uniform vec3 uRim;
    uniform vec3 uDeep;
    uniform vec3 uBase;
    uniform vec3 uTint;
    uniform float uTintMix;
    uniform sampler2D tNoise;
    uniform float uElevation;
    uniform float uAzimuth;
    uniform float uShadowTan;
    uniform vec3 uRamp1;
    uniform vec3 uRamp2;
    uniform float uRampGain;
    uniform vec3 uEmission;
    uniform vec2 uRampPos;
    uniform float uDiskWidth;
    uniform vec2 uFade;
    uniform float uFlare;
    uniform vec2 uGrain;
    uniform float uClump;
    uniform float uHotCore;
    uniform float uPlaneRipple;
    uniform float uDiskRipGlow;
    uniform float uDiskRipLift;
    uniform vec2 uRampKnee;
    uniform vec2 uNoiseScale;
    uniform float uLitAlpha;
    uniform float uLitLevel;
    uniform float uMarchGain;
    uniform float uGlow;
    varying vec2 vUv;

    float hash21(vec2 p){
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
                 mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
    }

#ifdef SINGULARITY_RAYMARCH
    vec3 catmullRom(float t, vec3 p0, vec3 p1, vec3 p2, vec3 p3){
      return 0.5 * (2.0 * p1 + (p2 - p0) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t * t
                  + (3.0 * p1 - p0 - 3.0 * p2 + p3) * t * t * t);
    }

    /** Three-stop B-spline ramp: uRamp1, then uRamp2, then black at 1. */
    vec3 diskRamp(float t){
      float iab = clamp((t - uRampPos.x) / (uRampPos.y - uRampPos.x), 0.0, 1.0);
      float ibc = clamp((t - uRampPos.y) / (1.0 - uRampPos.y), 0.0, 1.0);
      if(t < uRampPos.y) return catmullRom(1.0 - iab, vec3(0.0), uRamp2, uRamp1, uRamp1);
      if(t < 1.0) return catmullRom(iab - ibc, vec3(0.0), vec3(0.0), uRamp2, uRamp1);
      return vec3(0.0);
    }

    float smoothUnit(float t){ t = clamp(t, 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

    /**
     * Marches the virtual camera ray through screen offset n (in units where the shadow radius is rh) across
     * the reference's unit sphere. Rays are pulled towards the centre by power/r^2 and anything reaching the
     * core is swallowed. Returns the reference's colour accumulator (rgb) and coverage (a), in display space,
     * and the unoccluded glow density gathered on the way. The pulse scales mass (pull and core) only, so the
     * shadow swells into the disk while the disk itself holds still.
     */
    /** Plane ripple radii, packet width and wave frequency in disk units; set by main before the march. */
    vec4 gDiskRip;
    float gDiskRipWidth;
    float gDiskRipFreq;

    vec4 raymarchDisk(vec2 n, float rh, float mass, out float glow){
      float core = ${RM.core.toFixed(3)} * mass;
      glow = 0.0;
      float ce = cos(uElevation), se = sin(uElevation);
      vec3 cam = ${RM_CAM_DIST.toFixed(4)} * vec3(ce * sin(uAzimuth), -ce * cos(uAzimuth), se);
      vec3 fwd = -normalize(cam);
      vec3 right = normalize(cross(fwd, vec3(0.0, 0.0, 1.0)));
      vec3 up = cross(right, fwd);
      vec3 dir = normalize(fwd + (right * n.x + up * n.y) * (uShadowTan / rh));
      float b = dot(cam, dir);
      float disc = b * b - dot(cam, cam) + ${(RM_EXTENT * RM_EXTENT).toFixed(4)};
      if(disc <= 0.0) return vec4(0.0);
      vec3 pos = cam + dir * (-b - sqrt(disc) - hash21(gl_FragCoord.xy) * 0.01);

      vec3 acc = vec3(0.0);
      float cover = 0.0;
      for(int i = 0; i < ${RM.steps}; i++){
        float rl = length(pos);
        float env = 2.2 * uDiskWidth * (1.0 + uFlare * max(length(pos.xy) - 0.3, 0.0)) + uPlaneRipple * uDiskRipLift;
        // Reference step inside the lensing region; outside it rays run straight, so the step grows with
        // radius and jumps the empty space above or below the disk, stopping short of the lensing region.
        float h = ${RM.step.toFixed(4)} * clamp(rl * 2.0, 1.0, 4.0);
        if(rl > 1.0){
          if(abs(pos.z) > env && pos.z * dir.z > 0.0 && dot(pos, dir) > 0.0) break;
          h = max(h, min((abs(pos.z) - env) / max(abs(dir.z), 0.02), rl - 1.0) * 0.5);
        }
        vec3 steered = normalize(dir - pos / rl * (h * ${RM.power.toFixed(3)} * mass / (rl * rl)) * clamp((1.0 - rl) * 2.0, 0.0, 1.0));
        pos += dir * h;

        float xy = length(pos.xy);
        float w = uDiskWidth * (1.0 + uFlare * max(xy - 0.3, 0.0));
        // The plane ripples roll through the disk as a surface wave: the sheet heaves up and down under
        // the packet and its crests brighten and thicken.
        float heave = 0.0, rip = 0.0;
        for(int k = 0; k < 4; k++){
          if(gDiskRip[k] <= 0.0) continue;
          float d = xy - gDiskRip[k];
          float e = d / gDiskRipWidth;
          float wv = sin(d * gDiskRipFreq) * exp(-e * e) / (1.0 + gDiskRip[k]);
          heave += wv;
          rip += max(wv, 0.0);
        }
        heave *= uPlaneRipple * uDiskRipLift;
        rip *= uPlaneRipple;
        vec3 wp = vec3(pos.xy, pos.z - heave);
        // Polar lookup, so the clouds stretch into streaks along the orbit.
        float ph = xy * 4.27 - uTime * 0.1;
        vec2 uv = vec2((atan(pos.y, pos.x) - ph) * ${(1 / (2 * Math.PI)).toFixed(5)} * uNoiseScale.x, xy * uNoiseScale.y);
        // Each noise channel only counts within its own slice of the disk's thickness.
        vec3 dz = vec3(-w, 0.0, w) - wp.z;
        vec3 band = max(1.0 - dz * dz / (w * w), 0.0);
        float nl = length(texture2D(tNoise, uv).rgb * band);
        float no = length(texture2D(tNoise, uv + 0.002).rgb * band);

        float rt = min(xy, uRampKnee.x) + max(xy - uRampKnee.x, 0.0) * uRampKnee.y;
        vec3 em = diskRamp(rt + (nl - 0.78) * uGrain.x + (nl - no) * uGrain.y) * uRampGain + uEmission;
        em += vec3(1.0, 0.93, 0.84) * uHotCore * exp(-max(rt - 0.1, 0.0) / 0.08);
        // Cloud-scale clumps along the orbit (whole repeats round it, or the lookup seams) break the
        // streaks up so they don't read as concentric rings.
        vec2 uvc = vec2((atan(pos.y, pos.x) - ph * 0.35) * ${(3 / (2 * Math.PI)).toFixed(5)}, xy * 1.3 + 0.37);
        float clump = (texture2D(tNoise, uvc).g - 0.733) / 0.046;
        em *= clamp(1.0 + uClump * clump, 0.3, 1.8);
        em *= 1.0 + uDiskRipGlow * rip;
        float a = smoothUnit(1.0 - (abs(wp.z) - (nl - 0.75) * 0.6) / (w * (1.0 + rip))) * (1.0 - smoothstep(uFade.x, uFade.y, xy))
                * clamp(1.0 + uClump * 0.6 * clump, 0.2, 1.4);
        // Behind the disk is the board, not black space, so dim cloud has to thin out rather than paint over it.
        a *= mix(1.0, smoothstep(0.0, uLitLevel, dot(em, vec3(0.3, 0.55, 0.15))), uLitAlpha);
        // Opacity is per reference step, so longer steps compound it to cover the same depth.
        float span = h / ${RM.step.toFixed(4)};
        a = 1.0 - pow(1.0 - clamp(a, 0.0, 1.0), span);
        // Feathered, so the step pattern doesn't comb the shadow's edge into spikes.
        // A black absorber feathered outward from the core, so the step pattern doesn't comb the shadow's
        // edge into spikes. Emission is weighted by the disk's own opacity, since em is lit even off-plane.
        float swallow = length(pos) < core ? 1.0 : 1.0 - smoothstep(core, core * 1.2, length(pos));
        float aT = max(a, swallow);
        em *= a * (1.0 - swallow) / max(aT, 1e-4);
        a = aT;
        // Faded towards the core, so rays falling in keep the shadow dark at its middle.
        glow += (1.0 - cover) * span * exp(-abs(pos.z) * 12.0 - max(xy - 0.2, 0.0) * 6.0) * smoothstep(core, 0.3, length(pos));
        acc = mix(acc, em, (1.0 - cover) * a);
        cover = mix(cover, 1.0, a);

        pos += dir * h;
        dir = steered;
        if(cover > 0.995 || (rl > ${RM_EXTENT.toFixed(3)} && dot(pos, dir) > 0.0)) break;
      }
      return vec4(acc, cover);
    }
#else

    /** 0 at the hottest inner edge, 1 at cold outer dust. Stops overlap so the disk reads as
     *  a gradient rather than concentric bands. */
    vec3 goldRamp(float t){
      t = clamp(t, 0.0, 1.0);
      // The raymarch ramp's palette, which is authored in display space.
      vec3 r1 = pow(uRamp1, vec3(2.2)), r2 = pow(uRamp2, vec3(2.2));
      vec3 c = mix(mix(r1, vec3(1.0), 0.45), r1 * 0.75, smoothstep(0.0, 0.35, t));
      c = mix(c, mix(r1, r2, 0.6) * 0.7, smoothstep(0.2, 0.7, t));
      c = mix(c, r2, smoothstep(0.55, 0.92, t));
      return mix(c, vec3(0.0), smoothstep(0.8, 1.0, t));
    }

    /** fbm with octaves faded to their mean once they would shimmer; lod is one pixel's footprint in p's units. */
    float fbmAA(vec2 p, float lod){
      float v = 0.0, a = 0.5, f = 1.0;
      for(int i = 0; i < 5; i++){
        v += a * mix(0.5, vnoise(p), 1.0 - smoothstep(0.35, 0.7, f * lod));
        p *= 2.02; f *= 2.02; a *= 0.5;
      }
      return v;
    }

    /**
     * Where the ray through screen offset n crosses the disk plane after bending past the hole, from the
     * first-order orbit u(psi) = sin(psi)/b + k*M*(1 - cos(psi))^2/b^2 with the shadow edge at b = rh = 3√3 M.
     * order 0 is the direct image (near disk below centre, far disk lifted over the top); order 1 is the
     * secondary image (far disk's underside, wrapped under the hole). xy is the crossing in disk-plane
     * coordinates, x across the screen and y away from the camera; z is cos(psi), positive in front of the hole.
     */
    vec3 diskHit(vec2 n, float rh, float order, float k){
      float b = max(length(n), 1e-4);
      float sphi = n.y / b, cphi = n.x / b;
      float st = max(uSquash, 0.03);
      float ct = sqrt(1.0 - st * st);
      float psi = atan(st, -sphi * ct) + order * 3.14159265;
      float sp = sin(psi), cp = cos(psi);
      float omc = 1.0 - cp;
      float u = sp / b + k * (rh / ${B_CRIT.toFixed(3)}) * omc * omc / (b * b);
      // u <= 0: the ray leaves before reaching the plane; park the crossing far outside the disk.
      float R = 1.0 / max(u, 1e-5);
      return vec3(vec2(sp * cphi, sp * sphi * st - cp * ct) * R, cp);
    }

    /** Disk-plane position spun round the hole, in un-pulsed horizon radii: the cloud texture's domain. */
    vec2 diskQ(vec2 hit, float rhs){
      float Rh = length(hit) / rhs;
      float ang = atan(hit.y, hit.x) + ${DISK_TWIST.toFixed(3)} * Rh + uTime * ${DISK_SPIN.toFixed(3)};
      return vec2(cos(ang), sin(ang)) * Rh;
    }

    /**
     * Emission (rgb) and coverage (a) of the disk at a crossing. Every image of the disk samples this one
     * function, so the band and both arcs carry the same clouds and join up where they meet.
     */
    vec4 diskShade(vec2 hit, vec2 qh, float lod, float rhg, float tex){
      float R = length(hit);
      float c1 = fbmAA(qh * 2.6 + 3.1, lod * 2.6);
      float c2 = fbmAA(qh * 7.5 - vec2(uTime * 0.04, 0.0), lod * 7.5);
      // The near side is seen through the full depth of the disk, so its hot layer reads deeper and warmer.
      float nearSide = smoothstep(0.0, -0.6, hit.y / max(R, 1e-5));
      // Seen edge-on or squeezed by the lens, disk-plane noise collapses into stripes; the screen-keyed tex
      // (billows on the band, fibres round the arcs) carries the clouds there instead.
      float squash = smoothstep(0.01, 0.05, lod);
      float clouds = 0.5 + (smoothstep(0.3, 0.8, c1 * 0.65 + c2 * 0.35) - 0.5) * (1.0 - 0.7 * squash);
      clouds = mix(clouds, tex, max(squash, nearSide));
      float fib = mix(0.5, vnoise(vec2(length(qh) * 26.0, 0.0) + qh * 1.4), 1.0 - smoothstep(0.35, 0.7, 26.0 * lod));
      // Fine noise on the radius tufts the inner edge, and with it the rim of the shadow. On the band the
      // billows do it, lumping the crown.
      float Rr = R / rhg * (1.0 + uThickness * ((c2 - 0.5) * 1.4 + (c1 - 0.5) * 0.4) * (1.0 - 0.75 * squash))
               * (1.0 + 0.8 * uThickness * (tex - 0.5) * nearSide);
      // Every image of a given orbit angle lies along one screen ray, so noise keyed to that angle alone tufts
      // the inner edge along the arcs however hard the lens compresses the disk radially. It only moves the
      // edge: shading with it would streak the images radially. The near side's edge crosses the hole close to
      // where those rays converge, so it would step there; the billow lift roughens that edge instead.
      float ta = atan(hit.y, hit.x) + uTime * ${DISK_SPIN.toFixed(3)};
      vec2 tr = vec2(cos(ta), sin(ta));
      float tuft = smoothstep(0.3, 0.7, vnoise(tr * 4.0 + 11.0) * 0.55 + vnoise(tr * 11.0 - 5.0) * 0.3 + vnoise(tr * 27.0) * 0.15);
      // Kept to the far side: towards the equator the lens stops compressing the disk, and the tufts would
      // stretch into long radial notches.
      float ruffle = 1.0 + uThickness * (tuft - 0.5) * smoothstep(0.0, 0.6, hit.y / max(R, 1e-5));
      float inner = smoothstep(${(DISK_INNER * 0.88).toFixed(3)}, ${(DISK_INNER * 1.08).toFixed(3)}, Rr * ruffle);
      float outer = 1.0 - smoothstep(2.2, 4.4, Rr);
      float alpha = clamp(inner * outer * (0.45 + 1.1 * clouds) * (0.7 + 0.6 * fib), 0.0, 1.0);
      float t = Rr - ${DISK_INNER.toFixed(3)};
      // Clumps carry the glow further out than the gaps between them, so the outer edges break up into cloud.
      float heat = 0.06 + 2.0 * exp(-max(t, 0.0) * (1.3 - 0.6 * tex) / mix(0.65, 0.9, nearSide)) * (1.0 + 0.8 * nearSide);
      // Colour cools faster than the light falls off, so the rims read cream only at their core and the
      // falloff turns tan and rust instead of grey once tone mapping has had its way.
      float cool = clamp(0.08 + t / mix(1.5, 1.6, nearSide) + (clouds - 0.5) * 0.4, 0.0, 1.0) * (1.0 - 0.45 * nearSide);
      float a = atan(hit.y, hit.x);
      vec3 emis = max(goldRamp(min(cool, 0.85)), uBase * 0.9) * heat * (1.0 - uDoppler * cos(a))
                * (0.7 + 0.6 * fib) * (0.55 + 0.9 * tex);
      // The dust is lit, not soot: where it glows faintly it thins out instead of painting black over the
      // board. Only the band's underside keeps a little occlusion.
      float lit = smoothstep(0.0, 0.2, dot(emis, vec3(0.3, 0.55, 0.15)));
      return vec4(emis * mix(1.0, uDustGain, nearSide), alpha * max(lit, 0.25 * nearSide));
    }
#endif

    /**
     * Recolours the gold disk into shades of the winner's hue by brightness alone: dim dust takes a deep
     * shade, the body the hue itself, and the hottest light stays near white. The hue must be in the same
     * space as the colour: the march composites in display space, the lite disk in linear.
     */
    vec3 tintShade(vec3 c, vec3 hue){
      if(uTintMix <= 0.0) return c;
      const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
      float l = dot(c, LUM);
      vec3 shade = l * hue / max(dot(hue, LUM), 1e-4);
      // A saturated hue at that brightness runs a channel past 1, and tone mapping bends over-range blues to
      // violet. Clip to the channel limit and spend the missing brightness on white, which keeps the hue.
      float peak = max(shade.r, max(shade.g, shade.b));
      if(peak > 1.0){
        shade /= peak;
        float ls = dot(shade, LUM);
        shade = mix(shade, vec3(1.0), clamp((min(l, 1.0) - ls) / max(1.0 - ls, 1e-4), 0.0, 1.0));
      }
      shade = mix(shade, vec3(l), smoothstep(0.8, 1.8, l));
      return mix(c, shade, uTintMix);
    }

    /** Offset in board-half-height units -> screen UV, undoing the aspect correction. */
    vec2 toUv(vec2 n, float rOuter){
      return uCenter + (n * rOuter) / vec2(uAspect, 1.0);
    }

    /**
     * Expanding wave packets rolling out from behind the hole. Same radial sine as a vertex
     * ripple, but it displaces the sampled image instead of mesh vertices, so it refracts the
     * board and HUD rather than needing geometry. The out param collects the crest highlight.
     */
    float ripples(float sr, out float crest){
      float offset = 0.0;
      crest = 0.0;
      for(int i = 0; i < 4; i++){
        float radius = uRipples[i];
        if(radius < 0.0) continue;
        float d = sr - radius;
        float e = d / uRippleWidth;
        // Energy spreads as the ring grows, so it thins out by the time it reaches the corners.
        float w = sin(d * uRippleFreq) * exp(-e * e) / (1.0 + radius * 2.2);
        offset += w;
        crest += max(w, 0.0);
      }
      return offset * uRippleAmp;
    }

    void main(){
      float p = clamp(uProgress, 0.0, 1.0);
      vec4 src = texture2D(tDiffuse, vUv);
      if(p <= 0.0){ gl_FragColor = src; return; }

      // Work in board-half-height units: r == 1.0 is the board edge, so every constant below
      // is resolution independent and the effect always scales with the board.
      float rOuter = max(uRadius, 1e-4);
      vec2 n = ((vUv - uCenter) * vec2(uAspect, 1.0)) / rOuter;
      float r = length(n);
      float rh = uHorizon * p;

      // Deflection falls off as 1/r^2 and fades out at the board edge, so nothing beyond the
      // board moves. This is what bends the table, rails and floor glow into the hole.
      float influence = 1.0 - smoothstep(${INFLUENCE_IN.toFixed(3)}, 1.0, r);
      float pull = min(rh * rh * ${DEFLECT.toFixed(3)} / (r * r + 1e-4), ${PULL_CAP.toFixed(3)}) * influence * p;
      vec2 dir = r > 1e-4 ? n / r : vec2(0.0);

      // Splitting the deflection per channel gives the rim its chromatic smear.
      vec2 uvR = toUv(n - dir * pull * 0.94, rOuter);
      vec2 uvG = toUv(n - dir * pull * 1.00, rOuter);
      vec2 uvB = toUv(n - dir * pull * 1.08, rOuter);

      // Ripples are measured in screen units rather than board units so they can keep going
      // past the board edge and travel all the way out to the corners.
      vec2 s = (vUv - uCenter) * vec2(uAspect, 1.0);
      float sr = length(s);
      float crest;
      vec2 ripUv = (sr > 1e-4 ? s / sr : vec2(0.0)) * ripples(sr, crest) / vec2(uAspect, 1.0);
      // The same rings also run out along the disk plane, seen nearly edge-on as flat ellipses, and push
      // the image within that plane.
#ifdef SINGULARITY_RAYMARCH
      float planeSin = sin(uElevation);
#else
      float planeSin = uSquash;
#endif
      vec2 sp = vec2(s.x, s.y / planeSin);
      float spr = length(sp);
      float crestP;
      float ripP = ripples(spr, crestP) * uPlaneRipple;
      ripUv += (spr > 1e-4 ? vec2(sp.x, sp.y * planeSin) / spr : vec2(0.0)) * ripP / vec2(uAspect, 1.0);
      crest += crestP * uPlaneRipple;
      uvR += ripUv; uvG += ripUv; uvB += ripUv;

      vec3 scene = vec3(texture2D(tDiffuse, uvR).r, texture2D(tDiffuse, uvG).g, texture2D(tDiffuse, uvB).b);

      // The HUD snapshot rides the identical deflection, so cards bend with the board instead
      // of staying flat on top of it.
      if(uHudAmount > 0.0){
        vec4 hr = texture2D(tHud, uvR), hg = texture2D(tHud, uvG), hb = texture2D(tHud, uvB);
        float hudA = max(max(hr.a, hg.a), hb.a) * uHudAmount;
        scene = mix(scene, vec3(hr.r, hg.g, hb.b), hudA);
      }
      // Near the horizon the lens smears the board's bright centre into a wash; dust dims it so the
      // disk and arcs carry the light there instead.
      scene *= mix(1.0, mix(0.12, 1.0, smoothstep(rh, rh * 3.2, r)), p);
      vec3 col = scene + uTint * crest * uRippleGain * p;

#ifdef SINGULARITY_RAYMARCH
      float rhs = max(${HORIZON.toFixed(3)} * p, 1e-4);
      if(r * uShadowTan < rhs * ${RM_SPHERE_TAN.toFixed(4)}){
        // Screen units to disk units at the hole's distance.
        float toDisk = uShadowTan * ${RM_CAM_DIST.toFixed(3)} / (max(uRadius, 1e-4) * rhs);
        gDiskRip = uRipples * toDisk;
        gDiskRipWidth = uRippleWidth * toDisk;
        gDiskRipFreq = uRippleFreq / toDisk;
        float glow;
        vec4 disk = raymarchDisk(n, rhs, uHorizon / ${HORIZON.toFixed(3)}, glow);
        disk.rgb = tintShade(disk.rgb, pow(uTint / max(max(uTint.r, uTint.g), max(uTint.b, 1e-4)), vec3(1.0 / 2.2)));
        // The reference composites over its environment in display space; the lensed board stands in for it.
        vec3 env = pow(max(col, 0.0), vec3(1.0 / 2.2));
        col = pow(max(mix(disk.rgb * uMarchGain, env, 1.0 - disk.a), 0.0), vec3(2.2));
        // Held back where the march went opaque, so the shadow stays black under a saturated tint.
        col += uTint * glow * ${RM.step.toFixed(4)} * uGlow * (1.0 - 0.85 * disk.a);
      }
#else
      float rhg = max(rh, 1e-3);
      // The disk follows the opening but not the pulse, so only the shadow breathes with each swell.
      float rhs = max(${HORIZON.toFixed(3)} * p, 1e-3);
      float rIn = rhs * ${DISK_INNER.toFixed(3)};

      // Cloud tops stand above the disk midplane. From just above, the near side shows its top surface, so
      // it is looked up lower; the arcs over the hole are seen nearly face-on through the lens and keep only
      // a sliver of that height. The billow is keyed to the crossing's position across the screen, so the
      // band's crown and the arcs rise and fall together. Orbit angle would pinch round the lookup's singular
      // point, and depth changes too fast edge-on: either would saw the band's edge into steps.
      float h0 = ${DISK_LIFT.toFixed(3)} * rhs;
      float bl = 0.5;
      if(r < rhs * 5.0){
        vec2 hb = diskHit(n - vec2(0.0, h0), rhs, 0.0, ${LENS_DIRECT.toFixed(3)}).xy / rhs;
        vec2 bp = vec2(hb.x * 2.2 + uTime * 0.12, hb.y * 0.2);
        bl = smoothstep(0.25, 0.75, vnoise(bp) * 0.62 + vnoise(bp * 2.03 + 4.0) * 0.38);
      }
      float lift = h0 * (0.94 + 0.12 * bl) * mix(1.0, ${LIFT_TOP.toFixed(3)}, smoothstep(0.25 * rhs, 0.9 * rhs, n.y));

      // Direct image: one lookup serves the near band and the far disk bent over the top.
      vec3 hitP = diskHit(n - vec2(0.0, lift), rhs, 0.0, ${LENS_DIRECT.toFixed(3)});
      // Secondary image: the far disk's underside, a thin crescent under the hole.
      vec3 hitS = diskHit(n, rhs, 1.0, ${LENS_SECONDARY.toFixed(3)});
      vec2 qP = diskQ(hitP.xy, rhs), qS = diskQ(hitS.xy, rhs);
      // Screen-keyed cloud texture: domain-warped billows for the band, and fibres and clumps wrapped round
      // the hole for the arcs. Direction is used rather than angle so there is no seam.
      vec2 bq = vec2(n.x * 0.5 - uTime * 0.03, n.y) / rhs * 5.0;
      bq += 0.7 * vec2(vnoise(bq * 0.8 + 3.0), vnoise(bq * 0.8 - 5.0));
      float ca = cos(uTime * ${DISK_SPIN.toFixed(3)}), sa = sin(uTime * ${DISK_SPIN.toFixed(3)});
      vec2 dirR = mat2(ca, sa, -sa, ca) * dir;
      vec2 fq = vec2(r / rhs * 20.0, 0.0) + dirR * 2.5;
      vec2 cq = dirR * 3.5 + vec2(r / rhs * 6.0, 0.0);
      // Derivatives must stay out of the branches below.
      float lodP = max(length(dFdx(qP)), length(dFdy(qP)));
      float lodS = max(length(dFdx(qS)), length(dFdy(qS)));
      float lodB = max(length(dFdx(bq)), length(dFdy(bq)));
      float lodF = max(length(dFdx(fq)), length(dFdy(fq)));
      float lodC = max(length(dFdx(cq)), length(dFdy(cq)));
      float Rp = length(hitP.xy);

      float bill = 0.5, arcT = 0.5;
      if(r < rhs * 4.0){
        bill = smoothstep(0.28, 0.72, fbmAA(bq, lodB));
        arcT = smoothstep(0.35, 0.65, fbmAA(cq, lodC) * 0.6 + fbmAA(fq, lodF) * 0.4);
      }
      float nearP = smoothstep(0.0, -0.6, hitP.y / max(Rp, 1e-5));

      vec4 dP = vec4(0.0), dS = vec4(0.0);
      if(Rp < rhs * 5.2) dP = diskShade(hitP.xy, qP, lodP, rhs, mix(arcT, bill, nearP));
      if(length(hitS.xy) < rhs * 5.2) dS = diskShade(hitS.xy, qS, lodS, rhs, arcT);
      dP.rgb = tintShade(dP.rgb * uDiskGain, uTint);
      dS.rgb = tintShade(dS.rgb * uArcGain, uTint);
      float front = smoothstep(-0.02, 0.02, hitP.z);

      // Photon ring: thin, just outside the rim, mostly under the hole so it never draws a clean circle
      // over the ragged top edge.
      float ringUp = 1.0 - 0.95 * smoothstep(-0.6, -0.1, r > 1e-4 ? n.y / r : 0.0);
      vec3 ringCol = tintShade(uHot, uTint) * exp(-pow((r - rh * 1.04) / max(rh * 0.035, 1e-4), 2.0)) * uRingGain * ringUp;

      // Bloom stand-in, anchored to the lensed disk so it wraps with it.
      float halo = exp(-pow(max(Rp - rIn, 0.0) / 0.9, 1.4)) * smoothstep(rhs * 0.95, rhs * 1.4, r);
      vec3 haloCol = uTint * halo * uHaloGain;

      // Fine dust lanes in the same lensed disk plane, faded where they would alias edge-on.
      vec2 qB = qP * rhs;
      float lanes = pow(vnoise(vec2(Rp * 62.0, 0.0) + qB * 2.2), 7.0)
                  * smoothstep(rIn, rIn * 1.7, Rp) * (1.0 - smoothstep(0.9, 1.9, Rp))
                  * (1.0 - smoothstep(0.35, 0.7, 62.0 * rhs * lodP));
      vec3 streakCol = tintShade(mix(uDeep, uRim, 0.5), uTint) * lanes * uStreakGain;

      col += (haloCol + streakCol) * p;
      // The secondary image lies behind everything, and the horizon swallows it.
      col = mix(col, dS.rgb, dS.a * p);
      float hole = 1.0 - smoothstep(rh * 0.93, rh, r);
      // The band's glow spills over the shadow, so it is umber beside the band and black only at the top.
      float haze = exp(-abs(n.y / rhg + 0.08) / 0.7);
      col = mix(col, vec3(0.006, 0.003, 0.001) + uDeep * 0.03 * haze, hole);
      // The direct image goes on in a single composite so band and arcs cannot seam where they meet. Its far
      // half is swallowed by the horizon only inside ~0.87 rh: the arc's tufted inner edge overhangs the rim,
      // which is what makes the top of the shadow ragged. The near half (the band) is always in front.
      float hole2 = 1.0 - smoothstep(rh * 0.84, rh * 0.9, r);
      col = mix(col, dP.rgb, dP.a * mix(1.0 - hole2, 1.0, front) * p);
      col += ringCol * p * (1.0 - dP.a);
#endif

      gl_FragColor = vec4(col, src.a);
    }
  `,
};

/** Screen-space state of the hole, shared with the DOM HUD so cards can follow the same falloff. */
export type SingularityField = {
  /** Canvas-pixel centre. */
  cx: number;
  cy: number;
  /** Board half-height in canvas pixels. */
  radius: number;
  progress: number;
  /** True once the HUD has been rasterised into the shader, which supersedes the CSS fallback. */
  snapshot: boolean;
};
export const SingularityContext = createContext<RefObject<SingularityField> | null>(null);
export function useSingularityField(){ return useContext(SingularityContext); }

export function useSingularityPass(){
  const [singularityPass, setSingularityPass] = useState<ShaderPass | null>(null);
  const onPass = useCallback((pass: ShaderPass | null) => setSingularityPass(pass), []);
  return { singularityPass, onPass };
}

const _near = new THREE.Vector3();
const _far = new THREE.Vector3();

/**
 * End-of-session black hole, sized to the board and centred on it. The pass runs after bloom
 * (see `BoardFinish`) so the horizon stays black, and carries its own halo instead.
 */
export function Singularity({ active, onPass, field, portal, tint }:{
  active: boolean;
  onPass: (pass: ShaderPass | null) => void;
  field?: RefObject<SingularityField>;
  /** Html HUD layer, rasterised on collapse so it can be warped with the board. */
  portal?: RefObject<HTMLDivElement | null>;
  /** Winner's accent colour for the light the hole throws off; gold when unset (a tie). */
  tint?: string;
}){
  const { camera, size } = useThree();
  const progress = useRef({ value: 0 });
  const ripples = useRef({ age: Array(RIPPLE_SLOTS).fill(RIPPLE_IDLE) as number[], radius: Array(RIPPLE_SLOTS).fill(RIPPLE_OFF) as number[], clock: 0, next: 0, left: 0 });
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const tintTarget = useMemo(() => glowTint(tint), [tint]);

  const pass = useMemo(() => {
    const created = new ShaderPass(SINGULARITY_SHADER);
    // The chain is still linear HDR at this point; tone mapping happens in OutputPass.
    created.material.toneMapped = false;
    created.uniforms.tNoise.value = makeDiskNoise();
    applyQuality(created.material, defaultQuality());
    return created;
  }, []);

  useEffect(() => { onPass(pass); return () => onPass(null); }, [pass, onPass]);
  useEffect(() => () => { pass.uniforms.tNoise.value?.dispose(); pass.material.dispose(); pass.dispose?.(); }, [pass]);

  // Lookdev handle: `__singularity.set(0..1)` opens the hole without ending a session;
  // `__singularity.setQuality('raymarch' | 'lite')` swaps the disk implementation.
  useEffect(() => {
    if(!(import.meta as ImportMeta & {env?:{DEV?:boolean}}).env?.DEV) return;
    const w = window as unknown as { __singularity?: unknown };
    w.__singularity = {
      pass,
      set: (value: number) => { gsap.killTweensOf(progress.current); progress.current.value = value; },
      setQuality: (quality: SingularityQuality) => applyQuality(pass.material, quality),
    };
    return () => { delete w.__singularity; };
  }, [pass]);

  useEffect(() => {
    if(!active){ progress.current.value = 0; return; }
    if(reduced){ progress.current.value = 1; return; }
    const tween = gsap.to(progress.current, {
      value: 1,
      duration: SINGULARITY_MS.open / 1000,
      ease: 'power2.in',
    });
    return () => { tween.kill(); };
  }, [active, reduced]);

  // Rasterise the Html HUD once, swap the live DOM out for it, and let the shader warp it.
  // If rasterising fails the live DOM stays up and `Anchor` falls back to CSS displacement.
  useEffect(() => {
    const node = portal?.current;
    if(!active || !node) return;
    let cancelled = false;
    let texture: THREE.CanvasTexture | null = null;
    toCanvas(node, { pixelRatio: Math.min(window.devicePixelRatio, 2) })
      .then(canvas => {
        if(cancelled) return;
        texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        pass.uniforms.tHud.value = texture;
        pass.uniforms.uHudAmount.value = 1;
        node.style.visibility = 'hidden';
        if(field?.current) field.current.snapshot = true;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      node.style.visibility = '';
      pass.uniforms.uHudAmount.value = 0;
      pass.uniforms.tHud.value = null;
      texture?.dispose();
      if(field?.current) field.current.snapshot = false;
    };
  }, [active, portal, pass, field]);

  useFrame((_, delta) => {
    const u = pass.uniforms;
    u.uProgress.value = progress.current.value;
    const rp = ripples.current;
    if(u.uProgress.value <= 0){
      pass.enabled = false;
      rp.age.fill(RIPPLE_IDLE); rp.radius.fill(RIPPLE_OFF); rp.clock = 0; rp.next = 0; rp.left = 0;
      u.uHorizon.value = HORIZON;
      // Snapped while closed, so the hole always opens already in the winner's colour.
      u.uTint.value.copy(tintTarget);
      u.uTintMix.value = tint ? 1 : 0;
      if(field?.current) field.current.progress = 0;
      return;
    }
    pass.enabled = true;
    const dt = Math.min(delta, 0.05);
    const ease = 1 - Math.exp(-dt / TINT_EASE_S);
    u.uTint.value.lerp(tintTarget, ease);
    u.uTintMix.value += ((tint ? 1 : 0) - u.uTintMix.value) * ease;
    u.uTime.value += dt;
    u.uAspect.value = size.width / size.height;

    // Fire ripple bursts on the server cadence. Each one starts as a swell of the horizon and only
    // leaves it at the peak, so the size change reads as what sets the ring off.
    rp.clock += dt;
    if(rp.clock >= rp.next){
      if(rp.left === 0) rp.left = burstSize();
      rp.left--;
      const free = rp.age.findIndex(value => value === RIPPLE_IDLE);
      if(free >= 0) rp.age[free] = -PULSE_CHARGE_S;
      rp.next = rp.clock + burstGap(rp.left > 0);
    }
    let pulse = 0;
    for(let i = 0; i < RIPPLE_SLOTS; i++){
      if(rp.age[i] === RIPPLE_IDLE) continue;
      rp.age[i] += dt;
      pulse += pulseEnvelope(rp.age[i]);
    }
    u.uHorizon.value = HORIZON * (1 + Math.min(pulse, 1.5) * PULSE_AMP);
    // Rings launch from the swollen horizon's screen radius and travel out from there.
    const edge = u.uHorizon.value * u.uProgress.value * u.uRadius.value;
    for(let i = 0; i < RIPPLE_SLOTS; i++){
      const age = rp.age[i];
      rp.radius[i] = age === RIPPLE_IDLE || age < 0 ? RIPPLE_OFF : edge + RIPPLE_SPEED * age;
      // Retired once past the far corner of a wide viewport.
      if(rp.radius[i] > 1.6){ rp.age[i] = RIPPLE_IDLE; rp.radius[i] = RIPPLE_OFF; }
    }
    u.uRipples.value.set(rp.radius[0], rp.radius[1], rp.radius[2], rp.radius[3]);

    // Project the board's near and far rail to screen space; the hole is scaled against that.
    _near.set(0, BOARD_Y, BOARD_Z.near).project(camera);
    _far.set(0, BOARD_Y, BOARD_Z.far).project(camera);
    const cxNdc = (_near.x + _far.x) / 2, cyNdc = (_near.y + _far.y) / 2;
    u.uCenter.value.set(cxNdc * 0.5 + 0.5, cyNdc * 0.5 + 0.5);
    u.uRadius.value = Math.abs(_near.y - _far.y) * 0.25 * SIZE;

    if(field?.current){
      field.current.cx = (cxNdc * 0.5 + 0.5) * size.width;
      field.current.cy = (1 - (cyNdc * 0.5 + 0.5)) * size.height;
      field.current.radius = u.uRadius.value * size.height;
      field.current.progress = u.uProgress.value;
    }
  });

  return null;
}

/**
 * CSS fallback for the lens on the Html HUD, used only when rasterising the HUD failed.
 * Mirrors the same 1/r^2 falloff and horizon cutoff.
 */
export function singularityTransform(field: SingularityField, x: number, y: number){
  const { cx, cy, radius, progress } = field;
  if(progress <= 0 || radius <= 0) return null;
  const dx = x - cx, dy = y - cy;
  const r = Math.hypot(dx, dy) || 1e-5;
  const rh = radius * HORIZON * progress;
  const influence = 1 - smoothstep(radius * INFLUENCE_IN, radius, r);
  const pull = Math.min((rh * rh * DEFLECT) / (r * r + 1e-5), PULL_CAP) * influence * progress * radius;
  const consumed = 1 - smoothstep(rh * 0.9, rh * 1.6, r);
  return {
    dx: (-dx / r) * pull,
    dy: (-dy / r) * pull,
    /** Squeezed as it nears the horizon, then gone. */
    scale: 1 - consumed,
    opacity: 1 - consumed,
    blur: influence * progress * 2.4,
  };
}

function smoothstep(edge0: number, edge1: number, x: number){
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}
