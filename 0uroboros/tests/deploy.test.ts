/**
 * Deployment legality, Node capacity, play order, and onPlay/onReveal timing.
 */

import { describe, expect, it } from 'vitest';
import { addToHand, clearLocations, createHarness, openNodes } from './helpers';
import { canDeploy, deploy, legalNodesFor, revealCard } from '../src/game/engine/deploy';
import { cardPower } from '../src/game/engine/power';

describe('Deployment legality', () => {
  it('allows deployment to an unopened Node', () => {
    const { state, config } = createHarness();
    const id = addToHand(state, '0', 'cipher_runner');
    // Node 4 has not opened yet, but committing to it is legal.
    expect(canDeploy(state, '0', id, 3, config).ok).toBe(true);
  });

  it('allows deployment to a previously opened Node', () => {
    const { state, config } = createHarness();
    openNodes(state, [0]);
    const id = addToHand(state, '0', 'cipher_runner');
    expect(canDeploy(state, '0', id, 0, config).ok).toBe(true);
  });

  it('refuses deployment to a collapsed Node', () => {
    const { state, config } = createHarness();
    state.nodes[0].state = 'collapsed';
    const id = addToHand(state, '0', 'cipher_runner');
    const check = canDeploy(state, '0', id, 0, config);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('nodeCollapsed');
  });

  it('refuses to deploy a Crypto card to a Node', () => {
    const { state, config } = createHarness();
    const id = addToHand(state, '0', 'crypto_shard');
    const check = canDeploy(state, '0', id, 0, config);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('notDeployable');
    // No Node is legal for a Crypto card.
    expect(legalNodesFor(state, '0', id, config)).toEqual([]);
  });

  it('refuses to deploy a card that is not in hand', () => {
    const { state, config } = createHarness();
    const check = canDeploy(state, '0', 'nonexistent', 0, config);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('notInHand');
  });

  it('enforces the per-player Node capacity of 4', () => {
    const { state, config, random } = createHarness();
    for (let i = 0; i < config.nodeCapacityPerPlayer; i += 1) {
      const id = addToHand(state, '0', 'cipher_runner');
      expect(canDeploy(state, '0', id, 0, config).ok).toBe(true);
      deploy(state, '0', id, 0, config, random);
    }

    const overflow = addToHand(state, '0', 'cipher_runner');
    const check = canDeploy(state, '0', overflow, 0, config);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('nodeCapacityReached');
  });

  it('tracks capacity per player rather than per Node', () => {
    const { state, config, random } = createHarness();
    for (let i = 0; i < config.nodeCapacityPerPlayer; i += 1) {
      const id = addToHand(state, '0', 'cipher_runner');
      deploy(state, '0', id, 0, config, random);
    }
    // Player 1 still has their own full capacity at the same Node.
    const opponentCard = addToHand(state, '1', 'cipher_runner');
    expect(canDeploy(state, '1', opponentCard, 0, config).ok).toBe(true);
  });

  it('honours a configured capacity change', () => {
    const { state, config, random } = createHarness({ nodeCapacityPerPlayer: 2 });
    for (let i = 0; i < 2; i += 1) {
      const id = addToHand(state, '0', 'cipher_runner');
      deploy(state, '0', id, 0, config, random);
    }
    const overflow = addToHand(state, '0', 'cipher_runner');
    expect(canDeploy(state, '0', overflow, 0, config).ok).toBe(false);
  });

  it('lists all legal Nodes for a deployable card', () => {
    const { state, config } = createHarness();
    state.nodes[2].state = 'collapsed';
    const id = addToHand(state, '0', 'cipher_runner');
    expect(legalNodesFor(state, '0', id, config)).toEqual([0, 1, 3, 4]);
  });
});

describe('Play order', () => {
  it('assigns increasing chronological play order per player', () => {
    const { state, config, random } = createHarness();
    const a = addToHand(state, '0', 'cipher_runner');
    const b = addToHand(state, '0', 'cipher_runner');
    deploy(state, '0', a, 2, config, random);
    deploy(state, '0', b, 0, config, random);

    expect(state.cards[a].playOrder).toBe(0);
    expect(state.cards[b].playOrder).toBe(1);
  });

  it('tracks play order independently per player', () => {
    const { state, config, random } = createHarness();
    const a = addToHand(state, '0', 'cipher_runner');
    const b = addToHand(state, '1', 'cipher_runner');
    deploy(state, '0', a, 0, config, random);
    deploy(state, '1', b, 0, config, random);

    expect(state.cards[a].playOrder).toBe(0);
    expect(state.cards[b].playOrder).toBe(0);
  });
});

describe('Effect timing', () => {
  it('resolves onPlay effects at deployment, before reveal', () => {
    const { state, config, random } = createHarness();
    clearLocations(state);
    // Phase broker moves 5% from the highest Node to its own Node on play.
    const id = addToHand(state, '0', 'phase_broker');
    deploy(state, '0', id, 4, config, random);

    expect(state.cards[id].revealed).toBe(false);
    expect(state.nodes[0].probability).toBe(25);
    expect(state.nodes[4].probability).toBe(15);
  });

  it('resolves onReveal effects only when the card reveals', () => {
    const { state, config, random } = createHarness();
    openNodes(state, [0]);
    // Echo analyst gains 2 Power on reveal.
    const id = addToHand(state, '0', 'echo_analyst');
    deploy(state, '0', id, 0, config, random);

    expect(cardPower(state.cards[id])).toBe(2);
    revealCard(state, id, config, random);
    expect(state.cards[id].revealed).toBe(true);
    expect(cardPower(state.cards[id])).toBe(4);
  });

  it('does not re-resolve onReveal effects on a second reveal call', () => {
    const { state, config, random } = createHarness();
    openNodes(state, [0]);
    const id = addToHand(state, '0', 'echo_analyst');
    deploy(state, '0', id, 0, config, random);

    revealCard(state, id, config, random);
    revealCard(state, id, config, random);
    expect(cardPower(state.cards[id])).toBe(4);
  });

  it('buffs allies without buffing itself', () => {
    const { state, config, random } = createHarness();
    openNodes(state, [0]);
    const ally = addToHand(state, '0', 'cipher_runner');
    const buffer = addToHand(state, '0', 'resonance_array');
    deploy(state, '0', ally, 0, config, random);
    deploy(state, '0', buffer, 0, config, random);

    revealCard(state, ally, config, random);
    revealCard(state, buffer, config, random);

    expect(cardPower(state.cards[ally])).toBe(4);
    expect(cardPower(state.cards[buffer])).toBe(1);
  });

  it('reduces enemy Power at the same Node', () => {
    const { state, config, random } = createHarness();
    openNodes(state, [0]);
    const enemy = addToHand(state, '1', 'cipher_runner');
    const attacker = addToHand(state, '0', 'null_vector');
    deploy(state, '1', enemy, 0, config, random);
    deploy(state, '0', attacker, 0, config, random);

    revealCard(state, enemy, config, random);
    revealCard(state, attacker, config, random);

    expect(cardPower(state.cards[enemy])).toBe(2);
  });

  it('logs no valid target when an effect finds nothing', () => {
    const { state, config, random } = createHarness();
    openNodes(state, [0]);
    // Entropy lance destroys an enemy card, but there is no enemy present.
    const id = addToHand(state, '0', 'entropy_lance');
    deploy(state, '0', id, 0, config, random);
    revealCard(state, id, config, random);

    const messages = state.log.map((entry) => entry.message);
    expect(messages.some((message) => message.includes('no valid target'))).toBe(true);
  });

  it('destroys the lowest Power enemy card at the Node', () => {
    const { state, config, random } = createHarness();
    openNodes(state, [0]);
    const weak = addToHand(state, '1', 'phase_broker'); // Power 1
    const strong = addToHand(state, '1', 'monolith_core'); // Power 9
    const lance = addToHand(state, '0', 'entropy_lance');
    deploy(state, '1', weak, 0, config, random);
    deploy(state, '1', strong, 0, config, random);
    deploy(state, '0', lance, 0, config, random);

    revealCard(state, weak, config, random);
    revealCard(state, strong, config, random);
    revealCard(state, lance, config, random);

    expect(state.cards[weak].zone).toBe('destroyed');
    expect(state.cards[strong].zone).toBe('node');
  });

  it('trashes rather than destroys when the effect says trash', () => {
    const { state, config, random } = createHarness();
    openNodes(state, [0]);
    const target = addToHand(state, '1', 'monolith_core');
    const auditor = addToHand(state, '0', 'void_auditor');
    deploy(state, '1', target, 0, config, random);
    deploy(state, '0', auditor, 0, config, random);

    revealCard(state, target, config, random);
    revealCard(state, auditor, config, random);

    expect(state.cards[target].zone).toBe('trash');
    expect(state.trash).toContain(target);
  });
});
