import { CARD_CLASSES, type Card, type CardClass } from './game';
import type { EffectStep } from './effects/types';

/** Once-or-repeat Location triggers that fire when something happens at the Node. */
export type LocationEventKind =
  | 'cardDestroyed'
  | 'cardMovedHere'
  | 'cardLeft'
  | 'cardPlayed'
  | 'playsThisTurn';

export type LocationEvent = {
  /** Stable id for once-per-seat / once-per-instance tracking. */
  id: string;
  kind: LocationEventKind;
  /** cardPlayed: optional specific card identity. */
  definitionId?: string;
  /** cardPlayed: optional subtype filter. */
  cardClass?: CardClass;
  /** playsThisTurn: required reveals this turn (default 2). */
  count?: number;
  /**
   * When true, award at most once per seat for the event's scope (cycle/turn).
   * Defaults: playsThisTurn true; others false (every event).
   */
  oncePerSeat?: boolean;
  effects: EffectStep[];
};

/** Always-on Location rules (not Conditions). */
export type LocationPassives = {
  /** Revealed cards here may self-move once per Runtime turn. */
  revealedCanMove?: boolean;
  /** changePower deltas applied to cards at this Node are doubled. */
  doublePowerChanges?: boolean;
  /** Location Ongoing effects do not run while this is set. */
  suppressOngoing?: boolean;
  /** Amounts on Location Ongoing steps are doubled. */
  doubleOngoing?: boolean;
  /** Cards cannot be moved onto this Node (deploy/play still allowed). */
  blockMovesOnto?: boolean;
  /** Revealed cards here cannot be destroyed by effects. */
  immuneDestroy?: boolean;
  /** Revealed cards here ignore negative Power changes. */
  immunePowerDown?: boolean;
};

export const LOCATION_EVENT_KINDS: readonly LocationEventKind[] = [
  'cardDestroyed', 'cardMovedHere', 'cardLeft', 'cardPlayed', 'playsThisTurn',
];

export const LOCATION_EVENT_KIND_LABELS: Record<LocationEventKind, string> = {
  cardDestroyed: 'Card destroyed here',
  cardMovedHere: 'Card moved here',
  cardLeft: 'Card leaves here',
  cardPlayed: 'Card played here',
  playsThisTurn: 'Plays this turn',
};

export const LOCATION_PASSIVE_KEYS = [
  'revealedCanMove', 'doublePowerChanges', 'suppressOngoing', 'doubleOngoing',
  'blockMovesOnto', 'immuneDestroy', 'immunePowerDown',
] as const satisfies readonly (keyof LocationPassives)[];

const isCardClass = (value: unknown): value is CardClass =>
  typeof value === 'string' && CARD_CLASSES.includes(value as CardClass);

const classOf = (card: Card): CardClass | undefined =>
  card.cardClass ?? (card.type === 'VP' ? 'Volume' : undefined);

const article = (cls: CardClass) => (cls === 'Attack' || cls === 'Action' ? 'an' : 'a');

/** Whether oncePerSeat defaults on for this kind. */
export function eventOncePerSeatDefault(kind: LocationEventKind): boolean {
  return kind === 'playsThisTurn';
}

export function eventOncePerSeat(event: LocationEvent): boolean {
  return event.oncePerSeat ?? eventOncePerSeatDefault(event.kind);
}

/** Award tracking scope for once-per-seat events. */
export function eventAwardScope(kind: LocationEventKind): 'cycle' | 'turn' {
  return kind === 'playsThisTurn' ? 'turn' : 'cycle';
}

/** Does this reveal / card match a cardPlayed (or cardPlayedHere) filter? */
export function matchesCardPlayFilter(
  card: Card,
  filter: { definitionId?: string; cardClass?: CardClass },
): boolean {
  return matchesPlayIdentity(
    { definitionId: card.definitionId ?? card.id, cardClass: classOf(card) },
    filter,
  );
}

/** Match a recorded play (definition + class) against an authored filter. */
export function matchesPlayIdentity(
  play: { definitionId: string; cardClass?: CardClass },
  filter: { definitionId?: string; cardClass?: CardClass },
): boolean {
  const hasId = !!filter.definitionId;
  const hasClass = !!filter.cardClass;
  if (!hasId && !hasClass) return true;
  if (hasId && play.definitionId !== filter.definitionId) return false;
  if (hasClass && play.cardClass !== filter.cardClass) return false;
  return true;
}

/** Printed When: predicate (without reward effects). */
export function describeEventPredicate(event: LocationEvent): string {
  switch (event.kind) {
    case 'cardDestroyed':
      return 'a card is destroyed here';
    case 'cardMovedHere':
      return 'a card moves here';
    case 'cardLeft':
      return 'a card leaves here';
    case 'cardPlayed': {
      if (event.definitionId) return `${event.definitionId} is played here`;
      if (event.cardClass) return `${article(event.cardClass)} ${event.cardClass} is played here`;
      return 'a card is played here';
    }
    case 'playsThisTurn': {
      const count = Math.max(1, event.count ?? 2);
      return `you play ${count} cards here in a turn`;
    }
  }
}

/** Validation errors for one event (empty when valid). */
export function validateLocationEvent(event: LocationEvent, path: string): string[] {
  const errors: string[] = [];
  if (!event.id || typeof event.id !== 'string') errors.push(`${path}.id: expected a non-empty id`);
  if (!LOCATION_EVENT_KINDS.includes(event.kind)) errors.push(`${path}.kind: expected a known event kind`);
  if (!Array.isArray(event.effects)) errors.push(`${path}.effects: expected an effect list`);
  if (event.oncePerSeat !== undefined && typeof event.oncePerSeat !== 'boolean') {
    errors.push(`${path}.oncePerSeat: expected boolean`);
  }
  switch (event.kind) {
    case 'cardPlayed': {
      if (event.cardClass !== undefined && !isCardClass(event.cardClass)) {
        errors.push(`${path}.cardClass: expected a card class`);
      }
      if (event.definitionId !== undefined) {
        if (typeof event.definitionId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(event.definitionId)) {
          errors.push(`${path}.definitionId: use 1–80 letters, numbers, underscores or hyphens`);
        }
      }
      break;
    }
    case 'playsThisTurn':
      if (event.count !== undefined) {
        if (typeof event.count !== 'number' || !Number.isInteger(event.count) || event.count < 1 || event.count > 8) {
          errors.push(`${path}.count: expected integer from 1 to 8`);
        }
      }
      break;
    default:
      break;
  }
  return errors;
}

export function validateLocationPassives(passives: LocationPassives | undefined, path: string): string[] {
  if (passives === undefined) return [];
  const errors: string[] = [];
  if (passives === null || typeof passives !== 'object' || Array.isArray(passives)) {
    return [`${path}: expected an object`];
  }
  const allowed = new Set<string>(LOCATION_PASSIVE_KEYS);
  for (const key of Object.keys(passives)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}: unsupported field`);
  }
  for (const key of LOCATION_PASSIVE_KEYS) {
    const value = passives[key];
    if (value !== undefined && typeof value !== 'boolean') {
      errors.push(`${path}.${key}: expected boolean`);
    }
  }
  return errors;
}

/** Fresh event with a unique id for the authoring UI. */
export function createLocationEvent(kind: LocationEventKind = 'cardDestroyed'): LocationEvent {
  const id = `evt-${Math.random().toString(36).slice(2, 10)}`;
  switch (kind) {
    case 'cardDestroyed':
      return { id, kind, effects: [] };
    case 'cardMovedHere':
      return { id, kind, effects: [] };
    case 'cardLeft':
      return { id, kind, effects: [] };
    case 'cardPlayed':
      return { id, kind, effects: [] };
    case 'playsThisTurn':
      return { id, kind, count: 2, oncePerSeat: true, effects: [] };
  }
}

/** Autotext lines for passives (Ongoing: …). */
export function describePassives(passives: LocationPassives | undefined): string[] {
  if (!passives) return [];
  const lines: string[] = [];
  if (passives.revealedCanMove) lines.push('Ongoing: Revealed cards here can move.');
  if (passives.doublePowerChanges) lines.push('Ongoing: Changes to Power are doubled here.');
  if (passives.doubleOngoing) lines.push('Ongoing: Ongoing effects here are doubled.');
  if (passives.suppressOngoing) lines.push('Ongoing: Ongoing effects here do not resolve.');
  if (passives.blockMovesOnto) lines.push('Ongoing: Cards cannot move onto this Node.');
  if (passives.immuneDestroy) lines.push('Ongoing: Cards here cannot be destroyed.');
  if (passives.immunePowerDown) lines.push('Ongoing: Cards here ignore Power loss.');
  return lines;
}
