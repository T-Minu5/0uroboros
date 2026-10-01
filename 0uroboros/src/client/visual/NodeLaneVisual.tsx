import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import * as THREE from 'three';

import type { PlayerID } from '../../game/types';
import type { NodeView } from '../selectors';
import {
  CARD_DEPTH_STEP,
  NODE_PLATFORM_WIDTH,
  RIVAL_LANE_Z,
  SELF_LANE_Z,
  nodeWorldX,
} from '../board/boardLayout';
import { LANE_DEPTH, SLOT_COUNT, fanX } from '../board/spatialGrammar';
import { CardVisual, LandingGhostVisual } from './CardVisual';
import { LocationVisual } from './LocationVisual';
import { COLOR } from './tokens';

export function NodeLaneVisual({
  node,
  nodeCount,
  isLegal,
  isSelected,
  onSelect,
  onInspectCard,
  visuallyRevealed,
  hitCardIds,
  sourceCardId,
  resolving,
  collapsing,
  subdued,
  hiddenCardIds,
  showGhost,
  ghostLegal,
  chanceRole,
  sourceFamily,
}: {
  node: NodeView;
  nodeCount: number;
  isLegal: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onInspectCard?: (instanceId: string) => void;
  visuallyRevealed: (instanceId: string, revealed: boolean) => boolean;
  hitCardIds: ReadonlySet<string>;
  sourceCardId: string | null;
  resolving: boolean;
  collapsing: boolean;
  subdued: boolean;
  hiddenCardIds: ReadonlySet<string>;
  showGhost: boolean;
  ghostLegal: boolean;
  chanceRole: 'from' | 'to' | null;
  sourceFamily: 'drain' | 'restore' | 'chance' | 'focus';
  viewer?: PlayerID;
}) {
  const group = useRef<Group>(null);
  const x = nodeWorldX(node.index, nodeCount);
  const nextSlot = Math.min(SLOT_COUNT - 1, node.selfCards.length);

  useFrame((_, delta) => {
    if (!group.current) return;
    const restingY = collapsing ? 0.03 : 0;
    group.current.position.y = THREE.MathUtils.damp(group.current.position.y, restingY, 7, delta);
  });

  return (
    <group ref={group} position={[x, 0, 0]}>
      <mesh
        position={[0, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <planeGeometry args={[NODE_PLATFORM_WIDTH + 0.12, LANE_DEPTH + 1.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <LocationVisual
        collapsing={collapsing}
        resolving={resolving}
        open={node.state !== 'closed'}
        legal={Boolean(isLegal && isSelected)}
        selected={isSelected}
        muted={Boolean(showGhost && !isSelected)}
        lead={node.leader}
        nodeIndex={node.index}
      />
      {chanceRole ? (
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.4, 0.46, 40]} />
          <meshBasicMaterial
            color={COLOR.chance}
            transparent
            opacity={chanceRole === 'to' ? 0.7 : 0.35}
          />
        </mesh>
      ) : null}
      {showGhost ? (
        <LandingGhostVisual
          z={SELF_LANE_Z + nextSlot * CARD_DEPTH_STEP * 0.72}
          legal={ghostLegal}
        />
      ) : null}
      {node.rivalCards.map((card, i) =>
        hiddenCardIds.has(card.instanceId) ? null : (
          <CardVisual
            key={card.instanceId}
            card={card}
            x={fanX(i, node.rivalCards.length)}
            z={RIVAL_LANE_Z - i * CARD_DEPTH_STEP * 0.72}
            side="rival"
            visualRevealed={visuallyRevealed(card.instanceId, card.revealed)}
            impacted={hitCardIds.has(card.instanceId)}
            source={sourceCardId === card.instanceId}
            sourceFamily={sourceFamily}
            subdued={subdued && sourceCardId !== card.instanceId}
            onInspect={
              visuallyRevealed(card.instanceId, card.revealed)
                ? () => onInspectCard?.(card.instanceId)
                : undefined
            }
          />
        ),
      )}
      {node.selfCards.map((card, i) =>
        hiddenCardIds.has(card.instanceId) ? null : (
          <CardVisual
            key={card.instanceId}
            card={card}
            x={fanX(i, node.selfCards.length)}
            z={SELF_LANE_Z + i * CARD_DEPTH_STEP * 0.55}
            side="self"
            visualRevealed={
              card.cardDefId !== 'hidden' || visuallyRevealed(card.instanceId, card.revealed)
            }
            impacted={hitCardIds.has(card.instanceId)}
            source={sourceCardId === card.instanceId}
            sourceFamily={sourceFamily}
            subdued={subdued && sourceCardId !== card.instanceId}
            onInspect={
              card.cardDefId !== 'hidden' || visuallyRevealed(card.instanceId, card.revealed)
                ? () => onInspectCard?.(card.instanceId)
                : undefined
            }
          />
        ),
      )}
    </group>
  );
}
