/**
 * Resolution presentation beats.
 *
 * Recording an event must not change the applied op. The client only uses the
 * queue to hold numbers and play hits in the order the engine already resolved.
 */

import { describe, expect, it } from 'vitest';

import { revealCard } from '../src/game/engine/deploy';
import { resolveOps, type EffectContext } from '../src/game/engine/effects';
import { eventReady, formatFxDelta } from '../src/client/fxPlayback';
import { addToHand, createHarness, openNodes, placeCardAtNode } from './helpers';
import type { FxEvent } from '../src/game/types';

describe('fx recording', () => {
  it('records a Power beat when an onReveal effect applies', () => {
    const { state, config, random } = createHarness();
    openNodes(state, [0]);
    const id = placeCardAtNode(state, '0', 'echo_analyst', 0);

    revealCard(state, id, config, random);

    const beat = state.fxQueue.find((event) => event.kind === 'power');
    expect(beat).toMatchObject({
      kind: 'power',
      chapter: 'reveal',
      instanceId: id,
      amount: 2,
    });
    expect(state.cards[id].powerMods).toBe(2);
  });

  it('records Data Center damage without changing the applied amount', () => {
    const { state, config, random } = createHarness();
    const before = state.players['1'].dataCenters.primary.health;
    const ctx: EffectContext = {
      controller: '0',
      nodeIndex: 0,
      sourceCard: null,
      chapter: 'collapse',
      effectText: 'On collapse, deal 150 damage to the opposing Data Center.',
    };

    resolveOps(
      state,
      [{ op: 'damageDataCenter', amount: 150, target: 'opponent' }],
      ctx,
      config,
      random,
    );

    expect(state.players['1'].dataCenters.primary.health).toBe(before - 150);
    const beat = state.fxQueue.find((event) => event.kind === 'damageDc');
    expect(beat).toMatchObject({
      kind: 'damageDc',
      player: '1',
      dataCenter: 'primary',
      amount: 150,
      before,
      after: before - 150,
      chapter: 'collapse',
    });
  });
});

describe('fx playback readiness', () => {
  it('holds Collapse beats until the reveal sequence has finished', () => {
    const event: FxEvent = {
      id: 1,
      kind: 'damageDc',
      chapter: 'collapse',
      player: '1',
      amount: 150,
    };
    expect(eventReady(event, () => false, false)).toBe(false);
    expect(eventReady(event, () => false, true)).toBe(true);
  });

  it('holds reveal beats until the source card is face up', () => {
    const event: FxEvent = {
      id: 2,
      kind: 'power',
      chapter: 'reveal',
      sourceInstanceId: 'card-a',
      amount: 2,
    };
    expect(eventReady(event, (id) => id === 'card-a', false)).toBe(true);
    expect(eventReady(event, () => false, false)).toBe(false);
    expect(eventReady(event, () => false, true)).toBe(true);
  });

  it('formats a damage floater from the recorded amount', () => {
    expect(
      formatFxDelta({
        id: 3,
        kind: 'damageDc',
        chapter: 'collapse',
        amount: 150,
      }),
    ).toBe('-150');
  });
});

describe('deploy still legal after recording', () => {
  it('does not block a later deploy because an fx event was stored', () => {
    const { state } = createHarness();
    addToHand(state, '0', 'cipher_runner');
    expect(state.fxQueue).toEqual([]);
  });
});
