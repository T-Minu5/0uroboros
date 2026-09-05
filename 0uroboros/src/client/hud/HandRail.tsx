/**
 * Fanned hand rail.
 *
 * Every card stays visible, overlapped like a held fan. Hover or tap brings
 * that card to the front and scales it so the rules text is readable. Drag
 * starts from the same face; the 3D ghost is only the in-flight object.
 */

import { useDrag } from '@use-gesture/react';

import { CardFace } from './CardFace';
import type { HandCardView } from '../selectors';
import type { DragPointer } from '../board/DragGhost';
import { DRAG_THRESHOLD_PX } from '../board/boardLayout';

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

      <div className="rail__cards">
        {hand.length === 0 ? (
          <span className="rail__empty">Hand empty</span>
        ) : (
          hand.map((entry) => (
            <FanCard
              key={entry.card.instanceId}
              entry={entry}
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
          ))
        )}
      </div>

      <div className="rail__actions">
        <span className="rail__hint">
          {draggingInstanceId
            ? 'Drop on a highlighted Node'
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
  selected: boolean;
  focused: boolean;
  dragging: boolean;
  windowOpen: boolean;
  endedTurn: boolean;
  onFocus: (instanceId: string | null) => void;
  onSelect: (instanceId: string | null) => void;
  onDragActive: (instanceId: string | null) => void;
  onDragMove: (pointer: DragPointer) => void;
  onDragEnd: (pointer: DragPointer) => void;
}

function FanCard({
  entry,
  selected,
  focused,
  dragging,
  windowOpen,
  endedTurn,
  onFocus,
  onSelect,
  onDragActive,
  onDragMove,
  onDragEnd,
}: FanCardProps) {
  const playable = windowOpen && !endedTurn && entry.blockedReason === null;
  const instanceId = entry.card.instanceId;

  const bind = useDrag(
    ({ active, tap, first, last, xy, movement: [mx, my], velocity: [vx, vy] }) => {
      const pointer: DragPointer = {
        clientX: xy[0],
        clientY: xy[1],
        mx,
        my,
        vx,
        vy,
      };

      if (tap) {
        onSelect(selected ? null : instanceId);
        return;
      }

      if (!playable) return;

      if (first) onDragActive(instanceId);
      if (active) onDragMove(pointer);
      if (last) {
        onDragEnd(pointer);
        onDragActive(null);
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
      aria-label={`${entry.definition.name}. ${playable ? 'Playable' : entry.blockedReason ?? 'Not playable'}`}
      data-focus={focused || selected}
      data-dragging={dragging}
      {...bind()}
      onPointerEnter={() => onFocus(instanceId)}
      onPointerLeave={() => onFocus(null)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(selected ? null : instanceId);
        }
      }}
    >
      <CardFace
        definition={entry.definition}
        card={entry.card}
        selected={selected}
        playable={playable}
        blockedReason={entry.blockedReason}
        showCost
      />
    </div>
  );
}
