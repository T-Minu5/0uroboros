import { describe, expect, it } from 'vitest';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '@0uroboros/engine/runtime';
import { starterCards, type Card } from '@0uroboros/engine/game';
import { migrateEffects } from '@0uroboros/engine/effects/migrate';
import { describeCondition, describeLocation } from '@0uroboros/engine/effects/catalog';
import {
  createLocationCondition, meetsLocationCondition, revealedHere, type LocationCondition,
} from '@0uroboros/engine/locationConditions';
import type { EffectStep } from '@0uroboros/engine/effects/types';

const card = (id: string, extra: Partial<Card> = {}): Card =>
  ({ ...starterCards[0], id, name: id, power: 2, onReveal: [], ...extra });

const gainCrypto = (amount = 2): EffectStep[] =>
  migrateEffects([{ kind: 'crypto', amount }], 'locationCondition');

function finish(game: RuntimeSession) {
  const events: RuntimeEvent[] = [];
  while (game.pendingCount) {
    events.push(game.step()!.event);
    if (events.length > 800) throw new Error('stalled');
  }
  return events;
}

function quietSession(conditions: LocationCondition[]) {
  const game = createSession({
    carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
    random: seededRandom(7), aiSeats: [], midCycleDraw: false,
  });
  game.state.nodeOrder = [0, 1, 2, 3, 4];
  game.state.players.forEach(player => {
    player.hand = [];
    player.draw = [card(`${player === game.state.players[0] ? 'a' : 'b'}-d1`), card(`${player === game.state.players[0] ? 'a' : 'b'}-d2`), card(`${player === game.state.players[0] ? 'a' : 'b'}-d3`)];
    player.discard = [];
    player.wallet = 0;
  });
  game.state.nodes.forEach((node, index) => {
    node.location = {
      id: `loc-${index}`,
      name: index === 0 ? 'Condition Yard' : `Quiet ${index + 1}`,
      rule: '',
      reward: '',
      effects: [],
      ongoing: [],
      onPlay: [],
      ...(index === 0 ? { conditions: structuredClone(conditions) } : {}),
    };
    node.cards = [[], []];
  });
  game.state.turn = 1;
  game.state.phase = 'runtime';
  return game;
}

function place(game: RuntimeSession, owner: 0 | 1, entry: Card, revealed = true) {
  const placement = { card: entry, owner, node: 0, order: game.state.movedTotal + owner + 1, revealed };
  game.state.nodes[0].cards[owner].push(placement);
  return placement;
}

describe('location condition helpers', () => {
  it('describes each formula under While in play', () => {
    const count = createLocationCondition('subtypeCount');
    count.count = 3;
    count.cardClass = 'Attack';
    count.effects = gainCrypto(1);
    expect(describeCondition(count)).toMatch(/While in play:.*3 or more Attack cards here/i);
    const pair = createLocationCondition('subtypePair');
    pair.effects = gainCrypto(1);
    expect(describeCondition(pair)).toMatch(/While in play:.*an Attack and a Horror here/i);
    const power = createLocationCondition('powerThreshold');
    power.amount = 5;
    power.comparison = 'orMore';
    power.effects = gainCrypto(1);
    expect(describeCondition(power)).toMatch(/While in play:.*5 or more Power here/i);
    expect(describeLocation({ conditions: [count] })).toContain('While in play:');
  });

  it('ignores face-down cards when testing predicates', () => {
    const condition = createLocationCondition('subtypeCount');
    condition.count = 2;
    condition.cardClass = 'Attack';
    const revealed = [
      { card: card('a1', { cardClass: 'Attack' }), owner: 0 as const, node: 0, order: 1, revealed: true },
      { card: card('a2', { cardClass: 'Attack' }), owner: 0 as const, node: 0, order: 2, revealed: false },
    ];
    expect(revealedHere(revealed, 0)).toHaveLength(1);
    expect(meetsLocationCondition(condition, revealedHere(revealed, 0), 2)).toBe(false);
  });
});

/** Deploy one card for seat 0 onto a node and resolve the reveal window. */
function playOut(game: RuntimeSession, entry: Card, node = 0) {
  game.state.phase = 'runtime';
  game.state.turnReady = [false, false];
  game.state.players[0].hand = [entry];
  game.state.players[0].actions = Math.max(2, game.state.players[0].actions);
  game.deploy(entry.id, node);
  game.endTurn(0);
  game.endTurn(1);
  return finish(game);
}

describe('location conditions runtime', () => {
  it('awards subtypeCount once when the Nth matching revealed card arrives', () => {
    const condition: LocationCondition = {
      id: 'attack-2',
      kind: 'subtypeCount',
      count: 2,
      cardClass: 'Attack',
      effects: gainCrypto(3),
    };
    const game = quietSession([condition]);
    place(game, 0, card('atk-1', { cardClass: 'Attack', power: 2 }), true);
    place(game, 0, card('atk-face', { cardClass: 'Attack', power: 2 }), false);
    playOut(game, card('atk-2', { cardClass: 'Attack', power: 3 }));
    expect(game.state.players[0].wallet).toBe(3);
    const before = game.state.players[0].wallet;
    playOut(game, card('atk-3', { cardClass: 'Attack', power: 2 }));
    expect(game.state.players[0].wallet).toBe(before);
  });

  it('requires both subtypes from the same seat for subtypePair', () => {
    const condition: LocationCondition = {
      id: 'pair',
      kind: 'subtypePair',
      cardClassA: 'Attack',
      cardClassB: 'Horror',
      effects: gainCrypto(4),
    };
    const game = quietSession([condition]);
    place(game, 0, card('atk', { cardClass: 'Attack', power: 2 }), true);
    place(game, 1, card('hor', { cardClass: 'Horror', power: 2 }), true);
    playOut(game, card('util', { cardClass: 'Utility', power: 1 }));
    expect(game.state.players[0].wallet).toBe(0);
    expect(game.state.players[1].wallet).toBe(0);
    playOut(game, card('own-horror', { cardClass: 'Horror', power: 2 }));
    expect(game.state.players[0].wallet).toBe(4);
    expect(game.state.players[1].wallet).toBe(0);
  });

  it('awards power and card-count thresholds independently per seat', () => {
    const power: LocationCondition = {
      id: 'pwr',
      kind: 'powerThreshold',
      amount: 5,
      comparison: 'orMore',
      effects: gainCrypto(2),
    };
    const cards: LocationCondition = {
      id: 'cnt',
      kind: 'cardCountThreshold',
      amount: 2,
      comparison: 'orMore',
      effects: gainCrypto(1),
    };
    const game = quietSession([power, cards]);
    place(game, 0, card('p1', { power: 3 }), true);
    place(game, 1, card('o1', { power: 1 }), true);
    playOut(game, card('p2', { power: 3 }));
    expect(game.state.players[0].wallet).toBe(3);
    expect(game.state.players[1].wallet).toBe(0);
  });

  it('counts a revealed card already on the Node when another card reveals here', () => {
    const condition: LocationCondition = {
      id: 'move-in',
      kind: 'cardCountThreshold',
      amount: 1,
      comparison: 'orMore',
      effects: gainCrypto(5),
    };
    const game = quietSession([condition]);
    // Pretend a card was revealed elsewhere then moved here face-up before this check.
    place(game, 0, card('traveler', { power: 2 }), true);
    playOut(game, card('nudge', { power: 1 }), 0);
    expect(game.state.players[0].wallet).toBe(5);
  });

  it('supports orLess card-count thresholds when the first card reveals here', () => {
    const condition: LocationCondition = {
      id: 'sparse',
      kind: 'cardCountThreshold',
      amount: 1,
      comparison: 'orLess',
      effects: gainCrypto(2),
    };
    const game = quietSession([condition]);
    playOut(game, card('only', { power: 2 }), 0);
    expect(game.state.players[0].wallet).toBe(2);
  });
});
