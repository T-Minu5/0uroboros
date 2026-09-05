/**
 * Hand rail and turn actions.
 *
 * Deployability is a first-class visual state computed from game state, so
 * illegal plays are prevented rather than rejected. Selecting a card highlights
 * its legal Nodes before the player commits.
 */

import { CardFace } from './CardFace';
import type { HandCardView } from '../selectors';

export interface HandRailProps {
  hand: HandCardView[];
  selectedInstanceId: string | null;
  windowOpen: boolean;
  endedTurn: boolean;
  onSelect: (instanceId: string | null) => void;
  onEndDeployment: () => void;
  onConcede: () => void;
}

export function HandRail({
  hand,
  selectedInstanceId,
  windowOpen,
  endedTurn,
  onSelect,
  onEndDeployment,
  onConcede,
}: HandRailProps) {
  const selectedView = hand.find((entry) => entry.card.instanceId === selectedInstanceId);

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
          {endedTurn ? 'Waiting' : 'End window'}
        </button>
        <button type="button" className="act" onClick={onConcede}>
          Concede
        </button>
      </div>

      <div className="rail__cards">
        {hand.length === 0 ? (
          <span className="rail__empty">Hand empty</span>
        ) : (
          hand.map((entry) => {
            const selectable = windowOpen && !endedTurn && entry.blockedReason === null;
            return (
              <CardFace
                key={entry.card.instanceId}
                definition={entry.definition}
                card={entry.card}
                selected={entry.card.instanceId === selectedInstanceId}
                playable={selectable}
                blockedReason={entry.blockedReason}
                onClick={() =>
                  onSelect(
                    entry.card.instanceId === selectedInstanceId ? null : entry.card.instanceId,
                  )
                }
              />
            );
          })
        )}
      </div>

      <div className="rail__actions">
        <span className="metric__label">
          {selectedView
            ? selectedView.blockedReason
              ? selectedView.blockedReason
              : 'Choose a highlighted Node'
            : windowOpen
              ? 'Select a card'
              : 'Window closed'}
        </span>
      </div>
    </div>
  );
}
