/**
 * Player status block.
 *
 * One component renders both seats so comparison is positional. The two Data
 * Centers are always separate bars, because damage does not spill between them
 * and each awards different Victory Points when destroyed.
 */

import type { StatusView } from '../selectors';

export interface PlayerStatusProps {
  status: StatusView;
  side: 'local' | 'rival';
  label: string;
  /** Draft is running, so the Wallet is relevant. */
  showWallet: boolean;
}

export function PlayerStatus({ status, side, label, showWallet }: PlayerStatusProps) {
  return (
    <div className="status" data-side={side}>
      <div className="status__id">
        <div className="status__avatar">{status.player}</div>
        <div>
          <div className="status__name">{label}</div>
          <div className="status__sub">
            {`deck ${status.deckCount} · hand ${status.handCount} · discard ${status.discardCount}`}
          </div>
        </div>
      </div>

      <div className="dc-group">
        {status.dataCenters.map((dc) => {
          const pct = dc.maxHealth === 0 ? 0 : (dc.health / dc.maxHealth) * 100;
          return (
            <div
              key={dc.id}
              className="dc"
              data-destroyed={dc.destroyed}
              data-low={!dc.destroyed && pct <= 25}
            >
              <div className="dc__top">
                <span>{dc.destroyed ? `${dc.label} down` : dc.label}</span>
                <span className="dc__value">
                  {dc.health}/{dc.maxHealth}
                </span>
              </div>
                  <div className="dc__track">
                    <div className="dc__fill" style={{ transform: `scaleX(${pct / 100})` }} />
                  </div>
            </div>
          );
        })}
      </div>

      <div className="metric metric--vp">
        <span className="metric__label">Victory</span>
        <span className="metric__value">{status.victoryPoints}</span>
      </div>

      {showWallet ? (
        <div className="metric metric--wallet">
          <span className="metric__label">Wallet</span>
          <span className="metric__value">{status.wallet}</span>
        </div>
      ) : null}

      {status.hasRevealPriority ? (
        <span className="badge">Reveal priority</span>
      ) : (
        <span className="badge" data-kind="waiting">
          Second to reveal
        </span>
      )}

      {status.endedTurn ? (
        <span className="badge" data-kind="ended">
          Window closed
        </span>
      ) : null}
      {status.endedDraft ? (
        <span className="badge" data-kind="ended">
          Draft ended
        </span>
      ) : null}
    </div>
  );
}
