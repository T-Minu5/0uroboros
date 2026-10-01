import { describe, expect, it } from 'vitest';
import { createDefaultContent, compileContent, validateContent } from '../src/authoring/contentModel';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '../src/runtime';
import { starterCards, type Card, type EvaluationEffect } from '../src/game';
import { EVALUATION_LOCATIONS } from '../src/content';

const card = (id: string, extra: Partial<Card> = {}): Card =>
  ({ ...starterCards[0], id, power: 2, onReveal: [], ...extra });

function finish(game: RuntimeSession) {
  const events: RuntimeEvent[] = [];
  while (game.pendingCount) {
    events.push(game.step()!.event);
    if (events.length > 500) throw new Error('stalled');
  }
  return events;
}

describe('location hooks and in-location targeting', () => {
  it('includes Trash Compactor in the evaluation location pool', () => {
    expect(EVALUATION_LOCATIONS.some(location => location.id === 'trash_compactor')).toBe(true);
    const document = createDefaultContent();
    expect(document.locations.some(location => location.id === 'trash_compactor')).toBe(true);
    expect(validateContent(document)).toEqual([]);
  });

  it('trashes the lowest-Power revealed card at Trash Compactor on collapse', () => {
    const document = createDefaultContent();
    document.locations.forEach(location => {
      location.enabled = location.id === 'trash_compactor';
      if (location.id === 'trash_compactor') {
        location.effects = [{ kind: 'trashLowestAtLocation', amount: 1 }];
      }
    });
    // Keep validation happy with five enabled Locations.
    document.locations.filter(location => location.id !== 'trash_compactor').slice(0, 4).forEach(location => {
      location.enabled = true;
      location.effects = [{ kind: 'crypto', amount: 0 }];
    });
    const content = compileContent(document);
    const game = createSession({
      carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
      random: seededRandom(3), content,
    });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; });
    // Force Trash Compactor onto node 0.
    const compactor = content.locations.find(location => location.id === 'trash_compactor')!;
    game.state.nodes.forEach((node, index) => {
      node.location = index === 0 ? structuredClone(compactor) : { ...structuredClone(content.locations[0]), id: `pad-${index}`, effects: [{ kind: 'crypto', amount: 0 }] };
    });
    const low = card('low', { power: 1, name: 'Low Power' });
    const high = card('high', { power: 5, name: 'High Power' });
    game.state.nodes[0].cards[0].push({ card: high, owner: 0, node: 0, order: 1, revealed: true });
    game.state.nodes[0].cards[1].push({ card: low, owner: 1, node: 0, order: 2, revealed: true });
    for (let node = 1; node < 5; node++) {
      game.state.nodes[node].cards[0].push({ card: card(`pad-${node}`, { power: 3 }), owner: 0, node, order: 10 + node, revealed: true });
    }
    game.state.turn = 3;
    game.state.phase = 'runtime';
    game.endTurn();
    const events = finish(game);
    const trashed = events.filter(event => event.kind === 'trash' && event.source === 'location');
    expect(trashed.some(event => event.amount === 1 && /Low Power|low/i.test(event.text))).toBe(true);
    expect(game.state.trash.map(item => item.id)).toContain('low');
    expect(game.state.trash.map(item => item.id)).not.toContain('high');
  });

  it('gives the current controller an ongoing draw after each Runtime reveal', () => {
    const document = createDefaultContent();
    document.locations.forEach((location, index) => {
      location.enabled = true;
      location.effects = [{ kind: 'crypto', amount: 0 }];
      location.ongoing = index === 0 ? [{ kind: 'draw', amount: 1 }] : [];
    });
    const content = compileContent(document);
    const game = createSession({
      carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
      random: seededRandom(11), content,
    });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach(player => { player.hand = []; player.draw = [card('deck-a'), card('deck-b'), card('deck-c')]; player.discard = []; });
    game.state.nodes[0].location = { ...structuredClone(content.locations[0]), ongoing: [{ kind: 'draw', amount: 1 }], effects: [{ kind: 'crypto', amount: 0 }] };
    game.state.nodes[0].cards[0].push({ card: card('lead', { power: 4 }), owner: 0, node: 0, order: 1, revealed: true });
    game.state.turn = 1;
    game.state.phase = 'runtime';
    game.endTurn();
    finish(game);
    expect(game.state.players[0].hand.length).toBeGreaterThanOrEqual(1);
  });

  it('applies after-turn Power boosts only to Locations that were already open', () => {
    const boost: EvaluationEffect = { kind: 'boostPowerAtLocation', amount: 1 };
    const document = createDefaultContent();
    document.locations.forEach(location => {
      location.enabled = true;
      location.effects = [{ kind: 'crypto', amount: 0 }];
      location.schedule = [{ at: 2, effects: [boost] }];
    });
    const content = compileContent(document);
    const game = createSession({
      carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
      random: seededRandom(5), content,
    });
    // Open order: nodes 0,1,2 open on turn 1; node 3 opens turn 2; node 4 opens turn 3.
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; });
    game.state.nodes.forEach((node, index) => {
      node.location = { ...structuredClone(content.locations[0]), id: `loc-${index}`, schedule: [{ at: 2, effects: [boost] }], effects: [{ kind: 'crypto', amount: 0 }] };
      node.cards[0].push({ card: card(`n${index}`, { power: 2 }), owner: 0, node: index, order: index, revealed: true });
    });
    game.state.turn = 2;
    game.state.phase = 'runtime';
    game.endTurn();
    finish(game);
    // After turn 2, nodes open under legalNodes(2) = first 4 in order → 0,1,2,3 get +1; node 4 does not.
    expect(game.state.nodes[0].cards[0][0].powerModifier).toBe(1);
    expect(game.state.nodes[3].cards[0][0].powerModifier).toBe(1);
    expect(game.state.nodes[4].cards[0][0].powerModifier ?? 0).toBe(0);
  });

  it('on-play rewards the player who played the card, not the Location winner', () => {
    const document = createDefaultContent();
    document.locations.forEach(location => {
      location.enabled = true;
      location.effects = [{ kind: 'crypto', amount: 0 }];
      location.onPlay = [];
    });
    document.locations[0].onPlay = [{ kind: 'crypto', amount: 3 }];
    const content = compileContent(document);
    const game = createSession({
      carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
      random: seededRandom(9), content,
    });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; player.wallet = 0; });
    game.state.nodes[0].location = {
      ...structuredClone(content.locations[0]),
      onPlay: [{ kind: 'crypto', amount: 3 }],
      effects: [{ kind: 'crypto', amount: 0 }],
    };
    // Opponent is winning the Node, but the local player plays the card that reveals.
    game.state.nodes[0].cards[1].push({ card: card('lead', { power: 9 }), owner: 1, node: 0, order: 1, revealed: true });
    game.state.players[0].hand = [card('played', { power: 1 })];
    game.state.turn = 1;
    game.state.phase = 'runtime';
    game.deploy('played', 0);
    game.endTurn();
    finish(game);
    expect(game.state.players[0].wallet).toBe(3);
    expect(game.state.players[1].wallet).toBe(0);
  });

  it.each([
    { effect: { kind: 'destroyAtLocation', rank: 'strongest', amount: 1 } as EvaluationEffect, hit: 'big', zone: 'destroyed' },
    { effect: { kind: 'trashAtLocation', rank: 'first', amount: 1 } as EvaluationEffect, hit: 'early', zone: 'trash' },
    { effect: { kind: 'destroyAtLocation', rank: 'weakest', amount: 1, boardSide: 'loser' } as EvaluationEffect, hit: 'small', zone: 'destroyed' },
  ])('$effect.kind hits the $effect.rank card here', ({ effect, hit, zone }) => {
    const document = createDefaultContent();
    document.locations.forEach(location => { location.enabled = true; location.effects = [{ kind: 'crypto', amount: 0 }]; });
    const content = compileContent(document);
    const game = createSession({ carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true, random: seededRandom(3), content });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; });
    game.state.nodes.forEach((node, index) => {
      node.location = { ...structuredClone(content.locations[0]), id: `loc-${index}`, effects: index === 0 ? [effect] : [{ kind: 'crypto', amount: 0 }] };
    });
    game.state.nodes[0].cards[0].push({ card: card('big', { power: 9, name: 'Big' }), owner: 0, node: 0, order: 1, revealed: true, revealSequence: 5 });
    game.state.nodes[0].cards[1].push({ card: card('early', { power: 3, name: 'Early' }), owner: 1, node: 0, order: 2, revealed: true, revealSequence: 1 });
    game.state.nodes[0].cards[1].push({ card: card('small', { power: 2, name: 'Small' }), owner: 1, node: 0, order: 3, revealed: true, revealSequence: 7 });
    game.state.turn = 3;
    game.endTurn();
    finish(game);
    const trashed = game.state.trash.map(item => item.id);
    const destroyed = game.state.players.flatMap(player => player.destroyed.map(item => item.id));
    expect(zone === 'trash' ? trashed : destroyed).toContain(hit);
    expect([...trashed, ...destroyed].filter(id => ['big', 'early', 'small'].includes(id))).toEqual([hit]);
  });

  it('trashes the lowest card on the winner side when boardSide is winner', () => {
    const document = createDefaultContent();
    document.locations.forEach(location => {
      location.enabled = true;
      location.effects = [{ kind: 'crypto', amount: 0 }];
    });
    document.locations[0].effects = [{ kind: 'trashLowestAtLocation', amount: 1, boardSide: 'winner' }];
    const content = compileContent(document);
    const game = createSession({
      carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
      random: seededRandom(3), content,
    });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; });
    game.state.nodes[0].location = { ...structuredClone(content.locations[0]), effects: [{ kind: 'trashLowestAtLocation', amount: 1, boardSide: 'winner' }] };
    // Player 0 wins (higher power) but has a low card; opponent has even lower — only winner side trashes.
    game.state.nodes[0].cards[0].push({ card: card('winner-low', { power: 2, name: 'Winner Low' }), owner: 0, node: 0, order: 1, revealed: true });
    game.state.nodes[0].cards[0].push({ card: card('winner-high', { power: 8, name: 'Winner High' }), owner: 0, node: 0, order: 2, revealed: true });
    game.state.nodes[0].cards[1].push({ card: card('loser-tiny', { power: 1, name: 'Loser Tiny' }), owner: 1, node: 0, order: 3, revealed: true });
    for (let node = 1; node < 5; node++) {
      game.state.nodes[node].cards[0].push({ card: card(`pad-${node}`, { power: 3 }), owner: 0, node, order: 10 + node, revealed: true });
      game.state.nodes[node].location = { ...structuredClone(content.locations[1]), id: `pad-${node}`, effects: [{ kind: 'crypto', amount: 0 }] };
    }
    game.state.turn = 3;
    game.state.phase = 'runtime';
    game.endTurn();
    finish(game);
    expect(game.state.trash.map(item => item.id)).toContain('winner-low');
    expect(game.state.trash.map(item => item.id)).not.toContain('loser-tiny');
    expect(game.state.trash.map(item => item.id)).not.toContain('winner-high');
  });

  it('moves a random card on either side to another open Node', () => {
    const document = createDefaultContent();
    document.locations.forEach(location => {
      location.enabled = true;
      location.effects = [{ kind: 'crypto', amount: 0 }];
    });
    document.locations[0].effects = [{ kind: 'moveCard', boardSide: 'either', cardPick: 'random' }];
    const content = compileContent(document);
    expect(validateContent(document)).toEqual([]);
    const game = createSession({
      carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
      random: seededRandom(42), content,
    });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; });
    game.state.nodes[0].location = { ...structuredClone(content.locations[0]), effects: [{ kind: 'moveCard', boardSide: 'either', cardPick: 'random' }] };
    game.state.nodes[0].cards[0].push({ card: card('mover', { power: 4, name: 'Mover' }), owner: 0, node: 0, order: 1, revealed: true });
    for (let node = 1; node < 5; node++) {
      game.state.nodes[node].cards[1].push({ card: card(`pad-${node}`, { power: 1 }), owner: 1, node, order: 10 + node, revealed: true });
      game.state.nodes[node].location = { ...structuredClone(content.locations[1]), id: `pad-${node}`, effects: [{ kind: 'crypto', amount: 0 }] };
    }
    game.state.turn = 3;
    game.state.phase = 'runtime';
    game.endTurn();
    const events = finish(game);
    const moved = events.filter(event => event.kind === 'move' && event.source === 'location');
    expect(moved.length).toBeGreaterThanOrEqual(1);
    expect(moved.some(event => event.targetCardId === 'mover' && event.sourceNode === 0 && event.targetNode !== 0)).toBe(true);
  });

  it('boosts only the loser side when boardSide is loser', () => {
    const document = createDefaultContent();
    document.locations.forEach(location => {
      location.enabled = true;
      location.effects = [{ kind: 'crypto', amount: 0 }];
    });
    const content = compileContent(document);
    const game = createSession({
      carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
      random: seededRandom(7), content,
    });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; });
    game.state.nodes[0].location = {
      ...structuredClone(content.locations[0]),
      effects: [{ kind: 'boostPowerAtLocation', amount: 2, boardSide: 'loser' }],
    };
    game.state.nodes[0].cards[0].push({ card: card('win', { power: 5 }), owner: 0, node: 0, order: 1, revealed: true });
    game.state.nodes[0].cards[1].push({ card: card('lose', { power: 1 }), owner: 1, node: 0, order: 2, revealed: true });
    for (let node = 1; node < 5; node++) {
      game.state.nodes[node].cards[0].push({ card: card(`pad-${node}`, { power: 3 }), owner: 0, node, order: 10 + node, revealed: true });
      game.state.nodes[node].location = { ...structuredClone(content.locations[1]), id: `pad-${node}`, effects: [{ kind: 'crypto', amount: 0 }] };
    }
    game.state.turn = 3;
    game.state.phase = 'runtime';
    game.endTurn();
    // Resolve until the loser-side boost applies, before End-of-Cycle discard.
    let boosted = false;
    for (let i = 0; i < 200; i++) {
      const step = game.step();
      if (!step) break;
      if (step.event.kind === 'power' && step.event.source === 'location' && /loser|1 revealed/i.test(step.event.text)) {
        expect(game.state.nodes[0].cards[1][0]?.powerModifier).toBe(2);
        expect(game.state.nodes[0].cards[0][0]?.powerModifier ?? 0).toBe(0);
        boosted = true;
        break;
      }
    }
    expect(boosted).toBe(true);
  });
});
