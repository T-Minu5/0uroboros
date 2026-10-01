/**
 * Spatial source → target grammar. Presentation only.
 */

import { describe, expect, it } from 'vitest';

import { spatialPlanOf, isGlobalPresentationKind } from '../src/client/board/spatialGrammar';
import type { FxEvent } from '../src/game/types';

function event(partial: Partial<FxEvent> & Pick<FxEvent, 'kind'>): FxEvent {
  return {
    id: 1,
    chapter: 'reveal',
    ...partial,
  };
}

describe('spatial causality grammar', () => {
  it('sends Drain from the source card to the defending Data Center', () => {
    const plan = spatialPlanOf(
      event({
        kind: 'damageDc',
        sourceInstanceId: 'c1',
        player: '1',
        dataCenter: 'primary',
        amount: 75,
      }),
      '0',
    );
    expect(plan?.family).toBe('drain');
    expect(plan?.source).toMatchObject({ kind: 'card', instanceId: 'c1' });
    expect(plan?.target).toMatchObject({ kind: 'dc', player: '1', dataCenter: 'primary' });
    expect(plan?.label).toBe('-75');
  });

  it('sends Restore to the healed Data Center', () => {
    const plan = spatialPlanOf(
      event({
        kind: 'healDc',
        sourceInstanceId: 'c2',
        player: '0',
        dataCenter: 'backup',
        amount: 50,
      }),
      '0',
    );
    expect(plan?.family).toBe('restore');
    expect(plan?.target).toMatchObject({ kind: 'dc', dataCenter: 'backup' });
    expect(plan?.label).toBe('+50');
  });

  it('moves probability from one Node to another', () => {
    const plan = spatialPlanOf(
      event({
        kind: 'chance',
        fromNode: 0,
        toNode: 3,
        fromBefore: 25,
        toAfter: 20,
        amount: 5,
      }),
      '0',
    );
    expect(plan?.family).toBe('chance');
    expect(plan?.source).toMatchObject({ kind: 'node', nodeIndex: 0 });
    expect(plan?.target).toMatchObject({ kind: 'node', nodeIndex: 3 });
  });

  it('does not send Drain or Restore through a global presentation kind', () => {
    expect(isGlobalPresentationKind('damageDc')).toBe(false);
    expect(isGlobalPresentationKind('healDc')).toBe(false);
    expect(isGlobalPresentationKind('chance')).toBe(false);
  });
});
