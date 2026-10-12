import type { PlayerId } from '@0uroboros/engine/game';
import type { RuntimeEvent } from '@0uroboros/engine/runtime';

export type SeatNames = readonly [string, string];
/** One player's lines for a stretch of the log, in the order things happened. */
export type PlayerSummary = { owner: PlayerId; lines: string[] };

type Play = {
  owner: PlayerId; card: string; node?: number; kind: 'play' | 'trigger' | 'location' | 'circuit';
  drained: Map<PlayerId, number>; restored: number; cards: number; actions: number; crypto: number; vp: number;
  trashed?: number; destroyed?: number; notes: string[];
};

const plural = (n: number, word: string) => `${n} ${word}${Math.abs(n) === 1 ? '' : 's'}`;
const possessive = (name: string) => name === 'You' ? 'your' : name.endsWith('s') ? `${name}'` : `${name}'s`;
const joinAnd = (parts: string[]) => parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
const detail = (event: RuntimeEvent) => event.text.replace(/^[^:]*:\s*/, '').trim();
const cardName = (event: RuntimeEvent) => event.text.replace(/ reveals\.$/, '');

function newPlay(owner: PlayerId, card: string, kind: Play['kind'], node?: number): Play {
  return { owner, card, node, kind, drained: new Map(), restored: 0, cards: 0, actions: 0, crypto: 0, vp: 0, notes: [] };
}

function absorb(play: Play, event: RuntimeEvent, names: SeatNames) {
  const amount = event.amount ?? 0, to = event.targetOwner ?? play.owner, mine = to === play.owner;
  const note = (text: string) => { if (!play.notes.includes(text)) play.notes.push(text); };
  switch (event.kind) {
    case 'drain':
      if (/: destroy /.test(event.text)) note(`Destroying ${mine ? 'their own' : possessive(names[to])} ${event.target === 'backup' ? 'Backup' : 'Primary'} Server`);
      else if (amount > 0) play.drained.set(to, (play.drained.get(to) ?? 0) + amount);
      return;
    case 'restore': if (amount > 0) { if (mine) play.restored += amount; else note(`Restoring ${amount} to ${possessive(names[to])} Server`); } return;
    case 'draw': if (amount > 0 && event.target === 'hand') { if (mine) play.cards += amount; else note(`${names[to]} draws ${amount}`); } return;
    case 'actions': if (amount > 0) { if (mine) play.actions += amount; else note(`Giving ${names[to]} ${plural(amount, 'action')}`); } return;
    case 'crypto': if (amount) { if (mine) play.crypto += amount; else note(`${amount > 0 ? 'Giving' : 'Costing'} ${names[to]} ${Math.abs(amount)} Crypto`); } return;
    case 'vp': if (amount) { if (mine) play.vp += amount; else note(`${amount > 0 ? 'Giving' : 'Costing'} ${names[to]} ${plural(Math.abs(amount), 'VP').replace(/VPs$/, 'VP')}`); } return;
    case 'trash':
      if (/ destroys /.test(event.text)) play.destroyed = (play.destroyed ?? 0) + amount;
      else play.trashed = (play.trashed ?? 0) + amount;
      return;
    case 'power': {
      if (!amount) return;
      const pull = /pull (\d+) power from Node (\d+) to Node (\d+)/i.exec(event.text);
      if (pull) note(`Pulling ${pull[1]} Power from N${pull[2]} to N${pull[3]}`);
      else if (amount < 0) note(mine ? `Losing ${-amount} Power` : `Cutting ${-amount} Power from ${possessive(names[to])} card`);
      else note(`Adding ${amount} Power`);
      return;
    }
    default:
      if ((play.kind === 'location' || play.kind === 'circuit') && event.kind !== 'choice' && amount !== 0) note(detail(event));
  }
}

function sentence(play: Play, names: SeatNames): string | null {
  const actions = [
    ...[...play.drained].map(([to, amount]) => `Draining ${amount} from ${to === play.owner ? 'their own' : possessive(names[to])} Server`),
    ...(play.restored ? [`Restoring ${play.restored}`] : []),
    ...(play.trashed !== undefined ? [`Trashing ${plural(play.trashed, 'card')}`] : []),
    ...(play.destroyed !== undefined ? [`Destroying ${plural(play.destroyed, 'card')}`] : []),
    ...play.notes,
  ];
  const gains = [
    ...(play.cards ? [plural(play.cards, 'card')] : []), ...(play.actions ? [plural(play.actions, 'action')] : []),
    ...(play.crypto > 0 ? [`${play.crypto} Crypto`] : []), ...(play.vp > 0 ? [`${play.vp} VP`] : []),
  ];
  const losses = [...(play.crypto < 0 ? [`${-play.crypto} Crypto`] : []), ...(play.vp < 0 ? [`${-play.vp} VP`] : [])];
  if (play.kind !== 'play' && !actions.length && !gains.length && !losses.length) return null;
  const head = play.kind === 'play' ? `Plays ${play.card}${play.node !== undefined ? ` at N${play.node + 1}` : ''}`
    : play.kind === 'location' ? `${play.card} (Location)` : play.kind === 'circuit' ? `${play.card} (Circuit Reward)` : `${play.card} triggers`;
  return `${head}${actions.length ? `, ${actions.join(', ')}` : ''}.${gains.length ? ` Gaining ${joinAnd(gains)}.` : ''}${losses.length ? ` Losing ${joinAnd(losses)}.` : ''}`;
}

/** Per-player lines for a Runtime turn, Collapse or Draft: each played card with what it did, plus Location and Circuit effects. */
export function summarizeEvents(events: readonly RuntimeEvent[], names: SeatNames): PlayerSummary[] {
  const plays: Play[] = [], byCard = new Map<string, Play>(), purchases: { owner: PlayerId; line: string }[] = [];
  for (const event of events) {
    if (event.owner === undefined) continue;
    if (event.kind === 'reveal' && event.cardId) {
      const play = newPlay(event.owner, cardName(event), 'play', event.node);
      plays.push(play); byCard.set(event.cardId, play);
      continue;
    }
    if (event.kind === 'purchase') {
      const bought = /acquires? (.+) to Discard for (\d+) Crypto/.exec(event.text);
      purchases.push({ owner: event.owner, line: bought ? `Buys ${bought[1]} for ${bought[2]} Crypto.` : event.text });
      continue;
    }
    if (!event.cardId || ['choice', 'bank', 'deploy', 'turn'].includes(event.kind)) continue;
    // Held Crypto settling at the end of the Cycle is already in the Collapse table.
    if (event.phase === 'collapse' && event.node === undefined && event.source === 'card') continue;
    const key = `${event.owner}|${event.cardId}`;
    let play = byCard.get(event.cardId) ?? byCard.get(key);
    if (!play) {
      const kind = event.source === 'location' ? 'location' : event.source === 'circuit' ? 'circuit' : 'trigger';
      play = newPlay(event.owner, event.sourceName ?? 'A card', kind, event.node);
      plays.push(play); byCard.set(kind === 'trigger' ? event.cardId : key, play);
    }
    absorb(play, event, names);
  }
  return ([0, 1] as PlayerId[]).map(owner => ({
    owner,
    lines: [
      ...plays.filter(play => play.owner === owner).map(play => sentence(play, names)).filter((line): line is string => !!line),
      ...purchases.filter(entry => entry.owner === owner).map(entry => entry.line),
    ],
  })).filter(group => group.lines.length > 0);
}
