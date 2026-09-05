/**
 * Developer observability.
 *
 * Exposes the authoritative state directly so playtesters never reverse-engineer
 * what happened from animations. This panel reads the seat's own view, which
 * means private opponent data stays hidden exactly as the server sends it. To
 * inspect both seats at once, open the split view and read both panels.
 */

import type { OuroborosState, PlayerID } from '../../game/types';
import { definitionOf, isHidden, opponentOf, phaseLabel } from '../selectors';
import { totalVictoryPoints } from '../../game/engine/scoring';
import { controlledWeight } from '../../game/engine/power';

export interface DebugPanelProps {
  G: OuroborosState;
  bgioPhase: string | null;
  viewer: PlayerID;
  onClose: () => void;
}

export function DebugPanel({ G, bgioPhase, viewer, onClose }: DebugPanelProps) {
  const rival = opponentOf(viewer);

  return (
    <aside className="debug">
      <div className="debug__head">
        <span className="debug__title">Debug</span>
        <button type="button" className="toggle" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="debug__body">
        <Section title="State machine">
          <KV
            rows={[
              ['bgio phase', bgioPhase ?? 'none'],
              ['state', `${G.phase} (${phaseLabel(G.phase)})`],
              ['mode', G.mode],
              ['cycle', String(G.cycle)],
              ['window index', String(G.turn)],
              ['windows completed', String(G.windowsCompleted)],
              ['reveal priority', `player ${G.revealPriority}`],
              ['game over', G.gameOverReason ?? 'no'],
            ]}
          />
        </Section>

        <Section title="Nodes">
          <KV
            rows={G.nodes.map((node) => [
              `node ${node.index + 1}`,
              `${node.state} · ${node.probability}% · ${node.locationId ?? 'no location'}`,
            ])}
          />
          <KV
            rows={[
              [
                'collapse selection',
                G.collapseSelectedNode === null
                  ? 'none'
                  : `node ${G.collapseSelectedNode + 1}`,
              ],
              ['probability total', `${G.nodes.reduce((s, n) => s + n.probability, 0)}%`],
            ]}
          />
        </Section>

        <Section title="Cards at Nodes">
          {G.nodes.map((node) => {
            const cards = Object.values(G.cards)
              .filter((card) => card.zone === 'node' && card.nodeIndex === node.index)
              .sort((a, b) => (a.playOrder ?? 0) - (b.playOrder ?? 0));
            if (cards.length === 0) return null;
            return (
              <div key={node.index}>
                <div className="debug__h">Node {node.index + 1}</div>
                <ul className="debug__list">
                  {cards.map((card) => (
                    <li key={card.instanceId}>
                      p{card.controller} · {isHidden(card) ? 'hidden' : definitionOf(card).name} ·
                      order {card.playOrder} · {card.revealed ? 'revealed' : 'face down'} ·
                      mods {card.powerMods}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </Section>

        <Section title="Reveal queue">
          {G.revealQueue.length === 0 ? (
            <div>empty</div>
          ) : (
            <ol className="debug__list">
              {G.revealQueue.map((instanceId) => {
                const card = G.cards[instanceId];
                return (
                  <li key={instanceId}>
                    p{card?.controller ?? '?'} ·{' '}
                    {isHidden(card) ? 'hidden' : definitionOf(card).name}
                  </li>
                );
              })}
            </ol>
          )}
        </Section>

        {([viewer, rival] as PlayerID[]).map((player) => (
          <Section key={player} title={`Player ${player}${player === viewer ? ' (you)' : ''}`}>
            <KV
              rows={[
                ['victory points', String(totalVictoryPoints(G, player))],
                ['awarded VP', String(G.players[player].victoryPoints)],
                ['wallet', String(G.players[player].wallet)],
                ['controlled weight', `${controlledWeight(G, player).toFixed(1)}%`],
                [
                  'primary DC',
                  `${G.players[player].dataCenters.primary.health}/${G.players[player].dataCenters.primary.maxHealth}${
                    G.players[player].dataCenters.primary.destroyed ? ' destroyed' : ''
                  }`,
                ],
                [
                  'backup DC',
                  `${G.players[player].dataCenters.backup.health}/${G.players[player].dataCenters.backup.maxHealth}${
                    G.players[player].dataCenters.backup.destroyed ? ' destroyed' : ''
                  }`,
                ],
                ['deck', `${G.decks[player].length} cards`],
                ['hand', describeZone(G, G.hands[player])],
                ['discard', describeZone(G, G.discards[player])],
                ['next play order', String(G.players[player].nextPlayOrder)],
                ['ended window', String(G.players[player].endedTurn)],
                ['ended draft', String(G.players[player].endedDraft)],
                [
                  'effect bank',
                  G.effectBanks[player]
                    .map((id, slot) =>
                      id
                        ? `${slot}:${definitionOf(G.cards[id]).name}(${G.cards[id]?.durationRemaining ?? '-'})`
                        : `${slot}:empty`,
                    )
                    .join(' '),
                ],
              ]}
            />
          </Section>
        ))}

        <Section title="Shared zones">
          <KV
            rows={[
              ['trash', describeZone(G, G.trash)],
              ['destroyed', describeZone(G, G.destroyed)],
              [
                'pending choices',
                G.pendingChoices.length === 0
                  ? 'none'
                  : G.pendingChoices.map((c) => `${c.player}:${c.prompt}`).join(', '),
              ],
            ]}
          />
        </Section>

        <Section title="Market">
          <KV
            rows={[
              ...(['base', 'victoryPoint', 'crypto', 'chaos'] as const).map((category) => [
                category,
                G.market[category]
                  .map(
                    (slot) =>
                      `${slot.cardDefId}(${
                        slot.supply !== null
                          ? slot.supply
                          : `${slot.perPlayerSupply?.['0'] ?? 0}/${slot.perPlayerSupply?.['1'] ?? 0}`
                      })`,
                  )
                  .join(' '),
              ]) as Array<[string, string]>,
              [
                'circuit reward',
                G.market.circuitReward.rewardId
                  ? `${G.market.circuitReward.rewardId} eligible[${G.market.circuitReward.eligible.join(',')}] claimed[${G.market.circuitReward.claimed.join(',')}]`
                  : 'none',
              ],
            ]}
          />
        </Section>

        <Section title={`Game log (${G.log.length})`}>
          <div className="debug__log">
            {G.log.map((entry) => (
              <span key={entry.seq}>
                <b>
                  c{entry.cycle}t{entry.turn + 1} {entry.kind}
                </b>{' '}
                {entry.message}
              </span>
            ))}
          </div>
        </Section>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="debug__section">
      <div className="debug__h">{title}</div>
      {children}
    </section>
  );
}

function KV({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="debug__kv">
      {rows.map(([key, value]) => (
        <div key={key} style={{ display: 'contents' }}>
          <dt>{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Summarize a zone, respecting the redaction already applied by playerView. */
function describeZone(G: OuroborosState, instanceIds: string[]): string {
  if (instanceIds.length === 0) return 'empty';
  const hiddenCount = instanceIds.filter((id) => id === 'hidden' || isHidden(G.cards[id])).length;
  const named = instanceIds
    .filter((id) => id !== 'hidden' && !isHidden(G.cards[id]))
    .map((id) => definitionOf(G.cards[id]).name);

  const parts: string[] = [`${instanceIds.length} cards`];
  if (named.length > 0) parts.push(named.join(', '));
  if (hiddenCount > 0) parts.push(`${hiddenCount} hidden`);
  return parts.join(' · ');
}
