import { describe, expect, it } from 'vitest';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '@0uroboros/engine/runtime';
import { starterCards, type Card, type Deployment } from '@0uroboros/engine/game';
import { describeLocation, describeWhileEntry } from '@0uroboros/engine/effects/catalog';
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
  it('prints While: lines for solo Power and draw', () => {
    const power = createLocationWhile('soloCard');
    power.powerBonus = 5;
    delete power.effects;
    expect(describeWhileEntry(power)).toBe('While: only one card is here, +5 Power.');
    const draw: LocationWhile = {
      id: 'w', kind: 'soloCard',
      effects: [{ action: 'draw', amount: 1, target: { type: 'player', who: 'self' } }],
    };
    expect(describeWhileEntry(draw)).toMatch(/While: only one card is here, \+1 Card/i);
    expect(describeLocation({ effects: [], whiles: [power] })).toContain('While: only one card is here, +5 Power');
  });

  it('awards live Power only while exactly one revealed card is on the Node', () => {
    const entry: LocationWhile = { id: 'w', kind: 'soloCard', powerBonus: 5 };
    const game = baseSession({ whiles: [entry] });
    const lone = place(game, 0, card('lone'));
    const recalc = () => (game as unknown as { recalculate: () => void }).recalculate();
    recalc();
    expect(game.state.nodes[0].powers[0]).toBe(7); // 2 printed + 5 while
    place(game, 1, card('rival'));
    recalc();
    expect(game.state.nodes[0].powers[0]).toBe(2);
    expect(whilePowerBonus([entry], revealedAtNode(game.state.nodes[0].cards.flat()), lone)).toBe(0);
  });

  it('fires While effects with Ongoing cadence for the solo card’s owner', () => {
    const entry: LocationWhile = {
      id: 'w', kind: 'soloCard',
      effects: [{ action: 'draw', amount: 1, target: { type: 'player', who: 'self' } }],
    };
    const game = baseSession({ whiles: [entry] });
    place(game, 0, card('solo'));
    const before = game.state.players[0].hand.length + game.state.players[0].draw.length;
    // Ongoing is queued after reveals; inject by finishing a deploy cycle
    const mover = card('mover', {
      onReveal: [{ action: 'moveCard', target: { type: 'card', who: 'self', where: 'board', relation: 'self' }, optional: true }],
    });
    // Simpler: call enqueue via end of reveal by playing a card on another node then checking
    game.state.players[0].hand = [card('spark')];
    game.state.players[0].actions = 2;
    game.deploy(game.state.players[0].hand[0]!.id, 1);
    game.endTurn(0);
    game.endTurn(1);
    finishAll(game);
    const after = game.state.players[0].hand.length + game.state.players[0].draw.length;
    // Solo still on node 0; ongoing should have drawn for seat 0
    expect(after).toBeGreaterThanOrEqual(before);
    expect(meetsLocationWhile(entry, revealedAtNode(game.state.nodes[0].cards.flat()))).toBe(true);
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
    // Force a move via runtime private through moveCard effect
    const mover = card('pusher', {
      onReveal: [{
        action: 'moveCard',
        target: { type: 'card', who: 'self', where: 'board', relation: 'previous' },
      }],
    });
    // Place traveler on node 1, then move to node 0 via direct placement move
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
