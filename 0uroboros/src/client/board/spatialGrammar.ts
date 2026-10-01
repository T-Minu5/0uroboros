/**
 * Shared source → path → target grammar.
 *
 * Pure. The engine has already applied the op. This only names where the
 * player should look, and which visual family to use.
 */

import type { DataCenterId, FxEvent, PlayerID } from '../../game/types';
import type { NodeView } from '../selectors';
import {
  CARD_DEPTH_STEP,
  NODE_CENTER_GAP,
  NODE_HALF_DEPTH,
  NODE_HALF_Z,
  RIVAL_LANE_Z,
  SELF_LANE_Z,
  frustumHalfWidth,
  nodeWorldX,
} from './boardLayout';

export interface LaneScreenBox {
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  midY: number;
  selfY: number;
  rivalY: number;
}

export type SpatialFamily =
  | 'drain'
  | 'restore'
  | 'chance'
  | 'power'
  | 'draw'
  | 'actions'
  | 'crypto'
  | 'vp'
  | 'hit'
  | 'focus';

export type HudAnchor = 'actions' | 'wallet' | 'vp' | 'deck' | 'hand';

export interface SpatialAnchor {
  kind: 'card' | 'node' | 'dc' | 'hud';
  instanceId?: string;
  nodeIndex?: number;
  player?: PlayerID;
  dataCenter?: DataCenterId;
  hud?: HudAnchor;
  slot?: 'self' | 'rival' | 'location' | 'chance' | 'slot';
}

export interface SpatialPlan {
  family: SpatialFamily;
  source: SpatialAnchor;
  target: SpatialAnchor;
  label: string;
}

export const LANE_DEPTH = NODE_HALF_DEPTH * 2 + NODE_CENTER_GAP;
export const LANE_WELL_Y = -0.06;
export const SLOT_COUNT = 4;

export function isGlobalPresentationKind(kind: string): boolean {
  return (
    kind === 'phase_announcement' ||
    kind === 'collapse_final_probability' ||
    kind === 'collapse_selection' ||
    kind === 'circuit_reward'
  );
}

export function spatialPlanOf(
  event: FxEvent,
  viewer: PlayerID,
  sourceName?: string | null,
): SpatialPlan | null {
  const sourceCard: SpatialAnchor = event.sourceInstanceId
    ? { kind: 'card', instanceId: event.sourceInstanceId, nodeIndex: event.nodeIndex ?? undefined }
    : event.nodeIndex != null
      ? { kind: 'node', nodeIndex: event.nodeIndex, slot: 'location' }
      : { kind: 'node', nodeIndex: 2, slot: 'location' };

  if (event.kind === 'damageDc' && event.player && event.dataCenter) {
    return {
      family: 'drain',
      source: sourceCard,
      target: { kind: 'dc', player: event.player, dataCenter: event.dataCenter },
      label: `-${event.amount ?? 0}`,
    };
  }
  if (event.kind === 'healDc' && event.player && event.dataCenter) {
    return {
      family: 'restore',
      source: sourceCard,
      target: { kind: 'dc', player: event.player, dataCenter: event.dataCenter },
      label: `+${event.amount ?? 0}`,
    };
  }
  if (event.kind === 'chance' && event.fromNode !== undefined && event.toNode !== undefined) {
    return {
      family: 'chance',
      source: { kind: 'node', nodeIndex: event.fromNode, slot: 'chance' },
      target: { kind: 'node', nodeIndex: event.toNode, slot: 'chance' },
      label:
        event.fromBefore !== undefined && event.toAfter !== undefined
          ? `${event.fromBefore}% → ${event.toAfter}%`
          : `${event.amount ?? 0}%`,
    };
  }
  if (event.kind === 'power') {
    return {
      family: 'power',
      source: event.instanceId
        ? { kind: 'card', instanceId: event.instanceId, nodeIndex: event.nodeIndex ?? undefined }
        : sourceCard,
      target: { kind: 'node', nodeIndex: event.nodeIndex ?? 0, slot: 'self' },
      label: signed(event.amount),
    };
  }
  if (event.kind === 'draw') {
    return {
      family: 'draw',
      source: sourceCard,
      target: {
        kind: 'hud',
        hud: 'hand',
        player: event.player ?? viewer,
      },
      label: `+${event.amount ?? 0} Cards`,
    };
  }
  if (event.kind === 'actions') {
    return {
      family: 'actions',
      source: sourceCard,
      target: { kind: 'hud', hud: 'actions', player: event.player ?? viewer },
      label: event.amount === 1 ? '+1 Action' : `+${event.amount ?? 0} Actions`,
    };
  }
  if (event.kind === 'crypto') {
    return {
      family: 'crypto',
      source: sourceCard,
      target: { kind: 'hud', hud: 'wallet', player: event.player ?? viewer },
      label: `+${event.amount ?? 0}`,
    };
  }
  if (event.kind === 'vp') {
    return {
      family: 'vp',
      source: sourceCard,
      target: { kind: 'hud', hud: 'vp', player: event.player ?? viewer },
      label: `+${event.amount ?? 0} VP`,
    };
  }
  if (event.kind === 'hitCard' && event.instanceId) {
    return {
      family: 'hit',
      source: sourceCard,
      target: { kind: 'card', instanceId: event.instanceId, nodeIndex: event.nodeIndex ?? undefined },
      label: sourceName?.trim() || 'Hit',
    };
  }
  if (event.kind === 'nodeFocus' || event.kind === 'collapseSelect') {
    return {
      family: 'focus',
      source: { kind: 'node', nodeIndex: event.nodeIndex ?? 0, slot: 'location' },
      target: { kind: 'node', nodeIndex: event.nodeIndex ?? 0, slot: 'location' },
      label: '',
    };
  }
  return null;
}

export function familyColor(family: SpatialFamily): string {
  if (family === 'drain' || family === 'hit') return '#fa0048';
  if (family === 'restore') return '#1fffb1';
  if (family === 'chance' || family === 'focus') return '#bc64ff';
  if (family === 'power') return '#27e2ff';
  if (family === 'actions' || family === 'draw') return '#27e2ff';
  if (family === 'crypto') return '#1fffb1';
  if (family === 'vp') return '#ffcc12';
  return '#27e2ff';
}

export function dcWorld(
  player: PlayerID,
  viewer: PlayerID,
  pool: DataCenterId,
  nodeCount: number,
): [number, number, number] {
  const side = player === viewer ? 1 : -1;
  const wing = pool === 'primary' ? -1 : 1;
  const x = (frustumHalfWidth(nodeCount) + 0.22) * wing * 0.92;
  const z = side * 2.05;
  return [x, 0.03, z];
}

export function nodeAnchorWorld(
  index: number,
  nodeCount: number,
  slot: SpatialAnchor['slot'] = 'location',
): [number, number, number] {
  const x = nodeWorldX(index, nodeCount);
  if (slot === 'chance') return [x, 0.22, 0];
  if (slot === 'self') return [x, 0.18, NODE_HALF_Z];
  if (slot === 'rival') return [x, 0.18, -NODE_HALF_Z];
  if (slot === 'slot') return [x, 0.16, SELF_LANE_Z];
  return [x, 0.28, 0];
}

export function cardWorld(
  nodes: NodeView[],
  instanceId: string,
  nodeCount: number,
): [number, number, number] | null {
  for (const node of nodes) {
    const selfAt = node.selfCards.findIndex((card) => card.instanceId === instanceId);
    if (selfAt >= 0) {
      return [
        nodeWorldX(node.index, nodeCount) + fanX(selfAt, node.selfCards.length),
        0.36,
        SELF_LANE_Z + selfAt * CARD_DEPTH_STEP * 0.72,
      ];
    }
    const rivalAt = node.rivalCards.findIndex((card) => card.instanceId === instanceId);
    if (rivalAt >= 0) {
      return [
        nodeWorldX(node.index, nodeCount) + fanX(rivalAt, node.rivalCards.length),
        0.36,
        RIVAL_LANE_Z - rivalAt * CARD_DEPTH_STEP * 0.72,
      ];
    }
  }
  return null;
}

export function slotWorld(
  nodeIndex: number,
  nodeCount: number,
  slotIndex: number,
): [number, number, number] {
  return [
    nodeWorldX(nodeIndex, nodeCount),
    0.14,
    SELF_LANE_Z + slotIndex * CARD_DEPTH_STEP * 0.72,
  ];
}

export function fanX(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index - (count - 1) / 2) * 0.22;
}

function signed(amount: number | undefined): string {
  if (amount === undefined) return '';
  return amount >= 0 ? `+${amount}` : String(amount);
}
