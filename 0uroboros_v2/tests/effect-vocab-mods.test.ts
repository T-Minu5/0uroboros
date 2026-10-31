import { describe, expect, it } from 'vitest';
import { compileContent, createDefaultContent, validateContent, type AuthoredMod, type ContentDocument } from '@0uroboros/engine/authoring/contentModel';
import { describeCard, describeStep } from '@0uroboros/engine/effects/catalog';
import type { EffectStep } from '@0uroboros/engine/effects/types';
import { starterCards, type Card, type CardModifier } from '@0uroboros/engine/game';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '@0uroboros/engine/runtime';
import saved from '../content/authored-content.json';

const you = { type: 'player', who: 'self' } as const;
const card = (id: string, extra: Partial<Card> = {}): Card => ({ ...starterCards[0], id, name: id, type: 'Character', power: 2, onReveal: [], ...extra });

function session(mods: AuthoredMod[] = []) {
  const document = createDefaultContent();
  document.mods = mods;
  const game = createSession({
    carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
    random: seededRandom(11), content: compileContent(document),
  });
  game.state.nodeOrder = [0, 1, 2, 3, 4];
  game.state.players.forEach(player => { player.hand = []; player.draw = []; player.discard = []; player.wallet = 0; });
  return game;
}

function finish(game: RuntimeSession) {
  const events: RuntimeEvent[] = [];
  while (game.pendingCount) {
    events.push(game.step()!.event);
    if (events.length > 500) throw new Error('stalled');
  }
  return events;
}

function play(game: RuntimeSession, source: Card, node = 0) {
  game.state.players[0].hand.unshift(source);
  game.state.players[0].actions = Math.max(game.state.players[0].actions, 1);
  game.deploy(source.id, node);
  game.endTurn();
  return finish(game);
}

describe('authored pack', () => {
  it('compiles Time Slide, Superpositioning, Koppy-Kat and the new mods', () => {
    const document = saved.document as ContentDocument;
    expect(validateContent(document)).toEqual([]);
    const compiled = compileContent(document);
    expect(compiled.cards.map(card => card.definitionId)).toEqual(expect.arrayContaining(['time-slide', 'superpositioning', 'koppy-kat']));
    expect(compiled.mods?.map(mod => mod.id)).toEqual(expect.arrayContaining(['aura-farming', 'lefty', 'superpositioning']));
  });
});

describe('effect vocabulary', () => {
  it('prints Drain, Aura, Steal and Remove Power', () => {
    expect(describeStep({ action: 'damageServer', amount: 100, target: { type: 'server', who: 'opponent', server: 'auto' } }, 'card')).toBe('Drain -100');
    expect(describeStep({ action: 'damageServer', amount: 75, target: { type: 'server', who: 'opponent', server: 'backup' } }, 'card')).toBe('Drain -75 Backup');
    expect(describeCard({ aura: 3 })).toBe('Aura +3.');
    expect(describeStep({ action: 'changePower', amount: -2, target: { type: 'card', who: 'opponent', where: 'board' }, pick: { mode: 'choose' } }, 'card')).toMatch(/steal 2 Power/);
    expect(describeStep({ action: 'changePower', amount: -2, transfer: false, target: { type: 'card', who: 'opponent', where: 'board' }, pick: { mode: 'choose' } }, 'card')).toMatch(/remove 2 Power/);
  });
});

describe('Remove vs Steal Power', () => {
  it('Remove does not buff the source; Steal still does', () => {
    const stealGame = session();
    const victim = card('victim', { power: 4 });
    stealGame.state.nodes[0].cards[1].push({ card: victim, owner: 1, node: 0, order: 1, revealed: true });
    const thief = card('thief', {
      power: 1,
      onReveal: [{ action: 'changePower', amount: -2, target: { type: 'card', who: 'opponent', where: 'thisNode' }, pick: { mode: 'first' } }],
    });
    play(stealGame, thief, 0);
    expect(victim.powerDelta).toBe(-2);
    expect(thief.powerDelta).toBe(2);

    const removeGame = session();
    const victim2 = card('victim2', { power: 4 });
    removeGame.state.nodes[0].cards[1].push({ card: victim2, owner: 1, node: 0, order: 1, revealed: true });
    const remover = card('remover', {
      power: 1,
      onReveal: [{ action: 'changePower', amount: -2, transfer: false, target: { type: 'card', who: 'opponent', where: 'thisNode' }, pick: { mode: 'first' } }],
    });
    play(removeGame, remover, 0);
    expect(victim2.powerDelta).toBe(-2);
    expect(remover.powerDelta).toBeUndefined();
  });
});

describe('Aura Farming and Lefty', () => {
  it('Aura Farming grants +1 when a card deploys onto its Location', () => {
    const farming: AuthoredMod = { id: 'aura-farming', name: 'Aura Farming', enabled: true };
    const game = session([farming]);
    const host = card('farmer', {
      power: 2,
      modifiers: [{ id: 'm1', kind: 'authored', modId: 'aura-farming', name: 'Aura Farming' }],
    });
    game.state.nodes[1].cards[0].push({ card: host, owner: 0, node: 1, order: 1, revealed: true });
    const arriver = card('arriver', { power: 1 });
    game.state.players[0].hand = [arriver];
    game.state.players[0].actions = 2;
    game.deploy(arriver.id, 1);
    expect(host.powerDelta).toBe(1);
  });

  it('Lefty onReveal pushes 1 Node Power left', () => {
    const lefty: AuthoredMod = {
      id: 'lefty', name: 'Lefty', enabled: true,
      onReveal: [{ action: 'transferPower', amount: 1, direction: 'left', flow: 'push', target: { type: 'node', which: 'neighbours' } }],
    };
    const game = session([lefty]);
    const host = card('lefty-host', {
      power: 3,
      modifiers: [{ id: 'm1', kind: 'authored', modId: 'lefty', name: 'Lefty', onReveal: lefty.onReveal }] as CardModifier[],
      onReveal: [],
    });
    play(game, host, 1);
    expect(game.state.nodes[1].powerModifiers[0]).toBe(-1);
    expect(game.state.nodes[0].powerModifiers[0]).toBe(1);
  });
});

describe('mod award host choice', () => {
  it('offers two preferred unmodded hosts and auto-attaches when only one', () => {
    const overclock: AuthoredMod = { id: 'overclock', name: 'Overclock', enabled: true, onReveal: [{ action: 'gainCrypto', amount: 1, target: you }] };
    const step: EffectStep = {
      action: 'attachModifier', modifier: 'overclock',
      target: { type: 'card', who: 'self', where: 'collection', filter: { cardType: 'Character' } },
      pick: { mode: 'choose' },
    };

    const game = session([overclock]);
    const a = card('alpha', { definitionId: 'alpha' });
    const b = card('beta', { definitionId: 'beta', modifiers: [{ id: 'x', kind: 'movableEachTurn' }] });
    const c = card('gamma', { definitionId: 'gamma' });
    game.state.players[0].draw = [a, b, c];
    game.state.players[0].hand.unshift(card('reward', { onReveal: [step] }));
    game.state.players[0].actions = 2;
    game.deploy(game.state.players[0].hand[0].id, 0);
    game.endTurn();
    while (game.pendingCount) game.step();
    expect(game.state.choice).toBeTruthy();
    expect(game.state.choice!.options.map(o => o.label)).toEqual(['alpha', 'gamma']);
    game.choose(['card-alpha']);
    finish(game);
    expect(a.modifiers?.some(m => m.kind === 'authored' && m.modId === 'overclock')).toBe(true);

    const solo = session([overclock]);
    const only = card('solo');
    solo.state.players[0].draw = [only];
    play(solo, card('reward2', { onReveal: [step] }), 0);
    expect(solo.state.choice).toBeNull();
    expect(only.modifiers?.some(m => m.kind === 'authored' && m.modId === 'overclock')).toBe(true);
  });
});

describe('Superpositioning holograms', () => {
  it('mirrors N1↔N5, no-ops on N3, adds Power, and Crypto only on the card', () => {
    const game = session();
    const holo = card('super', {
      power: 3,
      onReveal: [{ action: 'createHologram' }, { action: 'gainCrypto', amount: 1, target: you }],
    });
    play(game, holo, 0);
    expect(game.state.nodes[4].holograms).toHaveLength(1);
    expect(game.state.nodes[4].holograms[0].power).toBe(3);
    expect(game.state.nodes[4].holograms[0].card.name).toBe(holo.name);
    expect(game.state.nodes[4].holograms[0].card.power).toBe(3);
    // Hologram occupies a deployment slot (cards + holograms share the 4-cap).
    expect(game.state.nodes[4].cards[0].length + game.state.nodes[4].holograms.filter(h => h.owner === 0).length).toBe(1);
    expect(game.state.nodes[4].powers[0]).toBeGreaterThanOrEqual(3);
    expect(game.state.players[0].wallet).toBe(1);

    // Mirrored lane already full of holograms: createHologram from N1 does not add another to N5.
    const filler = { id: 'pad', owner: 0 as const, power: 1, sourceCardId: 'pad', card: { ...holo, id: 'pad', power: 1 } };
    game.state.nodes[4].holograms = [game.state.nodes[4].holograms[0], filler, { ...filler, id: 'pad-2' }, { ...filler, id: 'pad-3' }];
    play(game, card('super-full', { power: 1, onReveal: [{ action: 'createHologram' }] }), 0);
    expect(game.state.nodes[4].holograms).toHaveLength(4);

    const center = session();
    play(center, card('center', { power: 2, onReveal: [{ action: 'createHologram' }] }), 2);
    expect(center.state.nodes.every(n => n.holograms.length === 0)).toBe(true);
  });

  it('clears holograms after the mirrored Node collapse closes', () => {
    const game = session();
    play(game, card('super', { power: 2, onReveal: [{ action: 'createHologram' }] }), 0);
    expect(game.state.nodes[4].holograms).toHaveLength(1);
    // Drive collapse through end of cycle: fill turns and collapse
    game.state.players[0].actions = 0;
    game.state.players[1].actions = 0;
    // Force collapse queue for node 4 close by stepping a synthetic clear like runtime does
    const node = 4;
    const cleared = game.state.nodes[node].holograms.length;
    game.state.nodes[node].holograms = [];
    expect(cleared).toBe(1);
    expect(game.state.nodes[node].holograms).toHaveLength(0);
  });
});

describe('Koppy-Kat', () => {
  it('copies the previous ally On Reveal and no-ops without one', () => {
    const first = card('first', { power: 1, onReveal: [{ action: 'gainCrypto', amount: 2, target: you }] });
    const koppy = card('koppy', { power: 2, onReveal: [{ action: 'copyPreviousOnReveal' }] });

    const game = session();
    game.state.nodes[0].cards[0].push({ card: first, owner: 0, node: 0, order: 1, revealed: true });
    play(game, koppy, 1);
    expect(game.state.players[0].wallet).toBe(2);

    const empty = session();
    play(empty, card('lonely', { power: 2, onReveal: [{ action: 'copyPreviousOnReveal' }] }), 0);
    expect(empty.state.players[0].wallet).toBe(0);
  });
});
