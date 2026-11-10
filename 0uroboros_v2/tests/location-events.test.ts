import { describe, expect, it } from 'vitest';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '@0uroboros/engine/runtime';
import { starterCards, type Card } from '@0uroboros/engine/game';
import { migrateEffects } from '@0uroboros/engine/effects/migrate';
import { describeEvent, describeLocation } from '@0uroboros/engine/effects/catalog';
import { createLocationEvent, type LocationEvent } from '@0uroboros/engine/locationEvents';
import type { EffectStep } from '@0uroboros/engine/effects/types';
import type { LocationCondition } from '@0uroboros/engine/locationConditions';

const card = (id: string, extra: Partial<Card> = {}): Card =>
  ({ ...starterCards[0], id, name: id, power: 2, onReveal: [], ...extra });

const gainCrypto = (amount = 2): EffectStep[] =>
  migrateEffects([{ kind: 'crypto', amount }], 'locationEvent');

function finish(game: RuntimeSession) {
  const events: RuntimeEvent[] = [];
  while (game.pendingCount) {
    events.push(game.step()!.event);
    if (game.state.choice) break;
    if (events.length > 800) throw new Error('stalled');
  }
  return events;
}

function finishAll(game: RuntimeSession) {
  const events: RuntimeEvent[] = [];
  while (game.pendingCount || game.state.choice) {
    if (game.state.choice) {
      const skip = game.state.choice.options.find(option => option.id === 'skip');
      game.choose(skip?.id ?? game.state.choice.options[0]!.id);
    } else {
      events.push(game.step()!.event);
    }
    if (events.length > 800) throw new Error('stalled');
  }
  return events;
}

function baseSession(extra: {
  events?: LocationEvent[];
  conditions?: LocationCondition[];
  passives?: { revealedCanMove?: boolean; doublePowerChanges?: boolean };
  effects?: EffectStep[];
} = {}) {
  const game = createSession({
    carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
    random: seededRandom(11), aiSeats: [], midCycleDraw: false,
  });
  game.state.nodeOrder = [0, 1, 2, 3, 4];
  game.state.players.forEach(player => {
    player.hand = [];
    player.draw = [card(`${player === game.state.players[0] ? 'a' : 'b'}-d1`), card(`${player === game.state.players[0] ? 'a' : 'b'}-d2`)];
    player.discard = [];
    player.wallet = 0;
  });
  game.state.nodes.forEach((node, index) => {
    node.location = {
      id: `loc-${index}`,
      name: index === 0 ? 'Event Yard' : `Quiet ${index + 1}`,
      rule: '',
      reward: '',
      effects: index === 0 ? (extra.effects ?? []) : [],
      ongoing: [],
      onPlay: [],
      events: index === 0 ? (extra.events ?? []) : [],
      ...(index === 0 && extra.conditions ? { conditions: structuredClone(extra.conditions) } : {}),
      ...(index === 0 && extra.passives ? { passives: extra.passives } : {}),
    };
    node.cards = [[], []];
  });
  game.state.turn = 1;
  game.state.phase = 'runtime';
  return game;
}

function place(game: RuntimeSession, owner: 0 | 1, entry: Card, revealed = true, node = 0) {
  const placement = { card: entry, owner, node, order: game.state.movedTotal + owner + 1, revealed };
  game.state.nodes[node].cards[owner].push(placement);
  return placement;
}

function playOut(game: RuntimeSession, entry: Card, node = 0) {
  game.state.phase = 'runtime';
  game.state.turnReady = [false, false];
  game.state.players[0].hand = [entry];
  game.deploy(entry.id, node);
  game.endTurn(0);
  game.endTurn(1);
  return finishAll(game);
}

describe('location event copy', () => {
  it('prints When: lines for each event kind', () => {
    const destroyed = createLocationEvent('cardDestroyed');
    destroyed.effects = gainCrypto(2);
    expect(describeEvent(destroyed)).toMatch(/When: a card is destroyed here/i);
    const moved = createLocationEvent('cardMovedHere');
    moved.effects = gainCrypto(1);
    expect(describeEvent(moved)).toMatch(/When: a card moves here/i);
    const played = createLocationEvent('cardPlayed');
    played.cardClass = 'Horror';
    played.effects = gainCrypto(1);
    expect(describeEvent(played)).toMatch(/When: a Horror is played here/i);
    const plays = createLocationEvent('playsThisTurn');
    plays.effects = gainCrypto(1);
    expect(describeEvent(plays)).toMatch(/When: you play 2 cards here in a turn/i);
    expect(describeLocation({
      passives: { revealedCanMove: true, doublePowerChanges: true },
      events: [destroyed],
    })).toMatch(/Ongoing: Revealed cards here can move/);
  });
});

describe('location events runtime', () => {
  it('fires cardDestroyed for the owner of the destroyed card', () => {
    const event: LocationEvent = {
      id: 'on-destroy', kind: 'cardDestroyed', effects: gainCrypto(2),
    };
    const game = baseSession({ events: [event] });
    place(game, 0, card('victim', { power: 1 }), true);
    playOut(game, card('killer', {
      power: 1,
      onReveal: [{
        action: 'destroyCard',
        target: { type: 'card', who: 'self', where: 'thisNode' },
        pick: { mode: 'first' },
      }],
    }));
    expect(game.state.players[0].wallet).toBe(2);
    expect(game.state.players[0].destroyed.some(entry => entry.id === 'victim' || entry.name === 'victim')).toBe(true);
  });

  it('fires cardMovedHere for the owner of the moved card', () => {
    const event: LocationEvent = {
      id: 'on-move', kind: 'cardMovedHere', effects: gainCrypto(3),
    };
    const game = baseSession({ events: [event] });
    const traveler = card('traveler', {
      power: 2,
      modifiers: [{ id: 'm1', kind: 'movableEachTurn' }],
    });
    place(game, 0, traveler, true, 1);
    game.relocateCard('traveler', 0);
    finishAll(game);
    expect(game.state.nodes[0].cards[0].some(placement => placement.card.id === 'traveler')).toBe(true);
    expect(game.state.players[0].wallet).toBe(3);
  });

  it('fires cardPlayed with subtype filter for the revealing seat', () => {
    const event: LocationEvent = {
      id: 'play-horror', kind: 'cardPlayed', cardClass: 'Horror', effects: gainCrypto(2),
    };
    const miss = baseSession({ events: [event] });
    playOut(miss, card('atk', { power: 2, cardClass: 'Attack' }));
    expect(miss.state.players[0].wallet).toBe(0);
    const hit = baseSession({ events: [event] });
    playOut(hit, card('hor', { power: 2, cardClass: 'Horror' }));
    expect(hit.state.players[0].wallet).toBe(2);
  });

  it('fires playsThisTurn at 2 plays same Node same turn, not across turns', () => {
    const event: LocationEvent = {
      id: 'two-plays', kind: 'playsThisTurn', count: 2, oncePerSeat: true, effects: gainCrypto(5),
    };
    const game = baseSession({ events: [event] });
    game.state.players[0].hand = [card('one', { power: 1 }), card('two', { power: 1 })];
    game.deploy('one', 0);
    game.deploy('two', 0);
    game.endTurn(0);
    game.endTurn(1);
    finishAll(game);
    expect(game.state.players[0].wallet).toBe(5);

    const across = baseSession({ events: [event] });
    playOut(across, card('t1', { power: 1 }));
    expect(across.state.players[0].wallet).toBe(0);
    expect(across.state.turn).toBe(2);
    playOut(across, card('t2', { power: 1 }));
    expect(across.state.players[0].wallet).toBe(0);
  });
});

describe('location passives', () => {
  it('revealedCanMove allows a revealed card to relocate once per turn', () => {
    const game = baseSession({ passives: { revealedCanMove: true } });
    // Same passive on neighbouring Nodes so the once-per-turn cadence is what blocks the second move.
    game.state.nodes.forEach(node => {
      node.location = { ...(node.location!), passives: { revealedCanMove: true } };
    });
    place(game, 0, card('walker', { power: 2, name: 'Walker' }), true);
    expect(game.view().movableCardIds).toContain('walker');
    game.relocateCard('walker', 1);
    expect(game.state.nodes[1].cards[0].some(placement => placement.card.id === 'walker')).toBe(true);
    expect(() => game.relocateCard('walker', 2)).toThrow(/already moved/i);
  });

  it('doublePowerChanges doubles changePower here', () => {
    const game = baseSession({ passives: { doublePowerChanges: true } });
    const host = card('host', { power: 2, name: 'Host' });
    place(game, 0, host, true);
    playOut(game, card('boost', {
      power: 1,
      onReveal: [{
        action: 'changePower',
        amount: 2,
        target: { type: 'card', who: 'self', where: 'thisNode' },
        pick: { mode: 'first' },
      }],
    }));
    expect(host.powerDelta).toBe(4);
  });
});

describe('sacrificeCards / Sacrificial Altar', () => {
  const sacrificeBoth: EffectStep = {
    action: 'sacrificeCards',
    amount: 2,
    optional: true,
    target: { type: 'card', who: 'both', where: 'thisNode' },
    pick: { mode: 'choose', count: 4 },
  };

  it('offers the sacrifice choice to both seats on collapse, not only the winner', () => {
    const game = baseSession({ effects: [sacrificeBoth] });
    place(game, 0, card('p0-a', { power: 3, name: 'Winner A' }), true);
    place(game, 0, card('p0-b', { power: 1, name: 'Winner B' }), true);
    place(game, 1, card('p1-a', { power: 1, name: 'Loser A' }), true);
    place(game, 1, card('p1-b', { power: 1, name: 'Loser B' }), true);
    for (let node = 1; node < 5; node++) {
      place(game, 0, card(`pad-${node}`, { power: 3 }), true, node);
    }
    game.state.turn = 3;
    game.state.phase = 'runtime';
    game.endTurn(0);
    game.endTurn(1);
    finish(game);
    expect(game.state.nodes[0].winner).toBe(0);
    expect(game.state.choice).toBeTruthy();
    expect(game.state.choice!.owner).toBe(0);
    expect(game.state.choice!.options.map(option => option.id)).toEqual(expect.arrayContaining(['card-p0-a', 'card-p0-b']));
    game.choose([], 0);
    finish(game);
    expect(game.state.choice).toBeTruthy();
    expect(game.state.choice!.owner).toBe(1);
    expect(game.state.choice!.options.map(option => option.id)).toEqual(expect.arrayContaining(['card-p1-a', 'card-p1-b']));
    game.choose(['card-p1-a'], 1);
    finishAll(game);
    expect(game.state.players[0].wallet).toBe(0);
    expect(game.state.players[1].wallet).toBe(2);
    expect(game.state.players[1].destroyed.map(entry => entry.id)).toContain('p1-a');
  });

  it('skips for 0 Crypto; destroying 2 yields +4 Crypto', () => {
    const sacrifice: EffectStep = {
      action: 'sacrificeCards',
      amount: 2,
      optional: true,
      target: { type: 'card', who: 'self', where: 'thisNode' },
      pick: { mode: 'choose', count: 4 },
    };
    expect(describeLocation({ effects: [sacrifice] })).toMatch(/You may destroy your cards here/i);

    const skipGame = baseSession({});
    place(skipGame, 0, card('keep-a', { power: 1 }), true);
    place(skipGame, 0, card('keep-b', { power: 1 }), true);
    skipGame.state.players[0].hand = [card('sk', {
      power: 1,
      onReveal: [sacrifice],
    })];
    skipGame.deploy('sk', 0);
    skipGame.endTurn(0);
    skipGame.endTurn(1);
    finish(skipGame);
    expect(skipGame.state.choice).toBeTruthy();
    // Multi-select with min 0: resolve empty selection.
    skipGame.choose([]);
    finishAll(skipGame);
    expect(skipGame.state.players[0].wallet).toBe(0);
    expect(skipGame.state.nodes[0].cards[0].length).toBeGreaterThanOrEqual(2);

    const takeGame = baseSession({});
    const a = card('sac-a', { power: 1, name: 'Sac A' });
    const b = card('sac-b', { power: 1, name: 'Sac B' });
    place(takeGame, 0, a, true);
    place(takeGame, 0, b, true);
    takeGame.state.players[0].hand = [card('tk', { power: 1, onReveal: [sacrifice] })];
    takeGame.deploy('tk', 0);
    takeGame.endTurn(0);
    takeGame.endTurn(1);
    finish(takeGame);
    expect(takeGame.state.choice).toBeTruthy();
    takeGame.choose(['card-sac-a', 'card-sac-b']);
    finishAll(takeGame);
    expect(takeGame.state.players[0].wallet).toBe(4);
    expect(takeGame.state.players[0].destroyed.map(entry => entry.id)).toEqual(expect.arrayContaining(['sac-a', 'sac-b']));
  });
});
