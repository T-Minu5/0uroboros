import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Scan sweep timing — power3.out for a strong ease-out finish. */
export const BOARD_SCAN_MS = { normal: 3000, fast: 2200 } as const;
/** Soft “lights coming on” after the neon band (eases dim 0.5 → 1). */
export const BOARD_SCAN_LIGHTS_MS = 650 as const;
export function boardScanTotalMs(fast: boolean): number {
  return (fast ? BOARD_SCAN_MS.fast : BOARD_SCAN_MS.normal) + BOARD_SCAN_LIGHTS_MS;
}

/** View-Z span covering the ortho board under camera (0,18,13.8). */
const DEPTH_NEAR = 18.5;
const DEPTH_FAR = 28.5;

const SCAN_SHARED = /* glsl */ `
  float sampleDepth(sampler2D map, vec2 uv){
    return texture2D(map, uv).r;
  }
  float sobelDepth(sampler2D map, vec2 uv, vec2 texel){
    float tl = sampleDepth(map, uv + vec2(-texel.x,  texel.y));
    float t  = sampleDepth(map, uv + vec2( 0.0,      texel.y));
    float tr = sampleDepth(map, uv + vec2( texel.x,  texel.y));
    float l  = sampleDepth(map, uv + vec2(-texel.x,  0.0));
    float r  = sampleDepth(map, uv + vec2( texel.x,  0.0));
    float bl = sampleDepth(map, uv + vec2(-texel.x, -texel.y));
    float b  = sampleDepth(map, uv + vec2( 0.0,     -texel.y));
    float br = sampleDepth(map, uv + vec2( texel.x, -texel.y));
    float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
    float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
    return clamp(length(vec2(gx, gy)) * 4.0, 0.0, 1.0);
  }
  vec3 neonMask(sampler2D map, vec2 uv, vec2 texel, float progress, float strength, vec3 tint){
    float depth = sampleDepth(map, uv);
    float edge = sobelDepth(map, uv, texel);
    float flow = 1.0 - smoothstep(0.0, 0.02, abs(depth - progress));
    return (1.0 - edge) * flow * tint * strength;
  }
`;

/** Over-driven neon colours: the cycle-opening scan uses Crypto green (#1fffb1), Wave Collapse keeps the original magenta. */
export type BoardScanTone = 'open' | 'close' | 'end';
const SCAN_TINT: Record<BoardScanTone, THREE.Vector3> = {
  open: new THREE.Vector3(1.2, 10.0, 6.9),
  close: new THREE.Vector3(10.0, 0.4, 10.0),
  /** Over-driven interface cyan (#27e2ff) for the final sweep before the board collapses. */
  end: new THREE.Vector3(1.0, 7.6, 10.0),
};

/**
 * Exact Codrops Neon Horizon (effect2) WebGL port on the 3D board.
 * A matching neon-only overlay is blitted above the Html HUD so Nodes get the scan too.
 */
export const neonScanShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uProgress: { value: 0 },
    uStrength: { value: 0 },
    /** Scene brightness: 0.5 while scanning, eases to 1 when lights come on. */
    uDim: { value: 1 },
    uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    uTint: { value: SCAN_TINT.close.clone() },
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
    uniform sampler2D tDepth;
    uniform float uProgress;
    uniform float uStrength;
    uniform float uDim;
    uniform vec2 uTexel;
    uniform vec3 uTint;
    varying vec2 vUv;
    ${SCAN_SHARED}
    vec3 blendScreen(vec3 base, vec3 blend){
      return 1.0 - (1.0 - base) * (1.0 - blend);
    }
    void main(){
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 base = color.rgb * uDim;
      if (uStrength < 0.001) {
        gl_FragColor = vec4(base, color.a);
        return;
      }
      vec3 mask = neonMask(tDepth, vUv, uTexel, uProgress, uStrength, uTint);
      gl_FragColor = vec4(blendScreen(base, mask), color.a);
    }
  `,
};

/** Neon-only (transparent) for the DOM overlay above Html Nodes. */
const overlayMaskShader = {
  uniforms: {
    tDepth: { value: null as THREE.Texture | null },
    uProgress: { value: 0 },
    uStrength: { value: 0 },
    uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDepth;
    uniform float uProgress;
    uniform float uStrength;
    uniform vec2 uTexel;
    uniform vec3 uTint;
    varying vec2 vUv;
    ${SCAN_SHARED}
    void main(){
      vec3 mask = neonMask(tDepth, vUv, uTexel, uProgress, uStrength, uTint);
      float a = clamp(max(mask.r, max(mask.g, mask.b)) * 0.12, 0.0, 1.0);
      gl_FragColor = vec4(mask, a);
    }
  `,
};

const depthVertex = /* glsl */ `
  uniform float uNear;
  uniform float uFar;
  varying float vMetric;
  void main(){
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Invert view-Z so progress 0→1 sweeps top (opponent / far) → bottom (you / near).
    float viewZ = clamp((-mv.z - uNear) / max(0.001, uFar - uNear), 0.0, 1.0);
    float height = clamp(world.y / 1.15, 0.0, 1.0);
    vMetric = clamp((1.0 - viewZ) * 0.80 + height * 0.20, 0.0, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const depthFragment = /* glsl */ `
  varying float vMetric;
  void main(){
    gl_FragColor = vec4(vec3(vMetric), 1.0);
  }
`;

/** Backdrop artwork read as relief: ± half this much depth on top of the floor plate's own view-Z ramp. */
const BACKDROP_RELIEF = 0.16;
/** Map-uv radius of the 3×3 tap that averages source detail into broad depth shapes. */
const BACKDROP_BLUR = 1 / 220;
/** Plate art lives in a narrow dark band (10th–90th lightness ≈ 0.12–0.48); this window restretches it. */
const BACKDROP_LEVELS = { lo: 0.1, hi: 0.52 } as const;

/** The floor plate is flat, so its artwork supplies the relief the board gets from real geometry. */
const backdropDepthVertex = /* glsl */ `
  uniform float uNear;
  uniform float uFar;
  varying float vGeo;
  varying vec2 vMapUv;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vMapUv = uv;
    vGeo = clamp((-mv.z - uNear) / max(0.001, uFar - uNear), 0.0, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const backdropDepthFragment = /* glsl */ `
  uniform sampler2D tMap;
  uniform float uRelief;
  uniform float uBlur;
  varying float vGeo;
  varying vec2 vMapUv;
  float luma(vec2 uv){
    vec3 c = texture2D(tMap, clamp(uv, 0.0, 1.0)).rgb;
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
  }
  void main(){
    float sum = 0.0;
    for (int y = -1; y <= 1; y++){
      for (int x = -1; x <= 1; x++){
        sum += luma(vMapUv + vec2(float(x), float(y)) * uBlur);
      }
    }
    // Samples are linear-light; the 1/2.2 lift turns them into perceptual lightness, where bright reads as near.
    float lightness = pow(clamp(sum / 9.0, 0.0, 1.0), 0.4545);
    float relief = smoothstep(${BACKDROP_LEVELS.lo.toFixed(3)}, ${BACKDROP_LEVELS.hi.toFixed(3)}, lightness) - 0.5;
    // Matches the board's (1 - viewZ) * 0.80 term (its height term is 0 at floor level) so the band crosses the seam unbroken.
    gl_FragColor = vec4(vec3(clamp((1.0 - vGeo) * 0.80 + relief * uRelief, 0.0, 1.0)), 1.0);
  }
`;

const _clearColor = new THREE.Color();

/** The floor plate opts in with `userData.scanBackground`; it is hidden during the board depth render. */
function findBackdrop(scene: THREE.Scene): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  scene.traverse(obj => {
    if (obj.visible && obj.userData?.scanBackground && (obj as THREE.Mesh).isMesh) found = obj as THREE.Mesh;
  });
  return found;
}

type Props = {
  active: boolean;
  duration?: number;
  onPass?: (pass: ShaderPass | null) => void;
  onScanning?: (scanning: boolean) => void;
  /** 0 = dimmed (scan), 1 = full lights — drives HUD + servers. */
  onPower?: (power: number) => void;
  /** DOM canvas above the Html HUD — receives neon-only blit so Nodes get the scan. */
  overlayRef?: RefObject<HTMLCanvasElement | null>;
  tone?: BoardScanTone;
};

export function NeonHorizonScan({
  active,
  tone = 'close',
  duration = BOARD_SCAN_MS.normal / 1000,
  onPass,
  onScanning,
  onPower,
  overlayRef,
}: Props) {
  const { gl, scene, camera, size } = useThree();
  const running = useRef(false);
  const lighting = useRef(false);
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const passRef = useRef<ShaderPass | null>(null);
  const proxy = useRef({ p: 0, dim: 1, strength: 0, power: 1 });
  const tweenRef = useRef<gsap.core.Tween | gsap.core.Timeline | null>(null);
  const onScanningRef = useRef(onScanning);
  onScanningRef.current = onScanning;
  const onPowerRef = useRef(onPower);
  onPowerRef.current = onPower;
  const pixelBuffer = useRef<Uint8Array | null>(null);
  const flipBuffer = useRef<Uint8ClampedArray | null>(null);

  const depthTarget = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });
    rt.texture.generateMipmaps = false;
    return rt;
  }, []);

  /** Half-res neon mask for HUD overlay (readPixels budget). */
  const maskTarget = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
    });
    rt.texture.generateMipmaps = false;
    return rt;
  }, []);

  const depthMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: depthVertex,
        fragmentShader: depthFragment,
        side: THREE.DoubleSide,
        uniforms: {
          uNear: { value: DEPTH_NEAR },
          uFar: { value: DEPTH_FAR },
        },
      }),
    [],
  );

  const backdropMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: backdropDepthVertex,
        fragmentShader: backdropDepthFragment,
        side: THREE.DoubleSide,
        uniforms: {
          tMap: { value: null as THREE.Texture | null },
          uNear: { value: DEPTH_NEAR },
          uFar: { value: DEPTH_FAR },
          uRelief: { value: BACKDROP_RELIEF },
          uBlur: { value: BACKDROP_BLUR },
        },
      }),
    [],
  );

  /** Stand-in that borrows the live plate's geometry and world matrix each frame. */
  const backdropScene = useMemo(() => {
    const s = new THREE.Scene();
    const placeholder = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>(placeholder, backdropMaterial);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.matrixWorldAutoUpdate = false;
    s.add(mesh);
    return { s, mesh, placeholder };
  }, [backdropMaterial]);

  const overlayMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          tDepth: { value: null as THREE.Texture | null },
          uProgress: { value: 0 },
          uStrength: { value: 0 },
          uTexel: { value: new THREE.Vector2(1, 1) },
          uTint: { value: SCAN_TINT.close.clone() },
        },
        vertexShader: overlayMaskShader.vertexShader,
        fragmentShader: overlayMaskShader.fragmentShader,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
    [],
  );

  const overlayScene = useMemo(() => {
    const s = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), overlayMaterial);
    s.add(mesh);
    return { s, cam };
  }, [overlayMaterial]);

  const toneRef = useRef(tone);
  toneRef.current = tone;
  useEffect(() => {
    passRef.current?.uniforms.uTint.value.copy(SCAN_TINT[tone]);
    overlayMaterial.uniforms.uTint.value.copy(SCAN_TINT[tone]);
  }, [tone, overlayMaterial]);

  useEffect(() => {
    const pass = new ShaderPass(neonScanShader);
    pass.material.toneMapped = false;
    pass.uniforms.uTint.value.copy(SCAN_TINT[toneRef.current]);
    pass.uniforms.tDepth.value = depthTarget.texture;
    pass.enabled = false;
    passRef.current = pass;
    onPass?.(pass);
    return () => {
      onPass?.(null);
      pass.dispose();
      passRef.current = null;
    };
  }, [depthTarget, onPass]);

  useEffect(
    () => () => {
      tweenRef.current?.kill();
      depthTarget.dispose();
      maskTarget.dispose();
      depthMaterial.dispose();
      backdropMaterial.dispose();
      backdropScene.placeholder.dispose();
      overlayMaterial.dispose();
      onScanningRef.current?.(false);
      const overlay = overlayRef?.current;
      if (overlay) {
        const ctx = overlay.getContext('2d');
        ctx?.clearRect(0, 0, overlay.width, overlay.height);
      }
    },
    [depthTarget, maskTarget, depthMaterial, backdropMaterial, backdropScene, overlayMaterial, overlayRef],
  );

  useEffect(() => {
    const pr = Math.min(gl.getPixelRatio(), 1.5);
    const w = Math.max(2, Math.floor(size.width * pr));
    const h = Math.max(2, Math.floor(size.height * pr));
    depthTarget.setSize(w, h);
    const mw = Math.max(2, Math.floor(w * 0.45));
    const mh = Math.max(2, Math.floor(h * 0.45));
    maskTarget.setSize(mw, mh);
    const pass = passRef.current;
    if (pass) pass.uniforms.uTexel.value.set(1 / w, 1 / h);
    overlayMaterial.uniforms.uTexel.value.set(1 / w, 1 / h);
    const overlay = overlayRef?.current;
    if (overlay) {
      overlay.width = mw;
      overlay.height = mh;
    }
    pixelBuffer.current = null;
    flipBuffer.current = null;
  }, [gl, size, depthTarget, maskTarget, overlayMaterial, overlayRef]);

  useEffect(() => {
    const pass = passRef.current;
    tweenRef.current?.kill();
    tweenRef.current = null;

    const finishOff = () => {
      running.current = false;
      lighting.current = false;
      proxy.current = { p: 0, dim: 1, strength: 0, power: 1 };
      onScanningRef.current?.(false);
      onPowerRef.current?.(1);
      if (pass) {
        pass.enabled = false;
        pass.uniforms.uProgress.value = 0;
        pass.uniforms.uStrength.value = 0;
        pass.uniforms.uDim.value = 1;
      }
      overlayMaterial.uniforms.uStrength.value = 0;
      const overlay = overlayRef?.current;
      if (overlay) {
        const ctx = overlay.getContext('2d');
        ctx?.clearRect(0, 0, overlay.width, overlay.height);
      }
    };

    if (!active || reduced) {
      finishOff();
      return;
    }

    proxy.current = { p: 0, dim: 0.5, strength: 1, power: 0 };
    running.current = true;
    lighting.current = false;
    onScanningRef.current?.(true);
    onPowerRef.current?.(0);
    if (pass) {
      pass.enabled = true;
      pass.uniforms.uProgress.value = 0;
      pass.uniforms.uStrength.value = 1;
      pass.uniforms.uDim.value = 0.5;
    }

    const syncPass = () => {
      if (!passRef.current) return;
      passRef.current.uniforms.uProgress.value = proxy.current.p;
      passRef.current.uniforms.uStrength.value = proxy.current.strength;
      passRef.current.uniforms.uDim.value = proxy.current.dim;
      overlayMaterial.uniforms.uProgress.value = proxy.current.p;
      overlayMaterial.uniforms.uStrength.value = proxy.current.strength;
      onPowerRef.current?.(proxy.current.power);
    };

    const tl = gsap.timeline({
      onComplete: () => {
        running.current = false;
        lighting.current = false;
        onScanningRef.current?.(false);
        onPowerRef.current?.(1);
        if (passRef.current) {
          passRef.current.enabled = false;
          passRef.current.uniforms.uStrength.value = 0;
          passRef.current.uniforms.uDim.value = 1;
          passRef.current.uniforms.uProgress.value = 1;
        }
        overlayMaterial.uniforms.uStrength.value = 0;
        const overlay = overlayRef?.current;
        if (overlay) {
          const ctx = overlay.getContext('2d');
          ctx?.clearRect(0, 0, overlay.width, overlay.height);
        }
      },
    });
    tl.to(proxy.current, {
      p: 1,
      duration: Math.max(0.2, duration),
      ease: 'power3.out',
      onUpdate: syncPass,
    });
    tl.add(() => {
      lighting.current = true;
      running.current = false;
    });
    tl.to(proxy.current, {
      dim: 1,
      strength: 0,
      power: 1,
      duration: BOARD_SCAN_LIGHTS_MS / 1000,
      ease: 'power2.out',
      onUpdate: syncPass,
    });
    tweenRef.current = tl;

    return () => {
      tweenRef.current?.kill();
      tweenRef.current = null;
    };
  }, [active, reduced, duration, overlayMaterial, overlayRef]);

  useFrame(() => {
    const pass = passRef.current;
    const needDepth = (running.current || lighting.current) && pass && active && !reduced;
    if (!needDepth) return;

    // Depth only while the neon band is moving; lights-up reuses last depth / no neon.
    if (running.current) {
      const backdrop = findBackdrop(scene);
      const hidden: THREE.Object3D[] = [];
      const world = new THREE.Vector3();
      scene.traverse(obj => {
        let skip =
          (obj as THREE.Light).isLight ||
          (obj as THREE.Line).isLine ||
          (obj as THREE.LineSegments).isLineSegments ||
          obj.type === 'GridHelper' ||
          !!obj.userData?.skipScanDepth;
        if (!skip && (obj as THREE.Mesh).isMesh && obj.visible) {
          obj.getWorldPosition(world);
          if (Math.abs(world.x) > 12 || Math.abs(world.z) > 10 || world.y < -0.4 || world.y > 4) skip = true;
        }
        if (skip && obj.visible) {
          obj.visible = false;
          hidden.push(obj);
        }
      });

      const prevOverride = scene.overrideMaterial;
      const prevBg = scene.background;
      const prevAutoClear = gl.autoClear;
      const prevClearAlpha = gl.getClearAlpha();
      gl.getClearColor(_clearColor);

      gl.setRenderTarget(depthTarget);
      gl.setClearColor(0x000000, 1);
      gl.clear();
      // Both draws share one depth buffer, so the board writes over the plate where it occludes it.
      gl.autoClear = false;
      scene.background = null;

      // Drawn through a stand-in because the plate is hidden for the board pass, and
      // scene.overrideMaterial would deny it the artwork it needs to sample.
      if (backdrop) {
        const map = (backdrop.material as THREE.MeshBasicMaterial).map ?? null;
        backdropMaterial.uniforms.tMap.value = map;
        backdropMaterial.uniforms.uRelief.value = map ? BACKDROP_RELIEF : 0;
        backdropScene.mesh.geometry = backdrop.geometry;
        backdropScene.mesh.matrixWorld.copy(backdrop.matrixWorld);
        gl.render(backdropScene.s, camera);
      }

      scene.overrideMaterial = depthMaterial;
      gl.render(scene, camera);

      gl.setRenderTarget(null);
      gl.autoClear = prevAutoClear;
      gl.setClearColor(_clearColor, prevClearAlpha);
      scene.overrideMaterial = prevOverride;
      scene.background = prevBg;
      hidden.forEach(obj => {
        obj.visible = true;
      });

      pass!.uniforms.tDepth.value = depthTarget.texture;

      const overlay = overlayRef?.current;
      if (overlay && proxy.current.strength > 0.01) {
        overlayMaterial.uniforms.tDepth.value = depthTarget.texture;
        overlayMaterial.uniforms.uProgress.value = proxy.current.p;
        overlayMaterial.uniforms.uStrength.value = proxy.current.strength;
        gl.setRenderTarget(maskTarget);
        gl.clear();
        gl.render(overlayScene.s, overlayScene.cam);
        gl.setRenderTarget(null);

        const w = maskTarget.width;
        const h = maskTarget.height;
        const need = w * h * 4;
        if (!pixelBuffer.current || pixelBuffer.current.length !== need) {
          pixelBuffer.current = new Uint8Array(need);
          flipBuffer.current = new Uint8ClampedArray(need);
        }
        gl.readRenderTargetPixels(maskTarget, 0, 0, w, h, pixelBuffer.current);
        const src = pixelBuffer.current;
        const dst = flipBuffer.current!;
        const stride = w * 4;
        for (let y = 0; y < h; y++) {
          dst.set(src.subarray(y * stride, y * stride + stride), (h - 1 - y) * stride);
        }
        const ctx = overlay.getContext('2d');
        if (ctx) {
          if (overlay.width !== w || overlay.height !== h) {
            overlay.width = w;
            overlay.height = h;
          }
          const image = ctx.createImageData(w, h);
          image.data.set(dst);
          ctx.putImageData(image, 0, 0);
        }
      }
    } else if (lighting.current) {
      const overlay = overlayRef?.current;
      if (overlay && proxy.current.strength < 0.02) {
        const ctx = overlay.getContext('2d');
        ctx?.clearRect(0, 0, overlay.width, overlay.height);
      }
    }
  }, -1);

  return null;
}
