/**
 * Three.js board presentation.
 *
 * The 3D layer owns spatial relationships: Node platforms, card placement, and
 * the motion that makes reveal and Collapse legible. All text and numerals live
 * in the 2D overlay, because text density and accessibility are better served
 * there.
 *
 * An orthographic camera keeps the five Node columns evenly spaced in screen
 * space, so the 2D header grid stays aligned with the 3D columns at any size.
 */

import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import * as THREE from 'three';

import { useEffect } from 'react';
import type { CardDefinition, CardInstance } from '../../game/types';
import type { NodeView } from '../selectors';
import {
  CAMERA_POSITION,
  CARD_DEPTH_STEP,
  frustumHalfWidth,
  nodeIndexAtX,
  NODE_SPACING,
} from './boardLayout';
import { clientToBoard, DragGhost, type DragPointer } from './DragGhost';

export interface Board3DProps {
  nodes: NodeView[];
  /** Nodes the currently selected or dragged card may legally be deployed to. */
  legalNodes: number[];
  selectedNode: number | null;
  onSelectNode: (index: number) => void;
  onHoverNode: (index: number | null) => void;
  ghost: {
    definition: CardDefinition;
    card: CardInstance;
    pointer: DragPointer;
  } | null;
  visuallyRevealed: (instanceId: string, revealed: boolean) => boolean;
  hitCardIds?: ReadonlySet<string>;
  focusNode?: number | null;
  collapsingNode?: number | null;
}

export function Board3D({
  nodes,
  legalNodes,
  selectedNode,
  onSelectNode,
  onHoverNode,
  ghost,
  visuallyRevealed,
  hitCardIds = new Set(),
  focusNode = null,
  collapsingNode = null,
}: Board3DProps) {
  const frustum = frustumHalfWidth(nodes.length);

  return (
    <Canvas
      orthographic
      dpr={[1, 2]}
      camera={{ position: CAMERA_POSITION, zoom: 1, near: 0.1, far: 100 }}
      onCreated={({ camera, size, gl }) => {
        applyFrustum(camera as THREE.OrthographicCamera, size.width, size.height, frustum);
        camera.lookAt(0, 0, 0);
        gl.domElement.style.touchAction = 'none';
      }}
      gl={{ antialias: true, alpha: true }}
    >
      <FrustumKeeper halfWidth={frustum} />

      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 9, 5]} intensity={0.85} color="#cfe9ff" />
      <directionalLight position={[-4, 3, -4]} intensity={0.3} color="#ffb066" />

      <GridPlane width={frustum * 2.4} />

      {nodes.map((node, i) => (
        <NodeColumn
          key={node.index}
          node={node}
          x={(i - (nodes.length - 1) / 2) * NODE_SPACING}
          isLegal={legalNodes.includes(node.index)}
          isSelected={selectedNode === node.index}
          onSelect={() => onSelectNode(node.index)}
          visuallyRevealed={visuallyRevealed}
          hitCardIds={hitCardIds}
          resolving={focusNode === node.index}
          collapsing={collapsingNode === node.index}
        />
      ))}

      <DropSensor
        pointer={ghost?.pointer ?? null}
        nodeCount={nodes.length}
        onHoverNode={onHoverNode}
      />

      {ghost ? (
        <DragGhost
          definition={ghost.definition}
          card={ghost.card}
          pointer={ghost.pointer}
        />
      ) : null}
    </Canvas>
  );
}

function DropSensor({
  pointer,
  nodeCount,
  onHoverNode,
}: {
  pointer: DragPointer | null;
  nodeCount: number;
  onHoverNode: (index: number | null) => void;
}) {
  const { camera, gl } = useThree();

  useEffect(() => {
    if (!pointer) {
      onHoverNode(null);
      return;
    }
    const hit = clientToBoard(pointer.clientX, pointer.clientY, camera, gl.domElement);
    if (!hit || Math.abs(hit.z) > 2.45) {
      onHoverNode(null);
      return;
    }
    onHoverNode(nodeIndexAtX(hit.x, nodeCount));
  }, [camera, gl.domElement, nodeCount, onHoverNode, pointer]);

  return null;
}

/** Keep the orthographic frustum locked to the Node row as the canvas resizes. */
function FrustumKeeper({ halfWidth }: { halfWidth: number }) {
  useFrame(({ camera, size }) => {
    applyFrustum(camera as THREE.OrthographicCamera, size.width, size.height, halfWidth);
  });
  return null;
}

function applyFrustum(
  camera: THREE.OrthographicCamera,
  width: number,
  height: number,
  halfWidth: number,
): void {
  if (!camera.isOrthographicCamera || width === 0 || height === 0) return;
  const aspect = width / height;
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfWidth / aspect;
  camera.bottom = -halfWidth / aspect;
  camera.updateProjectionMatrix();
}

/** Technical grid ground that reads as circuit substrate rather than decoration. */
function GridPlane({ width }: { width: number }) {
  const grid = useMemo(() => {
    const helper = new THREE.GridHelper(width, Math.round(width * 2), '#2b3d55', '#1d2a3c');
    helper.position.y = -0.02;
    return helper;
  }, [width]);

  return (
    <>
      <primitive object={grid} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
        <planeGeometry args={[width, width]} />
        <meshStandardMaterial color="#0d1522" roughness={0.9} metalness={0.1} />
      </mesh>
    </>
  );
}

interface NodeColumnProps {
  node: NodeView;
  x: number;
  isLegal: boolean;
  isSelected: boolean;
  onSelect: () => void;
  visuallyRevealed: (instanceId: string, revealed: boolean) => boolean;
  hitCardIds: ReadonlySet<string>;
  resolving: boolean;
  collapsing: boolean;
}

/**
 * One Node: a platform with the local player's cards toward the camera and the
 * opponent's away from it, so ownership is read from position rather than colour.
 */
function NodeColumn({
  node,
  x,
  isLegal,
  isSelected,
  onSelect,
  visuallyRevealed,
  hitCardIds,
  resolving,
  collapsing,
}: NodeColumnProps) {
  const platform = useRef<Mesh>(null);
  const group = useRef<Group>(null);

  useFrame((_, delta) => {
    const material = platform.current?.material as MeshStandardMaterial | undefined;
    if (!material) return;

    // Motion 1: emissive rise as a Node opens, and a distinct pulse while it is
    // the Collapse selection, so the probability payoff has its own beat.
    let target = 0.04;
    if (node.state === 'open') target = 0.2;
    if (node.state === 'collapsed') target = 0.1;
    if (isLegal) target = 0.55;
    if (resolving) target = 0.72;
    if (collapsing) target = 0.95;
    if (isSelected) target = 0.85;
    if (node.isCollapseSelection) {
      target = 0.5 + Math.sin(performance.now() / 240) * 0.35;
    }
    material.emissiveIntensity = THREE.MathUtils.damp(
      material.emissiveIntensity,
      target,
      6,
      delta,
    );

    // Motion 2: closed Nodes sit lower and lift as they open, giving the Node
    // opening sequence a physical read.
    if (group.current) {
      // Closed Nodes still accept commits. They sit slightly lower so "unopened"
      // is readable, but not so low they look disabled.
      const restingY = collapsing ? -0.28 : node.state === 'closed' ? -0.14 : 0;
      group.current.position.y = THREE.MathUtils.damp(
        group.current.position.y,
        restingY,
        7,
        delta,
      );
    }
  });

  const accent = collapsing || node.isCollapseSelection
    ? '#8b6bd9'
    : isLegal || isSelected
      ? '#3fbfe0'
      : '#2f4a66';

  return (
    <group ref={group} position={[x, 0, 0]}>
      <mesh
        ref={platform}
        position={[0, 0, 0]}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <boxGeometry args={[1.85, 0.1, 4.6]} />
        <meshStandardMaterial
          color="#16202f"
          emissive={accent}
          emissiveIntensity={0.04}
          roughness={0.55}
          metalness={0.35}
        />
      </mesh>

      {/* Opponent side, away from the camera. */}
      {node.rivalCards.map((card, i) => (
        <CardProxy
          key={card.instanceId}
          card={card}
          z={-1.05 - i * CARD_DEPTH_STEP}
          side="rival"
          visualRevealed={visuallyRevealed(card.instanceId, card.revealed)}
          impacted={hitCardIds.has(card.instanceId)}
        />
      ))}

      {/* Local side, toward the camera. */}
      {node.selfCards.map((card, i) => (
        <CardProxy
          key={card.instanceId}
          card={card}
          z={1.05 + i * CARD_DEPTH_STEP}
          side="self"
          visualRevealed={visuallyRevealed(card.instanceId, card.revealed)}
          impacted={hitCardIds.has(card.instanceId)}
        />
      ))}
    </group>
  );
}

interface CardProxyProps {
  card: CardInstance;
  z: number;
  side: 'self' | 'rival';
  visualRevealed: boolean;
  impacted: boolean;
}

/**
 * A placed card. Deliberately plain: this is a positional and state proxy, and
 * the readable card face lives in the 2D layer. Final art, frames, and rarity
 * treatments replace the material here without touching layout.
 */
function CardProxy({ z, side, visualRevealed, impacted }: CardProxyProps) {
  const mesh = useRef<Mesh>(null);
  const spawn = useRef(0);
  const impact = useRef(0);

  useEffect(() => {
    if (impacted) impact.current = 1;
  }, [impacted]);

  useFrame((_, delta) => {
    if (!mesh.current) return;

    // Motion 3: cards flip on reveal rather than swapping state instantly, so
    // resolution reads as a sequence and causality stays legible.
    const targetFlip = visualRevealed ? 0 : Math.PI;
    mesh.current.rotation.z = THREE.MathUtils.damp(
      mesh.current.rotation.z,
      targetFlip,
      8,
      delta,
    );

    // Placement settle, so committing a card has weight.
    spawn.current = Math.min(1, spawn.current + delta * 4);
    const eased = 1 - (1 - spawn.current) ** 3;
    impact.current = Math.max(0, impact.current - delta * 3.2);
    const shake = impact.current * Math.sin(performance.now() / 16) * 0.09;
    mesh.current.position.y = 0.09 + (1 - eased) * 0.7;
    mesh.current.position.x = shake;
    mesh.current.scale.setScalar(0.9 + eased * 0.1 + impact.current * 0.06);
  });

  const faceColor = visualRevealed ? (side === 'self' ? '#20465c' : '#5c3f20') : '#141d2b';
  const edgeColor = side === 'self' ? '#3fbfe0' : '#e0a13f';

  return (
    <mesh ref={mesh} position={[0, 0.09, z]} rotation={[-Math.PI / 2, 0, Math.PI]}>
      <boxGeometry args={[1.32, 0.05, 0.34]} />
      <meshStandardMaterial
        color={faceColor}
        emissive={edgeColor}
        emissiveIntensity={visualRevealed ? 0.18 : 0.05}
        roughness={0.5}
        metalness={0.3}
      />
    </mesh>
  );
}
