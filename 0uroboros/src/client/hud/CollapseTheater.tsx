/**
 * Wave Collapse sequence overlay.
 *
 * Owns the major event walk. Draft waits until this report is complete.
 */

import type { CollapseTheater } from '../collapseTheater';
import { isGlobalPresentationKind } from '../board/spatialGrammar';

export function CollapseTheaterOverlay({
  theater,
  pending = false,
  canContinue = false,
  onContinue,
}: {
  theater: CollapseTheater;
  pending?: boolean;
  canContinue?: boolean;
  onContinue?: () => void;
}) {
  if (pending && !theater.active) {
    return (
      <div className="collapse-show" data-kind="title" role="status" aria-live="polite">
        <span className="collapse-show__kicker">Circuit complete</span>
        <span className="collapse-show__title">Wave Collapse</span>
        <span className="collapse-show__sub">Resolving the Circuit</span>
        {canContinue && onContinue ? (
          <button type="button" className="collapse-show__go" onClick={onContinue}>
            Continue
          </button>
        ) : null}
      </div>
    );
  }

  if (!theater.active || !theater.event) return null;
  const event = theater.event;
  const global = isGlobalPresentationKind(event.kind) || pending;

  return (
    <div
      className="collapse-show"
      data-kind={event.kind}
      data-scope={global ? 'global' : 'local'}
      data-node={event.nodeIndex ?? ''}
      role="status"
      aria-live="polite"
    >
      {event.kicker ? <span className="collapse-show__kicker">{event.kicker}</span> : null}
      <span className="collapse-show__title">{event.title}</span>
      {event.lines?.map((line) => (
        <span key={line} className="collapse-show__sub">
          {line}
        </span>
      ))}
      {canContinue && onContinue ? (
        <button type="button" className="collapse-show__go" onClick={onContinue}>
          Continue
        </button>
      ) : (
        <span className="collapse-show__hint">Reading</span>
      )}
    </div>
  );
}
