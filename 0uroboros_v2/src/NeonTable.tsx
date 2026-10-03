import { useEffect, useMemo } from 'react';
import type * as THREE from 'three';
import { NeonGlassMaterial } from './neonMaterials';
import { useNeonCarPaint } from './neonCarPaint';
import { useNeonLiquid } from './neonLiquid';
import { NeonApron } from './NeonApron';
import { NeonServerBases } from './NeonServerBases';
import { NeonSideRails } from './NeonSideRails';
import { NeonGlassGlint } from './NeonGlassGlint';
import { GlassSheen } from './NeonGlassSheen';
import { DEFAULT_NEON_SURFACE, type NeonSurface } from './neonSurfaces';
import {
  FRAME_HOLE,
  FRAME_OUTER,
  GLASS_BEVEL,
  GLASS_OUTLINE,
  NEON_CHASSIS_TOP,
  NEON_FRAME_TOP,
  TABLE_OUTLINE,
  NEON_TABLE_BOTTOM,
  capGeometry,
  offsetOutline,
  roundedSlabGeometry,
  slabGeometry,
} from './neonTableGeometry';

const CHASSIS_BEVEL = .0125;
const CHASSIS_Y = NEON_TABLE_BOTTOM;
const CHASSIS_SPAN = [NEON_CHASSIS_TOP, NEON_TABLE_BOTTOM] as const;
const FRAME_BEVEL = GLASS_BEVEL;
/**
 * The frame and the chassis read as one piece: the chassis wall runs square up into the frame, whose outer edge sits
 * flush on it and rolls over into the top in this wider round.
 */
const FRAME_ROLL = .04;
const DECK_TOP = .045;
const FRAME_Y = NEON_CHASSIS_TOP;
/** The white frame is see-through enough that the chassis walls, seen from inside, show as the table's real edge. */
const FRAME_OPACITY = .6;

function GlassFrame({ geometry, liquid = false }: { geometry: THREE.BufferGeometry; liquid?: boolean }) {
  return (
    <>
      <mesh name="white-glass-frame" geometry={geometry} position={[0, FRAME_Y, 0]} receiveShadow renderOrder={-1}>
        <NeonGlassMaterial variant="frame" outline={FRAME_OUTER} hole={FRAME_HOLE} opacity={FRAME_OPACITY} liquid={liquid} />
      </mesh>
      <GlassSheen geometry={geometry} position={[0, FRAME_Y, 0]} minTilt={.04} />
    </>
  );
}

const PAINT_FRAME = { outline: FRAME_OUTER, hole: FRAME_HOLE, glints: true };
const PAINT_WALL = { outline: TABLE_OUTLINE, wall: CHASSIS_SPAN };

function PaintFrame({ geometry }: { geometry: THREE.BufferGeometry }) {
  const paint = useNeonCarPaint(PAINT_FRAME);
  return <mesh name="white-paint-frame" geometry={geometry} material={paint} position={[0, FRAME_Y, 0]} receiveShadow />;
}

/**
 * The table's thickness as an open glass shell: walls and floor with no top, drawn from both sides, so through the
 * frame the far walls show from inside. The cap closes the strip between the deck and the frame.
 */
function GlassChassis({ shell, cap, liquid = false }: { shell: THREE.BufferGeometry; cap: THREE.BufferGeometry; liquid?: boolean }) {
  return (
    <>
      <mesh name="chassis" geometry={shell} position={[0, CHASSIS_Y, 0]} receiveShadow castShadow>
        <NeonGlassMaterial variant="wall" outline={TABLE_OUTLINE} wall={CHASSIS_SPAN} twoSided liquid={liquid} />
      </mesh>
      <mesh name="chassis-cap" geometry={cap} receiveShadow>
        <NeonGlassMaterial variant="wall" outline={TABLE_OUTLINE} wall={CHASSIS_SPAN} liquid={liquid} />
      </mesh>
      <GlassSheen geometry={shell} position={[0, CHASSIS_Y, 0]} wall={CHASSIS_SPAN} />
    </>
  );
}

function PaintChassis({ geometry }: { geometry: THREE.BufferGeometry }) {
  const paint = useNeonCarPaint(PAINT_WALL);
  return <mesh name="chassis" geometry={geometry} material={paint} position={[0, CHASSIS_Y, 0]} receiveShadow castShadow />;
}

const LIQUID_FRAME = { outline: FRAME_OUTER, hole: FRAME_HOLE };
const LIQUID_WALL = { outline: TABLE_OUTLINE, wall: CHASSIS_SPAN };

/** Frame and chassis in the demo's clear liquid glass, each lit like Apple glass across its own bars or faces. */
function LiquidShell({ chassis, frame }: { chassis: THREE.BufferGeometry; frame: THREE.BufferGeometry }) {
  const frameGlass = useNeonLiquid(LIQUID_FRAME);
  const wallGlass = useNeonLiquid(LIQUID_WALL);
  return (
    <>
      <mesh name="chassis" geometry={chassis} material={wallGlass} position={[0, CHASSIS_Y, 0]} receiveShadow castShadow />
      <mesh name="liquid-glass-frame" geometry={frame} material={frameGlass} position={[0, FRAME_Y, 0]} receiveShadow />
    </>
  );
}

/** Complete procedural Neon table shell (presentation only). */
export function NeonTable({ surface = DEFAULT_NEON_SURFACE }: { surface?: NeonSurface }) {
  const refracted = surface === 'liquidGlass';
  const geometries = useMemo(() => {
    const chassisRounds = { top: 0, bottom: CHASSIS_BEVEL }, chassisHeight = NEON_CHASSIS_TOP - NEON_TABLE_BOTTOM;
    return {
      chassis: roundedSlabGeometry(TABLE_OUTLINE, chassisRounds, chassisHeight),
      shell: roundedSlabGeometry(TABLE_OUTLINE, chassisRounds, chassisHeight, { capTop: false }),
      cap: capGeometry(offsetOutline(FRAME_HOLE, FRAME_BEVEL * 2), NEON_CHASSIS_TOP - .001),
      deck: slabGeometry(offsetOutline(GLASS_OUTLINE, -GLASS_BEVEL), DECK_TOP - NEON_CHASSIS_TOP - GLASS_BEVEL * 2, GLASS_BEVEL),
      frame: roundedSlabGeometry(FRAME_OUTER, { top: FRAME_ROLL, bottom: 0 }, NEON_FRAME_TOP - NEON_CHASSIS_TOP, {
        hole: FRAME_HOLE, holeRounds: { top: FRAME_BEVEL, bottom: FRAME_BEVEL },
      }),
    };
  }, []);

  useEffect(() => () => Object.values(geometries).forEach(g => g.dispose()), [geometries]);

  return (
    <group name="neon-table">
      {surface === 'paint' && <><PaintChassis geometry={geometries.chassis} /><PaintFrame geometry={geometries.frame} /></>}
      {surface === 'liquid' && <LiquidShell chassis={geometries.chassis} frame={geometries.frame} />}
      {(surface === 'glass' || refracted) && <>
        <GlassChassis shell={geometries.shell} cap={geometries.cap} liquid={refracted} />
        <GlassFrame geometry={geometries.frame} liquid={refracted} />
      </>}
      <mesh name="frosted-glass-deck" geometry={geometries.deck} position={[0, NEON_CHASSIS_TOP + GLASS_BEVEL, 0]} receiveShadow>
        <NeonGlassMaterial variant="matte" />
      </mesh>
      <NeonSideRails />
      <NeonGlassGlint />
      <NeonServerBases deck="matte" />
      <NeonApron />
    </group>
  );
}
