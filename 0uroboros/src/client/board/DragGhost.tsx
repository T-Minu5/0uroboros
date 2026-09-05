/**
 * The card that exists only while a 2D hand card is being dragged.
 *
 * The readable hand stays in the rail. This mesh is the weighted, tilting
 * object that travels across the board.
 */

import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { a, useSpring } from '@react-spring/three';
import * as THREE from 'three';

import type { CardDefinition, CardInstance } from '../../game/types';
import {
  clamp,
  HAND_CARD_HEIGHT,
  HAND_CARD_WIDTH,
  HAND_PITCH,
  HAND_Y,
  HAND_Z,
  MAX_PITCH,
  MAX_ROLL,
  MAX_YAW,
  SPRING_FOLLOW,
} from './boardLayout';
import { createCardFaceTexture } from './cardFaceTexture';

export interface DragPointer {
  clientX: number;
  clientY: number;
  mx: number;
  my: number;
  vx: number;
  vy: number;
}

export interface DragGhostProps {
  definition: CardDefinition;
  card: CardInstance;
  pointer: DragPointer;
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane();
const planeHit = new THREE.Vector3();
const cameraDir = new THREE.Vector3();
const planePoint = new THREE.Vector3(0, HAND_Y, HAND_Z);

export function DragGhost({ definition, card, pointer }: DragGhostProps) {
  const { camera, gl } = useThree();
  const texture = useMemo(
    () => createCardFaceTexture(definition, card, { playable: true }),
    [definition, card],
  );

  const [{ position, rotation }, api] = useSpring(() => ({
    position: [0, HAND_Y, HAND_Z] as [number, number, number],
    rotation: [HAND_PITCH, 0, 0] as [number, number, number],
    config: SPRING_FOLLOW,
  }));

  useEffect(() => () => texture.dispose(), [texture]);

  useEffect(() => {
    const hit = clientToPlane(pointer.clientX, pointer.clientY, camera, gl.domElement);
    if (!hit) return;
    camera.getWorldDirection(cameraDir);
    hit.addScaledVector(cameraDir, -0.45);

    const pitch = clamp(
      HAND_PITCH - pointer.vy * 0.45 + pointer.my * 0.0014,
      HAND_PITCH - MAX_PITCH,
      HAND_PITCH + MAX_PITCH,
    );
    const yaw = clamp(pointer.vx * 0.4 + pointer.mx * 0.0011, -MAX_YAW, MAX_YAW);
    const roll = clamp(-pointer.vx * 0.28 - pointer.mx * 0.0008, -MAX_ROLL, MAX_ROLL);

    api.start({
      position: [hit.x, hit.y, hit.z],
      rotation: [pitch, yaw, roll],
    });
  }, [api, camera, gl.domElement, pointer]);

  return (
    <a.group
      position={position}
      rotation={rotation as unknown as [number, number, number]}
      scale={1.12}
    >
      <group position={[0, HAND_CARD_HEIGHT * 0.18, 0]}>
        <mesh position={[0, 0, -0.02]}>
          <planeGeometry args={[HAND_CARD_WIDTH * 1.06, HAND_CARD_HEIGHT * 1.06]} />
          <meshStandardMaterial color="#0a1018" />
        </mesh>
        <mesh>
          <planeGeometry args={[HAND_CARD_WIDTH, HAND_CARD_HEIGHT]} />
          <meshStandardMaterial map={texture} roughness={0.45} metalness={0.2} />
        </mesh>
      </group>
    </a.group>
  );
}

export function clientToBoard(
  clientX: number,
  clientY: number,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
): THREE.Vector3 | null {
  const rect = canvas.getBoundingClientRect();
  ndc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, camera);
  plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3());
  if (!raycaster.ray.intersectPlane(plane, planeHit)) return null;
  return planeHit.clone();
}

function clientToPlane(
  clientX: number,
  clientY: number,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
): THREE.Vector3 | null {
  const rect = canvas.getBoundingClientRect();
  ndc.set(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, camera);
  camera.getWorldDirection(cameraDir);
  plane.setFromNormalAndCoplanarPoint(cameraDir, planePoint);
  if (!raycaster.ray.intersectPlane(plane, planeHit)) return null;
  return planeHit.clone();
}
