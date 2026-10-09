import { Suspense, useEffect, useMemo, useRef } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { HudHologram } from './HudHologram';
import { HudStack } from './HudStack';
import { FLAT_LOOK, easeLook, mouseLook, type HudLook } from './hudLook';
import { useHudTuning } from './hudTuning';
import { CORE_HUD_SPAN, coreHudRadius, useSingularityField } from './Singularity';

/** The HUD camera frames a 2-unit square at the origin, which the shader lays over CORE_HUD_SPAN shadow radii. */
const FOV = 30;
const CAMERA_Z = 1 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
/** The event horizon's radius on z = 0, the plane the HUD rests on. */
const HORIZON_RADIUS = 1 / CORE_HUD_SPAN;
/** Each design's largest ring against the horizon. */
const HUD_SCALE = 1.25;
const HUD_RADIUS = HORIZON_RADIUS * HUD_SCALE;
/** Render target sizes step in this many pixels, so the opening hole doesn't reallocate it every frame. */
const TARGET_STEP = 128;
const MAX_TARGET = 2048;
/** Seconds for the pose to close most of the way to the cursor's. */
const LOOK_EASE_S = .18;
/** Runs after the scene's own frame work and before BoardFinish (priority 1) composites the frame. */
const RENDER_PRIORITY = .5;

/**
 * The chosen HUD design, drawn on its own into a texture the black hole shows inside its shadow. It rests on the event
 * horizon, starting flat and face-on; once `follow` is set it turns to look at the cursor and its layers stand out from
 * the horizon the further the cursor is from the hole's centre.
 */
export function BlackHoleHud({ pass, follow }: { pass: ShaderPass | null; follow: boolean }) {
  const field = useSingularityField();
  const gl = useThree(state => state.gl);
  const { coreHud: choice } = useHudTuning();
  const scene = useMemo(() => new THREE.Scene(), []);
  const camera = useMemo(() => {
    const created = new THREE.PerspectiveCamera(FOV, 1, .1, 20);
    created.position.set(0, 0, CAMERA_Z);
    return created;
  }, []);
  // Mipmapped so the shader can sample it blurred for the glow behind the disk.
  const target = useMemo(() => new THREE.WebGLRenderTarget(1, 1, { samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter }), []);
  const look = useRef<HudLook>({ ...FLAT_LOOK }).current;
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const clear = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const move = (event: PointerEvent) => { pointer.current = { x: event.clientX, y: event.clientY }; };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, []);
  useEffect(() => () => target.dispose(), [target]);
  useEffect(() => {
    if (!pass) return;
    return () => { pass.uniforms.uCoreHudAmount.value = 0; pass.uniforms.tCoreHud.value = null; };
  }, [pass]);

  useFrame((_, delta) => {
    const f = field?.current;
    if (!pass || !f) return;
    const radius = coreHudRadius(f);
    if (radius < 1) { pass.uniforms.uCoreHudAmount.value = 0; return; }

    const rect = gl.domElement.getBoundingClientRect();
    const at = follow && pointer.current;
    const goal = at ? mouseLook((at.x - rect.left - f.cx) / (rect.width / 2), (f.cy - (at.y - rect.top)) / (rect.height / 2)) : FLAT_LOOK;
    easeLook(look, goal, 1 - Math.exp(-Math.min(delta, .05) / LOOK_EASE_S));

    const px = Math.min(MAX_TARGET, Math.ceil(2 * radius * gl.getPixelRatio() / TARGET_STEP) * TARGET_STEP);
    if (target.width !== px) target.setSize(px, px);
    const previous = gl.getRenderTarget(), alpha = gl.getClearAlpha();
    gl.getClearColor(clear);
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(previous);
    gl.setClearColor(clear, alpha);
    pass.uniforms.tCoreHud.value = target.texture;
    pass.uniforms.uCoreHudAmount.value = 1;
  }, RENDER_PRIORITY);

  return createPortal(<>
    <group visible={choice === 'rings'}><Suspense fallback={null}><HudHologram radius={HUD_RADIUS} look={look}/></Suspense></group>
    <group visible={choice === 'stack'}><HudStack radius={HUD_RADIUS} look={look}/></group>
  </>, scene, { camera });
}
