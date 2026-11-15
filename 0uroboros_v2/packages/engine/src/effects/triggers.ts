import type { CardClass, CardType } from '../game';
import type { EffectStep } from './types';

/** Events the card Ongoing bus listens for. */
export type TriggerEvent =
  | 'anyCardDestroyed'
  | 'enemyDraws'
  | 'enemyDrainsYou'
  | 'enemyGainsCrypto'
  | 'cardPlayed'
  | 'deckAccess';

export type ListenWhose = 'enemyAccessesYours' | 'youAccessYours' | 'youAccessEnemy';

/**
 * Card-level Ongoing rules. Active while the host is revealed on the board and its Location
 * does not suppress Ongoing effects.
 */
export type CardTrigger =
  | { kind: 'mirrorCrypto' }
  | { kind: 'reflectDrain'; percent: number; random?: boolean }
  | { kind: 'protectPower' }
  | { kind: 'multiplyNode'; min: number; max: number; random: boolean; /** Rolled once when first revealed; omitted until then. */ rolled?: number }
  | {
      kind: 'listenAccess';
      whose: ListenWhose;
      then: EffectStep[];
    }
  | {
      kind: 'whenPlayed';
      /** Prefer one of definitionId, cardClass (Character/VP subtypes), or cardType (e.g. Crypto). */
      match: { definitionId?: string; cardClass?: CardClass; cardType?: CardType };
      scope: 'thisNode' | 'cycle';
      then: EffectStep[];
    }
  | {
      kind: 'when';
      event: Exclude<TriggerEvent, 'cardPlayed' | 'deckAccess' | 'enemyGainsCrypto'>;
      then: EffectStep[];
    };

export const TRIGGER_KINDS = [
  'mirrorCrypto', 'reflectDrain', 'protectPower', 'multiplyNode',
  'listenAccess', 'whenPlayed', 'when',
] as const;
export type TriggerKind = typeof TRIGGER_KINDS[number];

export const REFLECT_PERCENTS: readonly number[] = Array.from({ length: 9 }, (_, i) => 10 + i * 5);
export const MULTIPLY_MIN = 1.1;
export const MULTIPLY_MAX = 2.0;

export function describeTrigger(trigger: CardTrigger): string {
  switch (trigger.kind) {
    case 'mirrorCrypto':
      return 'Ongoing: Mirror any Crypto the enemy gains';
    case 'reflectDrain': {
      const pct = trigger.random ? `a random ${REFLECT_PERCENTS[0]}–${REFLECT_PERCENTS[REFLECT_PERCENTS.length - 1]}%` : `${trigger.percent}%`;
      return `Ongoing: Reflect ${pct} of enemy Drain back`;
    }
    case 'protectPower':
      return 'Ongoing: Your cards cannot lose Power';
    case 'multiplyNode': {
      const pct = (n: number) => `${Math.round((n - 1) * 100)}%`;
      if (trigger.random) return `Ongoing: Increase the Power here randomly between ${pct(trigger.min)}–${pct(trigger.max)}`;
      return `Ongoing: ×${trigger.min.toFixed(2)} Power here`;
    }
    case 'listenAccess': {
      const whose = trigger.whose === 'enemyAccessesYours' ? 'the enemy accesses your deck'
        : trigger.whose === 'youAccessYours' ? 'you access your deck'
        : 'you access the enemy deck';
      return `Ongoing: When ${whose}`;
    }
    case 'whenPlayed': {
      const match = trigger.match.definitionId ? `card ${trigger.match.definitionId}`
        : trigger.match.cardType ? `${trigger.match.cardType} card`
        : trigger.match.cardClass ? `${trigger.match.cardClass} card` : 'matching card';
      const where = trigger.scope === 'thisNode' ? 'at this Location' : 'this Cycle';
      return `Ongoing: When a ${match} is played ${where}`;
    }
    case 'when': {
      const event = trigger.event === 'anyCardDestroyed' ? 'any card is destroyed'
        : trigger.event === 'enemyDraws' ? 'the enemy draws a card'
        : 'the enemy Drains your Server';
      return `Ongoing: When ${event}`;
    }
  }
}

export function isTrigger(value: unknown): value is CardTrigger {
  if (!value || typeof value !== 'object') return false;
  const kind = (value as CardTrigger).kind;
  return TRIGGER_KINDS.includes(kind as TriggerKind);
}
