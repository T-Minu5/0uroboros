import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh, Points } from 'three';
import * as THREE from 'three';

import { nodeWorldX } from '../board/boardLayout';
import { COLOR } from './tokens';

const PARTICLE_COUNT = 980;
const SPIRAL_COUNT = 5;

/**
 * Wave Collapse spectacle.
 * Particles converge (FX-PARTICLE-IN / singularity refs).
 * Liquid spiral ribbons inspired by fx-05 "Drawing Lines" motion principle —
 * original R3F geometry, not the webp.
 */
export function CollapseVisual({
  measuring,
  selectedNode,
  collapsingNode,
  nodeCount,
}: {
  measuring: boolean;
  selectedNode: number | null;
  collapsingNode: number | null;
  nodeCount: number;
}) {
  const rings = useRef<Mesh[]>([]);
  const spirals = useRef<Mesh[]>([]);
  const points = useRef<Points>(null);
  const seed = useMemo(() => {
    const data = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.4 + Math.random() * 4.8;
      data[i * 3] = Math.cos(a) * r;
      data[i * 3 + 1] = 0.12 + Math.random() * 0.55;
      data[i * 3 + 2] = Math.sin(a) * r * 0.62;
    }
    return data;
  }, []);

  const spiralGeom = useMemo(() => {
    const curves = Array.from({ length: SPIRAL_COUNT }, (_, s) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 48; i++) {
        const t = i / 47;
        const a = t * Math.PI * 4 + s * 1.1;
        const r = 2.8 * (1 - t * 0.82);
        pts.push(new THREE.Vector3(Math.cos(a) * r, 0.08 + t * 0.35, Math.sin(a) * r * 0.55));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.012, 5, false);
    });
    return curves;
  }, []);

  useFrame((_, delta) => {
    const t = performance.now() / 1000;
    rings.current.forEach((mesh, index) => {
      if (!mesh) return;
      const live = measuring || collapsingNode !== null;
      const pulse = live ? 0.72 + Math.sin(t * 2.4 + index) * 0.12 : 0.01;
      mesh.scale.setScalar(THREE.MathUtils.damp(mesh.scale.x, pulse, 5, delta));
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = live ? (measuring ? 0.42 - index * 0.04 : 0.22) : 0;
    });
    spirals.current.forEach((mesh, index) => {
      if (!mesh) return;
      const live = measuring || selectedNode !== null;
      mesh.rotation.y = t * (0.35 + index * 0.08) * (index % 2 === 0 ? 1 : -1);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = live ? (measuring ? 0.55 : 0.28) : 0;
    });
    if (points.current) {
      const pos = points.current.geometry.getAttribute('position');
      const targetX = selectedNode === null ? 0 : nodeWorldX(selectedNode, nodeCount);
      const attract = measuring ? 0.95 : selectedNode !== null ? 1.35 : 0;
      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i);
        let y = pos.getY(i);
        let z = pos.getZ(i);
        x += (targetX - x) * attract * delta * 0.9;
        z += (0 - z) * attract * delta * 0.75;
        y += (0.18 - y) * attract * delta * 0.55;
        if (Math.hypot(x - targetX, z) < 0.12) {
          const a = Math.random() * Math.PI * 2;
          const r = 2.4 + Math.random() * 3.2;
          x = Math.cos(a) * r;
          z = Math.sin(a) * r * 0.62;
          y = 0.2 + Math.random() * 0.4;
        }
        pos.setXYZ(i, x, y, z);
      }
      pos.needsUpdate = true;
      const mat = points.current.material as THREE.PointsMaterial;
      mat.opacity = measuring || selectedNode !== null ? 0.58 : 0;
      mat.size = measuring ? 0.075 : 0.05;
    }
  });

  const well = collapsingNode;
  return (
    <group>
      {[0.4, 0.75, 1.15, 1.65, 2.25, 2.95, 3.75].map((radius, index) => (
        <mesh
          key={radius}
          ref={(node) => {
            if (node) rings.current[index] = node;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.03, 0]}
        >
          <ringGeometry args={[radius, radius + 0.035, 64]} />
          <meshBasicMaterial
            color={COLOR.chance}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
      {spiralGeom.map((geometry, index) => (
        <mesh
          key={`spiral-${index}`}
          ref={(node) => {
            if (node) spirals.current[index] = node;
          }}
          geometry={geometry}
          position={[
            selectedNode === null ? 0 : nodeWorldX(selectedNode, nodeCount) * 0.15,
            0.02,
            0,
          ]}
        >
          <meshBasicMaterial
            color={index % 2 === 0 ? COLOR.chance : COLOR.world}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
      <points ref={points} visible={measuring || selectedNode !== null}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[seed, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color={COLOR.chance}
          size={0.055}
          transparent
          opacity={0}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
      {measuring ? (
        <mesh position={[0, 1.4, 0]}>
          <cylinderGeometry args={[0.08, 0.55, 2.8, 20]} />
          <meshBasicMaterial color={COLOR.chance} transparent opacity={0.42} depthWrite={false} />
        </mesh>
      ) : null}
      {measuring ? (
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.15, 48]} />
          <meshBasicMaterial color={COLOR.chance} transparent opacity={0.22} depthWrite={false} />
        </mesh>
      ) : null}
      {well !== null ? (
        <group position={[nodeWorldX(well, nodeCount), 0.04, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.72, 48]} />
            <meshBasicMaterial color={COLOR.chance} transparent opacity={0.28} />
          </mesh>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.04, 0.22, 1.8, 16]} />
            <meshBasicMaterial color={COLOR.chance} transparent opacity={0.35} />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}
