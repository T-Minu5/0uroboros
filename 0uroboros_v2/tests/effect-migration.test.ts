import { describe, expect, it } from 'vitest';
import saved from '../content/authored-content.json';
import { EVALUATION_CIRCUIT_REWARDS, EVALUATION_LOCATIONS } from '@0uroboros/engine/content';
import { ACTION_IDS, collectActions, describeSteps, validateSteps, type ValidationCards } from '@0uroboros/engine/effects/catalog';
import { migrateEffects } from '@0uroboros/engine/effects/migrate';
import type { AnyEffect, EffectStep, Scope } from '@0uroboros/engine/effects/types';
import { EVALUATION_ALL_CARDS } from '@0uroboros/engine/evaluationMarket';
import type { Card, LegacyEffect } from '@0uroboros/engine/game';

type Source = { label: string; scope: Scope; effects: readonly AnyEffect[] };
type LooseLocation = { id: string; effects?: readonly AnyEffect[]; ongoing?: readonly AnyEffect[]; onPlay?: readonly AnyEffect[]; schedule?: readonly { at: number; effects: readonly AnyEffect[] }[] };
type LooseReward = { id: string; effect?: AnyEffect; effects?: readonly AnyEffect[] };

function cardSources(cards: readonly Card[], prefix: string): Source[] {
  return cards.flatMap(card => [
    ...(['onReveal', 'onCollapse', 'recurring'] as const).map(hook => ({ label: `${prefix}:${card.id}.${hook}`, scope: 'card' as const, effects: card[hook] ?? [] })),
    ...(card.schedule ?? []).map((entry, index) => ({ label: `${prefix}:${card.id}.schedule.${index}`, scope: 'card' as const, effects: entry.effects })),
  ]);
}

function locationSources(locations: readonly LooseLocation[], prefix: string): Source[] {
  return locations.flatMap(location => [
    { label: `${prefix}:${location.id}.effects`, scope: 'location' as const, effects: location.effects ?? [] },
    { label: `${prefix}:${location.id}.ongoing`, scope: 'location' as const, effects: location.ongoing ?? [] },
    { label: `${prefix}:${location.id}.onPlay`, scope: 'locationPlay' as const, effects: location.onPlay ?? [] },
    ...(location.schedule ?? []).map((entry, index) => ({ label: `${prefix}:${location.id}.schedule.${index}`, scope: 'location' as const, effects: entry.effects })),
  ]);
}

function rewardSources(rewards: readonly LooseReward[], prefix: string): Source[] {
  return rewards.map(reward => ({ label: `${prefix}:${reward.id}`, scope: 'circuit' as const, effects: reward.effects ?? (reward.effect ? [reward.effect] : []) }));
}

const document = (saved as unknown as { document: { cards: Card[]; locations: LooseLocation[]; circuitRewards: LooseReward[]; mods?: { id: string; enabled: boolean }[] } }).document;
const allCards = [...EVALUATION_ALL_CARDS, ...document.cards];
const validation: ValidationCards = {
  enabledIds: new Set(allCards.flatMap(card => [card.id, card.definitionId ?? card.id])),
  types: new Map(allCards.map(card => [card.definitionId ?? card.id, card.type])),
  modIds: new Set((document.mods ?? []).filter(mod => mod.enabled).map(mod => mod.id)),
};
const sources: Source[] = [
  ...cardSources(EVALUATION_ALL_CARDS, 'builtin'),
  ...locationSources(EVALUATION_LOCATIONS as unknown as LooseLocation[], 'builtin'),
  ...rewardSources(EVALUATION_CIRCUIT_REWARDS as unknown as LooseReward[], 'builtin'),
  ...cardSources(document.cards, 'saved'),
  ...locationSources(document.locations, 'saved'),
  ...rewardSources(document.circuitRewards, 'saved'),
].filter(source => source.effects.length);

describe('legacy effect migration', () => {
  it('migrates every live card, Location and Circuit reward into valid catalog steps', () => {
    const problems: string[] = [];
    for (const source of sources) {
      let steps: EffectStep[];
      try { steps = migrateEffects(source.effects, source.scope); }
      catch (error) { problems.push(`${source.label}: ${(error as Error).message}`); continue; }
      const unknown = [...collectActions(steps)].filter(action => !ACTION_IDS.includes(action as never));
      if (unknown.length) problems.push(`${source.label}: unknown actions ${unknown.join(', ')}`);
      validateSteps(steps, source.label, source.scope, validation, problems);
      expect(describeSteps(steps, source.scope, allCards)).not.toBe('');
    }
    expect(problems).toEqual([]);
    expect(sources.length).toBeGreaterThan(50);
  });

  it('turns an empty legacy Choice into the explicit Forked Signal menu', () => {
    const [step] = migrateEffects([{ kind: 'choice' }], 'card');
    expect(step).toMatchObject({ action: 'choice', options: [
      { label: '+2 Crypto', effects: [{ action: 'gainCrypto', amount: 2, target: { type: 'player', who: 'self' } }] },
      { label: '+1 Card', effects: [{ action: 'draw', amount: 1, target: { type: 'player', who: 'self' } }] },
    ] });
    const [location] = migrateEffects([{ kind: 'choice' }], 'location');
    expect(location.options?.[0].effects[0].target).toEqual({ type: 'player', who: 'winner' });
  });

  it('folds a legacy chain marker into then and keeps the engine-fixed Drain and Restore targets', () => {
    const legacy: LegacyEffect[] = [{ kind: 'handDiscard', amount: 1, chain: true }, { kind: 'drain', amount: 100, opponent: false }, { kind: 'restore', amount: 50, opponent: true }];
    expect(migrateEffects(legacy, 'card')).toEqual([{
      action: 'discardCards', amount: 1, target: { type: 'card', who: 'self', where: 'hand' }, pick: { mode: 'choose' },
      then: [
        { action: 'damageServer', amount: 100, target: { type: 'server', who: 'opponent', server: 'auto' } },
        { action: 'repairServer', amount: 50, target: { type: 'server', who: 'self', server: 'auto' } },
      ],
    }]);
  });

  it('writes Location and On Play effects in winner/loser and played/other terms', () => {
    expect(migrateEffects([{ kind: 'actions', amount: 1, opponent: true }], 'location')[0].target).toEqual({ type: 'player', who: 'loser' });
    expect(migrateEffects([{ kind: 'drain', amount: 25 }], 'locationPlay')[0].target).toEqual({ type: 'server', who: 'other', server: 'auto' });
    expect(migrateEffects([{ kind: 'modifyPower', amount: -1, boardSide: 'loser', cardPick: 'random' }], 'location')[0])
      .toMatchObject({ action: 'changePower', target: { type: 'card', who: 'loser', where: 'thisNode' }, pick: { mode: 'random' } });
    expect(migrateEffects([{ kind: 'moveCard', opponent: true }], 'location')[0].target).toEqual({ type: 'card', who: 'loser', where: 'thisNode' });
    expect(migrateEffects([{ kind: 'destroyAtLocation', rank: 'strongest', amount: 2, boardSide: 'both' }], 'location')[0])
      .toMatchObject({ action: 'destroyCard', pick: { mode: 'strongest', count: 2 } });
  });

  it('validation reports bad steps with nested paths', () => {
    const errors: string[] = [];
    validateSteps([
      { action: 'healCard', amount: 2, target: { type: 'card', who: 'opponent', where: 'trash' }, pick: { mode: 'choose' } },
      { action: 'choice', options: [{ id: 'a', label: 'A', effects: [] }] },
      { action: 'choice', options: [
        { id: 'a', label: 'A', effects: [{ action: 'draw', amount: 500, target: { type: 'player', who: 'self' } }] },
        { id: 'b', label: 'B', cost: [{ action: 'draw', amount: 1, target: { type: 'player', who: 'self' } }], effects: [] },
      ] },
    ], 'card.onReveal', 'card', validation, errors);
    expect(errors.some(error => error.startsWith('card.onReveal[0].target'))).toBe(true);
    expect(errors).toContain('card.onReveal[1].options: expected 2–12 options');
    expect(errors.some(error => error.startsWith('card.onReveal[2].options[0].effects[0].amount'))).toBe(true);
    expect(errors.some(error => error.startsWith('card.onReveal[2].options[1].cost[0].action'))).toBe(true);
  });

  it('rejects kinds the engine never supported', () => {
    expect(() => migrateEffects([{ kind: 'teleport' } as unknown as LegacyEffect], 'card')).toThrow(/Unknown effect kind: teleport/);
  });
});
