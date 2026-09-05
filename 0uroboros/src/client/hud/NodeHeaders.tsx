/**
 * Node headers, rendered in 2D above the 3D columns.
 *
 * Text and numerals stay out of Three.js. The grid uses the same column count as
 * the board, and the board camera is orthographic with a fixed frustum, so the
 * headers stay aligned with their Nodes at any viewport size.
 */

import type { CardInstance } from '../../game/types';
import { cardPowerOf, definitionOf, type NodeView } from '../selectors';
import type { FxView } from '../fxPlayback';
import { formatFxDelta } from '../fxPlayback';

export interface NodeHeadersProps {
  nodes: NodeView[];
  legalNodes: number[];
  onSelectNode?: (index: number) => void;
  /** Face-up for presentation. Defaults to the engine reveal flag. */
  isCardFaceUp?: (card: CardInstance) => boolean;
  powerOf?: (card: CardInstance) => number;
  fx?: FxView;
  collapsingNode?: number | null;
}

const STATE_LABELS: Record<NodeView['state'], string> = {
  closed: 'Closed',
  open: 'Open',
  collapsed: 'Collapsed',
};

export function NodeHeaders({
  nodes,
  legalNodes,
  onSelectNode,
  isCardFaceUp = (card) => card.revealed,
  powerOf = cardPowerOf,
  fx,
  collapsingNode = null,
}: NodeHeadersProps) {
  return (
    <div className="node-heads" style={{ ['--nodes' as string]: nodes.length }}>
      {nodes.map((node) => {
        const legal = legalNodes.includes(node.index);
        const canDeploy = Boolean(legal && onSelectNode);
        const resolving = collapsingNode === node.index || fx?.focusNode === node.index;
        const powerHit =
          fx?.active?.kind === 'power' && fx.active.nodeIndex === node.index;
        return (
          <button
            type="button"
            key={node.index}
            className="node-head"
            data-state={node.state}
            data-legal={legal}
            data-resolving={resolving}
            aria-disabled={!canDeploy}
            onClick={() => {
              if (canDeploy) onSelectNode?.(node.index);
            }}
          >
            <span className="node-head__index">
              {`Node ${node.index + 1} · ${STATE_LABELS[node.state]}`}
            </span>
            <span className="node-head__name">
              {node.state === 'closed'
                ? legal
                  ? 'Location hidden · playable'
                  : 'Location hidden'
                : node.locationName}
            </span>
            <span className="node-head__power" data-pop={powerHit}>
              <b className="rival">{node.rivalPower}</b>
              <span className="sep">vs</span>
              <b className="self">{node.selfPower}</b>
              {powerHit && fx?.active ? (
                <span className="fx-floater">{formatFxDelta(fx.active)}</span>
              ) : null}
            </span>
            <span className="node-head__lead">
              {node.leader === null
                ? 'Tied'
                : node.leader === 'self'
                  ? 'You lead'
                  : 'Opponent leads'}
            </span>
            <span className="node-head__piles">
              <PileSummary
                cards={node.rivalCards}
                side="rival"
                isCardFaceUp={isCardFaceUp}
                powerOf={powerOf}
              />
              <PileSummary
                cards={node.selfCards}
                side="self"
                isCardFaceUp={isCardFaceUp}
                powerOf={powerOf}
              />
            </span>
            {node.state !== 'closed' && node.locationText ? (
              <span className="node-head__text">{node.locationText}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function PileSummary({
  cards,
  side,
  isCardFaceUp,
  powerOf,
}: {
  cards: CardInstance[];
  side: 'self' | 'rival';
  isCardFaceUp: (card: CardInstance) => boolean;
  powerOf: (card: CardInstance) => number;
}) {
  const faceUp = cards.filter(isCardFaceUp);
  const committed = cards.length - faceUp.length;
  const parts = [
    ...faceUp.map((card) => `${definitionOf(card).name} ${powerOf(card)}`),
    committed > 0 ? `${committed} committed` : null,
  ].filter(Boolean);

  if (parts.length === 0) return null;

  return (
    <span className="node-head__pile" data-side={side}>
      {parts.join(' · ')}
    </span>
  );
}
