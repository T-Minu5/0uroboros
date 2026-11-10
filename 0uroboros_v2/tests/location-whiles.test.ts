import { describe, expect, it } from 'vitest';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '@0uroboros/engine/runtime';
import { starterCards, type Card, type Deployment } from '@0uroboros/engine/game';
import { describeLocation, describeStep, describeWhileEntry, validateSteps, type ValidationCards } from '@0uroboros/engine/effects/catalog';
import { createLocationWhile, meetsLocationWhile, revealedAtNode, whilePowerBonus } from '@0uroboros/engine/locationWhiles';
import type { LocationWhile } from '@0uroboros/engine/locationWhiles';
import type { LocationEvent } from '@0uroboros/engine/locationEvents';
import type { EffectStep } from '@0uroboros/engine/effects/types';

const card = (id: string, extra: Partial<Card> = {}): Card =>
  ({ ...starterCards[0], id, name: id, power: 2, onReveal: [], ...extra });

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
  whiles?: LocationWhile[];
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
      name: index === 0 ? 'Solo Yard' : `Quiet ${index + 1}`,
      rule: '',
      reward: '',
      effects: [],
      ongoing: [],
      onPlay: [],
      events: index === 0 ? (extra.events ?? []) : [],
      ...(index === 0 && extra.whiles ? { whiles: structuredClone(extra.whiles) } : {}),
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

describe('location while formulas', () => {
  it('prints Ongoing: While lines for per-seat solo Power and draw', () => {
    const power = createLocationWhile('soloCard');
    power.powerBonus = 5;
    delete power.effects;
    expect(describeWhileEntry(power)).toBe('Ongoing: While you have only 1 card here, +5 Power.');
    const draw: LocationWhile = {
      id: 'w', kind: 'soloCard',
      effects: [{ action: 'draw', amount: 1, target: { type: 'player', who: 'self' } }],
    };
    expect(describeWhileEntry(draw)).toMatch(/Ongoing: While you have only 1 card here, \+1 Card/i);
    expect(describeLocation({ effects: [], whiles: [power] })).toContain('Ongoing: While you have only 1 card here, +5 Power');
  });

  it('awards live Power per seat with exactly one revealed card (1–1 both qualify)', () => {
    const entry: LocationWhile = { id: 'w', kind: 'soloCard', powerBonus: 5 };
    const game = baseSession({ whiles: [entry] });
    const lone = place(game, 0, card('lone'));
    const recalc = () => (game as unknown as { recalculate: () => void }).recalculate();
    recalc();
    expect(game.state.nodes[0].powers[0]).toBe(7); // 2 printed + 5 while
    expect(whilePowerBonus([entry], revealedAtNode(game.state.nodes[0].cards.flat()), lone)).toBe(5);

    const rival = place(game, 1, card('rival'));
    recalc();
    // 1–1: both seats still qualify independently
    expect(game.state.nodes[0].powers[0]).toBe(7);
    expect(game.state.nodes[0].powers[1]).toBe(7);
    expect(whilePowerBonus([entry], revealedAtNode(game.state.nodes[0].cards.flat()), lone)).toBe(5);
    expect(whilePowerBonus([entry], revealedAtNode(game.state.nodes[0].cards.flat()), rival)).toBe(5);
    expect(meetsLocationWhile(entry, revealedAtNode(game.state.nodes[0].cards.flat()), 0)).toBe(true);
    expect(meetsLocationWhile(entry, revealedAtNode(game.state.nodes[0].cards.flat()), 1)).toBe(true);

    place(game, 0, card('second'));
    recalc();
    // Seat 0 now has 2; only seat 1 keeps the bonus
    expect(game.state.nodes[0].powers[0]).toBe(4); // 2+2 printed, no while
    expect(game.state.nodes[0].powers[1]).toBe(7);
    expect(whilePowerBonus([entry], revealedAtNode(game.state.nodes[0].cards.flat()), lone)).toBe(0);
    expect(meetsLocationWhile(entry, revealedAtNode(game.state.nodes[0].cards.flat()), 0)).toBe(false);
    expect(meetsLocationWhile(entry, revealedAtNode(game.state.nodes[0].cards.flat()), 1)).toBe(true);
  });

  it('fires While effects once per qualifying seat with Ongoing cadence', () => {
    const entry: LocationWhile = {
      id: 'w', kind: 'soloCard',
      effects: [{ action: 'gainCrypto', amount: 1, target: { type: 'player', who: 'self' } }],
    };
    const game = baseSession({ whiles: [entry] });
    place(game, 0, card('solo-a'));
    place(game, 1, card('solo-b'));
    game.state.players[0].hand = [card('spark')];
    game.deploy(game.state.players[0].hand[0]!.id, 1);
    game.endTurn(0);
    game.endTurn(1);
    finishAll(game);
    expect(game.state.players[0].wallet).toBeGreaterThanOrEqual(1);
    expect(game.state.players[1].wallet).toBeGreaterThanOrEqual(1);
    expect(meetsLocationWhile(entry, revealedAtNode(game.state.nodes[0].cards.flat()), 0)).toBe(true);
    expect(meetsLocationWhile(entry, revealedAtNode(game.state.nodes[0].cards.flat()), 1)).toBe(true);
  });
});

describe('gainCard filter describe/validate', () => {
  it('describes random Utility filter gains and validates filter + maxCost', () => {
    const step: EffectStep = {
      action: 'gainCard',
      amount: 1,
      filter: { cardClass: 'Utility' },
      maxCost: 3,
      selection: 'random',
      target: { type: 'zone', who: 'winner', zone: 'hand' },
    };
    expect(describeStep(step, 'location')).toMatch(/Gain a random Utility card costing 3 or less in the winning player's hand/i);

    const validation: ValidationCards = { enabledIds: new Set(['alpha']), types: new Map([['alpha', 'Character']]) };
    const errors: string[] = [];
    validateSteps([step], 'steps', 'location', validation, errors);
    expect(errors).toEqual([]);

    const namedCleared: EffectStep = {
      action: 'gainCard',
      amount: 1,
      filter: { cardClass: 'Utility' },
      maxCost: 3,
      selection: 'random',
      cardId: undefined,
      cardIds: undefined,
      target: { type: 'zone', who: 'winner', zone: 'hand' },
    };
    const more: string[] = [];
    validateSteps([namedCleared], 'steps', 'location', validation, more);
    expect(more).toEqual([]);
  });
});

describe('location event This card', () => {
  it('gives +1 Power to the card that moved here', () => {
    const events: LocationEvent[] = [{
      id: 'buff',
      kind: 'cardMovedHere',
      effects: [{
        action: 'changePower',
        amount: 1,
        target: { type: 'card', who: 'self', where: 'board', relation: 'self' },
      } satisfies EffectStep],
    }];
    const game = baseSession({ events });
    const host = place(game, 0, card('traveler'));
    place(game, 0, card('anchor'), true, 1);
    const mover = card('pusher', {
      onReveal: [{
        action: 'moveCard',
        target: { type: 'card', who: 'self', where: 'board', relation: 'previous' },
      }],
    });
    game.state.nodes[0].cards[0] = [];
    const traveler = place(game, 0, card('traveler-2'), true, 1);
    const source = place(game, 0, mover, true, 1);
    (game as unknown as {
      movePlacement: (from: Deployment, destination: number, target: Deployment) => RuntimeEvent;
    }).movePlacement(source, 0, traveler);
    finish(game);
    expect(traveler.card.powerDelta ?? 0).toBe(1);
    expect(host.card.powerDelta ?? 0).toBe(0);
  });
});
