/**
 * Wave Collapse sequence overlay.
 *
 * Owns the major event: title, each Node collapsing with its Location award,
 * the probability measurement, and the winner announcement. Draft waits.
 */

import type { CollapseTheater } from '../collapseTheater';

export function CollapseTheaterOverlay({ theater }: { theater: CollapseTheater }) {
  if (!theater.active || !theater.beat) return null;

  return (
    <div className="collapse-show" data-kind={theater.beat.kind} role="status" aria-live="polite">
      <span className="collapse-show__kicker">
        {theater.beat.kind === 'title' ? 'Circuit complete' : 'Wave Collapse'}
      </span>
      <span className="collapse-show__title">{theater.beat.title}</span>
      <span className="collapse-show__sub">{theater.beat.subtitle}</span>
    </div>
  );
}
