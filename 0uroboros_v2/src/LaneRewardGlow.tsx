import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { ENGRAVING_LANES, ENGRAVING_W, LANE_RIM, LANE_RIM_HX, LANE_RIM_RADIUS } from './boardLayout';
import { lightingNow, useBoardLighting } from './boardLighting';
import { PATTERN_LANES, PATTERN_W, laneSealEdgeZ, laneSealProgress } from './laneSeal';

/**
 * Lane payout glow: emissive-map engraving panel, HDR instanced shapes, a perimeter sweep and one pooled point light.
 * Selection into bloom is purely by linear luminance, so every emissive term is normalised by the reward colour's
 * luminance (`gain = targetL / L`). Idle everything is hidden or at intensity 0; nothing mounts/unmounts.
 */
export type LaneWinner = 0 | 1 | 'tie';
type LaneRewardGlowProps = { x: number; index: number; awarding: boolean; winnerSide: LaneWinner; reward?: string; kind?: string; closed?: boolean };

const ENGRAVING = '/assets/materials/field-engraving.png';
/** Owner 0 = local/near lane, 1 = opponent/far lane. Matches `FieldEngravings`. */
const LANES = ENGRAVING_LANES.map((lane, owner) => ({ ...lane, rz: owner === 0 ? 0 : Math.PI }));
const LANE_W = ENGRAVING_W;
/** World z of the centre of each lane's 2×2 card block; on close the pattern shrinks about it, as the cards do. */
const CARD_BLOCK_Z = [2.659, -3.006] as const;
/** The sweep traces the centreline of the lane's gunmetal border; the plane overhangs it so the rim's falloff isn't cut. */
const SWEEP_MARGIN = .12;
const RIMS = LANE_RIM.map(({ z0, z1 }) => ({ z: (z0 + z1) / 2, d: z1 - z0 }));
/** Clip-plane constant that keeps the whole lane. */
const UNCLIPPED = 100;
/** Linear luminance of the engraving line texels (measured ≈ .15–.19). */
const ENGRAVE_L = .17;
const PANEL_L = 1.8, PANEL_OPACITY = .55, SWEEP_L = 2.4, ORB_L = 3.2, GEM_L = 2.6, LIGHT_I = 7;
const ORBS = 8, GEMS = 4, WARM_FRAMES = 3;

/**
 * Normalising luminance, floored at .4: dark hues (violet .27, blue .25) would otherwise need a dominant channel so hot
 * that ACES clips it to white. Gold/cyan/green (≥ .62) are unaffected; violet/blue land ~35% dimmer but still bloom.
 */
const luminance = (c: THREE.Color) => Math.max(.4, c.r * .2126 + c.g * .7152 + c.b * .0722);
const smooth = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
/** Instance → lane / slot within lane / instances in that lane. In a tie instances alternate lanes. */
const laneOf = (i: number, winner: LaneWinner) => winner === 'tie' ? i % 2 : winner;
const slotOf = (i: number, winner: LaneWinner) => winner === 'tie' ? i >> 1 : i;
const countOf = (i: number, n: number, winner: LaneWinner) => winner === 'tie' ? Math.ceil((n - (i % 2)) / 2) : n;

export function laneRewardColor(reward?: string, kind?: string) {
  const k = (kind ?? reward ?? '').toLowerCase();
  if (/crypto|coin/.test(k)) return '#1fffb1';
  if (/\bdraw\s+\d/.test(k) || k === 'draw') return '#4185ff';
  if (/\baction/.test(k)) return '#27e2ff';
  if (!k || /\bvp\b|victory|restore/.test(k)) return '#ffcc12';
  return '#bc64ff';
}

/** One point light for the whole board: every lane writes its request, lane 0 hosts the light and applies it. */
type LightSlot = { intensity: number; x: number; y: number; z: number; distance: number; color: THREE.Color };
const slots = new WeakMap<THREE.Scene, LightSlot>();
const O = new THREE.Object3D(), C = new THREE.Color(), HSL = { h: 0, s: 0, l: 0 };

const SWEEP_VERT = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
// Local +y is the lane's power end on both sides, so it takes the border's tight corners and -y the rounder outer ones.
const SWEEP_FRAG = `varying vec2 vUv;uniform vec3 uColor;uniform vec2 uSize,uHalf,uRadius;uniform float uLevel,uPhase,uHead,uRim;
void main(){
 vec2 p=(vUv-.5)*uSize;
 float r=p.y>0.?uRadius.x:uRadius.y;
 vec2 q=abs(p)-uHalf+r;float sd=length(max(q,0.))+min(max(q.x,q.y),0.)-r;
 float rim=exp(-abs(sd)*42.)+exp(-abs(sd)*12.)*.18;
 float s=atan(p.y,p.x)*.1591549+.5;
 float a=fract(s-uPhase),b=fract(s-uPhase+.5);
 float head=pow(a,18.)+pow(b,18.)+(a*a*a+b*b*b)*.22;
 gl_FragColor=vec4(uColor*rim*(uRim+head*uHead)*uLevel,1.);
}`;

export function LaneRewardGlow({ x, index, awarding, winnerSide, reward, kind, closed = false }: LaneRewardGlowProps) {
  const scene = useThree(s => s.scene);
  const lighting = useBoardLighting();
  const map = useTexture(ENGRAVING);
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const tint = useMemo(() => new THREE.Color(laneRewardColor(reward, kind)), [reward, kind]);
  const slot = useMemo(() => {
    let s = slots.get(scene);
    if (!s) slots.set(scene, s = { intensity: 0, x: 0, y: 1, z: 0, distance: 3, color: new THREE.Color() });
    return s;
  }, [scene]);
  const host = index === 0;
  const light = useRef<THREE.PointLight>(null);
  const panels = useRef<(THREE.Mesh | null)[]>([]);
  const panelMats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  /** Per-lane clip at the seal plate's leading edge: side 0 keeps z beyond it, side 1 keeps z before it. */
  const clips = useMemo(() => LANES.map((_, side) => new THREE.Plane(new THREE.Vector3(0, 0, side === 0 ? 1 : -1), UNCLIPPED)), []);
  const clipLists = useMemo(() => clips.map(clip => [clip]), [clips]);
  const sweeps = useRef<(THREE.Mesh | null)[]>([]);
  const sweepUniforms = useMemo(() => RIMS.map(rim => ({
    uColor: { value: new THREE.Color() }, uLevel: { value: 0 }, uPhase: { value: 0 }, uHead: { value: reduced ? 0 : 1.6 }, uRim: { value: reduced ? .6 : .3 },
    uSize: { value: new THREE.Vector2(LANE_RIM_HX * 2 + SWEEP_MARGIN * 2, rim.d + SWEEP_MARGIN * 2) }, uHalf: { value: new THREE.Vector2(LANE_RIM_HX, rim.d / 2) },
    uRadius: { value: new THREE.Vector2(LANE_RIM_RADIUS.power, LANE_RIM_RADIUS.outer) },
  })), [reduced]);
  // R3F copies each entry of a `uniforms` prop (freezing number uniforms); constructor args keep these objects live.
  const sweepArgs = useMemo(() => sweepUniforms.map(uniforms => [{ uniforms, vertexShader: SWEEP_VERT, fragmentShader: SWEEP_FRAG }] as [THREE.ShaderMaterialParameters]), [sweepUniforms]);
  const shapes = useMemo(() => {
    const make = (geometry: THREE.BufferGeometry, count: number) => {
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ toneMapped: false, fog: false }), count);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < count; i++) mesh.setColorAt(i, C.setRGB(1, 1, 1));
      return mesh;
    };
    return { orbs: make(new THREE.IcosahedronGeometry(1, 2), ORBS), gems: make(new THREE.OctahedronGeometry(1, 0), GEMS) };
  }, []);
  useEffect(() => () => Object.values(shapes).forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); m.dispose(); }), [shapes]);
  // Dark-saturated hue jitter around the reward colour, each instance normalised to unit luminance (material colour = target L).
  useEffect(() => {
    tint.getHSL(HSL);
    const paint = (mesh: THREE.InstancedMesh, spread: number) => {
      for (let i = 0; i < mesh.count; i++) {
        C.setHSL(HSL.h + (((i * .618) % 1) - .5) * spread, Math.min(1, HSL.s * .9 + .1), .45);
        mesh.setColorAt(i, C.multiplyScalar((.85 + .3 * ((i * .37) % 1)) / luminance(C)));
      }
      mesh.instanceColor!.needsUpdate = true;
    };
    paint(shapes.orbs, .07); paint(shapes.gems, .035);
  }, [tint, shapes]);

  /** Host only: apply the strongest lane request to the pooled light, then release the slot for the next frame. */
  const applyLight = () => {
    const l = light.current;
    if (!host || !l) return;
    l.intensity = slot.intensity;
    if (slot.intensity > 0) { l.position.set(slot.x, slot.y, slot.z); l.distance = slot.distance; l.color.copy(slot.color); }
    slot.intensity = 0;
  };
  const st = useRef({ on: false, stamp: -1, start: 0, from: 0, fade: 0, hold: 0, level: 0, warm: 0, hidden: false, sealStart: closed ? -Infinity : 0, sealDone: closed });
  // Closing starts the lane seal; the engraving shrinks with the cards and is covered by the plate as they are.
  const wasClosed = useRef(closed);
  useEffect(() => {
    const s = st.current;
    // A glow that has already faded out has nothing to carry under the plate.
    if (closed && !wasClosed.current) { s.sealStart = lightingNow(); s.sealDone = false; if (s.level === 0) s.hold = 0; }
    if (!closed) s.sealDone = false;
    wasClosed.current = closed;
  }, [closed]);
  useFrame((_, rawDelta) => {
    const s = st.current;
    const award = lighting.current.award, storeOn = award?.node === index;
    const on = awarding || storeOn;
    const sealing = closed && !s.sealDone && s.hold > 0;
    // Idle and already hidden: the host still serves other lanes' light requests, everyone else does nothing.
    if (!on && !sealing && s.level === 0 && s.hidden) { s.on = false; s.stamp = -1; applyLight(); return; }
    const now = lightingNow(), dt = Math.min(rawDelta, .05), stamp = storeOn ? award!.startedAt : -1;
    if (on && (!s.on || (storeOn && stamp !== s.stamp))) { s.start = storeOn ? award!.startedAt : now; s.from = s.level; }
    s.on = on; s.stamp = stamp;
    const age = Math.max(0, now - s.start), mt = reduced ? 0 : age;
    if (reduced) {
      s.fade = THREE.MathUtils.damp(s.fade, on ? 1 : 0, on ? 3 : 2, dt);
      if (!on && s.fade < .003) s.fade = 0;
      s.level = s.fade * .85;
    } else if (on) {
      // Attack to ~1.4x in .14s, settle, then breathe for as long as the award holds.
      const attack = smooth(age / .14);
      s.hold = THREE.MathUtils.lerp(s.from, 1, attack) + .4 * attack * Math.exp(-Math.max(0, age - .14) * 4.5) + .12 * Math.sin(age * 5.2) * smooth((age - .35) / .6);
      s.fade = 1; s.level = s.hold;
    } else {
      s.fade = THREE.MathUtils.damp(s.fade, 0, closed ? 7 : 3.5, dt);
      s.level = s.fade < .003 ? 0 : s.fade * s.hold;
    }
    const level = s.level, tie = winnerSide === 'tie';
    const warming = s.warm < WARM_FRAMES; if (warming) s.warm++;
    // While the seal runs the engraving holds its last level; the plate's edge hides it rather than a fade.
    const seal = sealing ? laneSealProgress(reduced ? Infinity : now - s.sealStart) : null;
    if (seal && seal.slide >= 1) { s.sealDone = true; s.hold = 0; }
    const patternLevel = seal ? (s.sealDone ? 0 : s.hold) : level;
    const show = level > 0 || patternLevel > 0 || warming;
    const lum = luminance(tint);

    for (let side = 0; side < 2; side++) {
      const share = tie ? .75 : winnerSide === side ? 1 : 0;
      const sideLevel = level * share, panelLevel = patternLevel * share;
      const panel = panels.current[side], mat = panelMats.current[side], sweep = sweeps.current[side], u = sweepUniforms[side];
      if (panel && mat) {
        panel.visible = show && (warming || panelLevel > 0);
        const scale = seal ? seal.scale : 1;
        panel.scale.setScalar(scale);
        panel.position.z = CARD_BLOCK_Z[side] + (PATTERN_LANES[side].z - CARD_BLOCK_Z[side]) * scale;
        clips[side].constant = seal ? (side === 0 ? -1 : 1) * laneSealEdgeZ(side, seal.slide) : UNCLIPPED;
        mat.opacity = PANEL_OPACITY * Math.min(1, panelLevel);
        mat.emissive.copy(tint);
        mat.emissiveIntensity = panelLevel * PANEL_L / (lum * ENGRAVE_L * Math.max(mat.opacity, 1e-3));
      }
      if (sweep) {
        sweep.visible = show && (warming || sideLevel > 0);
        u.uColor.value.copy(tint).multiplyScalar(SWEEP_L / lum);
        u.uLevel.value = sideLevel;
        u.uPhase.value = mt * .55;
      }
    }

    // Shapes: in a tie instances alternate lanes, otherwise all rise over the winner.
    const shapeLevel = level * (tie ? .8 : 1);
    const { orbs, gems } = shapes;
    orbs.visible = gems.visible = show;
    if (show) {
      (orbs.material as THREE.MeshBasicMaterial).color.setScalar(ORB_L * shapeLevel);
      (gems.material as THREE.MeshBasicMaterial).color.setScalar(GEM_L * shapeLevel);
      const grow = Math.min(1, shapeLevel), rise = reduced ? 1 : smooth(age / .6);
      for (let i = 0; i < ORBS; i++) {
        const lane = LANES[laneOf(i, winnerSide)], j = slotOf(i, winnerSide), count = countOf(i, ORBS, winnerSide);
        const cyc = mt / 1.6 + (j + .5) / count, u = cyc % 1;
        const phi = j * 2.399 + Math.floor(cyc) * 1.3, pull = 1 - .25 * u;
        O.position.set(x + Math.cos(phi) * (LANE_W / 2) * .92 * pull, .28 + u * 1.2, lane.z + Math.sin(phi) * (lane.d / 2) * .92 * pull);
        O.rotation.set(0, 0, 0);
        O.scale.setScalar((.05 + .03 * ((j * .37) % 1)) * 4 * u * (1 - u) * grow + 1e-4);
        O.updateMatrix(); orbs.setMatrixAt(i, O.matrix);
      }
      for (let i = 0; i < GEMS; i++) {
        const lane = LANES[laneOf(i, winnerSide)], j = slotOf(i, winnerSide), count = countOf(i, GEMS, winnerSide);
        const th = (j / count) * Math.PI * 2 + mt * .7;
        O.position.set(x + Math.cos(th) * (LANE_W / 2 + .12), .25 + (.25 + .08 * Math.sin(mt * 2.3 + j * 1.7)) * rise, lane.z + Math.sin(th) * (lane.d / 2 + .1));
        O.rotation.set(.4, mt * 2.5 + j, 0);
        O.scale.set(.07, .11, .07).multiplyScalar(grow + 1e-4);
        O.updateMatrix(); gems.setMatrixAt(i, O.matrix);
      }
      orbs.instanceMatrix.needsUpdate = gems.instanceMatrix.needsUpdate = true;
    }

    if (level > 0) {
      const intensity = LIGHT_I * level * (tie ? .8 : 1);
      if (intensity > slot.intensity) {
        slot.intensity = intensity; slot.x = x; slot.color.copy(tint);
        if (tie) { slot.y = 1.4; slot.z = (LANES[0].z + LANES[1].z) / 2; slot.distance = 4.2; }
        else { slot.y = .9; slot.z = LANES[winnerSide as number].z; slot.distance = 2.4; }
      }
    }
    applyLight();
    s.hidden = !show;
  });

  return <group>
    {host && <pointLight ref={light} intensity={0} distance={2.4} decay={2}/>}
    {LANES.map((lane, side) => <group key={side}>
      <mesh ref={m => { panels.current[side] = m; }} position={[x, .226, PATTERN_LANES[side].z]} rotation={[-Math.PI / 2, 0, lane.rz]} visible={false} renderOrder={2}>
        <planeGeometry args={[PATTERN_W, PATTERN_LANES[side].d]}/>
        <meshStandardMaterial ref={m => { panelMats.current[side] = m; }} color='#05070c' roughness={.4} metalness={.6} emissiveMap={map} emissive='#000000' emissiveIntensity={0} transparent opacity={0} depthWrite={false} clippingPlanes={clipLists[side]}/>
      </mesh>
      <mesh ref={m => { sweeps.current[side] = m; }} position={[x, .232, RIMS[side].z]} rotation={[-Math.PI / 2, 0, lane.rz]} visible={false} renderOrder={3}>
        <planeGeometry args={[LANE_RIM_HX * 2 + SWEEP_MARGIN * 2, RIMS[side].d + SWEEP_MARGIN * 2]}/>
        <shaderMaterial args={sweepArgs[side]} transparent depthWrite={false} blending={THREE.AdditiveBlending}/>
      </mesh>
    </group>)}
    <primitive object={shapes.orbs}/><primitive object={shapes.gems}/>
  </group>;
}
