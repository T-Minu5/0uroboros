/**
 * Information visibility boundary.
 *
 * Privacy is enforced by playerView on the server side, not by the client.
 */

import { describe, expect, it } from 'vitest';
import { addToHand, createHarness, openNodes, placeCardAtNode } from './helpers';
import { playerView } from '../src/game/playerView';
import { moveToDestroyed, moveToDiscard, moveToTrash } from '../src/game/engine/zones';

describe('Private information', () => {
  it('hides the opponent hand contents while preserving the count', () => {
    const { state } = createHarness();
    const own = addToHand(state, '0', 'monolith_core');
    const theirs = addToHand(state, '1', 'monolith_core');

    const view = playerView(state, '0');
    expect(view.cards[own].cardDefId).toBe('monolith_core');
    expect(view.cards[theirs].cardDefId).toBe('hidden');
    expect(view.hands['1']).toHaveLength(1);
    expect(view.hands['1'][0]).toBe('hidden');
  });

  it('hides the identity of an opponent face-down card at a Node', () => {
    const { state } = createHarness();
    openNodes(state, [0]);
    const hidden = placeCardAtNode(state, '1', 'monolith_core', 0, { revealed: false });

    const view = playerView(state, '0');
    // The commitment is visible as a card at the Node, but not its identity.
    expect(view.cards[hidden].zone).toBe('node');
    expect(view.cards[hidden].nodeIndex).toBe(0);
    expect(view.cards[hidden].cardDefId).toBe('hidden');
  });

  it('lets a player see their own face-down commitments', () => {
    const { state } = createHarness();
    openNodes(state, [0]);
    const own = placeCardAtNode(state, '0', 'monolith_core', 0, { revealed: false });

    const view = playerView(state, '0');
    expect(view.cards[own].cardDefId).toBe('monolith_core');
  });

  it('hides Draw pile order and contents', () => {
    const { state } = createHarness();
    const view = playerView(state, '0');
    expect(view.decks['1'].every((id) => id === 'hidden')).toBe(true);
    // The count remains available for display.
    expect(view.decks['1']).toHaveLength(10);
    expect(view.decks['0']).toEqual(state.decks['0']);
  });

  it('hides opponent Discard pile contents', () => {
    const { state } = createHarness();
    const id = addToHand(state, '1', 'monolith_core');
    moveToDiscard(state, state.cards[id]);

    const view = playerView(state, '0');
    expect(view.discards['1'][0]).toBe('hidden');
    expect(view.cards[id].cardDefId).toBe('hidden');
  });

  it('shows only the viewer their own pending choices', () => {
    const { state } = createHarness();
    state.pendingChoices = [
      { id: 'a', player: '0', prompt: 'Choose', options: [], optional: false },
      { id: 'b', player: '1', prompt: 'Choose', options: [], optional: false },
    ];

    expect(playerView(state, '0').pendingChoices.map((c) => c.id)).toEqual(['a']);
    expect(playerView(state, '1').pendingChoices.map((c) => c.id)).toEqual(['b']);
  });
});

describe('Public information', () => {
  it('shows revealed cards at Nodes to both players', () => {
    const { state } = createHarness();
    openNodes(state, [0]);
    const id = placeCardAtNode(state, '1', 'monolith_core', 0, { revealed: true });

    expect(playerView(state, '0').cards[id].cardDefId).toBe('monolith_core');
  });

  it('shows the shared Trash to both players', () => {
    const { state } = createHarness();
    const id = addToHand(state, '1', 'monolith_core');
    moveToTrash(state, state.cards[id]);

    const view = playerView(state, '0');
    expect(view.trash).toContain(id);
    expect(view.cards[id].cardDefId).toBe('monolith_core');
  });

  it('shows Destroyed cards to both players', () => {
    const { state } = createHarness();
    const id = addToHand(state, '1', 'monolith_core');
    moveToDestroyed(state, state.cards[id]);

    expect(playerView(state, '0').cards[id].cardDefId).toBe('monolith_core');
  });

  it('shows Effect Bank contents to both players', () => {
    const { state } = createHarness();
    const id = placeCardAtNode(state, '1', 'serpent_loop', 0);
    state.cards[id].zone = 'effectBank';
    state.effectBanks['1'][0] = id;

    expect(playerView(state, '0').cards[id].cardDefId).toBe('serpent_loop');
  });

  it('shows probability, Wallet, and Victory Points to both players', () => {
    const { state } = createHarness();
    state.players['1'].wallet = 7;
    state.players['1'].victoryPoints = 5;

    const view = playerView(state, '0');
    expect(view.players['1'].wallet).toBe(7);
    expect(view.players['1'].victoryPoints).toBe(5);
    expect(view.nodes.map((n) => n.probability)).toEqual([30, 25, 20, 15, 10]);
  });

  it('shows Draft market supply to both players', () => {
    const { state } = createHarness();
    const view = playerView(state, '0');
    expect(view.market.base[0].supply).toBe(state.market.base[0].supply);
  });
});

describe('Spectator view', () => {
  it('hides both hands from a spectator', () => {
    const { state } = createHarness();
    addToHand(state, '0', 'monolith_core');
    addToHand(state, '1', 'monolith_core');

    const view = playerView(state, null);
    expect(view.hands['0'][0]).toBe('hidden');
    expect(view.hands['1'][0]).toBe('hidden');
  });
});
