import { describe, expect, it } from 'vitest';

import { addToHand, createHarness, fundActions } from './helpers';
import { canDeploy, deploy, revealCard } from '../src/game/engine/deploy';
import { startRuntimeTurn } from '../src/game/engine/actions';
import { beginNextCycle, startOfCycle } from '../src/game/engine/cycle';

describe('Action economy', () => {
  it('grants 2 Actions on Runtime turn 1', () => {
    const { state } = createHarness();
    expect(state.players['0'].actions).toBe(2);
    expect(state.players['1'].actions).toBe(2);
  });

  it('spends 1 Action to deploy a Character and 0 to deploy a VP', () => {
    const { state, config, random } = createHarness();
    const character = addToHand(state, '0', 'slash_dot');
    const vp = addToHand(state, '0', 'vault_encryption');
    deploy(state, '0', character, 0, config, random);
    expect(state.players['0'].actions).toBe(1);
    deploy(state, '0', vp, 1, config, random);
    expect(state.players['0'].actions).toBe(1);
  });

  it('blocks Character deploy when Actions are insufficient', () => {
    const { state, config } = createHarness();
    fundActions(state, '0', 0);
    const id = addToHand(state, '0', 'slash_dot');
    const check = canDeploy(state, '0', id, 0, config);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe('insufficientActions');
  });

  it('makes OnReveal Action gain available on the next Runtime turn', () => {
    const { state, config, random } = createHarness();
    const id = addToHand(state, '0', 'dash_dot');
    deploy(state, '0', id, 0, config, random);
    revealCard(state, id, config, random);
    expect(state.players['0'].actions).toBe(1);
    expect(state.players['0'].pendingActions).toBe(1);
    startRuntimeTurn(state, config, 1);
    expect(state.players['0'].actions).toBe(2);
    expect(state.players['0'].pendingActions).toBe(0);
  });

  it('clears Actions between Cycles', () => {
    const { state, config, random } = createHarness();
    state.players['0'].actions = 4;
    state.players['0'].pendingActions = 2;
    startOfCycle(state, config, random);
    expect(state.players['0'].actions).toBe(0);
    expect(state.players['0'].pendingActions).toBe(0);
    beginNextCycle(state);
    expect(state.players['0'].actions).toBe(0);
  });
});
