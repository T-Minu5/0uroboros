/**
 * Node overlays on the five location pads.
 *
 * Power totals sit on the Location plaque, rival above the name and self
 * below it. The plaque border lights in the leader's colour and a chevron
 * points toward that player. Card chips stay in the halves. Drag shows a
 * landing cue only.
 */

import type { CardInstance } from '../../game/types';
import { cardPowerOf, definitionOf, type NodeView } from '../selectors';
import { cardArtUrl } from '../lookdev/cardArt';
import type { FxView } from '../fxPlayback';
import { formatFxDelta } from '../fxPlayback';
import { formatPercent } from './ProbabilityStrip';
import type { PresentationEvent } from '../presentation/queue';
import type { LaneScreenBox } from '../board/spatialGrammar';

export interface NodeHeadersProps {
  nodes: NodeView[];
  legalNodes: number[];
  selected?: boolean;
  nodeReasons?: Record<number, string | null>;
  onSelectNode?: (index: number) => void;
  isCardFaceUp?: (card: CardInstance) => boolean;
  powerOf?: (card: CardInstance) => number;
  fx?: FxView;
  collapsingNode?: number | null;
  focusedCardId?: string | null;
  onFocusCard?: (instanceId: string | null) => void;
  onInspectCard?: (instanceId: string) => void;
  hiddenCardIds?: ReadonlySet<string>;
  laneBoxes?: LaneScreenBox[] | null;
  dragging?: boolean;
  hoveredNode?: number | null;
  ghostName?: string | null;
  localBeat?: PresentationEvent | null;
  canContinue?: boolean;
  onContinue?: () => void;
  openingNodes?: number[];
}

const STATE_LABELS: Record<NodeView['state'], string> = {
  closed: 'Closed',
  open: 'Open',
  collapsed: 'Collapsed',
};

export function NodeHeaders({
  nodes,
  legalNodes,
  selected = false,
  nodeReasons = {},
  onSelectNode,
  isCardFaceUp = (card) => card.revealed,
  powerOf = cardPowerOf,
  fx,
  collapsingNode = null,
  focusedCardId = null,
  onFocusCard,
  onInspectCard,
  hiddenCardIds = new Set(),
  laneBoxes = null,
  dragging = false,
  hoveredNode = null,
  ghostName = null,
  localBeat = null,
  canContinue = false,
  onContinue = () => undefined,
  openingNodes = [],
}: NodeHeadersProps) {
  const projected = Boolean(laneBoxes && laneBoxes.length === nodes.length);

  return (
    <div
      className="node-heads"
      data-projected={projected}
      style={{ ['--nodes' as string]: nodes.length }}
    >
      {nodes.map((node) => {
        const legal = legalNodes.includes(node.index);
        const reason = nodeReasons[node.index] ?? null;
        const canDeploy = Boolean(legal && onSelectNode);
        const resolving =
          collapsingNode === node.index ||
          (collapsingNode == null && fx?.focusNode === node.index);
        const powerHit =
          fx?.active?.kind === 'power' && fx.active.nodeIndex === node.index;
        const hovering = dragging && hoveredNode === node.index;
        const box = laneBoxes?.find((entry) => entry.index === node.index);
        const nextSlot = node.selfCards.filter((card) => !hiddenCardIds.has(card.instanceId)).length;
        const selfWins = node.selfPower > node.rivalPower;
        const rivalWins = node.rivalPower > node.selfPower;
        const lead = node.leader ?? 'tie';
        const comparing = resolving && localBeat?.kind === 'node_result';
        const locationFocus = resolving && localBeat?.kind === 'location_resolution';
        const opening = openingNodes.includes(node.index);
        const beatHere = localBeat && localBeat.nodeIndex === node.index ? localBeat : null;
        const cue = hovering && reason
          ? reason
          : hovering && legal
            ? 'Land here'
            : hovering && ghostName
              ? ghostName
              : null;

        return (
          <div
            key={node.index}
            className="node-head"
            data-node={String(node.index)}
            data-state={node.state}
            data-legal={legal}
            data-selected={hovering}
            data-blocked={Boolean((selected || dragging) && hovering && reason)}
            data-resolving={resolving}
            data-hover={hovering}
            data-figure={resolving}
            data-opening={opening}
            data-lead={lead}
            role="group"
            aria-label={`${node.state === 'closed' ? 'Location hidden' : node.locationName}. ${formatPercent(node.probability)}`}
            style={
              projected && box
                ? {
                    position: 'absolute',
                    left: box.left,
                    top: box.top,
                    width: box.width,
                    height: box.height,
                    ['--mid-y' as string]: `${box.midY}px`,
                    ['--self-y' as string]: `${box.selfY}px`,
                    ['--rival-y' as string]: `${box.rivalY}px`,
                  }
                : undefined
            }
            aria-disabled={!canDeploy}
            onClick={() => {
              if (canDeploy) onSelectNode?.(node.index);
            }}
            onKeyDown={(event) => {
              if (!canDeploy) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectNode?.(node.index);
              }
            }}
            tabIndex={canDeploy ? 0 : -1}
          >
            <span className="node-head__lane" />

            <span className="node-head__half" data-side="rival">
              <CardStrip
                cards={node.rivalCards}
                side="rival"
                isCardFaceUp={isCardFaceUp}
                powerOf={powerOf}
                focusedCardId={focusedCardId}
                sourceId={fx?.active?.sourceInstanceId ?? null}
                hiddenCardIds={hiddenCardIds}
                onFocusCard={onFocusCard}
                onInspectCard={onInspectCard}
              />
            </span>

            <span className="node-head__mid" data-location={locationFocus} data-lead={lead}>
              <span className="node-head__point" data-side="rival" aria-hidden="true" />
              <span
                className="node-head__power"
                data-side="rival"
                data-pop={powerHit}
                data-rank={rivalWins ? 'win' : selfWins ? 'lose' : 'tie'}
              >
                <b className="rival">{node.rivalPower}</b>
              </span>
              <span className="node-head__copy">
                <span className="node-head__chance">{formatPercent(node.probability)}</span>
                <span className="node-head__index">{STATE_LABELS[node.state]}</span>
                <span className="node-head__name">
                  {node.state === 'closed'
                    ? legal
                      ? 'Location hidden · playable'
                      : 'Location hidden'
                    : node.locationName}
                </span>
                {node.state !== 'closed' && node.locationText ? (
                  <span className="node-head__text" data-expanded="hover">
                    {node.locationText}
                  </span>
                ) : null}
                <span className="sr-copy">{leadCopy(node)}</span>
                {opening ? <span className="sr-copy">Opens this window</span> : null}
                {cue ? <span className="node-head__lead">{cue}</span> : null}
                {hovering && reason ? <span className="node-head__why">{reason}</span> : null}
                {beatHere && beatHere.kind !== 'node_result' ? (
                  <span className="node-head__local" data-kind={beatHere.kind}>
                    {beatHere.kind === 'location_reward' ? beatHere.lines?.[0] ?? beatHere.title : beatHere.title}
                  </span>
                ) : null}
                {comparing ? (
                  <span className="node-head__local" data-kind="node_result">
                    {selfWins ? 'WIN' : rivalWins ? 'LOSS' : 'TIE'}
                  </span>
                ) : null}
                {beatHere && canContinue && onContinue ? (
                  <span
                    className="node-head__go"
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      onContinue();
                    }}
                  >
                    Continue
                  </span>
                ) : null}
              </span>
              <span
                className="node-head__power"
                data-side="self"
                data-pop={powerHit}
                data-rank={selfWins ? 'win' : rivalWins ? 'lose' : 'tie'}
              >
                <b className="self">{node.selfPower}</b>
                {powerHit && fx?.active ? (
                  <span className="fx-floater">{formatFxDelta(fx.active)}</span>
                ) : null}
              </span>
              <span className="node-head__point" data-side="self" aria-hidden="true" />
            </span>

            <span className="node-head__half" data-side="self">
              <span className="node-head__slots" data-hover={hovering} hidden={!dragging && !hovering}>
                {Array.from({ length: 4 }, (_, slot) => (
                  <span
                    key={slot}
                    className="node-head__slot"
                    data-filled={slot < nextSlot}
                    data-ghost={hovering && slot === nextSlot}
                  >
                    {hovering && slot === nextSlot && ghostName ? ghostName : slot < nextSlot ? '' : `${slot + 1}`}
                  </span>
                ))}
              </span>
              <span className="node-head__cap">{`${node.selfCards.length}/4`}</span>
              <CardStrip
                cards={node.selfCards}
                side="self"
                isCardFaceUp={isCardFaceUp}
                powerOf={powerOf}
                focusedCardId={focusedCardId}
                sourceId={fx?.active?.sourceInstanceId ?? null}
                hiddenCardIds={hiddenCardIds}
                onFocusCard={onFocusCard}
                onInspectCard={onInspectCard}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function leadCopy(node: NodeView): string {
  if (node.leader === null) return 'Tied';
  return node.leader === 'self' ? 'You lead' : 'Opponent leads';
}

const KIND_MARK: Record<string, string> = {
  character: 'CHR',
  victoryPoint: 'VP',
  crypto: 'CRY',
  base: 'BASE',
  chaos: 'CHS',
};

function CardStrip({
  cards,
  side,
  isCardFaceUp,
  powerOf,
  focusedCardId,
  sourceId,
  hiddenCardIds,
  onFocusCard,
  onInspectCard,
}: {
  cards: CardInstance[];
  side: 'self' | 'rival';
  isCardFaceUp: (card: CardInstance) => boolean;
  powerOf: (card: CardInstance) => number;
  focusedCardId: string | null;
  sourceId: string | null;
  hiddenCardIds: ReadonlySet<string>;
  onFocusCard?: (instanceId: string | null) => void;
  onInspectCard?: (instanceId: string) => void;
}) {
  const visible = cards.filter((card) => !hiddenCardIds.has(card.instanceId));
  if (visible.length === 0) return null;

  return (
    <span className="node-chips" data-side={side}>
      {visible.map((card, index) => {
        const known = side === 'self' && card.cardDefId !== 'hidden';
        const faceUp = known || isCardFaceUp(card);
        const definition = faceUp ? definitionOf(card) : null;
        const art = definition ? cardArtUrl(definition.id, definition.name) : null;
        return (
          <button
            key={card.instanceId}
            type="button"
            className="node-chip"
            data-side={side}
            data-face={faceUp ? 'up' : 'down'}
            data-focus={focusedCardId === card.instanceId}
            data-source={sourceId === card.instanceId}
            data-instance-id={card.instanceId}
            onPointerEnter={() => onFocusCard?.(card.instanceId)}
            onPointerLeave={() => onFocusCard?.(null)}
            onClick={(event) => {
              event.stopPropagation();
              if (faceUp) onInspectCard?.(card.instanceId);
            }}
          >
            <span
              className="node-chip__art"
              style={art ? { backgroundImage: `url(${art})` } : undefined}
              aria-hidden="true"
            />
            <span className="node-chip__order">
              {typeof card.playOrder === 'number' && card.playOrder > 0 ? card.playOrder : index + 1}
            </span>
            <span className="node-chip__name">
              {faceUp ? definition?.name ?? 'Card' : 'Committed'}
            </span>
            {faceUp ? (
              <span className="node-chip__meta">
                <b>{powerOf(card)}</b>
                <em>{KIND_MARK[definition?.kind ?? 'character']}</em>
                {definition?.duration ? <i>DUR</i> : null}
              </span>
            ) : (
              <span className="node-chip__meta">Hidden</span>
            )}
          </button>
        );
      })}
    </span>
  );
}
