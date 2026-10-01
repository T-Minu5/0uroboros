/**
 * Fanned hand rail.
 *
 * Every card stays visible, overlapped like a held fan. Hover or tap brings
 * that card to the front and scales it so the rules text is readable. Drag
 * starts from the same face. Travel lives in the HUD overlay, not the canvas.
 * New instance IDs fly into the fan from the deck; seen IDs stay put.
 */

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useDrag } from '@use-gesture/react';

import { CardFace } from './CardFace';
import type { HandCardView } from '../selectors';
import type { DragPointer } from '../board/DragGhost';
import { DRAG_THRESHOLD_PX, isDragGesture } from '../board/boardLayout';
import { FxMark } from '../visual/FxMark';

export interface HandRailProps {
  hand: HandCardView[];
  selectedInstanceId: string | null;
  focusedInstanceId: string | null;
  windowOpen: boolean;
  endedTurn: boolean;
  draggingInstanceId: string | null;
  onFocus: (instanceId: string | null) => void;
  onSelect: (instanceId: string | null) => void;
  onDragActive: (instanceId: string | null) => void;
  onDragMove: (pointer: DragPointer) => void;
  onDragEnd: (pointer: DragPointer) => void;
  onEndDeployment: () => void;
  onConcede: () => void;
}

export function HandRail({
  hand,
  selectedInstanceId,
  focusedInstanceId,
  windowOpen,
  endedTurn,
  draggingInstanceId,
  onFocus,
  onSelect,
  onDragActive,
  onDragMove,
  onDragEnd,
  onEndDeployment,
  onConcede,
}: HandRailProps) {
  const focused = hand.find((entry) => entry.card.instanceId === focusedInstanceId);
  const seen = useRef(new Set<string>());
  const playableHand = hand.filter((entry) => entry.definition.kind !== 'crypto');
  const stash = hand.filter((entry) => entry.definition.kind === 'crypto');
  const incomingPlayable = playableHand.filter((entry) => !seen.current.has(entry.card.instanceId));
  const incomingKey = incomingPlayable
    .concat(stash.filter((entry) => !seen.current.has(entry.card.instanceId)))
    .map((entry) => entry.card.instanceId)
    .join('|');
  const [swirlKey, setSwirlKey] = useState(0);

  useEffect(() => {
    if (!incomingKey) return;
    setSwirlKey((key) => key + 1);
    const hide = window.setTimeout(() => setSwirlKey(0), 1300);
    return () => window.clearTimeout(hide);
  }, [incomingKey]);

  return (
    <div className="rail">
      <div className="rail__actions">
        <button
          type="button"
          className="act"
          data-primary="true"
          onClick={onEndDeployment}
          disabled={!windowOpen || endedTurn}
        >
          {endedTurn ? 'Waiting' : 'End turn'}
        </button>
        <button
          type="button"
          className="act"
          data-danger="true"
          onClick={() => {
            if (window.confirm('Concede the match?')) onConcede();
          }}
        >
          Concede
        </button>
      </div>

      <div className="rail__cards" data-hud="hand">
        {swirlKey > 0 ? <FxMark key={swirlKey} kind="swirl" className="rail__swirl" /> : null}
        {playableHand.length === 0 && stash.length === 0 ? (
          <span className="rail__empty">Hand empty</span>
        ) : playableHand.length === 0 ? (
          <span className="rail__empty">No playable cards</span>
        ) : (
          playableHand.map((entry, index) => {
            const dealIndex = incomingPlayable.findIndex(
              (item) => item.card.instanceId === entry.card.instanceId,
            );
            return (
              <FanCard
                key={entry.card.instanceId}
                entry={entry}
                fan={index - (playableHand.length - 1) / 2}
                dealIndex={dealIndex >= 0 ? dealIndex : null}
                seen={seen}
                selected={entry.card.instanceId === selectedInstanceId}
                focused={entry.card.instanceId === focusedInstanceId}
                dragging={entry.card.instanceId === draggingInstanceId}
                windowOpen={windowOpen}
                endedTurn={endedTurn}
                onFocus={onFocus}
                onSelect={onSelect}
                onDragActive={onDragActive}
                onDragMove={onDragMove}
                onDragEnd={onDragEnd}
              />
            );
          })
        )}
      </div>

      {stash.length > 0 ? (
        <div className="rail__stash" data-hud="crypto" aria-label="Wallet">
          <span className="rail__stash-label">Wallet</span>
          {stash.map((entry, index) => (
            <FanCard
              key={entry.card.instanceId}
              entry={entry}
              fan={0}
              dealIndex={seen.current.has(entry.card.instanceId) ? null : index}
              seen={seen}
              selected={entry.card.instanceId === selectedInstanceId}
              focused={entry.card.instanceId === focusedInstanceId}
              dragging={false}
              windowOpen={windowOpen}
              endedTurn={endedTurn}
              stash
              stack={index}
              onFocus={onFocus}
              onSelect={onSelect}
              onDragActive={onDragActive}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      ) : null}

      <div className="rail__actions">
        <span className="rail__hint">
          {draggingInstanceId
            ? 'Drop on a highlighted Node'
            : focused?.definition.kind === 'crypto'
              ? 'Wallet'
              : focused?.blockedReason
                ? focused.blockedReason
              : selectedInstanceId
                ? 'Drag or click a Node. Closed Nodes accept commits.'
                : windowOpen
                  ? 'Drag onto any Node, including closed ones'
                  : 'Window closed'}
        </span>
      </div>
    </div>
  );
}

interface FanCardProps {
  entry: HandCardView;
  fan: number;
  dealIndex: number | null;
  seen: MutableRefObject<Set<string>>;
  selected: boolean;
  focused: boolean;
  dragging: boolean;
  windowOpen: boolean;
  endedTurn: boolean;
  stash?: boolean;
  stack?: number;
  onFocus: (instanceId: string | null) => void;
  onSelect: (instanceId: string | null) => void;
  onDragActive: (instanceId: string | null) => void;
  onDragMove: (pointer: DragPointer) => void;
  onDragEnd: (pointer: DragPointer) => void;
}

function FanCard({
  entry,
  fan,
  dealIndex,
  seen,
  selected,
  focused,
  dragging,
  windowOpen,
  endedTurn,
  stash = false,
  stack = 0,
  onFocus,
  onSelect,
  onDragActive,
  onDragMove,
  onDragEnd,
}: FanCardProps) {
  const playable = windowOpen && !endedTurn && entry.blockedReason === null;
  const instanceId = entry.card.instanceId;
  const armed = useRef(false);

  const bind = useDrag(
    ({ active, tap, last, xy, movement: [mx, my], velocity: [vx, vy] }) => {
      const pointer: DragPointer = {
        clientX: xy[0],
        clientY: xy[1],
        mx,
        my,
        vx,
        vy,
      };

      if (tap) {
        if (!armed.current) onSelect(selected ? null : instanceId);
        return;
      }

      if (!playable && !armed.current) return;

      if (isDragGesture(mx, my, false)) {
        if (!armed.current) {
          armed.current = true;
          onDragActive(instanceId);
        }
        if (active) onDragMove(pointer);
      }

      if (last) {
        if (armed.current) {
          onDragEnd(pointer);
          onDragActive(null);
        }
        armed.current = false;
      }
    },
    { filterTaps: true, threshold: DRAG_THRESHOLD_PX, pointer: { touch: true } },
  );

  return (
    <div
      className="rail__card"
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${entry.definition.name}. ${stash ? 'Wallet' : playable ? 'Playable' : entry.blockedReason ?? 'Not playable'}`}
      data-instance-id={instanceId}
      data-focus={focused || selected}
      data-dragging={dragging}
      data-stash={stash}
      style={{ ['--fan' as string]: fan, zIndex: stash ? stack + 1 : undefined }}
      {...bind()}
      onPointerEnter={() => {
        if (dragging) return;
        onFocus(instanceId);
      }}
      onPointerLeave={() => onFocus(null)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(selected ? null : instanceId);
        }
      }}
    >
      <DealIn instanceId={instanceId} dealIndex={dealIndex} seen={seen}>
        <CardFace
          definition={entry.definition}
          card={entry.card}
          selected={selected}
          playable={playable}
          blockedReason={stash ? null : entry.blockedReason}
          supplyLabel={stash ? 'Wallet' : null}
          showCost
          density="compact"
        />
      </DealIn>
    </div>
  );
}

function DealIn({
  instanceId,
  dealIndex,
  seen,
  children,
}: {
  instanceId: string;
  dealIndex: number | null;
  seen: MutableRefObject<Set<string>>;
  children: ReactNode;
}) {
  const origin = useRef(dealIndex);

  useEffect(() => {
    seen.current.add(instanceId);
  }, [instanceId, seen]);

  return (
    <div
      className="rail__deal"
      data-deal={origin.current !== null ? 'true' : 'false'}
      style={{ ['--deal' as string]: origin.current ?? 0 }}
    >
      {children}
    </div>
  );
}
