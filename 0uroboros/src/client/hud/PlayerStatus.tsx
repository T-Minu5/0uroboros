/**
 * Player status block.
 *
 * One component renders both seats so comparison is positional. The two Data
 * Centers are always separate bars, because damage does not spill between them
 * and each awards different Victory Points when destroyed.
 */

import type { StatusView } from '../selectors';
import type { FxView } from '../fxPlayback';
import { formatFxDelta } from '../fxPlayback';
import { GameIcon, IconStat } from '../visual/icons';

export interface PlayerStatusProps {
  status: StatusView;
  side: 'local' | 'rival';
  label: string;
  /** Draft is running, so the Wallet is relevant. */
  showWallet: boolean;
  fx?: FxView;
}

export function PlayerStatus({ status, side, label, showWallet, fx }: PlayerStatusProps) {
  const vp = status.victoryPoints - (fx?.vpPending(status.player) ?? 0);
  const wallet = status.wallet - (fx?.walletPending(status.player) ?? 0);
  const vpPop = fx?.active?.kind === 'vp' && fx.active.player === status.player;
  const walletPop = fx?.active?.kind === 'crypto' && fx.active.player === status.player;
  return (
    <div className="status" data-side={side}>
      <div className="status__id">
        <div className="status__avatar">{status.player}</div>
        <div>
          <div className="status__name">{label}</div>
          <div className="status__sub" data-hud="deck" data-side={side}>
            <IconStat icon="deck" value={status.deckCount} label="deck" />
            <IconStat icon="hand" value={status.handCount} label="hand" />
            <IconStat icon="discard" value={status.discardCount} label="discard" />
          </div>
        </div>
      </div>

      <div className="dc-group">
        {status.dataCenters.map((dc) => {
          const health = fx?.dcHealth(status.player, dc.id) ?? dc.health;
          const pct = dc.maxHealth === 0 ? 0 : (health / dc.maxHealth) * 100;
          const hit = fx?.hitDcKey === `${status.player}:${dc.id}`;
          const delta = hit && fx?.active ? formatFxDelta(fx.active) : null;
          return (
            <div
              key={dc.id}
              className="dc"
              data-dc={dc.id}
              data-player={status.player}
              data-side={side}
              data-destroyed={dc.destroyed && health <= 0}
              data-low={!dc.destroyed && pct <= 25}
              data-hit={hit}
            >
              <div className="dc__top">
                <span className="dc__label">
                  <GameIcon name="database" />
                  {dc.destroyed && health <= 0 ? `${dc.label} down` : dc.label}
                </span>
                <span className="dc__value" data-pop={hit}>
                  {health}/{dc.maxHealth}
                </span>
              </div>
              <div className="dc__track">
                <div className="dc__fill" style={{ transform: `scaleX(${pct / 100})` }} />
                {delta ? <span className="fx-floater">{delta}</span> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="metric metric--actions" data-hud="actions" data-side={side}>
        <IconStat icon="action" value={status.actions} label="Actions" />
        {status.pendingActions > 0 ? (
          <span className="metric__pending">{`pending ${status.pendingActions}`}</span>
        ) : null}
      </div>

      <div className="metric metric--vp">
        <span className="metric__label">Victory</span>
        <span className="metric__value" data-pop={vpPop} data-hud="vp" data-side={side}>
          {vp}
        </span>
        {vpPop && fx?.active ? (
          <span className="fx-floater">{formatFxDelta(fx.active)}</span>
        ) : null}
      </div>

      {showWallet ? (
        <div className="metric metric--wallet" data-hud="wallet" data-side={side}>
          <IconStat icon="crypto" value={wallet} label="Wallet" />
          {walletPop && fx?.active ? (
            <span className="fx-floater">{formatFxDelta(fx.active)}</span>
          ) : null}
        </div>
      ) : null}

      {status.hasRevealPriority ? (
        <span className="badge">
          <GameIcon name="priority" />
          Reveal priority
        </span>
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
