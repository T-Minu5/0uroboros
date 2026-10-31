import { describe, expect, it } from 'vitest';
import {
  CONTENT_VERSION,
  compileContent,
  createDefaultContent,
  normalizeDocument,
  upgradeDocument,
  validateContent,
  type AuthoredRuntimeHack,
  type ContentDocument,
} from '@0uroboros/engine/authoring/contentModel';
import { createStep } from '@0uroboros/engine/effects/catalog';
import { starterCards, type Card } from '@0uroboros/engine/game';
import {
  matchesRuntimeHack,
  suggestRuntimeHackFormula,
  unlockedRuntimeHacks,
  type RevealRecord,
  type RuntimeHackDefinition,
} from '@0uroboros/engine/runtimeHacks';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '@0uroboros/engine/runtime';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const reveal = (partial: Partial<RevealRecord> & Pick<RevealRecord, 'definitionId'>): RevealRecord => ({
  node: 0, cycle: 1, turn: 1, owner: 0, ...partial,
});

const hack = (partial: Partial<RuntimeHackDefinition> & Pick<RuntimeHackDefinition, 'id' | 'cards' | 'window'>): RuntimeHackDefinition => ({
  name: partial.id,
  formula: suggestRuntimeHackFormula(partial.window, partial.cards),
  effects: [{ action: 'gainCard', amount: 1, cardId: 'owl-king', target: { type: 'zone', who: 'self', zone: 'hand' } }],
  ...partial,
});

const gain = (cardId: string): AuthoredRuntimeHack['effects'] => [
  { action: 'gainCard', amount: 1, cardId, target: { type: 'zone', who: 'self', zone: 'hand' } },
];

function finish(session: RuntimeSession) {
  const events: RuntimeEvent[] = [];
  while (session.pendingCount) {
    events.push(session.step()!.event);
    if (events.length > 800) throw new Error('stalled');
  }
  return events;
}

function quietSession(document: ContentDocument) {
  const content = compileContent(document);
  const session = createSession({
    carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
    random: seededRandom(11), aiSeats: [], midCycleDraw: false, content,
  });
  session.state.nodeOrder = [0, 1, 2, 3, 4];
  session.state.priority = 0;
  session.state.players.forEach(player => {
    player.hand = [];
    player.draw = [];
    player.discard = [];
    player.wallet = 0;
    player.actions = 4;
  });
  session.state.nodes.forEach(node => { node.cards = [[], []]; node.location = null; });
  session.state.turn = 1;
  session.state.phase = 'runtime';
  return session;
}

function card(id: string, extra: Partial<Card> = {}): Card {
  return { ...starterCards[0], id, definitionId: id, name: id, power: 1, cost: 0, onReveal: [], ...extra };
}

function placeInHand(session: RuntimeSession, owner: 0 | 1, entry: Card) {
  session.state.players[owner].hand.push(entry);
  return entry;
}

/** Deploy seat 0 cards and resolve the reveal window (both seats commit). */
function playOut(session: RuntimeSession) {
  session.endTurn(0);
  session.endTurn(1);
  return finish(session);
}

describe('Runtime Hack matching', () => {
  it('requires every listed card inside the authored window', () => {
    const combo = hack({ id: 'pair', window: 'game', cards: ['a', 'b'] });
    const log = [reveal({ definitionId: 'a' }), reveal({ definitionId: 'b' })];
    expect(matchesRuntimeHack(combo, [reveal({ definitionId: 'a' })], 0, reveal({ definitionId: 'a' }))).toBe(false);
    expect(matchesRuntimeHack(combo, log, 0, reveal({ definitionId: 'b' }))).toBe(true);
  });

  it('scopes cycle and turn windows and keeps game history across them', () => {
    const cycleHack = hack({ id: 'cycle', window: 'cycle', cards: ['a', 'b'] });
    const turnHack = hack({ id: 'turn', window: 'turn', cards: ['a', 'b'] });
    const gameHack = hack({ id: 'game', window: 'game', cards: ['a', 'b'] });
    const prior = [reveal({ definitionId: 'a', cycle: 1, turn: 1 }), reveal({ definitionId: 'b', cycle: 1, turn: 2 })];
    const nextCycle = reveal({ definitionId: 'b', cycle: 2, turn: 1 });
    expect(matchesRuntimeHack(cycleHack, [...prior, nextCycle], 0, nextCycle)).toBe(false);
    expect(matchesRuntimeHack(gameHack, [...prior, nextCycle], 0, nextCycle)).toBe(true);
    const sameTurn = [reveal({ definitionId: 'a', turn: 2 }), reveal({ definitionId: 'b', turn: 2 })];
    expect(matchesRuntimeHack(turnHack, sameTurn, 0, sameTurn[1])).toBe(true);
    expect(matchesRuntimeHack(turnHack, prior, 0, prior[1])).toBe(false);
  });

  it('requires the same Node for location windows across the whole game', () => {
    const blade = hack({ id: 'blade', window: 'location', cards: ['rezz-razor', 'rezz-blade'] });
    const split = [
      reveal({ definitionId: 'rezz-razor', node: 0 }),
      reveal({ definitionId: 'rezz-blade', node: 1 }),
    ];
    const sameAcrossCycles = [
      reveal({ definitionId: 'rezz-razor', node: 2, cycle: 1 }),
      reveal({ definitionId: 'rezz-blade', node: 2, cycle: 3 }),
    ];
    expect(matchesRuntimeHack(blade, split, 0, split[1])).toBe(false);
    expect(matchesRuntimeHack(blade, sameAcrossCycles, 0, sameAcrossCycles[1])).toBe(true);
  });

  it('requires the same Node and Cycle for locationCycle windows', () => {
    const blade = hack({ id: 'blade', window: 'locationCycle', cards: ['rezz-razor', 'rezz-blade'] });
    const sameNodeDifferentCycle = [
      reveal({ definitionId: 'rezz-razor', node: 2, cycle: 1, turn: 1 }),
      reveal({ definitionId: 'rezz-blade', node: 2, cycle: 2, turn: 1 }),
    ];
    const sameNodeAndCycle = [
      reveal({ definitionId: 'rezz-razor', node: 2, cycle: 1, turn: 1 }),
      reveal({ definitionId: 'rezz-blade', node: 2, cycle: 1, turn: 3 }),
    ];
    expect(matchesRuntimeHack(blade, sameNodeDifferentCycle, 0, sameNodeDifferentCycle[1])).toBe(false);
    expect(matchesRuntimeHack(blade, sameNodeAndCycle, 0, sameNodeAndCycle[1])).toBe(true);
  });

  it('dedupes awards per hack per seat', () => {
    const combo = hack({ id: 'pair', window: 'game', cards: ['a', 'b'] });
    const at = reveal({ definitionId: 'b' });
    const log = [reveal({ definitionId: 'a' }), at];
    expect(unlockedRuntimeHacks([combo], log, new Set(), at)).toEqual([combo]);
    expect(unlockedRuntimeHacks([combo], log, new Set(['pair:0']), at)).toEqual([]);
    expect(unlockedRuntimeHacks([combo], log, new Set(['pair:1']), at)).toEqual([combo]);
  });
});

describe('Runtime Hack content', () => {
  it('upgrades older documents with an empty runtimeHacks list and compiles enabled hacks only', () => {
    const document = createDefaultContent();
    delete document.runtimeHacks;
    const upgraded = upgradeDocument({ ...document, version: 2 }) as ContentDocument;
    expect(upgraded.version).toBe(CONTENT_VERSION);
    expect(upgraded.runtimeHacks).toEqual([]);
    document.runtimeHacks = [
      {
        id: 'hack-live', name: 'Live', enabled: true, window: 'game',
        cards: ['slash-dot', 'dash-dot'], formula: 'Reveal both.', effects: gain('basic-encryption'),
      },
      {
        id: 'hack-off', name: 'Off', enabled: false, window: 'game',
        cards: [], formula: '', effects: [],
      },
    ];
    expect(validateContent(document)).toEqual([]);
    expect(compileContent(document).runtimeHacks.map(entry => entry.id)).toEqual(['hack-live']);
    expect(normalizeDocument({ version: 2, cards: document.cards, locations: document.locations, circuitRewards: document.circuitRewards }).runtimeHacks).toEqual([]);
  });

  it('rejects enabled hacks that are incomplete and accepts disabled drafts', () => {
    const document = createDefaultContent();
    document.runtimeHacks = [{
      id: 'hack-bad', name: 'Bad', enabled: true, window: 'game',
      cards: ['slash-dot'], formula: 'Need two.', effects: gain('basic-encryption'),
    }];
    expect(validateContent(document).some(error => error.includes('runtimeHacks[0].cards'))).toBe(true);
    document.runtimeHacks[0].enabled = false;
    document.runtimeHacks[0].cards = [];
    document.runtimeHacks[0].formula = '';
    document.runtimeHacks[0].effects = [];
    expect(validateContent(document)).toEqual([]);
  });

  it('loads the three seeded Runtime Hacks from authored content', () => {
    const raw = JSON.parse(readFileSync(resolve(__dirname, '../content/authored-content.json'), 'utf8')).document as ContentDocument;
    expect(validateContent(upgradeDocument(raw))).toEqual([]);
    const compiled = compileContent(raw);
    expect(compiled.runtimeHacks.map(entry => entry.id)).toEqual([
      'hack-starless-sea', 'hack-burning-blade', 'hack-2-dots-and-a-dash',
    ]);
    expect(compiled.runtimeHacks.find(entry => entry.id === 'hack-burning-blade')).toMatchObject({
      window: 'locationCycle', cards: ['rezz-razor', 'rezz-blade'],
    });
  });
});

describe('Runtime Hack awards', () => {
  it('awards once when the completing reveal finishes, grants into hand, and includes presentation fields', () => {
    const document = createDefaultContent();
    document.runtimeHacks = [{
      id: 'hack-dots', name: '2 Dots and a Dash', enabled: true, window: 'cycle',
      cards: ['slash-dot', 'dash-dot'], formula: 'Reveal Slash-dot and Dash-dot in the same Cycle.',
      effects: gain('basic-encryption'),
    }];
    const session = quietSession(document);
    const first = placeInHand(session, 0, card('slash-dot'));
    const second = placeInHand(session, 0, card('dash-dot'));
    session.deploy(first.id, 0);
    session.deploy(second.id, 1);
    const events = playOut(session);
    const award = events.find(event => event.kind === 'runtimeHack');
    expect(award).toMatchObject({
      kind: 'runtimeHack',
      definitionId: 'hack-dots',
      sourceName: '2 Dots and a Dash',
      formula: 'Reveal Slash-dot and Dash-dot in the same Cycle.',
      rewardCardId: 'basic-encryption',
      owner: 0,
    });
    expect(session.state.players[0].hand.some(entry => (entry.definitionId ?? entry.id) === 'basic-encryption')).toBe(true);
    expect(session.state.players[1].hand.some(entry => (entry.definitionId ?? entry.id) === 'basic-encryption')).toBe(false);

    // Same combo again this game for the same seat must not re-fire.
    session.state.phase = 'runtime';
    session.state.turn = 1;
    session.state.turnReady = [false, false];
    session.state.players[0].actions = 4;
    session.state.nodes.forEach(node => { node.cards = [[], []]; });
    const againA = placeInHand(session, 0, card('slash-dot-2', { definitionId: 'slash-dot' }));
    const againB = placeInHand(session, 0, card('dash-dot-2', { definitionId: 'dash-dot' }));
    session.deploy(againA.id, 0);
    session.deploy(againB.id, 1);
    const secondPass = playOut(session);
    expect(secondPass.filter(event => event.kind === 'runtimeHack')).toEqual([]);
  });

  it('does not award a locationCycle-window hack across different Nodes', () => {
    const document = createDefaultContent();
    document.runtimeHacks = [{
      id: 'hack-blade', name: 'The Burning Blade', enabled: true, window: 'locationCycle',
      cards: ['rezz-razor', 'rezz-blade'], formula: 'Same Node, same Cycle.',
      effects: gain('basic-encryption'),
    }];
    const session = quietSession(document);
    const razor = placeInHand(session, 0, card('rezz-razor'));
    const blade = placeInHand(session, 0, card('rezz-blade'));
    session.deploy(razor.id, 0);
    session.deploy(blade.id, 1);
    const events = playOut(session);
    expect(events.filter(event => event.kind === 'runtimeHack')).toEqual([]);
    expect(session.state.players[0].hand.some(entry => (entry.definitionId ?? entry.id) === 'basic-encryption')).toBe(false);
  });

  it('defaults new authoring gainCard steps to the unlocker hand', () => {
    const step = createStep('gainCard', 'runtimeHack');
    expect(step.target).toEqual({ type: 'zone', who: 'self', zone: 'hand' });
  });
});
