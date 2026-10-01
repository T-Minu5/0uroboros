import { useGSAP } from '@gsap/react';
import { RoundedBox, useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useCallback, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { neonIntensity } from './boardMaterials';
import { usePlayerColors } from './playerTheme';

type Props = { x: number; z?: number; nodeIndex: number; cycle?: number; winner: 0 | 1 | 'tie' };

/** Tied Nodes seal in plain slate metal: no ring carries a player's colour. */
const SLATE = '#7d8a99';
/** Multiplies the grey metal matcap into gold. */
const GOLD_TINT = '#f4c74e';

/** Hover height so seals sit clear of lane plates, cards, and the board surface. */
const SEAL_HEIGHT = 2.65;
/** Nudge seals down in screen space so they sit over their Node. */
const SCREEN_DOWN_PX = 64;
const _screenDown = new THREE.Vector3();

export const MATCAP_URL = '/assets/matcaps/1.jpeg';
useTexture.preload(MATCAP_URL);

/*
 * Every seal material is unlit (matcap or basic). Seals mount mid-Collapse, and a lit material or a light of their own
 * would change the scene's light set, which makes three.js recompile every lit material on the board.
 */

/** Codrops-style grey metal matcap; `tint` multiplies it, e.g. toward slate. */
function Metal({ tint }: { tint?: string }) {
  const matcap = useTexture(MATCAP_URL);
  return <meshMatcapMaterial matcap={matcap} color={tint} />;
}

/** Single gold accent piece per seal. */
function Gold() {
  return <Metal tint={GOLD_TINT} />;
}

/** Unlit colour lifted to the board's neon luminance `level`, so it clears the bloom threshold like the emissive trim. */
function NeonBasic({ color, level }: { color: string; level: number }) {
  const hdr = useMemo(() => new THREE.Color(color).multiplyScalar(neonIntensity(color, level)), [color, level]);
  return <meshBasicMaterial color={hdr} toneMapped={false} />;
}

/** Emissive piece in a player's colour, lifted to the board's neon level so it reads as a glow. */
function Glow({ color }: { color: string }) {
  return <NeonBasic color={color} level={1.3} />;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Rings — a nucleus ring with three orbits tumbling (Codrops), resting in an atom pose.
 * The smallest is the centre: gold by default, `glow` for a winner, and slate like the rest when `slate`.
 */
const RING_RADII = [0.5, 1.25, 1.25, 1.25];
/** Orbit tilt away from the camera; the orbits' minor axis must still clear the nucleus ring. */
const ORBIT_TILT = 0.99;
/** Each orbit's resting frame: flattened into an ellipse, then turned 60° apart (horizontal, ±30° from vertical) so they cross. */
const RING_FRAMES: [number, number, number, THREE.EulerOrder][] = [
  [0, 0, 0, 'XYZ'],
  [0, ORBIT_TILT, Math.PI / 2, 'ZYX'],
  [0, ORBIT_TILT, Math.PI / 6, 'ZYX'],
  [0, ORBIT_TILT, -Math.PI / 6, 'ZYX'],
];
/**
 * Starting angle of each orbit's light. At equal speed this spread keeps the lights at least
 * 1.3 orbit radii apart on screen in the resting pose, so no two reach a crossing together.
 */
const LIGHT_PHASES = [0, 0, (5 * Math.PI) / 3, (4 * Math.PI) / 3];
const LIGHT_LAP_S = 2.4;
const LIGHT_COLOR = '#fff1c8';
/** How long the rings rest in the atom pose between tumbles. */
const ATOM_HOLD_S = 3;
/** Shared by every seal, so a Node closing mid-Collapse allocates and uploads no geometry. */
const RING_GEOMETRIES = new Map(RING_RADII.map(radius => [radius, new THREE.TorusGeometry(radius, 0.1, 12, 48)]));
const BEAD_GEOMETRY = new THREE.SphereGeometry(0.13, 16, 12);

/** Stand-ins carrying the seals' two program variants, so they can be compiled before the first Node closes. */
export function sealWarmupScene(matcap: THREE.Texture) {
  const scene = new THREE.Scene();
  scene.add(
    new THREE.Mesh(BEAD_GEOMETRY, new THREE.MeshMatcapMaterial({ matcap })),
    new THREE.Mesh(BEAD_GEOMETRY, new THREE.MeshBasicMaterial({ toneMapped: false })),
  );
  return scene;
}

/** Tiny glowing bead riding its parent ring; parented to the ring mesh so it follows the tumble. */
function OrbitLight({ radius, phase, color, still }: { radius: number; phase: number; color: string; still: boolean }) {
  const bead = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!bead.current) return;
    const angle = phase + (still ? 0 : (clock.elapsedTime / LIGHT_LAP_S) * Math.PI * 2);
    bead.current.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  });
  return (
    <mesh ref={bead} geometry={BEAD_GEOMETRY}>
      <NeonBasic color={color} level={2.4} />
    </mesh>
  );
}

function EffectRings({ glow, slate = false }: { glow?: string; slate?: boolean }) {
  const reduced = useMemo(reducedMotion, []);
  const refs = useRef<THREE.Mesh[]>([]);
  const getRef = useCallback((mesh: THREE.Mesh | null) => {
    if (mesh && !refs.current.includes(mesh)) refs.current.push(mesh);
  }, []);
  useGSAP(() => {
    if (!refs.current.length || reduced) return;
    // A full turn on both axes lands every ring back in its resting frame, so each hold shows the atom.
    gsap.timeline({ repeat: -1, repeatDelay: ATOM_HOLD_S }).to(
      refs.current.map(m => m.rotation),
      { y: `+=${Math.PI * 2}`, x: `-=${Math.PI * 2}`, duration: 1.5, stagger: { each: 0.15 }, ease: 'none' },
    );
  }, [reduced]);
  return (
    <group scale={0.55}>
      {RING_RADII.map((radius, i) => (
        <group key={i} rotation={RING_FRAMES[i]}>
          <mesh ref={getRef} geometry={RING_GEOMETRIES.get(radius)}>
            {i > 0 || slate ? <Metal tint={slate ? SLATE : undefined} /> : glow ? <Glow color={glow} /> : <Gold />}
            {i > 0 && <OrbitLight radius={radius} phase={LIGHT_PHASES[i]} color={glow ?? LIGHT_COLOR} still={reduced} />}
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Loop — ring of boxes orbiting (Codrops). */
function EffectLoop() {
  const ring = useRef<THREE.Group>(null);
  const bars = useRef<THREE.Mesh[]>([]);
  const getRef = useCallback((mesh: THREE.Mesh | null) => {
    if (mesh && !bars.current.includes(mesh)) bars.current.push(mesh);
  }, []);
  const radius = 3;
  useGSAP(() => {
    if (!ring.current || !bars.current.length) return;
    gsap.timeline()
      .to(bars.current.map(m => m.rotation), { y: `+=${Math.PI * 2}`, repeat: -1, duration: 6, ease: 'none' })
      .to(ring.current.rotation, { z: Math.PI * 2, duration: 24, ease: 'none', repeat: -1 }, 0);
  }, []);
  return (
    <group scale={0.35}>
      <group ref={ring} scale={0.6}>
        {Array.from({ length: 20 }).map((_, i) => {
          const a = (i / 20) * Math.PI * 2;
          return (
            <mesh key={i} ref={getRef} rotation={[0, 0, a]} position={[Math.cos(a) * radius, Math.sin(a) * radius, 0]}>
              <boxGeometry args={[1, 0.2, 1]} />
              {i === 0 ? <Gold /> : <Metal />}
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

/** Coins — orbiting disks that spin in place (Codrops). */
function EffectCoins() {
  const root = useRef<THREE.Group>(null);
  const coins = useRef<THREE.Group[]>([]);
  const getRef = useCallback((group: THREE.Group | null) => {
    if (group && !coins.current.includes(group)) coins.current.push(group);
  }, []);
  const count = 8;
  const radius = 3;
  useFrame(() => {
    if (root.current) root.current.rotation.z -= 0.01;
    for (const coin of coins.current) {
      coin.rotation.x += 0.01;
      coin.rotation.y += 0.01;
      coin.rotation.z += 0.01;
    }
  });
  return (
    <group scale={0.35}>
      <group ref={root} scale={0.6}>
        {Array.from({ length: count }).map((_, i) => {
          const a = (i * 2 * Math.PI) / count + Math.PI / 4;
          return (
            <group key={i} ref={getRef} position={[radius * Math.cos(a), radius * Math.sin(a), 0]} rotation={[0, 0, a]}>
              <mesh rotation={[0, Math.PI / count, Math.PI / 2]}>
                <cylinderGeometry args={[1, 1, 0.1, 32]} />
                {i === 0 ? <Gold /> : <Metal />}
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
}

/** Core — dual octahedral cones + tumbling rings (Codrops). */
function EffectCore() {
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const root = useRef<THREE.Group>(null);
  useGSAP(() => {
    if (!ring1.current || !ring2.current || !root.current) return;
    gsap.timeline({ repeat: -1 })
      .to(ring1.current.rotation, { z: `+=${Math.PI * 2}`, x: `+=${Math.PI * 2}`, duration: 4, ease: 'none' }, 0)
      .to(ring2.current.rotation, { z: `-=${Math.PI * 2}`, x: `-=${Math.PI * 2}`, duration: 4, ease: 'none' }, 0)
      .to(root.current.rotation, { y: Math.PI * 2, duration: 4, ease: 'none' }, 0);
  }, []);
  return (
    <group ref={root} scale={0.4}>
      <mesh ref={ring1}>
        <torusGeometry args={[2.1, 0.1, 12, 48]} />
        <Metal />
      </mesh>
      <mesh ref={ring2} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.8, 0.1, 12, 48]} />
        <Metal />
      </mesh>
      <group scale={0.8}>
        <mesh position={[0, 1, 0]}>
          <coneGeometry args={[1, 1.41, 4]} />
          <Gold />
        </mesh>
        <mesh position={[0, -1, 0]} rotation={[-Math.PI, 0, 0]}>
          <coneGeometry args={[1, 1.41, 4]} />
          <Metal />
        </mesh>
      </group>
    </group>
  );
}

/** Rubik — 3×3×3 cubies in three twisting layers (Codrops), scaled −25%. */
function EffectRubik() {
  const root = useRef<THREE.Group>(null);
  const layerNeg = useRef<THREE.Group>(null);
  const layerMid = useRef<THREE.Group>(null);
  const layerPos = useRef<THREE.Group>(null);
  const gap = 1.1;
  const layers = useMemo(() => {
    const neg: [number, number, number][] = [];
    const mid: [number, number, number][] = [];
    const pos: [number, number, number][] = [];
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const cell: [number, number, number] = [x * gap, y * gap, z * gap];
          if (z === -1) neg.push(cell);
          else if (z === 0) mid.push(cell);
          else pos.push(cell);
        }
      }
    }
    return [neg, mid, pos] as const;
  }, []);
  useGSAP(() => {
    if (!root.current || !layerNeg.current || !layerMid.current || !layerPos.current) return;
    gsap.timeline({ repeat: -1 })
      .to(layerNeg.current.rotation, { z: Math.PI, duration: 1.5, ease: 'power1.inOut' })
      .to(layerMid.current.rotation, { z: Math.PI, duration: 1.5, delay: 0.15, ease: 'power1.inOut' }, '<')
      .to(layerPos.current.rotation, { z: Math.PI, duration: 1.5, delay: 0.25, ease: 'power1.inOut' }, '<')
      .to(root.current.rotation, { y: Math.PI * 2, duration: 1.75, ease: 'none' }, 0);
  }, []);
  const cubie = (cells: readonly [number, number, number][], ref: RefObject<THREE.Group | null>, goldIndex: number) => (
    <group ref={ref}>
      {cells.map((pos, i) => (
        <mesh key={i} position={pos}>
          <boxGeometry args={[1, 1, 1]} />
          {i === goldIndex ? <Gold /> : <Metal />}
        </mesh>
      ))}
    </group>
  );
  // Codrops outer 1.2 × inner 0.6, then −25%.
  return (
    <group rotation={[0, 0, Math.PI / 8]} scale={1.2 * 0.75}>
      <group ref={root} rotation={[0, Math.PI / 2, 0]} scale={0.6}>
        {cubie(layers[0], layerNeg, 4)}
        {cubie(layers[1], layerMid, -1)}
        {cubie(layers[2], layerPos, -1)}
      </group>
    </group>
  );
}

/** Stagger — stacked rounded slabs twisting in sequence (Codrops). */
function EffectStagger() {
  const refs = useRef<THREE.Mesh[]>([]);
  const getRef = useCallback((mesh: THREE.Mesh | null) => {
    if (mesh && !refs.current.includes(mesh)) refs.current.push(mesh);
  }, []);
  useGSAP(() => {
    if (!refs.current.length) return;
    gsap.to(refs.current.map(m => m.rotation), {
      y: `+=${Math.PI / 2}`, repeat: -1, ease: 'back.out(1.4)', stagger: { each: 0.1 }, duration: 1,
    });
  }, []);
  return (
    <group scale={0.55} rotation={[Math.PI / 10, Math.PI / 4, 0]}>
      <group scale={3}>
        {Array.from({ length: 5 }).map((_, i) => (
          <RoundedBox key={i} ref={getRef} args={[1, 0.1, 1]} radius={0.02} position={[0, (i - 1) * 0.1, 0]}>
            {i === 2 ? <Gold /> : <Metal />}
          </RoundedBox>
        ))}
      </group>
    </group>
  );
}

/** Pulse — stacked cylinders pulsing radially (Codrops “Pulse”). */
function EffectPulse() {
  const refs = useRef<THREE.Mesh[]>([]);
  const getRef = useCallback((mesh: THREE.Mesh | null) => {
    if (mesh && !refs.current.includes(mesh)) refs.current.push(mesh);
  }, []);
  useGSAP(() => {
    if (!refs.current.length) return;
    refs.current.forEach((mesh, i) => {
      gsap.to(mesh.scale, {
        x: 0.3, z: 0.3, delay: 0.25 * i, repeat: -1, yoyo: true, ease: 'sine.inOut', duration: 1,
      });
    });
  }, []);
  return (
    <group scale={0.4} rotation={[0, 0, Math.PI / 4]}>
      <group rotation={[0, 0, Math.PI / 2]}>
        {Array.from({ length: 10 }).map((_, i) => (
          <mesh key={i} ref={getRef} position={[0, 0.5 * i, 2]}>
            <cylinderGeometry args={[1, 1, 0.2, 32]} />
            {i === 0 ? <Gold /> : <Metal />}
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Rings and other Codrops FX — seals use Rings; remaining effects stay available for other surfaces. */
export {
  EffectRings, EffectLoop, EffectCoins, EffectCore, EffectRubik, EffectStagger, EffectPulse,
};

/** Codrops Origami-style seal FX over a closed Node (always Rings), centred on the winner's colour. */
export function NodeSealOrigami({ x, z = 0, nodeIndex, cycle = 1, winner }: Props) {
  const root = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const colors = usePlayerColors();
  useFrame(() => {
    if (!root.current) return;
    const zoom = camera instanceof THREE.OrthographicCamera ? camera.zoom : 55;
    _screenDown.set(0, -1, 0).transformDirection(camera.matrixWorld);
    root.current.position.set(x, SEAL_HEIGHT, z);
    root.current.position.addScaledVector(_screenDown, SCREEN_DOWN_PX / zoom);
    // Face the view plane, not the camera's position: under the orthographic camera, aiming at a point tilts each
    // seal by its offset from centre, and only the middle Node's would read as the atom.
    root.current.quaternion.copy(camera.quaternion);
  });
  useGSAP(() => {
    if (!root.current || reducedMotion()) return;
    root.current.scale.setScalar(0.01);
    gsap.to(root.current.scale, { x: 0.48, y: 0.48, z: 0.48, duration: 0.55, ease: 'back.out(1.6)' });
  }, [nodeIndex, cycle]);
  return (
    <group ref={root} position={[x, SEAL_HEIGHT, z]} scale={0.48} renderOrder={20}>
      <EffectRings slate={winner === 'tie'} glow={winner === 'tie' ? undefined : colors[winner].accent} />
    </group>
  );
}
