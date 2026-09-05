/**
 * Data Center damage, healing, destruction, and no-spillover behavior.
 */

import { describe, expect, it } from 'vitest';
import { createHarness } from './helpers';
import {
  damageDataCenter,
  healDataCenter,
  isEliminated,
} from '../src/game/engine/dataCenters';

describe('Data Center damage', () => {
  it('targets Primary first for generic damage', () => {
    const { state, config } = createHarness();
    damageDataCenter(state, '1', 300, config);
    expect(state.players['1'].dataCenters.primary.health).toBe(1700);
    expect(state.players['1'].dataCenters.backup.health).toBe(1500);
  });

  it('targets Backup once Primary is destroyed', () => {
    const { state, config } = createHarness();
    damageDataCenter(state, '1', 2000, config);
    expect(state.players['1'].dataCenters.primary.destroyed).toBe(true);

    damageDataCenter(state, '1', 400, config);
    expect(state.players['1'].dataCenters.backup.health).toBe(1100);
  });

  it('does not spill excess damage between Data Centers', () => {
    const { state, config } = createHarness();
    state.players['1'].dataCenters.primary.health = 50;

    // Primary at 50 takes 300. Primary is destroyed and the remaining 250 vanishes.
    const result = damageDataCenter(state, '1', 300, config);
    expect(result.applied).toBe(50);
    expect(state.players['1'].dataCenters.primary.destroyed).toBe(true);
    expect(state.players['1'].dataCenters.backup.health).toBe(1500);
  });

  it('awards 8 Victory Points for destroying Primary', () => {
    const { state, config } = createHarness();
    const result = damageDataCenter(state, '1', 2000, config);
    expect(result.destroyedDataCenter).toBe('primary');
    expect(result.victoryPointsAwarded).toBe(config.primaryDestructionVP);
    expect(result.victoryPointsAwarded).toBe(8);
  });

  it('awards 12 Victory Points for destroying Backup', () => {
    const { state, config } = createHarness();
    damageDataCenter(state, '1', 2000, config);
    const result = damageDataCenter(state, '1', 1500, config);
    expect(result.destroyedDataCenter).toBe('backup');
    expect(result.victoryPointsAwarded).toBe(12);
  });

  it('does not redirect when an explicitly targeted Data Center is destroyed', () => {
    const { state, config } = createHarness();
    state.players['1'].dataCenters.backup.health = 0;
    state.players['1'].dataCenters.backup.destroyed = true;

    const result = damageDataCenter(state, '1', 500, config, 'backup');
    expect(result.noValidTarget).toBe(true);
    expect(result.applied).toBe(0);
    // Primary is untouched because the effect did not redirect.
    expect(state.players['1'].dataCenters.primary.health).toBe(2000);
  });

  it('can target Backup explicitly while Primary is alive', () => {
    const { state, config } = createHarness();
    damageDataCenter(state, '1', 200, config, 'backup');
    expect(state.players['1'].dataCenters.backup.health).toBe(1300);
    expect(state.players['1'].dataCenters.primary.health).toBe(2000);
  });

  it('reports no valid target when both Data Centers are destroyed', () => {
    const { state, config } = createHarness();
    damageDataCenter(state, '1', 2000, config);
    damageDataCenter(state, '1', 1500, config);
    const result = damageDataCenter(state, '1', 100, config);
    expect(result.noValidTarget).toBe(true);
  });
});

describe('Data Center healing', () => {
  it('cannot exceed maximum health', () => {
    const { state } = createHarness();
    state.players['0'].dataCenters.primary.health = 1900;
    const healed = healDataCenter(state, '0', 500, 'primary');
    expect(healed).toBe(100);
    expect(state.players['0'].dataCenters.primary.health).toBe(2000);
  });

  it('cannot heal a destroyed Data Center', () => {
    const { state, config } = createHarness();
    damageDataCenter(state, '0', 2000, config);
    const healed = healDataCenter(state, '0', 500, 'primary');
    expect(healed).toBe(0);
    expect(state.players['0'].dataCenters.primary.destroyed).toBe(true);
  });
});

describe('Elimination', () => {
  it('eliminates a player only when both Data Centers are destroyed', () => {
    const { state, config } = createHarness();
    damageDataCenter(state, '1', 2000, config);
    expect(isEliminated(state, '1')).toBe(false);

    damageDataCenter(state, '1', 1500, config);
    expect(isEliminated(state, '1')).toBe(true);
  });
});
