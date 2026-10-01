/**
 * Structured effect-resolution plate. One causal chain, not a single sentence.
 */

import type { FxEvent } from '../../game/types';

export function EffectResolve({
  events,
  sourceName = null,
  canContinue,
  onContinue,
}: {
  events: FxEvent[];
  sourceName?: string | null;
  canContinue?: boolean;
  onContinue?: () => void;
}) {
  if (events.length === 0) return null;
  const heading = sourceName?.trim() || events[0].text?.split('.')[0] || 'Effect';

  return (
    <div className="resolve" data-kind={events[0].kind} role="status" aria-live="polite">
      <div className="resolve__card">
        <div className="resolve__source">{heading}</div>
        {events.map((event) => (
          <EffectLine key={event.id} event={event} />
        ))}
        {canContinue && onContinue ? (
          <button type="button" className="resolve__go" onClick={onContinue}>
            Continue
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EffectLine({ event }: { event: FxEvent }) {
  const text = event.text?.trim() || labelOf(event.kind);
  if (event.kind === 'damageDc' || event.kind === 'healDc') {
    const pool = event.dataCenter === 'backup' ? 'Backup' : 'Primary';
    const who = event.player === undefined ? '' : `P${event.player} `;
    const span =
      event.before !== undefined && event.after !== undefined
        ? `${event.before} → ${event.after}`
        : '';
    return (
      <div className="resolve__line">
        <div className="resolve__op">{text}</div>
        <div className="resolve__target">{`${who}${pool}`}</div>
        {span ? <div className="resolve__span">{span}</div> : null}
      </div>
    );
  }
  if (event.kind === 'chance') {
    const from = event.fromNode !== undefined ? `N${event.fromNode + 1}` : 'Node';
    const to = event.toNode !== undefined ? `N${event.toNode + 1}` : 'Node';
    return (
      <div className="resolve__line">
        <div className="resolve__op">{text}</div>
        <div className="resolve__target">{`${from} → ${to}`}</div>
      </div>
    );
  }
  return (
    <div className="resolve__line">
      <div className="resolve__op">{text}</div>
      {event.amount !== undefined ? (
        <div className="resolve__span">{formatAmount(event)}</div>
      ) : null}
    </div>
  );
}

function labelOf(kind: FxEvent['kind']): string {
  if (kind === 'damageDc') return 'Drain';
  if (kind === 'healDc') return 'Restore';
  if (kind === 'vp') return 'Victory Points';
  if (kind === 'crypto') return 'Crypto';
  if (kind === 'power') return 'Power';
  if (kind === 'chance') return 'Probability';
  return kind;
}

function formatAmount(event: FxEvent): string {
  const amount = event.amount ?? 0;
  if (event.kind === 'damageDc') return `-${amount}`;
  if (event.kind === 'chance') return `${amount}%`;
  return amount >= 0 ? `+${amount}` : String(amount);
}
