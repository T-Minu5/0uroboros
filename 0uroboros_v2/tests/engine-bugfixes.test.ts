import { describe, expect, it } from 'vitest';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '@0uroboros/engine/runtime';
import { starterCards, type Card } from '@0uroboros/engine/game';
import type { AnyEffect, EffectStep } from '@0uroboros/engine/effects/types';

const card = (id: string, extra: Partial<Card> = {}): Card => ({ ...starterCards[0], id, name: id, power: 2, onReveal: [], ...extra });

/** A session whose five Locations do nothing unless a test gives them effects. */
function session(seed = 3) {
  const game = createSession({ carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true, random: seededRandom(seed) });
  game.state.nodeOrder = [0, 1, 2, 3, 4];
  game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; player.wallet = 0; });
  game.state.nodes.forEach((node, index) => {
    node.location = { ...structuredClone(node.location!), id: `quiet-${index}`, name: `Quiet ${index + 1}`, effects: [], ongoing: [], onPlay: [] };
  });
  return game;
}

function finish(game: RuntimeSession) {
  const events: RuntimeEvent[] = [];
  while (game.pendingCount) {
    events.push(game.step()!.event);
    if (events.length > 600) throw new Error('stalled');
  }
  return events;
}

const setLocation = (game: RuntimeSession, node: number, patch: { effects?: AnyEffect[]; ongoing?: AnyEffect[]; startTurn2?: AnyEffect[]; startTurn3?: AnyEffect[] }) => {
  game.state.nodes[node].location = { ...game.state.nodes[node].location!, ...patch };
};

describe('engine fixes', () => {
  it('resolves start-of-turn-3 Location effects before turn 3 planning', () => {
    const game = session();
    setLocation(game, 0, { startTurn3: [{ kind: 'boostPowerAtLocation', amount: 1 }] });
    game.state.nodes[0].cards[0].push({ card: card('held'), owner: 0, node: 0, order: 1, revealed: true });
    game.state.turn = 2;
    game.state.phase = 'runtime';
    game.endTurn();
    const events = finish(game);
    const boost = events.findIndex(event => event.kind === 'power' && event.source === 'location');
    const planning = events.findIndex(event => event.text === 'Runtime turn 3 planning begins.');
    expect(boost).toBeGreaterThanOrEqual(0);
    expect(boost).toBeLessThan(planning);
    expect(game.state.nodes[0].cards[0][0].card.powerDelta).toBe(1);
  });

  it('lets a random player decide a tied Location choice instead of always player 1', () => {
    const choice: EffectStep = { action: 'choice', options: [
      { id: 'a', label: 'One', effects: [{ action: 'gainCrypto', amount: 1, target: { type: 'player', who: 'winner' } }] },
      { id: 'b', label: 'Two', effects: [{ action: 'gainCrypto', amount: 2, target: { type: 'player', who: 'winner' } }] },
    ] };
    const deciders = new Set<number>();
    for (let seed = 1; seed <= 16; seed++) {
      const game = session(seed);
      setLocation(game, 0, { effects: [choice] });
      game.state.turn = 3;
      game.state.phase = 'runtime';
      game.endTurn();
      while (game.pendingCount) {
        const { event } = game.step()!;
        if (event.source === 'location' && /^Opponent chooses/.test(event.text)) deciders.add(1);
      }
      if (game.state.choice?.sourceName === 'Quiet 1') deciders.add(game.state.choice.owner);
    }
    expect([...deciders].sort()).toEqual([0, 1]);
  });

  it('adds Ongoing Actions to the Runtime turn that is starting', () => {
    const actionsAfterTurn = (ongoing: AnyEffect[]) => {
      const game = session();
      setLocation(game, 0, { ongoing });
      game.state.nodes[0].cards[0].push({ card: card('lead', { power: 4 }), owner: 0, node: 0, order: 1, revealed: true });
      game.state.turn = 1;
      game.state.phase = 'runtime';
      game.endTurn();
      finish(game);
      return { actions: game.state.players[0].actions, pending: game.state.players[0].pendingActions };
    };
    const plain = actionsAfterTurn([]);
    const boosted = actionsAfterTurn([{ kind: 'actions', amount: 1 }]);
    expect(boosted.actions).toBe(plain.actions + 1);
    expect(boosted.pending).toBe(plain.pending);
  });

  it('gives Circuit rewards with board card targets No target rather than acting on a card', () => {
    const game = session();
    game.state.nodes[0].cards[1].push({ card: card('enemy', { power: 5 }), owner: 1, node: 0, order: 1, revealed: true });
    const circuit = game as unknown as { resolveCircuitEffect(owner: 0 | 1, name: string, step: EffectStep): RuntimeEvent };
    const event = circuit.resolveCircuitEffect(0, 'Circuit Test', { action: 'destroyCard', target: { type: 'card', where: 'board', who: 'opponent' } });
    finish(game);
    expect(event.text).toMatch(/No target/);
    expect(game.state.nodes[0].cards[1].map(entry => entry.card.id)).toEqual(['enemy']);
  });
});
