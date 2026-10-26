import type { Card, LegacyEffect } from '../game';
import { ACTIONS } from './catalog';
import { isStep, scopedWho, type AnyEffect, type ChoiceOption, type EffectStep, type PickMode, type Scope, type Target, type Who } from './types';

export { scopedWho };

const SIDE_WHO: Record<NonNullable<LegacyEffect['boardSide']>, Who> = {
  either: 'any', both: 'both', winner: 'winner', loser: 'loser', played: 'played', other: 'other',
};

/** The "+2 Crypto or +1 Card" menu the engine used to offer when a Choice had no options of its own. */
export function legacyChoiceOptions(scope: Scope): ChoiceOption[] {
  const you: Target = { type: 'player', who: scopedWho('self', scope) };
  return [
    { id: 'crypto', label: '+2 Crypto', effects: [{ action: 'gainCrypto', amount: 2, target: you }] },
    { id: 'draw', label: '+1 Card', effects: [{ action: 'draw', amount: 1, target: you }] },
  ];
}

/** Converts every legacy effect in a list and leaves new steps as they are. A legacy `chain`
    marker makes everything after it wait in that effect's `then`. */
export function migrateEffects(effects: readonly AnyEffect[] | undefined, scope: Scope): EffectStep[] {
  if (!effects?.length) return [];
  const output: EffectStep[] = [];
  for (let index = 0; index < effects.length; index++) {
    const effect = effects[index];
    if (!isStep(effect) && effect.chain && index < effects.length - 1) {
      const { chain: _chain, ...head } = effect;
      const step = migrateEffect(head, scope);
      output.push({ ...step, then: [...(step.then ?? []), ...migrateEffects(effects.slice(index + 1), scope)] });
      break;
    }
    output.push(migrateEffect(effect, scope));
  }
  return output;
}

type StepCard<T> = Omit<T, 'onReveal' | 'onCollapse' | 'recurring' | 'schedule'> & {
  onReveal?: EffectStep[]; onCollapse?: EffectStep[]; recurring?: EffectStep[];
  schedule?: { at: number; timing?: 'start' | 'end'; effects: EffectStep[] }[];
};
/** A card with every printed hook in catalog steps. */
export function migrateCard<T extends Card>(card: T): StepCard<T> {
  const { onReveal, onCollapse, recurring, schedule, ...rest } = card;
  return {
    ...rest,
    ...(onReveal ? { onReveal: migrateEffects(onReveal, 'card') } : {}),
    ...(onCollapse ? { onCollapse: migrateEffects(onCollapse, 'card') } : {}),
    ...(recurring ? { recurring: migrateEffects(recurring, 'card') } : {}),
    ...(schedule ? { schedule: schedule.map(entry => ({ ...entry, effects: migrateEffects(entry.effects, 'card') })) } : {}),
  } as StepCard<T>;
}

type LocationConditionLike = { id: string; kind: string; effects: readonly AnyEffect[]; [key: string]: unknown };
type LocationLike = {
  effects: readonly AnyEffect[]; ongoing?: readonly AnyEffect[]; onPlay?: readonly AnyEffect[];
  startTurn2?: readonly AnyEffect[]; startTurn3?: readonly AnyEffect[]; conditions?: readonly LocationConditionLike[];
};
type StepLocationCondition = Omit<LocationConditionLike, 'effects'> & { effects: EffectStep[] };
type StepLocation<T> = Omit<T, 'effects' | 'ongoing' | 'onPlay' | 'startTurn2' | 'startTurn3' | 'conditions'> & {
  effects: EffectStep[]; ongoing?: EffectStep[]; onPlay?: EffectStep[]; startTurn2?: EffectStep[]; startTurn3?: EffectStep[];
  conditions?: StepLocationCondition[];
};
type LegacyLocationSchedule = { schedule?: readonly { at: number; effects: readonly AnyEffect[] }[] };

/** Older Locations fired `schedule` entries after turn 2 or 3; each now runs at the start of that turn instead. */
export function liftLocationSchedule<T extends object>(location: T & LegacyLocationSchedule): T {
  const { schedule, ...rest } = location;
  if (!schedule) return location;
  const lifted: Record<string, unknown> = rest;
  for (const entry of schedule) {
    const key = entry.at === 3 ? 'startTurn3' : 'startTurn2';
    lifted[key] = [...(lifted[key] as readonly AnyEffect[] | undefined ?? []), ...(entry.effects ?? [])];
  }
  return lifted as T;
}

/** A Location with its collapse, Ongoing and start-of-turn lists in winner/loser terms and On Play in played/other terms. */
export function migrateLocation<T extends LocationLike>(location: T): StepLocation<T> {
  const { effects, ongoing, onPlay, startTurn2, startTurn3, conditions, ...rest } = liftLocationSchedule(location);
  return {
    ...rest,
    effects: migrateEffects(effects, 'location'),
    ...(ongoing ? { ongoing: migrateEffects(ongoing, 'location') } : {}),
    ...(onPlay ? { onPlay: migrateEffects(onPlay, 'locationPlay') } : {}),
    ...(startTurn2 ? { startTurn2: migrateEffects(startTurn2, 'location') } : {}),
    ...(startTurn3 ? { startTurn3: migrateEffects(startTurn3, 'location') } : {}),
    ...(conditions?.length ? {
      conditions: conditions.map(condition => ({
        ...condition,
        effects: migrateEffects(condition.effects, 'locationCondition'),
      })),
    } : {}),
  } as StepLocation<T>;
}

/** A Circuit reward's effect list; older rewards stored a single `effect`. */
export function migrateRewardEffects(reward: { effect?: AnyEffect; effects?: readonly AnyEffect[] }): EffectStep[] {
  return migrateEffects(reward.effects ?? (reward.effect ? [reward.effect] : []), 'circuit');
}

function options(list: LegacyEffect['options'], scope: Scope): ChoiceOption[] | undefined {
  return list?.map(option => ({ id: option.id, label: option.label, effects: migrateEffects(option.effects, scope) }));
}

/** One legacy effect as a catalog step. Throws on a kind the engine never supported. */
export function migrateEffect(effect: AnyEffect, scope: Scope): EffectStep {
  if (isStep(effect)) return effect;
  const step = migrateLegacy(effect, scope);
  // Flags the engine ignored for an action are dropped rather than carried as invalid fields.
  if (step.optional && !ACTIONS[step.action].optional) delete step.optional;
  if (step.min !== undefined && !ACTIONS[step.action].min) delete step.min;
  return step;
}

function migrateLegacy(effect: LegacyEffect, scope: Scope): EffectStep {
  const who = (opponent?: boolean): Who => scopedWho(opponent ? 'opponent' : 'self', scope);
  const player = (opponent?: boolean): Target => ({ type: 'player', who: who(opponent) });
  const common: Partial<EffectStep> = {
    ...(effect.optional ? { optional: true } : {}),
    ...(effect.min !== undefined ? { min: effect.min } : {}),
    ...(effect.then?.length ? { then: migrateEffects(effect.then, scope) } : {}),
  };
  const board = scope === 'location' || scope === 'locationPlay';
  /** Location board effects pick by side at this Node; card effects pick one card anywhere on the board. */
  const boardTarget = (defaultSide: NonNullable<LegacyEffect['boardSide']>, defaultPick: PickMode): Pick<EffectStep, 'target' | 'pick'> => {
    if (effect.cardRelation) return { target: { type: 'card', who: who(effect.opponent), where: 'board', relation: effect.cardRelation } };
    // The old editor saved "your card"/"opponent card" at Locations as `opponent`, which the engine ignored.
    if (board) return {
      target: { type: 'card', who: effect.boardSide ? SIDE_WHO[effect.boardSide] : effect.opponent !== undefined ? who(effect.opponent) : SIDE_WHO[defaultSide], where: 'thisNode' },
      pick: { mode: effect.cardPick ? (effect.cardPick === 'choice' ? 'choose' : 'random') : defaultPick },
    };
    return { target: { type: 'card', who: who(effect.opponent), where: 'board' }, pick: { mode: 'choose' } };
  };
  switch (effect.kind) {
    case 'draw': return { action: 'draw', amount: effect.amount ?? 0, target: player(effect.opponent), ...common };
    case 'actions': return { action: 'gainActions', amount: effect.amount ?? 0, target: player(effect.opponent), ...common };
    case 'crypto': return { action: 'gainCrypto', amount: effect.amount ?? 0, target: player(effect.opponent), ...common };
    case 'vp': return { action: 'gainVP', amount: effect.amount ?? 0, target: player(effect.opponent), ...common };
    // The engine always aimed Drain at the opponent and Restore at its owner, whatever `opponent` said.
    case 'drain': return { action: 'damageServer', amount: effect.amount ?? 0, target: { type: 'server', who: who(true), server: effect.target ?? 'auto' }, ...common };
    case 'damageLoser': return { action: 'damageServer', amount: effect.amount ?? 1, target: { type: 'server', who: who(true), server: 'auto' }, ...common };
    case 'restore': return { action: 'repairServer', amount: effect.amount ?? 0, target: { type: 'server', who: who(false), server: effect.target ?? 'auto' }, ...common };
    case 'restorePrimary': return { action: 'repairServer', amount: effect.amount ?? 1, target: { type: 'server', who: who(effect.opponent), server: effect.target ?? 'primary' }, ...common };
    case 'selfDestroyBackup': return { action: 'destroyServer', target: { type: 'server', who: who(effect.opponent), server: 'backup' }, ...common };
    case 'gain': return {
      action: 'gainCard', amount: effect.amount ?? 1, cardId: effect.cardId,
      target: { type: 'zone', who: who(effect.opponent), zone: effect.destination === 'hand' ? 'hand' : effect.destination === 'discard' ? 'discard' : 'deck' }, ...common,
    };
    case 'handDiscard':
    case 'handTrash': return {
      action: effect.kind === 'handDiscard' ? 'discardCards' : 'trashCards', amount: effect.amount ?? 1,
      target: { type: 'card', who: who(effect.opponent), where: 'hand' },
      pick: { mode: 'choose', ...(effect.chooser === 'opponent' ? { chooser: 'opponent' as const } : {}) }, ...common,
    };
    case 'mill': return { action: 'mill', amount: effect.amount ?? 0, target: { type: 'zone', who: who(true), zone: 'deck' }, destination: 'discard', ...common };
    case 'scry': return { action: 'scry', amount: effect.amount ?? 0, target: { type: 'zone', who: who(effect.opponent), zone: 'deck' }, ...common };
    case 'recover': return { action: 'recover', amount: 1, target: { type: 'card', who: who(false), where: 'trash' }, pick: { mode: 'choose' }, destination: 'discard', ...common };
    case 'stealCrypto': return {
      action: 'stealCrypto', amount: effect.amount ?? 1, target: { type: 'zone', who: who(true), zone: 'wallet' },
      pick: { mode: effect.cardPick === 'choice' ? 'choose' : 'random', ...(effect.chooser === 'opponent' ? { chooser: 'opponent' as const } : {}) }, ...common,
    };
    case 'bump': return {
      action: 'bump', amount: effect.amount ?? 1,
      target: { type: 'zone', who: who(true), zone: effect.zone === 'bank' ? 'bank' : effect.zone === 'wallet' ? 'wallet' : 'bankOrWallet' },
      pick: { mode: effect.cardPick === 'random' ? 'random' : 'choose' }, ...common,
    };
    case 'moveSelf': return { action: 'moveCard', target: { type: 'card', who: who(false), where: 'board', relation: 'self' }, ...common };
    case 'moveCard': return { action: 'moveCard', ...boardTarget('either', 'random'), ...common };
    case 'modifyPower': return { action: 'changePower', amount: effect.amount ?? 0, ...boardTarget('either', 'random'), ...common };
    case 'destroyCard': return { action: 'destroyCard', ...(effect.cardRelation ? boardTarget('either', 'choose') : { target: { type: 'card', who: who(effect.opponent), where: 'board' }, pick: { mode: 'choose' } }), ...common };
    case 'boostPowerAtLocation': return {
      action: 'changePower', amount: effect.amount ?? 1,
      target: { type: 'card', who: SIDE_WHO[effect.boardSide ?? 'both'], where: 'thisNode' }, pick: { mode: 'all' }, ...common,
    };
    case 'trashLowestAtLocation':
    case 'trashAtLocation':
    case 'destroyAtLocation': return {
      action: effect.kind === 'destroyAtLocation' ? 'destroyCard' : 'trashCard',
      target: { type: 'card', who: SIDE_WHO[effect.boardSide ?? 'either'], where: 'thisNode' },
      pick: { mode: effect.kind === 'trashLowestAtLocation' ? 'weakest' : effect.rank ?? 'weakest', count: Math.max(1, effect.amount ?? 1) }, ...common,
    };
    case 'trashSelf': return { action: 'trashCard', target: { type: 'card', who: who(false), where: 'board', relation: 'self' }, ...common };
    case 'attachModifier': {
      const modifier = effect.modifier ?? 'doublePrintedEffects';
      const placed = effect.boardHost || effect.cardRelation;
      return {
        action: 'attachModifier', modifier, ...(modifier === 'powerAuraAtLocation' ? { amount: effect.amount ?? 1 } : {}),
        target: { type: 'card', who: who(effect.opponent), where: placed ? 'board' : 'collection', ...(effect.cardRelation ? { relation: effect.cardRelation } : {}), filter: { cardType: 'Character' } },
        ...(placed && !effect.cardRelation ? { pick: { mode: 'choose' as const } } : {}),
        ...(!placed ? { pick: { mode: effect.cardId ? 'first' as const : 'random' as const } } : {}),
        ...(effect.cardId ? { cardId: effect.cardId } : {}), ...common,
      };
    }
    case 'probability': return { action: 'transferPower', amount: (effect.amount ?? 5) / 5, target: { type: 'node', which: 'neighbours' }, direction: effect.direction ?? 'choice', flow: effect.flow ?? 'push', ...common };
    case 'transferPower': return {
      action: 'transferPower', amount: effect.amount ?? 1, target: { type: 'node', which: 'neighbours' },
      ...(effect.direction ? { direction: effect.direction } : {}), ...(effect.flow ? { flow: effect.flow } : {}), ...common,
    };
    case 'morph': return {
      action: 'morph', formIds: [...(effect.formIds ?? [])],
      ...(effect.selection ? { selection: effect.selection } : {}),
      ...(effect.cycleForms ? { cycleForms: true } : {}),
      ...(effect.resetAfterCycle ? { resetAfterCycle: true } : {}),
      ...common,
    };
    case 'choice': return {
      action: 'choice', ...(effect.prompt ? { prompt: effect.prompt } : {}),
      options: effect.options?.length ? options(effect.options, scope) : legacyChoiceOptions(scope), ...common,
    };
    case 'random': return { action: 'random', options: options(effect.options, scope) ?? [], ...common };
  }
  throw new Error(`Unknown effect kind: ${(effect as { kind: string }).kind}`);
}
