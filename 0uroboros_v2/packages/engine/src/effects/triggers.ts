import type { CardClass, CardType } from '../game';
import type { EffectStep, Who } from './types';

/** Events the card Ongoing bus listens for. */
export type TriggerEvent =
  | 'anyCardDestroyed'
  | 'enemyDraws'
  | 'enemyDrainsYou'
  | 'enemyDrainsBackup'
  | 'enemyGainsCrypto'
  | 'cardPlayed'
  | 'deckAccess'
  | 'serverRepaired'
  | 'cardTrashedHere'
  | 'cardTrashedThisCycle'
  | 'cardMoved'
  | 'cardMovedHere'
  | 'handDiscarded';

export type ListenWhose = 'enemyAccessesYours' | 'youAccessYours' | 'youAccessEnemy';

/** Whose act / whose Servers for repair When. Relative to the Ongoing host. */
export type TriggerActor = 'self' | 'opponent' | 'any';

/**
 * Card-level Ongoing rules. Active while the host is revealed on the board and its Location
 * does not suppress Ongoing effects.
 */
export type CardTrigger =
  | { kind: 'mirrorCrypto' }
  | { kind: 'reflectDrain'; percent: number; random?: boolean }
  | { kind: 'protectPower' }
  | { kind: 'protectCrypto' }
  | { kind: 'protectDestroy' }
  | { kind: 'protectDeckAccess' }
  | { kind: 'multiplyNode'; min: number; max: number; random: boolean; /** Rolled once when first revealed; omitted until then. */ rolled?: number }
  | {
      kind: 'listenAccess';
      whose: ListenWhose;
      then: EffectStep[];
    }
  | {
      kind: 'whenPlayed';
      /**
       * Prefer `definitionIds` (checkbox list), a single `definitionId`, cardClass, or cardType.
       * Multiple ids are OR’d — any listed card fires the Ongoing.
       */
      match: {
        definitionId?: string;
        definitionIds?: readonly string[];
        cardClass?: CardClass;
        cardType?: CardType;
      };
      scope: 'thisNode' | 'cycle';
      then: EffectStep[];
    }
  | {
      kind: 'when';
      event: Exclude<TriggerEvent, 'cardPlayed' | 'deckAccess' | 'enemyGainsCrypto'>;
      /** Optional actor filter for repair / trash / move / discard Whens. */
      actor?: TriggerActor;
      /** Repair: whose Servers were repaired (relative to host). */
      serverWhose?: TriggerActor;
      then: EffectStep[];
    };

export const TRIGGER_KINDS = [
  'mirrorCrypto', 'reflectDrain', 'protectPower', 'protectCrypto', 'protectDestroy', 'protectDeckAccess',
  'multiplyNode', 'listenAccess', 'whenPlayed', 'when',
] as const;
export type TriggerKind = typeof TRIGGER_KINDS[number];

export const WHEN_EVENTS = [
  'anyCardDestroyed', 'enemyDraws', 'enemyDrainsYou', 'enemyDrainsBackup',
  'serverRepaired', 'cardTrashedHere', 'cardTrashedThisCycle',
  'cardMoved', 'cardMovedHere', 'handDiscarded',
] as const satisfies readonly TriggerEvent[];

export const REFLECT_PERCENTS: readonly number[] = Array.from({ length: 9 }, (_, i) => 10 + i * 5);
export const MULTIPLY_MIN = 1.1;
export const MULTIPLY_MAX = 2.0;

function actorLabel(actor: TriggerActor | undefined, noun: string): string {
  if (!actor || actor === 'any') return noun;
  return actor === 'self' ? `you ${noun}` : `the enemy ${noun}`;
}

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
    case 'protectCrypto':
      return 'Ongoing: Your Crypto cannot be bumped or stolen';
    case 'protectDestroy':
      return 'Ongoing: Your cards cannot be destroyed';
    case 'protectDeckAccess':
      return 'Ongoing: Your enemy cannot access your deck';
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
      const ids = [
        ...(trigger.match.definitionId ? [trigger.match.definitionId] : []),
        ...(trigger.match.definitionIds ?? []),
      ];
      const match = ids.length > 1 ? `${ids.length} named cards`
        : ids.length === 1 ? `card ${ids[0]}`
        : trigger.match.cardType ? `${trigger.match.cardType} card`
        : trigger.match.cardClass ? `${trigger.match.cardClass} card` : 'any card';
      const where = trigger.scope === 'thisNode' ? 'at this Location' : 'this Cycle';
      return `Ongoing: When a ${match} is played ${where}`;
    }
    case 'when': {
      switch (trigger.event) {
        case 'anyCardDestroyed':
          return 'Ongoing: When any card is destroyed';
        case 'enemyDraws':
          return 'Ongoing: When the enemy draws a card';
        case 'enemyDrainsYou':
          return 'Ongoing: When the enemy Drains your Server';
        case 'enemyDrainsBackup':
          return 'Ongoing: When the enemy Drains your Backup Server';
        case 'serverRepaired': {
          const who = actorLabel(trigger.actor, 'repairs');
          const servers = !trigger.serverWhose || trigger.serverWhose === 'any' ? 'a Server'
            : trigger.serverWhose === 'self' ? 'your Server' : "the enemy's Server";
          return `Ongoing: When ${who} ${servers}`;
        }
        case 'cardTrashedHere':
          return 'Ongoing: When a card is trashed here';
        case 'cardTrashedThisCycle':
          return `Ongoing: When ${actorLabel(trigger.actor, 'trashes a card')} this Cycle`;
        case 'cardMoved':
          return `Ongoing: When ${actorLabel(trigger.actor, 'moves a card')}`;
        case 'cardMovedHere':
          return 'Ongoing: When a card moves here';
        case 'handDiscarded':
          return `Ongoing: When ${actorLabel(trigger.actor, 'discards from hand')}`;
        default:
          return 'Ongoing: When …';
      }
    }
  }
}

export function isTrigger(value: unknown): value is CardTrigger {
  if (!value || typeof value !== 'object') return false;
  const kind = (value as CardTrigger).kind;
  return TRIGGER_KINDS.includes(kind as TriggerKind);
}

/** @deprecated Prefer TriggerActor; kept for call sites that used Who. */
export type _WhoCompat = Who;
