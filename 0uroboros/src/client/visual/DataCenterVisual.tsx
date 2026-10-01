import { useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import * as THREE from 'three';

import { COLOR } from './tokens';

export function DataCenterVisual({
  position,
  pool,
  side,
  struck,
  strike,
  label,
}: {
  position: [number, number, number];
  pool: 'primary' | 'backup';
  side: 'self' | 'rival';
  struck: boolean;
  strike: 'drain' | 'restore';
  label: string | null;
}) {
  const group = useRef<Group>(null);
  const rest = side === 'self' ? COLOR.self : COLOR.rival;
  const hit = strike === 'restore' ? COLOR.restore : COLOR.drain;
  const color = struck ? hit : rest;
  const radius = pool === 'primary' ? 0.28 : 0.22;

  useFrame((_, delta) => {
    if (!group.current) return;
    const target = struck ? 1.12 : 1;
    const next = THREE.MathUtils.damp(group.current.scale.x, target, 8, delta);
    group.current.scale.setScalar(next);
  });

  return (
    <group ref={group} position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[radius, 28]} />
        <meshBasicMaterial color={COLOR.obsidian} />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius + 0.02, radius + 0.055, 28]} />
        <meshBasicMaterial color={color} transparent opacity={struck ? 0.92 : 0.55} />
      </mesh>
      {struck && label ? (
        <Html position={[0, 0.42, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <span className="fx-world" data-family={strike}>
            {label}
          </span>
        </Html>
      ) : null}
    </group>
  );
}
