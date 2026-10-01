/**
 * One physical card traveling from hand space to a Node slot.
 * The engine already committed the deploy. This mesh is the object in flight.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { a, useSpring } from '@react-spring/three';

import type { CardDefinition, CardInstance } from '../../game/types';
import {
  CARD_DEPTH_STEP,
  HAND_CARD_HEIGHT,
  HAND_CARD_WIDTH,
  HAND_PITCH,
  HAND_Y,
  HAND_Z,
  SELF_LANE_Z,
  SPRING_SNAP,
  nodeWorldX,
} from './boardLayout';
import { createCardFaceTexture } from './cardFaceTexture';

export interface CardFlight {
  instanceId: string;
  definition: CardDefinition;
  card: CardInstance;
  fromClient: { clientX: number; clientY: number };
  toNode: number;
  toSlot: number;
  nodeCount: number;
  faceDown: boolean;
}

export function CardFlightMesh({
  flight,
  onLanded,
}: {
  flight: CardFlight;
  onLanded: (instanceId: string) => void;
}) {
  const { camera, gl } = useThree();
  const texture = useMemo(
    () => createCardFaceTexture(flight.definition, flight.card, { playable: true }),
    [flight.definition, flight.card],
  );
  const landed = useRef(false);
  const from = useMemo(
    () =>
      clientToHandPlane(
        flight.fromClient.clientX,
        flight.fromClient.clientY,
        camera,
        gl.domElement,
      ),
    [camera, flight.fromClient.clientX, flight.fromClient.clientY, gl.domElement],
  );
  const to = useMemo<[number, number, number]>(
    () => [
      nodeWorldX(flight.toNode, flight.nodeCount),
      0.14,
      SELF_LANE_Z + flight.toSlot * CARD_DEPTH_STEP,
    ],
    [flight.nodeCount, flight.toNode, flight.toSlot],
  );

  const [{ position, rotation, scale }] = useSpring(() => ({
    from: {
      position: from,
      rotation: [HAND_PITCH, 0, 0] as [number, number, number],
      scale: 1.08,
    },
    to: {
      position: to,
      rotation: [-Math.PI / 2, 0, flight.faceDown ? Math.PI : 0] as [number, number, number],
      scale: 0.92,
    },
    config: SPRING_SNAP,
    onRest: () => {
      if (landed.current) return;
      landed.current = true;
      onLanded(flight.instanceId);
    },
  }));

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <a.group position={position} rotation={rotation as unknown as [number, number, number]} scale={scale}>
      <mesh position={[0, 0, -0.02]} castShadow>
        <planeGeometry args={[HAND_CARD_WIDTH * 1.04, HAND_CARD_HEIGHT * 1.04]} />
        <meshStandardMaterial color="#07051a" />
      </mesh>
      <mesh castShadow>
        <planeGeometry args={[HAND_CARD_WIDTH, HAND_CARD_HEIGHT]} />
        <meshStandardMaterial map={texture} roughness={0.42} metalness={0.18} />
      </mesh>
    </a.group>
  );
}

function clientToHandPlane(
  clientX: number,
  clientY: number,
  _camera: import('three').Camera,
  canvas: HTMLCanvasElement,
): [number, number, number] {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  const x = ndcX * 3.2;
  const y = HAND_Y + ndcY * 0.4;
  return [x, y, HAND_Z];
}
