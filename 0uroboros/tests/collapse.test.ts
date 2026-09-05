/**
 * Wave Collapse ordering, Location rewards, Circuit Reward separation, and the
 * mid-Collapse endgame interruption.
 */

import { describe, expect, it } from 'vitest';
import {
  clearLocations,
  createHarness,
  openNodes,
  placeCardAtNode,
  setLocation,
} from './helpers';
import {
  destroyUnrevealedCards,
  runWaveCollapse,
} from '../src/game/engine/collapse';
import { tryEnterEffectBank } from '../src/game/engine/zones';

describe('Unrevealed cards at Collapse', () => {
  it('destroys any card still unrevealed', () => {
    const { state } = createHarness();
    openNodes(state, [0]);
    const hidden = placeCardAtNode(state, '0', 'cipher_runner', 0, { revealed: false });
    const shown = placeCardAtNode(state, '0', 'cipher_runner', 0, { revealed: true });

    destroyUnrevealedCards(state);
    expect(state.cards[hidden].zone).toBe('destroyed');
    expect(state.cards[shown].zone).toBe('node');
  });
});

describe('Wave Collapse resolution', () => {
  it('resolves Nodes 1 through 5 in order and marks them collapsed', () => {
    const { state, config, random } = createHarness();
    clearLocations(state);
    openNodes(state, [0, 1, 2, 3, 4]);

    const result = runWaveCollapse(state, config, random);
    expect(result.resolvedNodes).toEqual([0, 1, 2, 3, 4]);
    state.nodes.forEach((node) => {
      expect(node.state).toBe('collapsed');
    });
  });

  it('grants a Location reward to the Node winner', () => {
    const { state, config, random } = createHarness();
    clearLocations(state);
    openNodes(state, [0]);
    setLocation(state, 0, 'occult_archive'); // winner gains 2 Victory Points
    placeCardAtNode(state, '0', 'monolith_core', 0, { revealed: true });

    runWaveCollapse(state, config, random);
    expect(state.players['0'].victoryPoints).toBe(2);
    expect(state.players['1'].victoryPoints).toBe(0);
  });

  it('grants a Location reward to both players when the Node is tied', () => {
    const { state, config, random } = createHarness();
    clearLocations(state);
    openNodes(state, [0]);
    setLocation(state, 0, 'occult_archive');
    placeCardAtNode(state, '0', 'cipher_runner', 0, { revealed: true });
    placeCardAtNode(state, '1', 'cipher_runner', 0, { revealed: true });

    runWaveCollapse(state, config, random);
    expect(state.players['0'].victoryPoints).toBe(2);
    expect(state.players['1'].victoryPoints).toBe(2);
  });

  it('grants Location rewards using the winner determined after card effects', () => {
    const { state, config, random } = createHarness();
    clearLocations(state);
    openNodes(state, [0]);
    setLocation(state, 0, 'data_exchange'); // winner gains 2 Crypto

    // Player 0 leads 6 to 3 until Recursive husk trashes itself on collapse,
    // which removes its Power and hands the Node to player 1. Location rewards
    // resolve after the final Power comparison, so player 1 collects.
    placeCardAtNode(state, '0', 'recursive_husk', 0, { revealed: true });
    placeCardAtNode(state, '1', 'cipher_runner', 0, { revealed: true });

    runWaveCollapse(state, config, random);
    expect(state.players['1'].wallet).toBe(2);
    expect(state.players['0'].wallet).toBe(0);
  });

  it('resolves Location text that does not depend on the winner before card effects', () => {
    const { state, config, random } = createHarness();
    clearLocations(state);
    openNodes(state, [0, 1, 2, 3, 4]);
    // Entanglement lab moves 5% off its own Node regardless of who wins.
    setLocation(state, 0, 'entanglement_lab');
    const before = state.nodes[0].probability;

    runWaveCollapse(state, config, random);
    expect(state.nodes[0].probability).toBe(before - 5);
  });

  it('resolves card onCollapse effects at their Node', () => {
    const { state, config, random } = createHarness();
    clearLocations(state);
    openNodes(state, [0]);
    // Breach daemon deals 150 damage to the opposing Data Center on collapse.
    placeCardAtNode(state, '0', 'breach_daemon', 0, { revealed: true });

    runWaveCollapse(state, config, random);
    expect(state.players['1'].dataCenters.primary.health).toBe(1850);
  });

  it('resolves Effect Bank onCollapse effects after Node 5', () => {
    const { state, config, random } = createHarness();
    clearLocations(state);
    openNodes(state, [0, 1, 2, 3, 4]);

    // Glitch swarm in the Effect Bank fires after all Nodes have resolved.
    const banked = placeCardAtNode(state, '0', 'glitch_swarm', 0, { revealed: true });
    tryEnterEffectBank(state, state.cards[banked]);

    runWaveCollapse(state, config, random);
    expect(state.players['1'].dataCenters.primary.health).toBe(1750);
  });

  it('keeps the Circuit Reward separate from Location rewards', () => {
    const { state, config, random } = createHarness();
    clearLocations(state);
    openNodes(state, [0, 1, 2, 3, 4]);
    setLocation(state, 0, 'occult_archive');
    placeCardAtNode(state, '0', 'monolith_core', 0, { revealed: true });

    const result = runWaveCollapse(state, config, random);
    // The Location reward already applied during Node 1's collapse.
    expect(state.players['0'].victoryPoints).toBe(2);
    // The Circuit Reward is a separate, later selection that only names eligibility.
    expect(result.selectedNode).not.toBeNull();
    expect(result.circuitRewardEligible.length).toBeGreaterThan(0);
  });

  it('selects a Node using the final probability weights', () => {
    const { state, config, random } = createHarness();
    clearLocations(state);
    openNodes(state, [0, 1, 2, 3, 4]);
    // Force all probability onto Node 3.
    state.nodes.forEach((node, index) => {
      node.probability = index === 2 ? 100 : 0;
    });

    const result = runWaveCollapse(state, config, random);
    expect(result.selectedNode).toBe(2);
  });

  it('gives both players a Circuit Reward instance when the selected Node is tied', () => {
    const { state, config, random } = createHarness();
    clearLocations(state);
    openNodes(state, [0, 1, 2, 3, 4]);
    state.nodes.forEach((node, index) => {
      node.probability = index === 0 ? 100 : 0;
    });
    // Node 1 ends tied.
    placeCardAtNode(state, '0', 'cipher_runner', 0, { revealed: true });
    placeCardAtNode(state, '1', 'cipher_runner', 0, { revealed: true });

    const result = runWaveCollapse(state, config, random);
    expect(result.selectedNode).toBe(0);
    expect(result.circuitRewardEligible.sort()).toEqual(['0', '1']);
  });
});

describe('Endgame interruption during Collapse', () => {
  it('finishes the current Node then stops, skipping later Nodes and the reward', () => {
    const { state, config, random } = createHarness();
    clearLocations(state);
    openNodes(state, [0, 1, 2, 3, 4]);

    // Leave player 1 one hit from losing both Data Centers.
    state.players['1'].dataCenters.primary.health = 0;
    state.players['1'].dataCenters.primary.destroyed = true;
    state.players['1'].dataCenters.backup.health = 100;

    // Node 1 destroys the Backup Data Center.
    placeCardAtNode(state, '0', 'breach_daemon', 0, { revealed: true });
    // Node 3 would also deal damage but must never resolve.
    placeCardAtNode(state, '0', 'breach_daemon', 2, { revealed: true });

    const result = runWaveCollapse(state, config, random);

    expect(result.endedEarly).toBe(true);
    expect(result.resolvedNodes).toEqual([0]);
    // No Circuit Reward selection occurs when Collapse stops early.
    expect(result.selectedNode).toBeNull();
    expect(result.circuitRewardEligible).toEqual([]);
    // Later Nodes never collapsed.
    expect(state.nodes[2].state).not.toBe('collapsed');
  });

  it('awards destruction Victory Points before stopping', () => {
    const { state, config, random } = createHarness();
    clearLocations(state);
    openNodes(state, [0]);
    state.players['1'].dataCenters.primary.health = 0;
    state.players['1'].dataCenters.primary.destroyed = true;
    state.players['1'].dataCenters.backup.health = 100;

    placeCardAtNode(state, '0', 'breach_daemon', 0, { revealed: true });
    runWaveCollapse(state, config, random);

    // Destroying the Backup Data Center awards 12 Victory Points.
    expect(state.players['0'].victoryPoints).toBe(config.backupDestructionVP);
  });
});
