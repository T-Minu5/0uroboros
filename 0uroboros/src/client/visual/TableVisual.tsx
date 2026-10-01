import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';

import { TABLE_URL } from './boardArt';
import { COLOR } from './tokens';

/**
 * Physical table from first-party board concept art.
 * Octagon slab, magenta world rim, cyan local edge bar, flanking pylons.
 */
export function TableVisual({ width, depth }: { width: number; depth: number }) {
  const [map, setMap] = useState<THREE.Texture | null>(null);
  const rim = useMemo(() => octagonRing(1, 0.978), []);
  const innerRim = useMemo(() => octagonRing(0.978, 0.962), []);
  const slab = useMemo(() => new THREE.ShapeGeometry(octagon(1), 2), []);

  useEffect(() => {
    if (!TABLE_URL) return;
    const loader = new THREE.TextureLoader();
    const texture = loader.load(TABLE_URL, (next) => {
      next.colorSpace = THREE.SRGBColorSpace;
      next.anisotropy = 8;
      next.wrapS = THREE.ClampToEdgeWrapping;
      next.wrapT = THREE.ClampToEdgeWrapping;
      next.repeat.set(0.38, 0.42);
      next.offset.set(0.31, 0.26);
      setMap(next);
    });
    return () => {
      texture.dispose();
    };
  }, []);

  useEffect(
    () => () => {
      rim.dispose();
      innerRim.dispose();
      slab.dispose();
    },
    [rim, innerRim, slab],
  );

  const scaleX = width * 0.5;
  const scaleZ = depth * 0.5;
  const pylons: Array<[number, number, string]> = [
    [-scaleX * 0.78, -scaleZ * 0.72, COLOR.self],
    [scaleX * 0.78, -scaleZ * 0.72, COLOR.self],
    [-scaleX * 0.78, scaleZ * 0.62, COLOR.world],
    [scaleX * 0.78, scaleZ * 0.62, COLOR.world],
  ];

  return (
    <group>
      <mesh
        geometry={slab}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[scaleX, scaleZ, 1]}
        receiveShadow
      >
        <meshBasicMaterial map={map ?? undefined} color={map ? '#2e2c36' : '#1c1a24'} />
      </mesh>
      <mesh
        geometry={rim}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.014, 0]}
        scale={[scaleX, scaleZ, 1]}
      >
        <meshBasicMaterial
          color={COLOR.world}
          transparent
          opacity={0.95}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh
        geometry={innerRim}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.016, 0]}
        scale={[scaleX, scaleZ, 1]}
      >
        <meshBasicMaterial
          color={COLOR.self}
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Concept: intense magenta local-edge bar at the player side. */}
      <mesh position={[0, 0.03, depth * 0.47]}>
        <boxGeometry args={[width * 0.82, 0.028, 0.048]} />
        <meshBasicMaterial color={COLOR.world} />
      </mesh>
      <mesh position={[0, 0.04, depth * 0.47]}>
        <boxGeometry args={[width * 0.62, 0.012, 0.02]} />
        <meshBasicMaterial color={COLOR.self} transparent opacity={0.55} />
      </mesh>
      {/* Quiet rival-side accent (red strips from portal concept). */}
      <mesh position={[0, 0.028, -depth * 0.46]}>
        <boxGeometry args={[width * 0.7, 0.016, 0.02]} />
        <meshBasicMaterial color={COLOR.drain} transparent opacity={0.45} />
      </mesh>
      {pylons.map(([x, z, color], index) => (
        <group key={index} position={[x, 0.12, z]}>
          <mesh>
            <boxGeometry args={[0.2, 0.52, 0.2]} />
            <meshBasicMaterial color="#14121c" />
          </mesh>
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.07, 0.62, 0.07]} />
            <meshBasicMaterial color={color} transparent opacity={0.92} />
          </mesh>
          <pointLight position={[0, 0.42, 0]} intensity={0.62} color={color} distance={4.4} />
        </group>
      ))}
    </group>
  );
}

function octagon(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function octagonRing(outer: number, inner: number): THREE.ShapeGeometry {
  const shape = octagon(outer);
  const hole = octagon(inner);
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape, 2);
}
