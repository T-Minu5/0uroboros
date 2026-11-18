import { describe, expect, it } from 'vitest';
import { compileContent, normalizeDocument, type ContentDocument } from '@0uroboros/engine/authoring/contentModel';
import { starterCards, type Card } from '@0uroboros/engine/game';
import { createSession, seededRandom, type RuntimeSession } from '@0uroboros/engine/runtime';
import authored from '../content/authored-content.json';

const pad = (id: string): Card => ({ ...starterCards[0], id, name: id, power: 1, onReveal: [] });

function finish(game: RuntimeSession) {
  let n = 0;
  while (game.pendingCount || game.state.choice) {
    if (game.state.choice) {
      const open = game.state.choice.options.filter(option => !option.disabled);
      game.choose((open[0] ?? game.state.choice.options[0]!).id, game.state.choice.owner);
    } else game.step();
    if (++n > 500) throw new Error('stalled');
  }
}

describe('Astra Wraith discard', () => {
  it('requires a discard — no min:0 / Don’t discard path', () => {
    const document = normalizeDocument(((authored as { document?: unknown }).document ?? authored) as never) as ContentDocument;
    const pack = compileContent(document);
    const wraith = pack.cards.find(entry => entry.name === 'Astra Wraith' || (entry.definitionId ?? entry.id) === 'card-tgyg8mea');
    expect(wraith).toBeTruthy();
    const discard = (wraith!.onReveal ?? []).find(step => step.action === 'discardCards');
    expect(discard).toBeTruthy();
    expect(discard!.min).toBeUndefined();
    expect(discard!.optional).toBeUndefined();

    const game = createSession({
      content: pack, strategicMarket: true, evaluationContent: true, carryover: true, priorityPreference: 'higher',
      random: seededRandom(11), midCycleDraw: false, aiSeats: [],
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
    game.state.nodes[0].cards[1].push({
      card: { ...pad('foe'), power: 5 }, owner: 1, node: 0, order: 1, revealed: true,
    });
    game.state.players[1].hand = [pad('enemy-a'), pad('enemy-b')];
    game.state.players[0].hand = [{ ...structuredClone(wraith!), id: 'wraith-1' }];
    game.deploy('wraith-1', 0, 0);
    game.endTurn(0);
    try { game.endTurn(1); } catch { /* */ }
    let sawDiscard = false;
    let n = 0;
    while (game.pendingCount || game.state.choice) {
      if (game.state.choice) {
        const choice = game.state.choice;
        if (/discard/i.test(choice.prompt) || choice.verb === 'Discard') {
          sawDiscard = true;
          expect(choice.select?.min ?? 1).toBe(1);
          expect(choice.options.some(option => option.id === 'skip' || /don.?t/i.test(option.label))).toBe(false);
          const pick = choice.options.find(option => !option.disabled)!;
          game.choose(pick.id, choice.owner);
        } else {
          const open = choice.options.filter(option => !option.disabled);
          game.choose((open[0] ?? choice.options[0]!).id, choice.owner);
        }
      } else game.step();
      if (++n > 500) throw new Error('stalled');
    }
    expect(sawDiscard).toBe(true);
    expect(game.state.players[1].hand.length).toBe(1);
    expect(game.state.players[1].discard.length).toBe(1);
  });
});
