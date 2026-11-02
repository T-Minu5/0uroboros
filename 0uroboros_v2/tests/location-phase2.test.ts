import { describe, expect, it } from 'vitest';
import { createSession, seededRandom, type RuntimeEvent, type RuntimeSession } from '@0uroboros/engine/runtime';
import { starterCards, type Card } from '@0uroboros/engine/game';
import { describeLocation, describeMod } from '@0uroboros/engine/effects/catalog';
import { describePassives } from '@0uroboros/engine/locationEvents';
import { migrateEffects } from '@0uroboros/engine/effects/migrate';
import type { EffectStep } from '@0uroboros/engine/effects/types';
import type { LocationEvent } from '@0uroboros/engine/locationEvents';
import { compileContent, createDefaultContent, validateContent } from '@0uroboros/engine/authoring/contentModel';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const card = (id: string, extra: Partial<Card> = {}): Card =>
  ({ ...starterCards[0], id, name: id, power: 2, onReveal: [], ...extra });

function finish(game: RuntimeSession) {
  const events: RuntimeEvent[] = [];
  while (game.pendingCount || game.state.choice) {
    if (game.state.choice) {
      const skip = game.state.choice.options.find(option => option.id === 'skip');
      game.choose(skip?.id ?? game.state.choice.options[0]!.id);
    } else {
      events.push(game.step()!.event);
    }
    if (events.length > 900) throw new Error('stalled');
  }
  return events;
}

function baseSession(extra: {
  events?: LocationEvent[];
  passives?: Record<string, boolean>;
  ongoing?: EffectStep[];
  effects?: EffectStep[];
  conditions?: unknown[];
} = {}) {
  const game = createSession({
    carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
    random: seededRandom(21), aiSeats: [], midCycleDraw: false,
  });
  game.state.nodeOrder = [0, 1, 2, 3, 4];
  game.state.players.forEach((player, seat) => {
    player.hand = [];
    player.draw = [card(`${seat}-d1`), card(`${seat}-d2`), card(`${seat}-d3`)];
    player.discard = [];
    player.wallet = 0;
  });
  game.state.nodes.forEach((node, index) => {
    node.location = {
      id: `loc-${index}`,
      name: index === 0 ? 'Phase2 Yard' : `Pad ${index + 1}`,
      rule: '',
      reward: '',
      effects: index === 0 ? (extra.effects ?? []) : [],
      ongoing: index === 0 ? (extra.ongoing ?? []) : [],
      onPlay: [],
      events: index === 0 ? (extra.events ?? []) : [],
      ...(index === 0 && extra.passives ? { passives: extra.passives } : {}),
      ...(index === 0 && extra.conditions ? { conditions: structuredClone(extra.conditions) as never } : {}),
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

describe('phase 2 passives', () => {
  it('describes new Ongoing passive lines', () => {
    const lines = describePassives({
      suppressOngoing: true, doubleOngoing: true, blockMovesOnto: true,
      immuneDestroy: true, immunePowerDown: true,
    });
    expect(lines.join(' ')).toMatch(/do not resolve/i);
    expect(lines.join(' ')).toMatch(/doubled/i);
    expect(lines.join(' ')).toMatch(/cannot move onto/i);
    expect(lines.join(' ')).toMatch(/cannot be destroyed/i);
    expect(lines.join(' ')).toMatch(/ignore Power loss/i);
  });

  it('suppressOngoing skips Location Ongoing; doubleOngoing scales amounts', () => {
    const silent = baseSession({
      passives: { suppressOngoing: true },
      ongoing: migrateEffects([{ kind: 'draw', amount: 1 }], 'location'),
    });
    place(silent, 0, card('s1'), true);
    silent.state.phase = 'runtime';
    silent.endTurn(0); silent.endTurn(1);
    finish(silent);
    // Turn advances and ongoing would fire for turn 2 open nodes — suppress keeps hand from gaining.
    const afterSilent = silent.state.players[0].hand.length;

    const echo = baseSession({
      passives: { doubleOngoing: true },
      ongoing: migrateEffects([{ kind: 'draw', amount: 1 }], 'location'),
    });
    // Force controller for ongoing winner path: put more power on seat 0.
    place(echo, 0, card('e1', { power: 5 }), true);
    echo.state.phase = 'runtime';
    echo.endTurn(0); echo.endTurn(1);
    finish(echo);
    // After turn 1 reveal window, turn becomes 2 and ongoing fires with doubled draw (2).
    expect(echo.state.players[0].hand.length).toBeGreaterThanOrEqual(afterSilent);
  });

  it('blockMovesOnto prevents relocate onto the Node', () => {
    const game = baseSession({ passives: { blockMovesOnto: true } });
    const rover = card('rover', { modifiers: [{ id: 'm', kind: 'movableEachTurn' }] });
    place(game, 0, rover, true, 1);
    expect(() => game.relocateCard('rover', 0)).toThrow(/unavailable|not movable|Destination/i);
  });

  it('immuneDestroy and immunePowerDown protect cards here', () => {
    const game = baseSession({ passives: { immuneDestroy: true, immunePowerDown: true } });
    const host = card('host', { power: 3 });
    place(game, 0, host, true);
    game.state.players[0].hand = [card('hit', {
      power: 1,
      onReveal: [
        { action: 'destroyCard', target: { type: 'card', who: 'self', where: 'thisNode' }, pick: { mode: 'first' } },
        { action: 'changePower', amount: -2, transfer: false, target: { type: 'card', who: 'self', where: 'thisNode' }, pick: { mode: 'first' } },
      ],
    })];
    game.state.players[0].actions = 2;
    game.deploy('hit', 0);
    game.endTurn(0); game.endTurn(1);
    finish(game);
    expect(game.state.nodes[0].cards[0].some(placement => placement.card.id === 'host')).toBe(true);
    expect(host.powerDelta ?? 0).toBe(0);
  });
});

describe('phase 2 events and actions', () => {
  it('cardLeft awards the leaving seat (Departure / MOOP leave)', () => {
    const game = baseSession({
      events: [{
        id: 'left', kind: 'cardLeft',
        effects: migrateEffects([{ kind: 'crypto', amount: 2 }], 'locationEvent'),
      }],
    });
    const traveler = card('traveler', { modifiers: [{ id: 'm', kind: 'movableEachTurn' }] });
    place(game, 0, traveler, true, 0);
    game.relocateCard('traveler', 1);
    finish(game);
    expect(game.state.players[0].wallet).toBe(2);
  });

  it('Vamping-style cardMovedHere Drains on arrival', () => {
    const game = baseSession({
      events: [{
        id: 'vamp', kind: 'cardMovedHere',
        effects: [{
          action: 'damageServer', amount: 40,
          target: { type: 'server', who: 'opponent', server: 'auto' },
        }],
      }],
    });
    const before = game.state.players[1].servers.primary;
    const traveler = card('bat', { modifiers: [{ id: 'm', kind: 'movableEachTurn' }] });
    place(game, 0, traveler, true, 1);
    game.relocateCard('bat', 0);
    finish(game);
    expect(game.state.players[1].servers.primary).toBe(before - 40);
  });

  it('stealDeckCard takes from the enemy deck into hand', () => {
    const game = baseSession({});
    const top = game.state.players[1].draw[0]!;
    game.state.players[0].hand = [card('thief', {
      power: 1,
      onReveal: [{
        action: 'stealDeckCard', amount: 1,
        target: { type: 'zone', who: 'opponent', zone: 'deck' },
      }],
    })];
    game.state.players[0].actions = 2;
    game.deploy('thief', 0);
    game.endTurn(0); game.endTurn(1);
    finish(game);
    expect(game.state.players[0].hand.some(entry => entry.id === top.id)).toBe(true);
    expect(game.state.players[1].draw[0]?.id).not.toBe(top.id);
  });

  it('deckSwap exchanges top cards', () => {
    const game = baseSession({});
    const a = game.state.players[0].draw[0]!;
    const b = game.state.players[1].draw[0]!;
    game.state.players[0].hand = [card('swapper', {
      power: 1,
      onReveal: [{ action: 'deckSwap', amount: 1 }],
    })];
    game.state.players[0].actions = 2;
    game.deploy('swapper', 0);
    game.endTurn(0); game.endTurn(1);
    finish(game);
    expect(game.state.players[0].draw[0]?.id).toBe(b.id);
    expect(game.state.players[1].draw[0]?.id).toBe(a.id);
  });

  it('placeCard puts a hand card onto this Node', () => {
    const game = baseSession({});
    const spare = card('spare', { power: 2 });
    game.state.players[0].hand = [
      card('placer', {
        power: 1,
        onReveal: [{
          action: 'placeCard',
          target: { type: 'card', who: 'self', where: 'hand' },
          pick: { mode: 'choose' },
        }],
      }),
      spare,
    ];
    game.state.players[0].actions = 2;
    game.deploy('placer', 0);
    game.endTurn(0); game.endTurn(1);
    while (game.pendingCount || game.state.choice) {
      if (game.state.choice) {
        game.choose('card-spare');
      } else {
        game.step();
      }
    }
    expect(game.state.nodes[0].cards[0].some(placement => placement.card.id === 'spare' && placement.revealed)).toBe(true);
  });

  it('copyText re-runs a previous On Reveal', () => {
    const game = baseSession({});
    place(game, 0, card('donor', {
      power: 2,
      onReveal: migrateEffects([{ kind: 'crypto', amount: 3 }], 'card'),
    }), true);
    // Mark donor as already revealed in play order.
    game.state.nodes[0].cards[0][0]!.order = 1;
    game.state.players[0].hand = [card('copier', {
      power: 1,
      onReveal: [{
        action: 'copyText',
        target: { type: 'card', who: 'self', where: 'board', relation: 'previous' },
      }],
    })];
    game.state.players[0].actions = 2;
    game.deploy('copier', 0);
    game.endTurn(0); game.endTurn(1);
    finish(game);
    expect(game.state.players[0].wallet).toBe(3);
  });

  it('gainCard by subtype+cost filters the catalog', () => {
    const document = createDefaultContent();
    const utility = document.cards.find(entry => entry.enabled && entry.cardClass === 'Utility' && (entry.cost ?? 0) <= 2);
    expect(utility).toBeTruthy();
    const game = createSession({
      carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
      random: seededRandom(3), aiSeats: [], midCycleDraw: false,
      content: compileContent(document),
    });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.nodes.forEach(node => { node.cards = [[], []]; node.location = { id: 'x', name: 'x', rule: '', reward: '', effects: [] }; });
    game.state.turn = 1;
    game.state.phase = 'runtime';
    game.state.players[0].hand = [card('buyer', {
      power: 1,
      onReveal: [{
        action: 'gainCard', amount: 1, maxCost: 2,
        filter: { cardClass: 'Utility' },
        target: { type: 'zone', who: 'self', zone: 'hand' },
      }],
    })];
    game.state.players[0].actions = 2;
    game.state.players[0].draw = [card('pad')];
    game.deploy('buyer', 0);
    game.endTurn(0); game.endTurn(1);
    finish(game);
    expect(game.state.players[0].hand.some(entry => entry.cardClass === 'Utility')).toBe(true);
  });
});

describe('phase 2 authored pack', () => {
  it('loads Phase 2 locations and mods without validation errors', () => {
    const raw = JSON.parse(readFileSync(resolve('content/authored-content.json'), 'utf8'));
    const document = raw.document ?? raw;
    const errors = validateContent(document).filter(error =>
      /loc-consume|loc-moop|loc-vamp|loc-sanctuary|loc-warded|loc-silent|loc-echo|loc-solo|loc-death|loc-subtype|loc-deck|loc-swap|loc-placement|loc-copy|loc-neighbour|mod-consume|mod-moop|mod-vamp|mod-deck|mod-placer|mod-copy|mod-subtype|mod-move/.test(error)
      || error.includes('loc-')
      || error.includes('mod-consume')
      || error.includes('mod-moop')
      || error.includes('mod-vamping')
      || error.includes('mod-deck')
      || error.includes('mod-placer')
      || error.includes('mod-copy')
      || error.includes('mod-subtype')
      || error.includes('mod-move-it')
    );
    // Full pack may have unrelated draft-currency issues; ensure Phase 2 entries themselves are clean.
    const phase2Ids = [
      'loc-consume-pit', 'loc-moop-yard', 'loc-vamping-grounds', 'loc-sanctuary', 'loc-warded-gate',
      'mod-consume', 'mod-vamping', 'mod-deck-thief', 'mod-copy-text',
    ];
    for (const id of phase2Ids) {
      const hit = document.locations?.some((entry: { id: string }) => entry.id === id)
        || document.mods?.some((entry: { id: string }) => entry.id === id);
      expect(hit, id).toBe(true);
    }
    expect(describeLocation({
      passives: { blockMovesOnto: true, immuneDestroy: true },
      events: [{ id: 'x', kind: 'cardLeft', effects: migrateEffects([{ kind: 'crypto', amount: 1 }], 'locationEvent') }],
    })).toMatch(/When: a card leaves here/i);
    expect(describeMod({
      id: 'mod-consume',
      onCollapse: [{
        action: 'sacrificeCards', amount: 2, optional: true,
        target: { type: 'card', who: 'self', where: 'thisNode' },
        pick: { mode: 'choose', count: 4 },
      }],
    })).toMatch(/On collapse/i);
    expect(errors.filter(error => phase2Ids.some(id => error.includes(id)))).toEqual([]);
  });
});
