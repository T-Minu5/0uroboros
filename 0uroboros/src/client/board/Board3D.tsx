/**
 * Three.js board presentation.
 *
 * One stone table. Five location pads in a row. Cards are the objects.
 * Power and Location names live in the 2D overlay on those pads.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import type { CardDefinition, CardInstance, FxEvent, PlayerID } from '../../game/types';
import type { NodeView } from '../selectors';
import {
  CAMERA_FOV,
  CAMERA_LOOK_AT,
  CAMERA_POSITION,
  frustumHalfWidth,
  nodeIndexAtX,
  NODE_SPACING,
  nodeWorldX,
} from './boardLayout';
import { clientToBoard, type DragPointer } from './DragGhost';
import { SpatialFx } from './SpatialFx';
import {
  dcWorld,
  LANE_DEPTH,
  type LaneScreenBox,
} from './spatialGrammar';
import { CollapseVisual } from '../visual/CollapseVisual';
import { DataCenterVisual } from '../visual/DataCenterVisual';
import { LightingRig } from '../visual/LightingRig';
import { NodeLaneVisual } from '../visual/NodeLaneVisual';
import { TableVisual } from '../visual/TableVisual';
import { WaveField } from '../visual/WaveField';
import type { Atmosphere } from '../visual/tokens';

export interface Board3DProps {
  nodes: NodeView[];
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
  sourceCardId?: string | null;
  focusNode?: number | null;
  collapsingNode?: number | null;
  hiddenCardIds?: ReadonlySet<string>;
  viewer?: PlayerID;
  fxEvent?: FxEvent | null;
  sourceName?: string | null;
  measuring?: boolean;
  ghostLegal?: boolean;
  onLaneLayout?: (boxes: LaneScreenBox[]) => void;
  atmosphere?: Atmosphere;
  selectedCollapseNode?: number | null;
  onInspectCard?: (instanceId: string) => void;
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
  sourceCardId = null,
  focusNode = null,
  collapsingNode = null,
  hiddenCardIds = new Set(),
  viewer = '0',
  fxEvent = null,
  sourceName = null,
  measuring = false,
  ghostLegal = true,
  onLaneLayout,
  atmosphere = 'play',
  selectedCollapseNode = null,
  onInspectCard,
}: Board3DProps) {
  const frustum = frustumHalfWidth(nodes.length);
  const hovered = selectedNode;
  const focusX =
    collapsingNode !== null
      ? nodeWorldX(collapsingNode, nodes.length)
      : focusNode !== null
        ? nodeWorldX(focusNode, nodes.length)
        : null;

  return (
    <Canvas
      dpr={[1, 1.75]}
      shadows
      camera={{ position: CAMERA_POSITION, fov: CAMERA_FOV, near: 0.1, far: 80 }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(...CAMERA_LOOK_AT);
        gl.domElement.style.touchAction = 'none';
        gl.shadowMap.enabled = true;
        gl.setClearColor('#120814', 0.16);
      }}
      gl={{ antialias: true, alpha: true }}
    >
      <PerspectiveKeeper />
      <LightingRig atmosphere={atmosphere} focusX={focusX} />
      <TableVisual width={frustum * 2.35} depth={Math.max(7.2, LANE_DEPTH + 3.4)} />
      <WaveField
        width={frustum * 2.2}
        depth={Math.max(6.4, LANE_DEPTH + 2.6)}
        active={atmosphere === 'collapse' || measuring}
      />
      <CollapseVisual
        measuring={measuring}
        selectedNode={selectedCollapseNode}
        collapsingNode={collapsingNode}
        nodeCount={nodes.length}
      />
      <LaneProjector nodeCount={nodes.length} onLaneLayout={onLaneLayout} />

      {nodes.map((node) => (
        <NodeLaneVisual
          key={node.index}
          node={node}
          nodeCount={nodes.length}
          isLegal={legalNodes.includes(node.index)}
          isSelected={hovered === node.index}
          onSelect={() => onSelectNode(node.index)}
          onInspectCard={onInspectCard}
          visuallyRevealed={visuallyRevealed}
          hitCardIds={hitCardIds}
          sourceCardId={sourceCardId}
          resolving={focusNode === node.index}
          collapsing={collapsingNode === node.index}
          subdued={focusNode !== null && focusNode !== node.index}
          hiddenCardIds={hiddenCardIds}
          showGhost={Boolean(ghost) && hovered === node.index}
          ghostLegal={ghostLegal && legalNodes.includes(node.index)}
          chanceRole={
            fxEvent?.kind === 'chance'
              ? fxEvent.fromNode === node.index
                ? 'from'
                : fxEvent.toNode === node.index
                  ? 'to'
                  : null
              : null
          }
          sourceFamily={
            fxEvent?.kind === 'damageDc'
              ? 'drain'
              : fxEvent?.kind === 'healDc'
                ? 'restore'
                : fxEvent?.kind === 'chance'
                  ? 'chance'
                  : 'focus'
          }
        />
      ))}

      {(['1', '0'] as const).flatMap((player) =>
        (['primary', 'backup'] as const).map((pool) => {
          const struck = Boolean(
            fxEvent &&
              (fxEvent.kind === 'damageDc' || fxEvent.kind === 'healDc') &&
              fxEvent.player === player &&
              fxEvent.dataCenter === pool,
          );
          return (
            <DataCenterVisual
              key={`${player}:${pool}`}
              position={dcWorld(player, viewer, pool, nodes.length)}
              pool={pool}
              side={player === viewer ? 'self' : 'rival'}
              struck={struck}
              strike={fxEvent?.kind === 'healDc' ? 'restore' : 'drain'}
              label={
                struck && fxEvent?.amount != null
                  ? `${fxEvent.kind === 'healDc' ? '+' : '-'}${fxEvent.amount}`
                  : null
              }
            />
          );
        }),
      )}

      <SpatialFx
        event={fxEvent}
        nodes={nodes}
        viewer={viewer}
        sourceName={sourceName}
        measuring={measuring}
        focusNode={focusNode ?? collapsingNode ?? null}
      />

      <DropSensor
        pointer={ghost?.pointer ?? null}
        nodeCount={nodes.length}
        onHoverNode={onHoverNode}
      />
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
    const board = clientToBoard(pointer.clientX, pointer.clientY, camera, gl.domElement);
    const index = board ? nodeIndexAtX(board.x, nodeCount) : null;
    if (index !== null) onHoverNode(index);
  }, [camera, gl.domElement, nodeCount, onHoverNode, pointer]);

  return null;
}

function LaneProjector({
  nodeCount,
  onLaneLayout,
}: {
  nodeCount: number;
  onLaneLayout?: (boxes: LaneScreenBox[]) => void;
}) {
  const { camera, gl } = useThree();
  const last = useRef('');
  const scratch = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!onLaneLayout) return;
    const canvas = gl.domElement.getBoundingClientRect();
    const toScreen = (x: number, y: number, z: number) => {
      scratch.set(x, y, z).project(camera);
      return {
        sx: ((scratch.x + 1) / 2) * canvas.width,
        sy: ((1 - scratch.y) / 2) * canvas.height,
      };
    };
    const boxes: LaneScreenBox[] = [];
    for (let i = 0; i < nodeCount; i++) {
      const x = nodeWorldX(i, nodeCount);
      const leftEdge = toScreen(x - NODE_SPACING / 2, 0.12, 0);
      const rightEdge = toScreen(x + NODE_SPACING / 2, 0.12, 0);
      const mid = toScreen(x, 0.34, 0);
      boxes.push({
        index: i,
        left: Math.min(leftEdge.sx, rightEdge.sx),
        top: 0,
        width: Math.max(8, Math.abs(rightEdge.sx - leftEdge.sx)),
        height: canvas.height,
        midY: mid.sy,
        selfY: Math.min(canvas.height - 160, mid.sy + 86),
        rivalY: Math.max(48, mid.sy - 118),
      });
    }
    const key = boxes
      .map(
        (box) =>
          `${box.left | 0}:${box.width | 0}:${box.height | 0}:${box.midY | 0}:${box.selfY | 0}:${box.rivalY | 0}`,
      )
      .join('|');
    if (key === last.current) return;
    last.current = key;
    onLaneLayout(boxes);
  });
  return null;
}

function PerspectiveKeeper() {
  useFrame(({ camera, size }) => {
    const cam = camera as THREE.PerspectiveCamera;
    if (!cam.isPerspectiveCamera || size.height === 0) return;
    cam.aspect = size.width / size.height;
    cam.lookAt(...CAMERA_LOOK_AT);
    cam.updateProjectionMatrix();
  });
  return null;
}
