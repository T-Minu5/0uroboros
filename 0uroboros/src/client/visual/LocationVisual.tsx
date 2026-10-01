import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Mesh } from 'three';
import * as THREE from 'three';

import { NODE_PLATFORM_WIDTH } from '../board/boardLayout';
import { LANE_DEPTH } from '../board/spatialGrammar';
import { COLOR } from './tokens';

/**
 * Full-height lane column. Cyan neon pad outline from board concept art.
 * The whole vertical strip is a legal drop onto one of the five Nodes.
 */
export function LocationVisual({
  collapsing,
  resolving,
  open,
  legal,
  selected,
  muted = false,
  lead = null,
  nodeIndex,
}: {
  collapsing: boolean;
  resolving: boolean;
  open: boolean;
  legal?: boolean;
  selected?: boolean;
  muted?: boolean;
  lead?: 'self' | 'rival' | null;
  nodeIndex?: number;
}) {
  const rim = useRef<Mesh>(null);
  const live = Boolean(resolving || legal || selected);
  const leadColor = lead === 'self' ? COLOR.self : lead === 'rival' ? COLOR.rival : COLOR.world;

  useFrame((_, delta) => {
    if (!rim.current) return;
    const mat = rim.current.material as THREE.MeshBasicMaterial;
    const target = collapsing ? 0.95 : live ? 0.88 : muted ? 0.12 : lead ? 0.48 : open ? 0.38 : 0.18;
    mat.opacity = THREE.MathUtils.damp(mat.opacity, target, 8, delta);
  });

  const accent = collapsing
    ? COLOR.chance
    : live
      ? COLOR.self
      : lead
        ? leadColor
        : COLOR.self;

  const width = NODE_PLATFORM_WIDTH - 0.1;
  const depth = LANE_DEPTH + 0.35;
  const wellW = width - 0.1;
  const wellD = depth - 0.12;
  const wallH = 0.1;

  return (
    <group position={[0, 0.03, 0]}>
      <mesh position={[0, -0.02, 0]}>
        <boxGeometry args={[width + 0.06, 0.05, depth + 0.06]} />
        <meshBasicMaterial color="#0a0810" transparent opacity={muted ? 0.28 : 0.55} />
      </mesh>
      <mesh position={[0, 0.005, 0]}>
        <boxGeometry args={[wellW, 0.03, wellD]} />
        <meshBasicMaterial
          color={open ? '#101018' : '#0c0a12'}
          transparent
          opacity={muted ? 0.32 : 0.62}
        />
      </mesh>
      {/* Concept pad: thin cyan neon rectangle outlining the Node region. */}
      <mesh position={[0, wallH * 0.45, wellD * 0.5]}>
        <boxGeometry args={[wellW, wallH, 0.028]} />
        <meshBasicMaterial color={accent} transparent opacity={muted ? 0.14 : live ? 0.72 : 0.42} />
      </mesh>
      <mesh position={[0, wallH * 0.45, -wellD * 0.5]}>
        <boxGeometry args={[wellW, wallH, 0.028]} />
        <meshBasicMaterial color={accent} transparent opacity={muted ? 0.12 : live ? 0.55 : 0.32} />
      </mesh>
      <mesh position={[-wellW * 0.5, wallH * 0.45, 0]}>
        <boxGeometry args={[0.028, wallH, wellD]} />
        <meshBasicMaterial color={accent} transparent opacity={muted ? 0.12 : 0.38} />
      </mesh>
      <mesh position={[wellW * 0.5, wallH * 0.45, 0]}>
        <boxGeometry args={[0.028, wallH, wellD]} />
        <meshBasicMaterial color={accent} transparent opacity={muted ? 0.12 : 0.38} />
      </mesh>
      <mesh ref={rim} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.028, 0]}>
        <ringGeometry args={[Math.min(wellW, wellD) * 0.26, Math.min(wellW, wellD) * 0.33, 40]} />
        <meshBasicMaterial color={accent} transparent opacity={0.14} side={THREE.DoubleSide} />
      </mesh>
      {lead ? <LeadChevron lead={lead} /> : null}
      {typeof nodeIndex === 'number' ? (
        <Html position={[0, 0.18, 0]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
          <span
            style={{
              color: '#f2f6fb',
              font: '700 11px Orbitron, sans-serif',
              letterSpacing: '0.12em',
              opacity: muted ? 0.25 : 0.55,
              textShadow: '0 0 8px #030012',
            }}
          >
            NODE {nodeIndex + 1}
          </span>
        </Html>
      ) : null}
    </group>
  );
}

function LeadChevron({ lead }: { lead: 'self' | 'rival' }) {
  const color = lead === 'self' ? COLOR.self : COLOR.rival;
  const z = lead === 'self' ? 0.95 : -0.95;
  const rot = lead === 'self' ? 0 : Math.PI;
  return (
    <mesh position={[0, 0.06, z]} rotation={[rot, 0, 0]}>
      <coneGeometry args={[0.12, 0.18, 3]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} />
    </mesh>
  );
}
