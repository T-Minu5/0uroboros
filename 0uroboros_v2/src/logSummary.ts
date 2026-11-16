import type { PlayerId } from '@0uroboros/engine/game';
import type { RuntimeEvent } from '@0uroboros/engine/runtime';

export type SeatNames = readonly [string, string];
/** One player's lines for a stretch of the log, in the order things happened. */
export type PlayerSummary = { owner: PlayerId; lines: string[] };

type Play = {
  owner: PlayerId; card: string; node?: number; kind: 'play' | 'trigger' | 'location' | 'circuit';
  drained: Map<PlayerId, number>; restored: number; cards: number; crypto: number; vp: number;
  trashedNames: string[]; destroyedNames: string[]; notes: string[];
};

const plural = (n: number, word: string) => `${n} ${word}${Math.abs(n) === 1 ? '' : 's'}`;
const possessive = (name: string) => name === 'You' ? 'your' : name.endsWith('s') ? `${name}'` : `${name}'s`;
const joinAnd = (parts: string[]) => parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
const detail = (event: RuntimeEvent) => event.text.replace(/^[^:]*:\s*/, '').trim();
const cardName = (event: RuntimeEvent) => event.text.replace(/ reveals\.$/, '');

/** Readable note for an engine `choice` event (copy, pick, skip, no target, etc.). */
function choiceLogNote(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const copied = /^(.+?) copied '(.+?)'(?::\s*(.+))?\.?$/i.exec(trimmed);
  if (copied) {
    const [, , source, summary] = copied;
    return summary?.trim() ? `Copying ${source} (${summary.trim()})` : `Copying ${source}`;
  }
  if (/no previous revealed card to copy/i.test(trimmed)) return 'No card to copy';
  if (/No matching card to copy/i.test(trimmed)) return 'No card to copy';
  if (/nothing to copy from (.+)\.?$/i.test(trimmed)) {
    const from = /nothing to copy from (.+?)\.?$/i.exec(trimmed)?.[1]?.trim();
    return from ? `Nothing to copy from ${from}` : 'Nothing to copy';
  }
  const chooses = /chooses:\s*(.+)$/i.exec(trimmed);
  if (chooses) return `Choosing ${chooses[1].replace(/\.$/, '').trim()}`;
  const afterCard = detail({ text: trimmed } as RuntimeEvent);
  const body = (afterCard && afterCard !== trimmed ? afterCard : trimmed).replace(/\.$/, '').trim();
  if (!body) return null;
  return body.charAt(0).toUpperCase() + body.slice(1);
}

function attachNote(play: Play, text: string) {
  if (!play.notes.includes(text)) play.notes.push(text);
}

function playForEvent(
  plays: Play[],
  byCard: Map<string, Play>,
  event: RuntimeEvent,
  kind: Play['kind'] = 'trigger',
): Play {
  const key = event.cardId ? `${event.owner}|${event.cardId}` : undefined;
  let play = (event.cardId ? byCard.get(event.cardId) : undefined)
    ?? (key ? byCard.get(key) : undefined)
    ?? (event.sourceName
      ? [...plays].reverse().find(entry => entry.owner === event.owner && entry.card === event.sourceName)
      : undefined);
  if (!play) {
    play = newPlay(event.owner!, event.sourceName ?? 'A card', kind, event.node);
    plays.push(play);
    if (event.cardId) byCard.set(kind === 'trigger' ? event.cardId : key!, play);
    else if (key) byCard.set(key, play);
  }
  return play;
}

function newPlay(owner: PlayerId, card: string, kind: Play['kind'], node?: number): Play {
  return { owner, card, node, kind, drained: new Map(), restored: 0, cards: 0, crypto: 0, vp: 0, trashedNames: [], destroyedNames: [], notes: [] };
}

/** Pull the affected card name from engine trash/destroy event text. */
function affectedCardName(text: string): string | undefined {
  const named =
    /(?:trashes|destroys) (.+?)(?: from | to |\.|$)/i.exec(text)
    ?? /^(.+?) enters shared Trash/i.exec(text)
    ?? /: (.+?) enters (?:shared Trash|Discard)/i.exec(text)
    ?? /(?:trash|destroy) (.+?)\.?$/i.exec(text);
  const name = named?.[1]?.trim();
  if (!name || /^(no target|this card)$/i.test(name)) return undefined;
  return name.replace(/\.$/, '');
}

function absorb(play: Play, event: RuntimeEvent, names: SeatNames) {
  const amount = event.amount ?? 0, to = event.targetOwner ?? play.owner, mine = to === play.owner;
  const note = (text: string) => attachNote(play, text);
  switch (event.kind) {
    case 'choice': {
      const choice = choiceLogNote(event.text);
      if (choice) note(choice);
      return;
    }
    case 'drain':
      if (/: destroy /.test(event.text)) note(`Destroying ${mine ? 'their own' : possessive(names[to])} ${event.target === 'backup' ? 'Backup' : 'Primary'} Server`);
      else if (amount > 0) play.drained.set(to, (play.drained.get(to) ?? 0) + amount);
      return;
    case 'restore': if (amount > 0) { if (mine) play.restored += amount; else note(`Restoring ${amount} to ${possessive(names[to])} Server`); } return;
    case 'draw': {
      if (amount > 0 && event.target === 'hand') {
        if (mine) play.cards += amount;
        else note(`${names[to]} draws ${amount}`);
        return;
      }
      if (amount > 0 && event.target === 'discard') {
        const gained = /gain \d+ (.+) to Discard/i.exec(event.text)?.[1]?.trim();
        const label = gained || plural(amount, 'card');
        note(mine
          ? `Gaining ${label} to Discard`
          : `Giving ${label} to ${possessive(names[to])} Discard`);
      }
      return;
    }
    case 'actions': return;
    case 'crypto': if (amount) { if (mine) play.crypto += amount; else note(`${amount > 0 ? 'Giving' : 'Costing'} ${names[to]} ${Math.abs(amount)} Crypto`); } return;
    case 'vp': if (amount) { if (mine) play.vp += amount; else note(`${amount > 0 ? 'Giving' : 'Costing'} ${names[to]} ${plural(Math.abs(amount), 'VP').replace(/VPs$/, 'VP')}`); } return;
    case 'trash': {
      const name = affectedCardName(event.text);
      if (/ destroys /.test(event.text)) {
        if (name) play.destroyedNames.push(name);
        else if (amount > 0) play.destroyedNames.push(...Array.from({ length: amount }, () => 'a card'));
      } else if (name) play.trashedNames.push(name);
      else if (amount > 0) play.trashedNames.push(...Array.from({ length: amount }, () => 'a card'));
      return;
    }
    case 'power': {
      if (!amount) return;
      const pull = /pull (\d+) power from Node (\d+) to Node (\d+)/i.exec(event.text);
      if (pull) note(`Pulling ${pull[1]} Power from N${pull[2]} to N${pull[3]}`);
      else if (amount < 0) note(mine ? `Losing ${-amount} Power` : `Cutting ${-amount} Power from ${possessive(names[to])} card`);
      else note(`Adding ${amount} Power`);
      return;
    }
    default:
      if ((play.kind === 'location' || play.kind === 'circuit') && amount !== 0) note(detail(event));
  }
}

function sentence(play: Play, names: SeatNames): string | null {
  const actions = [
    ...[...play.drained].map(([to, amount]) => `Draining ${amount} from ${to === play.owner ? 'their own' : possessive(names[to])} Server`),
    ...(play.restored ? [`Restoring ${play.restored}`] : []),
    ...(play.trashedNames.length ? [`Trashing ${joinAnd(play.trashedNames)}`] : []),
    ...(play.destroyedNames.length ? [`Destroying ${joinAnd(play.destroyedNames)}`] : []),
    ...play.notes,
  ];
  const gains = [
    ...(play.cards ? [plural(play.cards, 'card')] : []),
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
    if (event.kind === 'choice') {
      const kind = event.source === 'location' ? 'location' : event.source === 'circuit' ? 'circuit' : 'trigger';
      // Choice outcomes always belong in the Circuit log (picks, skips, copy, no target).
      if (event.cardId || event.sourceName) absorb(playForEvent(plays, byCard, event, kind), event, names);
      continue;
    }
    if (!event.cardId || ['bank', 'deploy', 'turn'].includes(event.kind)) continue;
    // Held Crypto settling at the end of the Cycle is already in the Collapse table.
    if (event.phase === 'collapse' && event.node === undefined && event.source === 'card') continue;
    const kind = event.source === 'location' ? 'location' : event.source === 'circuit' ? 'circuit' : 'trigger';
    absorb(playForEvent(plays, byCard, event, kind), event, names);
  }
  return ([0, 1] as PlayerId[]).map(owner => ({
    owner,
    lines: [
      ...plays.filter(play => play.owner === owner).map(play => sentence(play, names)).filter((line): line is string => !!line),
      ...purchases.filter(entry => entry.owner === owner).map(entry => entry.line),
    ],
  })).filter(group => group.lines.length > 0);
}
