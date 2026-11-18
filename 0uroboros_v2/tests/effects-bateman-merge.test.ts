import { describe, expect, it } from 'vitest';
import { describeCardIf } from '@0uroboros/engine/effects/cardIfs';
import { describeStep } from '@0uroboros/engine/effects/catalog';
import { describeTrigger } from '@0uroboros/engine/effects/triggers';
import { compileContent, normalizeDocument, type ContentDocument } from '@0uroboros/engine/authoring/contentModel';
import { starterCards, type Card } from '@0uroboros/engine/game';
import { createSession, seededRandom, type RuntimeSession } from '@0uroboros/engine/runtime';
import authored from '../content/authored-content.json';

const pad = (id: string, extra: Partial<Card> = {}): Card =>
  ({ ...starterCards[0], id, name: id, power: 1, onReveal: [], ...extra });

function finish(game: RuntimeSession) {
  let n = 0;
  while (game.pendingCount || game.state.choice) {
    if (game.state.choice) {
      const open = game.state.choice.options.filter(option => !option.disabled);
      game.choose((open[0] ?? game.state.choice.options[0]!).id, game.state.choice.owner);
    } else game.step();
    if (++n > 800) throw new Error('stalled');
  }
}

function session(): RuntimeSession {
  const game = createSession({
    carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
    random: seededRandom(11), aiSeats: [], midCycleDraw: false,
  });
  game.state.nodeOrder = [0, 1, 2, 3, 4];
  game.state.players.forEach((player, seat) => {
    player.hand = [];
    player.draw = [pad(`pad-${seat}-a`), pad(`pad-${seat}-b`), pad(`pad-${seat}-c`)];
    player.discard = [];
    player.wallet = 0;
  });
  game.state.turn = 1;
  game.state.phase = 'runtime';
  return game;
}

describe('protect Ongoing + When describe', () => {
  it('describes new protective Ongoing and When events', () => {
    expect(describeTrigger({ kind: 'protectCrypto' })).toMatch(/Crypto/);
    expect(describeTrigger({ kind: 'protectDestroy' })).toMatch(/destroyed/);
    expect(describeTrigger({ kind: 'protectDeckAccess' })).toMatch(/access/);
    expect(describeTrigger({
      kind: 'when', event: 'enemyDrainsBackup', then: [{ action: 'draw', amount: 1, target: { type: 'player', who: 'self' } }],
    })).toMatch(/Backup/);
    expect(describeTrigger({
      kind: 'when', event: 'cardMovedHere', then: [{ action: 'draw', amount: 1, target: { type: 'player', who: 'self' } }],
    })).toMatch(/moves here/);
    expect(describeTrigger({
      kind: 'whenPlayed',
      match: { definitionIds: ['glitch', 'liaison'] },
      scope: 'thisNode',
      then: [{ action: 'destroyCard', target: { type: 'card', who: 'opponent', where: 'thisNode' }, pick: { mode: 'random' } }],
    })).toMatch(/2 named cards/);
    expect(describeCardIf({ kind: 'firstRevealed', scope: 'cycle', then: [] })).toMatch(/First/);
    expect(describeStep({ action: 'reclaimStolen' }, 'card')).toMatch(/Reclaim/);
    expect(describeStep({
      action: 'merge', absorbPower: true,
      target: { type: 'card', who: 'opponent', where: 'thisNode' },
      pick: { mode: 'random' },
    }, 'card')).toMatch(/absorbing/);
  });

  it('whenPlayed fires for any listed definitionId', () => {
    const game = session();
    game.state.nodes[0].cards[0].push({
      card: pad('hunter', {
        triggers: [{
          kind: 'whenPlayed',
          match: { definitionIds: ['glitch', 'liaison-x'] },
          scope: 'thisNode',
          then: [{ action: 'gainCrypto', amount: 1, target: { type: 'player', who: 'self' } }],
        }],
      }),
      owner: 0, node: 0, order: 1, revealed: true,
    });
    const before = game.state.players[0].wallet;
    game.state.players[1].hand = [pad('bug', { definitionId: 'glitch', power: 1 })];
    game.deploy('bug', 0, 1);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.players[0].wallet).toBe(before + 1);
  });

  it('whenPlayed destroy trigger relation removes the played named card', () => {
    const game = session();
    game.state.nodes[0].cards[0].push({
      card: pad('hunter', {
        triggers: [{
          kind: 'whenPlayed',
          match: { definitionIds: ['glitch', 'Glitch-B'] },
          scope: 'thisNode',
          then: [{
            action: 'destroyCard',
            target: { type: 'card', who: 'any', where: 'board', relation: 'trigger' },
          }],
        }],
      }),
      owner: 0, node: 0, order: 1, revealed: true,
    });
    game.state.players[1].hand = [pad('bug', { definitionId: 'glitch', power: 1 })];
    game.deploy('bug', 0, 1);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.nodes[0].cards[1].some(entry => (entry.card.definitionId ?? entry.card.id) === 'glitch')).toBe(false);
    expect(game.state.players[1].destroyed.some(card => (card.definitionId ?? card.id) === 'glitch')).toBe(true);
  });

  it('protectCrypto blocks enemy bump/steal', () => {
    const game = session();
    game.state.nodes[0].cards[0].push({
      card: pad('shield', { triggers: [{ kind: 'protectCrypto' }] }),
      owner: 0, node: 0, order: 1, revealed: true,
    });
    game.state.players[0].wallet = 5;
    game.state.players[1].hand = [pad('thief', {
      onReveal: [{
        action: 'stealCrypto', amount: 2,
        target: { type: 'zone', who: 'opponent', zone: 'wallet' },
      }],
    })];
    game.deploy(game.state.players[1].hand[0].id, 0, 1);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.players[0].wallet).toBe(5);
  });

  it('protectDestroy blocks destroyCard', () => {
    const game = session();
    game.state.nodes[0].cards[0].push({
      card: pad('ward', { triggers: [{ kind: 'protectDestroy' }] }),
      owner: 0, node: 0, order: 1, revealed: true,
    });
    const victim = pad('prey', { power: 3 });
    game.state.nodes[0].cards[0].push({
      card: victim, owner: 0, node: 0, order: 2, revealed: true,
    });
    game.state.players[1].hand = [pad('killer', {
      onReveal: [{
        action: 'destroyCard',
        target: { type: 'card', who: 'opponent', where: 'thisNode' },
        pick: { mode: 'choose' },
      }],
    })];
    game.deploy(game.state.players[1].hand[0].id, 0, 1);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.nodes[0].cards[0].some(entry => entry.card.id === 'prey')).toBe(true);
    expect(game.state.players[0].destroyed.some(card => card.id === 'prey')).toBe(false);
  });
});

describe('moveDir', () => {
  it('emits blocked moveDir event at the left edge of playable Nodes', () => {
    const game = createSession({
      carryover: true, priorityPreference: 'higher', strategicMarket: true, evaluationContent: true,
      random: seededRandom(11), aiSeats: [], midCycleDraw: false, middleNodesOnly: true,
    });
    game.state.nodeOrder = [0, 1, 2, 3, 4];
    game.state.players.forEach((player, seat) => {
      player.hand = [];
      player.draw = [pad(`pad-${seat}-a`), pad(`pad-${seat}-b`), pad(`pad-${seat}-c`)];
      player.discard = [];
      player.wallet = 0;
    });
    game.state.turn = 1;
    game.state.phase = 'runtime';
    // Playable Nodes are 1–3; left from Node 1 is off the board.
    game.state.players[0].hand = [pad('edge', {
      power: 1,
      onReveal: [{
        action: 'moveCard', moveDir: 'left',
        target: { type: 'card', who: 'self', where: 'thisNode', relation: 'self' },
      }],
    })];
    game.deploy('edge', 1, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    const moves: { amount?: number; text: string }[] = [];
    let n = 0;
    while (game.pendingCount || game.state.choice) {
      if (game.state.choice) {
        const open = game.state.choice.options.filter(option => !option.disabled);
        game.choose((open[0] ?? game.state.choice.options[0]!).id, game.state.choice.owner);
      } else {
        const stepped = game.step();
        const ev = stepped?.event;
        if (ev?.kind === 'move') moves.push({ amount: ev.amount, text: ev.text });
      }
      if (++n > 500) throw new Error('stalled');
    }
    expect(game.state.nodes[1].cards[0].some(entry => entry.card.id === 'edge')).toBe(true);
    expect(moves.some(entry => entry.amount === 0 || /can.?t move/i.test(entry.text))).toBe(true);
  });

  it('moves right onto an open adjacent Node', () => {
    const game = session();
    const mover = pad('slider', {
      power: 2,
      onReveal: [{
        action: 'moveCard', moveDir: 'right',
        target: { type: 'card', who: 'self', where: 'thisNode', relation: 'self' },
      }],
    });
    game.state.players[0].hand = [mover];
    game.deploy('slider', 1, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.nodes[2].cards[0].some(entry => entry.card.id === 'slider')).toBe(true);
    expect(game.state.nodes[1].cards[0].some(entry => entry.card.id === 'slider')).toBe(false);
  });
});

describe('Bateman reclaimStolen', () => {
  it('Business Card content uses reclaimStolen', () => {
    const document = normalizeDocument(((authored as { document?: unknown }).document ?? authored) as never) as ContentDocument;
    const pack = compileContent(document);
    const business = pack.cards.find(entry => (entry.definitionId ?? entry.id) === 'card-hwz1k87f');
    expect(business).toBeTruthy();
    expect(business!.onReveal?.[0]?.action).toBe('reclaimStolen');
    expect(business!.onCollapse ?? []).toHaveLength(0);
  });

  it('swaps seats and re-reveals the stolen card; no-op when none here', () => {
    const game = session();
    const stolen = pad('loot', {
      power: 2,
      stolenFrom: 0,
      onReveal: [{ action: 'gainCrypto', amount: 1, target: { type: 'player', who: 'self' } }],
    });
    game.state.nodes[0].cards[1].push({
      card: stolen, owner: 1, node: 0, order: 1, revealed: true,
    });
    const beforeWallet = game.state.players[0].wallet;
    game.state.players[0].hand = [pad('biz', {
      cardClass: 'Runtime',
      onReveal: [{ action: 'reclaimStolen' }],
    })];
    game.deploy('biz', 0, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.nodes[0].cards[0].some(entry => entry.card.id === 'loot')).toBe(true);
    expect(game.state.nodes[0].cards[1].some(entry => entry.card.id === 'biz')).toBe(true);
    expect(stolen.stolenFrom).toBeUndefined();
    expect(game.state.players[0].wallet).toBe(beforeWallet + 1);

    // Alone: no stolen card → no-op
    const alone = session();
    alone.state.players[0].hand = [pad('biz2', {
      cardClass: 'Runtime',
      onReveal: [{ action: 'reclaimStolen' }],
    })];
    alone.deploy('biz2', 0, 0);
    alone.endTurn(0);
    try { alone.endTurn(1); } catch { /* */ }
    finish(alone);
    expect(alone.state.nodes[0].cards[0].some(entry => entry.card.id === 'biz2')).toBe(true);
  });

  it('stamps stolenFrom on stealDeckCard', () => {
    const game = session();
    const top = pad('secret', { power: 3 });
    game.state.players[1].draw = [top, pad('rest')];
    game.state.players[0].hand = [pad('bateman', {
      onReveal: [{
        action: 'stealDeckCard', amount: 1,
        target: { type: 'zone', who: 'opponent', zone: 'deck' },
      }],
    })];
    game.deploy('bateman', 0, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    const held = game.state.players[0].hand.find(card => card.id === 'secret');
    expect(held?.stolenFrom).toBe(1);
  });
});

describe('merge + absorbPower', () => {
  it('removes the victim without destroy bus and absorbs Power', () => {
    const game = session();
    let destroyFires = 0;
    game.state.nodes[0].cards[0].push({
      card: pad('mosquito', {
        triggers: [{
          kind: 'when', event: 'anyCardDestroyed',
          then: [{ action: 'gainCrypto', amount: 9, target: { type: 'player', who: 'self' } }],
        }],
      }),
      owner: 0, node: 0, order: 1, revealed: true,
    });
    const victim = pad('meal', { power: 4 });
    game.state.nodes[0].cards[1].push({
      card: victim, owner: 1, node: 0, order: 2, revealed: true,
    });
    const merger = pad('hydra', {
      power: 2,
      onReveal: [{
        action: 'merge', absorbPower: true,
        target: { type: 'card', who: 'opponent', where: 'thisNode' },
        pick: { mode: 'random' },
      }],
    });
    game.state.players[0].hand = [merger];
    const walletBefore = game.state.players[0].wallet;
    game.deploy('hydra', 0, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.nodes[0].cards[1].some(entry => entry.card.id === 'meal')).toBe(false);
    expect(game.state.players[1].destroyed.some(card => card.id === 'meal')).toBe(false);
    expect(game.state.players[0].wallet).toBe(walletBefore); // mosquito did not fire
    const live = game.state.nodes[0].cards[0].find(entry => entry.card.id === 'hydra');
    expect(live).toBeTruthy();
    expect((live!.card.powerDelta ?? 0)).toBeGreaterThanOrEqual(4);
    destroyFires = game.state.players[0].wallet - walletBefore;
    expect(destroyFires).toBe(0);
  });

  it('If two at Location → Merge absorbs the other copy into one', () => {
    const game = session();
    const def = 'twin-def';
    game.state.nodes[0].cards[0].push({
      card: pad('twin-a', { definitionId: def, power: 3 }),
      owner: 0, node: 0, order: 1, revealed: true,
    });
    game.state.players[0].hand = [pad('twin-b', {
      definitionId: def,
      power: 2,
      ifs: [{
        kind: 'twoAtLocation',
        match: { this: true },
        then: [{
          action: 'merge', absorbPower: true,
          target: { type: 'card', who: 'self', where: 'thisNode', filter: { this: true } },
          pick: { mode: 'random' },
        }],
      }],
    })];
    game.deploy('twin-b', 0, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    const lane = game.state.nodes[0].cards[0];
    expect(lane.some(entry => entry.card.id === 'twin-a')).toBe(false);
    expect(lane.some(entry => entry.card.id === 'twin-b')).toBe(true);
    expect(lane.filter(entry => (entry.card.definitionId ?? entry.card.id) === def)).toHaveLength(1);
    const survivor = lane.find(entry => entry.card.id === 'twin-b')!;
    expect((survivor.card.powerDelta ?? 0)).toBeGreaterThanOrEqual(3);
  });

  it('only the second reveal Merges — both copies with the If do not wipe each other', () => {
    const game = session();
    const def = 'batz-mutual';
    const mergeIf = [{
      kind: 'twoAtLocation' as const,
      match: { this: true },
      then: [{
        action: 'merge' as const,
        // choose would open a modal; same-card Merge must auto-resolve.
        pick: { mode: 'choose' as const },
        target: { type: 'card' as const, who: 'self' as const, where: 'thisNode' as const, filter: { this: true } },
      }],
    }];
    game.state.nodes[0].cards[0].push({
      card: pad('batz-first', {
        definitionId: def, name: 'Batz', power: 1,
        onReveal: [{ action: 'gainCrypto', amount: 1, target: { type: 'player', who: 'self' } }],
        ifs: mergeIf,
      }),
      owner: 0, node: 0, order: 1, revealed: true,
    });
    game.state.players[0].hand = [pad('batz-second', {
      definitionId: def, name: 'Batz', power: 1,
      onReveal: [{ action: 'gainCrypto', amount: 1, target: { type: 'player', who: 'self' } }],
      ifs: mergeIf,
    })];
    let sawMergeChoice = false;
    game.deploy('batz-second', 0, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    let n = 0;
    while (game.pendingCount || game.state.choice) {
      if (game.state.choice) {
        if (/merge/i.test(game.state.choice.prompt) || game.state.choice.verb === 'Merge') sawMergeChoice = true;
        const open = game.state.choice.options.filter(option => !option.disabled);
        game.choose((open[0] ?? game.state.choice.options[0]!).id, game.state.choice.owner);
      } else game.step();
      if (++n > 800) throw new Error('stalled');
    }
    const lane = game.state.nodes[0].cards[0];
    expect(sawMergeChoice).toBe(false);
    expect(lane).toHaveLength(1);
    expect(lane[0].card.id).toBe('batz-second');
    expect(lane[0].card.onReveal?.length).toBe(2);
  });

  it('same-card Merge stacks On Reveal (two Batz → double Crypto and draw next play)', () => {
    const game = session();
    const def = 'batz-def';
    const batzEffects = [
      { action: 'gainCrypto' as const, amount: 1, target: { type: 'player' as const, who: 'self' as const } },
      { action: 'draw' as const, amount: 1, target: { type: 'player' as const, who: 'self' as const } },
    ];
    game.state.nodes[0].cards[0].push({
      card: pad('batz-a', { definitionId: def, name: 'Batz', power: 1, onReveal: batzEffects }),
      owner: 0, node: 0, order: 1, revealed: true,
    });
    game.state.players[0].hand = [pad('batz-b', {
      definitionId: def,
      name: 'Batz',
      power: 1,
      onReveal: batzEffects,
      ifs: [{
        kind: 'twoAtLocation',
        match: { this: true },
        then: [{
          action: 'merge',
          target: { type: 'card', who: 'self', where: 'thisNode', filter: { this: true } },
          pick: { mode: 'choose' },
        }],
      }],
    })];
    game.deploy('batz-b', 0, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    const survivor = game.state.nodes[0].cards[0].find(entry => entry.card.id === 'batz-b')!;
    expect(survivor).toBeTruthy();
    expect(survivor.card.onReveal?.length).toBe(4);

    // Later play of the stacked copy runs both packages.
    game.state.turn = 1;
    game.state.phase = 'runtime';
    game.state.turnReady = [false, false];
    game.state.players[0].hand = [{ ...structuredClone(survivor.card), id: 'batz-stacked' }];
    game.state.nodes.forEach(node => { node.cards = [[], []]; });
    const wallet = game.state.players[0].wallet;
    const handBeforeDeploy = game.state.players[0].hand.length;
    game.deploy('batz-stacked', 1, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.players[0].wallet).toBe(wallet + 2);
    // Drew twice from the stacked package (deploy consumed 1 from hand).
    expect(game.state.players[0].hand.length).toBeGreaterThanOrEqual(handBeforeDeploy - 1 + 2);
  });

  it('describeStep names merge-with-this-card targets', () => {
    expect(describeStep({
      action: 'merge', absorbPower: true,
      target: { type: 'card', who: 'self', where: 'thisNode', filter: { this: true } },
      pick: { mode: 'random' },
    }, 'card')).toMatch(/another copy of this card/);
  });

  it('ignores face-down victims', () => {
    const game = session();
    game.state.nodes[0].cards[1].push({
      card: pad('hidden', { power: 5 }), owner: 1, node: 0, order: 1, revealed: false,
    });
    game.state.players[0].hand = [pad('hungry', {
      power: 1,
      onReveal: [{
        action: 'merge', absorbPower: true,
        target: { type: 'card', who: 'opponent', where: 'thisNode' },
        pick: { mode: 'random' },
      }],
    })];
    game.deploy('hungry', 0, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.nodes[0].cards[1].some(entry => entry.card.id === 'hidden')).toBe(true);
  });
});

describe('If bus', () => {
  it('fires firstRevealed this Cycle', () => {
    const game = session();
    game.state.players[0].hand = [pad('firsty', {
      power: 1,
      ifs: [{
        kind: 'firstRevealed', scope: 'cycle',
        then: [{ action: 'gainCrypto', amount: 3, target: { type: 'player', who: 'self' } }],
      }],
    })];
    const before = game.state.players[0].wallet;
    game.deploy('firsty', 0, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.players[0].wallet).toBe(before + 3);
  });

  it('fires enemyPlayedHere on a host', () => {
    const game = session();
    game.state.nodes[0].cards[0].push({
      card: pad('sentry', {
        ifs: [{
          kind: 'enemyPlayedHere',
          match: { cardClass: 'Action' },
          then: [{ action: 'gainCrypto', amount: 2, target: { type: 'player', who: 'self' } }],
        }],
      }),
      owner: 0, node: 0, order: 1, revealed: true,
    });
    game.state.players[1].hand = [pad('intruder', { cardClass: 'Action', power: 1 })];
    const before = game.state.players[0].wallet;
    game.deploy('intruder', 0, 1);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.players[0].wallet).toBe(before + 2);
  });
});

describe('When emits', () => {
  it('fires when cardMovedHere', () => {
    const game = session();
    game.state.nodes[2].cards[0].push({
      card: pad('watcher', {
        triggers: [{
          kind: 'when', event: 'cardMovedHere',
          then: [{ action: 'gainCrypto', amount: 1, target: { type: 'player', who: 'self' } }],
        }],
      }),
      owner: 0, node: 2, order: 1, revealed: true,
    });
    game.state.players[0].hand = [pad('nomad', {
      power: 1,
      onReveal: [{
        action: 'moveCard', moveDir: 'right',
        target: { type: 'card', who: 'self', where: 'thisNode', relation: 'self' },
      }],
    })];
    const before = game.state.players[0].wallet;
    game.deploy('nomad', 1, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    finish(game);
    expect(game.state.nodes[2].cards[0].some(entry => entry.card.id === 'nomad')).toBe(true);
    expect(game.state.players[0].wallet).toBe(before + 1);
  });
});
