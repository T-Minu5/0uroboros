import { describe, expect, it } from 'vitest';
import { createDefaultContent, compileContent, normalizeDocument, upgradeDocument, validateContent, type ContentDocument } from '../src/authoring/contentModel';
import { createSession, latestRevealSlot, seededRandom, type RuntimeEvent, type RuntimeSession } from '../src/runtime';
import { starterCards, type Card, type EvaluationEffect } from '../src/game';
import { EVALUATION_LOCATIONS } from '../src/content';
import { migrateEffects } from '../src/effects/migrate';
import type { AnyEffect, EffectStep, Scope } from '../src/effects/types';
import { describeStep, targetsFor, whoChoices } from '../src/effects/catalog';

const steps = (effects: AnyEffect[], scope: Scope = 'location') => migrateEffects(effects, scope);

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
        location.effects = steps([{ kind: 'trashLowestAtLocation', amount: 1 }]);
      }
    });
    // Keep validation happy with five enabled Locations.
    document.locations.filter(location => location.id !== 'trash_compactor').slice(0, 4).forEach(location => {
      location.enabled = true;
      location.effects = steps([{ kind: 'crypto', amount: 0 }]);
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
      location.effects = steps([{ kind: 'crypto', amount: 0 }]);
      location.ongoing = index === 0 ? steps([{ kind: 'draw', amount: 1 }]) : [];
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

  it('applies start-of-turn Power boosts only to Locations that were already open', () => {
    const boost: EvaluationEffect = { kind: 'boostPowerAtLocation', amount: 1 };
    const document = createDefaultContent();
    document.locations.forEach(location => {
      location.enabled = true;
      location.effects = steps([{ kind: 'crypto', amount: 0 }]);
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
      node.location = { ...structuredClone(content.locations[0]), id: `loc-${index}`, startTurn3: [boost], effects: [{ kind: 'crypto', amount: 0 }] };
      node.cards[0].push({ card: card(`n${index}`, { power: 2 }), owner: 0, node: index, order: index, revealed: true });
    });
    game.state.turn = 2;
    game.state.phase = 'runtime';
    game.endTurn();
    finish(game);
    // Turn 3 starts with nodes open under legalNodes(2) = first 4 in order → 0,1,2,3 get +1; node 4 does not.
    expect(game.state.nodes[0].cards[0][0].card.powerDelta).toBe(1);
    expect(game.state.nodes[3].cards[0][0].card.powerDelta).toBe(1);
    expect(game.state.nodes[4].cards[0][0].card.powerDelta ?? 0).toBe(0);
  });

  it('fires start-of-turn-2 effects when turn 2 begins, not on other turns', () => {
    const document = createDefaultContent();
    document.locations.forEach(location => { location.enabled = true; location.effects = steps([{ kind: 'crypto', amount: 0 }]); });
    const content = compileContent(document);
    const game = createSession({ carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true, random: seededRandom(5), content });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; player.wallet = 0; });
    game.state.nodes.forEach((node, index) => { node.location = { ...structuredClone(content.locations[0]), id: `loc-${index}`, effects: [{ kind: 'crypto', amount: 0 }] }; });
    game.state.nodes[0].location!.startTurn2 = [{ kind: 'crypto', amount: 2 }];
    game.state.nodes[0].cards[0].push({ card: card('lead', { power: 4 }), owner: 0, node: 0, order: 1, revealed: true });
    game.state.turn = 1;
    game.state.phase = 'runtime';
    game.endTurn();
    finish(game);
    expect(game.state.turn).toBe(2);
    expect(game.state.players[0].wallet).toBe(2);
    game.state.players[1].actions = 0;
    game.endTurn();
    finish(game);
    expect(game.state.players[0].wallet).toBe(2);
  });

  it('turns saved after-turn schedules into the matching start-of-turn effects', () => {
    const document = createDefaultContent() as ContentDocument & { locations: Record<string, unknown>[] };
    document.locations[0].schedule = [{ at: 2, effects: steps([{ kind: 'draw', amount: 1 }]) }, { at: 3, effects: steps([{ kind: 'crypto', amount: 2 }]) }];
    document.locations[0].rule = document.locations[0].reward = 'After turn 2: old copy.';
    const upgraded = upgradeDocument(document) as ContentDocument;
    const location = upgraded.locations[0];
    expect(location).not.toHaveProperty('schedule');
    expect(location.startTurn2?.[0]).toMatchObject({ action: 'draw' });
    expect(location.startTurn3?.[0]).toMatchObject({ action: 'gainCrypto' });
    expect(location.rule).toContain('Start of turn 2:');
    expect(location.rule).toContain('Start of turn 3:');
    expect(validateContent(upgraded)).toEqual([]);
  });

  it('keeps hand-shortened Location text and only fills blank text', () => {
    const document = createDefaultContent();
    document.locations[0].rule = document.locations[0].reward = 'Short.';
    document.locations[1].rule = document.locations[1].reward = '';
    const normalized = normalizeDocument(document);
    expect(normalized.locations[0].rule).toBe('Short.');
    expect(normalized.locations[1].rule).toMatch(/^On collapse:/);
  });

  it('needs enough Locations without start-of-turn effects for the late reveals', () => {
    const document = createDefaultContent();
    document.locations.forEach(location => { location.enabled = true; location.startTurn3 = steps([{ kind: 'crypto', amount: 1 }]); });
    expect(validateContent(document).some(error => error.includes('fifth reveal'))).toBe(true);
    document.locations[0].startTurn3 = undefined;
    document.locations.slice(1).forEach(location => { location.startTurn3 = undefined; location.startTurn2 = steps([{ kind: 'crypto', amount: 1 }]); });
    expect(validateContent(document).some(error => error.includes('fourth and fifth reveals'))).toBe(true);
  });

  it('deals start-of-turn Locations only to reveal slots that are open in time', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const document = createDefaultContent();
      document.locations.forEach(location => { location.enabled = true; location.effects = steps([{ kind: 'crypto', amount: 0 }]); });
      document.locations[0].startTurn2 = steps([{ kind: 'crypto', amount: 1 }]);
      document.locations[1].startTurn2 = steps([{ kind: 'crypto', amount: 1 }]);
      document.locations[2].startTurn3 = steps([{ kind: 'crypto', amount: 1 }]);
      document.locations[3].startTurn3 = steps([{ kind: 'crypto', amount: 1 }]);
      const game = createSession({ carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true, random: seededRandom(seed), content: compileContent(document) });
      game.state.nodeOrder.forEach((node, slot) => {
        const location = game.state.nodes[node].location!;
        expect(slot, `seed ${seed}: ${location.id}`).toBeLessThanOrEqual(latestRevealSlot(location));
      });
    }
  });

  it('on-play rewards the player who played the card, not the Location winner', () => {
    const document = createDefaultContent();
    document.locations.forEach(location => {
      location.enabled = true;
      location.effects = steps([{ kind: 'crypto', amount: 0 }]);
      location.onPlay = steps([], 'locationPlay');
    });
    document.locations[0].onPlay = steps([{ kind: 'crypto', amount: 3 }], 'locationPlay');
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
    document.locations.forEach(location => { location.enabled = true; location.effects = steps([{ kind: 'crypto', amount: 0 }]); });
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
      location.effects = steps([{ kind: 'crypto', amount: 0 }]);
    });
    document.locations[0].effects = steps([{ kind: 'trashLowestAtLocation', amount: 1, boardSide: 'winner' }]);
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
      location.effects = steps([{ kind: 'crypto', amount: 0 }]);
    });
    document.locations[0].effects = steps([{ kind: 'moveCard', boardSide: 'either', cardPick: 'random' }]);
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
      location.effects = steps([{ kind: 'crypto', amount: 0 }]);
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
        expect(game.state.nodes[0].cards[1][0]?.card.powerDelta).toBe(2);
        expect(game.state.nodes[0].cards[0][0]?.card.powerDelta ?? 0).toBe(0);
        boosted = true;
        break;
      }
    }
    expect(boosted).toBe(true);
  });
});

describe('Location awards for the player with the least VP', () => {
  const award: EffectStep = { action: 'gainCrypto', amount: 3, target: { type: 'player', who: 'leastVP' } };

  function playHere(vp: [number, number]) {
    const content = compileContent(createDefaultContent());
    const game = createSession({ carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true, random: seededRandom(9), content });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach((player, owner) => { player.hand = []; player.draw = []; player.discard = []; player.wallet = 0; player.rewardVP = vp[owner]; });
    game.state.nodes[0].location = { ...structuredClone(content.locations[0]), onPlay: [award], effects: [] };
    game.state.players[0].hand = [card('played', { power: 1 })];
    game.state.turn = 1;
    game.state.phase = 'runtime';
    game.deploy('played', 0);
    game.endTurn();
    finish(game);
    return game.state.players.map(player => player.wallet);
  }

  it('awards whoever trails on VP, even when the other player triggered it', () => {
    expect(playHere([2, 5])).toEqual([3, 0]);
    expect(playHere([6, 1])).toEqual([0, 3]);
  });

  it('awards both players on a VP tie', () => {
    expect(playHere([4, 4])).toEqual([3, 3]);
  });

  it('is offered for player, Server and zone targets in Location effects only, and prints plainly', () => {
    expect(whoChoices(targetsFor('gainVP', 'location')[0], 'location')).toContain('leastVP');
    expect(whoChoices(targetsFor('repairServer', 'location')[0], 'location')).toContain('leastVP');
    expect(whoChoices(targetsFor('gainVP', 'card')[0], 'card')).not.toContain('leastVP');
    expect(whoChoices(targetsFor('destroyCard', 'location')[0], 'location')).not.toContain('leastVP');
    expect(describeStep({ action: 'gainVP', amount: 2, target: { type: 'player', who: 'leastVP' } }, 'location')).toBe('+2 VP to the player with the least VP');
    const document = createDefaultContent();
    document.locations[0].effects = [award];
    expect(validateContent(document)).toEqual([]);
  });
});
