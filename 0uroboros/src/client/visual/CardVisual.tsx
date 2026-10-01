import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import * as THREE from 'three';

import type { CardInstance } from '../../game/types';
import { definitionOf } from '../selectors';
import { createCardFaceTexture } from '../board/cardFaceTexture';
import { cardArtUrl } from '../lookdev/cardArt';
import {
  BOARD_CARD_HEIGHT,
  BOARD_CARD_TILT,
  BOARD_CARD_WIDTH,
} from '../board/boardLayout';
import { COLOR } from './tokens';

export function CardVisual({
  card,
  x,
  z,
  side,
  visualRevealed,
  impacted,
  source,
  sourceFamily,
  subdued,
  onInspect,
}: {
  card: CardInstance;
  x: number;
  z: number;
  side: 'self' | 'rival';
  visualRevealed: boolean;
  impacted: boolean;
  source: boolean;
  sourceFamily: 'drain' | 'restore' | 'chance' | 'focus';
  subdued: boolean;
  onInspect?: () => void;
}) {
  const mesh = useRef<Mesh>(null);
  const body = useRef<THREE.Group>(null);
  const scan = useRef<Mesh>(null);
  const spawn = useRef(0);
  const impact = useRef(0);
  const definition = visualRevealed && card.cardDefId !== 'hidden' ? definitionOf(card) : null;
  const artUrl = definition ? cardArtUrl(definition.id, definition.name) : null;
  // First-party card art when available; painted face as fallback. Title plate keeps name readable.
  const texture = useMemo(() => {
    if (!definition) return null;
    if (artUrl) {
      const map = new THREE.TextureLoader().load(artUrl);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
      return map;
    }
    return createCardFaceTexture(definition, card, { playable: true });
  }, [artUrl, card, definition]);

  useEffect(() => () => texture?.dispose(), [texture]);

  useEffect(() => {
    if (impacted || source) impact.current = 1;
  }, [impacted, source]);

  useFrame((_, delta) => {
    if (!mesh.current || !body.current) return;
    const targetFlip = visualRevealed ? 0 : Math.PI;
    mesh.current.rotation.y = THREE.MathUtils.damp(mesh.current.rotation.y, targetFlip, 7, delta);
    spawn.current = Math.min(1, spawn.current + delta * 3.6);
    const eased = 1 - (1 - spawn.current) ** 3;
    // Hearthstone weight: impact decays slower with a stronger contact punch.
    impact.current = Math.max(0, impact.current - delta * 1.6);
    const windup = source ? Math.sin(Math.min(1, impact.current) * Math.PI) * 0.12 : 0;
    const contact = impacted ? impact.current * 0.1 : 0;
    const lift = source ? 0.28 + windup : contact;
    body.current.position.y = 0.02 + (1 - eased) * 0.7 + lift;
    body.current.rotation.z = source ? windup * 0.35 : impacted ? -contact * 0.5 : 0;
    body.current.scale.setScalar(
      (subdued ? 0.9 : 1) + (source ? 0.08 + windup * 0.2 : 0) + (impacted ? impact.current * 0.12 : 0),
    );
    if (scan.current) {
      const t = (performance.now() / 520) % 1;
      scan.current.position.y = -BOARD_CARD_HEIGHT * 0.42 + t * BOARD_CARD_HEIGHT * 0.84;
      scan.current.visible = source;
    }
  });

  const edge = side === 'self' ? COLOR.self : COLOR.rival;
  const title = definition?.name ?? '';
  const scanColor =
    sourceFamily === 'drain'
      ? COLOR.drain
      : sourceFamily === 'restore'
        ? COLOR.restore
        : sourceFamily === 'chance'
          ? COLOR.chance
          : COLOR.self;

  return (
    <group position={[x, 0.22, z]} rotation={[BOARD_CARD_TILT, 0, 0]}>
      <group ref={body}>
      {/* CARD_PHYSICALITY_V3: thickness, foil edge, not a HUD chip. */}
      <mesh position={[0, 0, -0.028]}>
        <boxGeometry args={[BOARD_CARD_WIDTH + 0.07, BOARD_CARD_HEIGHT + 0.07, 0.072]} />
        <meshBasicMaterial color={edge} />
      </mesh>
      <mesh position={[0, 0, -0.01]}>
        <boxGeometry args={[BOARD_CARD_WIDTH + 0.02, BOARD_CARD_HEIGHT + 0.02, 0.05]} />
        <meshBasicMaterial color="#1a1610" />
      </mesh>
      <mesh
        ref={mesh}
        castShadow
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          onInspect?.();
        }}
      >
        <planeGeometry args={[BOARD_CARD_WIDTH, BOARD_CARD_HEIGHT]} />
        <meshBasicMaterial
          color={texture ? '#ffffff' : visualRevealed ? '#121018' : '#0a0c14'}
          map={texture ?? undefined}
          transparent={subdued}
          opacity={subdued ? 0.55 : 1}
          side={THREE.DoubleSide}
        />
      </mesh>
      {visualRevealed && title ? (
        <mesh position={[0, -BOARD_CARD_HEIGHT * 0.36, 0.012]}>
          <planeGeometry args={[BOARD_CARD_WIDTH * 0.92, 0.18]} />
          <meshBasicMaterial color="#0b1018" transparent opacity={0.82} depthWrite={false} />
        </mesh>
      ) : null}
      <mesh ref={scan} position={[0, 0, 0.008]}>
        <planeGeometry args={[BOARD_CARD_WIDTH * 1.02, 0.045]} />
        <meshBasicMaterial color={scanColor} transparent opacity={0.78} depthWrite={false} />
      </mesh>
      </group>
    </group>
  );
}

export function LandingGhostVisual({ z, legal }: { z: number; legal: boolean }) {
  const mesh = useRef<Mesh>(null);
  useFrame(() => {
    if (!mesh.current) return;
    mesh.current.position.y = 0.04 + Math.sin(performance.now() / 180) * 0.02;
  });
  const color = legal ? COLOR.self : COLOR.drain;
  return (
    <group position={[0, 0.2, z]} rotation={[BOARD_CARD_TILT, 0, 0]}>
      <mesh ref={mesh}>
        <planeGeometry args={[BOARD_CARD_WIDTH, BOARD_CARD_HEIGHT]} />
        <meshBasicMaterial color={color} transparent opacity={legal ? 0.42 : 0.32} />
      </mesh>
    </group>
  );
}
