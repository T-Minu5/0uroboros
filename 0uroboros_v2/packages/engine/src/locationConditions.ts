import { CARD_CLASSES, type Card, type CardClass, type Deployment, type PlayerId } from './game';
import type { EffectStep } from './effects/types';

/** How a Power or card-count threshold compares to the seat's total here. */
export type ConditionComparison = 'orMore' | 'orLess';

/** Formulas that award a Location reward once per seat while the Location is in play. */
export type LocationConditionKind = 'subtypeCount' | 'subtypePair' | 'powerThreshold' | 'cardCountThreshold';

export type LocationCondition = {
  /** Stable id for once-per-seat tracking within a Cycle. */
  id: string;
  kind: LocationConditionKind;
  /** subtypeCount: required count of matching revealed cards. */
  count?: number;
  /** subtypeCount: required card class. */
  cardClass?: CardClass;
  /** subtypePair: first required class. */
  cardClassA?: CardClass;
  /** subtypePair: second required class. */
  cardClassB?: CardClass;
  /** powerThreshold / cardCountThreshold: threshold value. */
  amount?: number;
  comparison?: ConditionComparison;
  effects: EffectStep[];
};

export const LOCATION_CONDITION_KINDS: readonly LocationConditionKind[] = [
  'subtypeCount', 'subtypePair', 'powerThreshold', 'cardCountThreshold',
];

export const CONDITION_COMPARISONS: readonly ConditionComparison[] = ['orMore', 'orLess'];

export const CONDITION_KIND_LABELS: Record<LocationConditionKind, string> = {
  subtypeCount: 'Subtype count',
  subtypePair: 'Subtype pair',
  powerThreshold: 'Power threshold',
  cardCountThreshold: 'Card count threshold',
};

const classOf = (card: Card): CardClass | undefined =>
  card.cardClass ?? (card.type === 'VP' ? 'Volume' : undefined);

/** Revealed placements owned by `owner` currently on the Node. */
export function revealedHere(placements: readonly Deployment[], owner: PlayerId): Deployment[] {
  return placements.filter(placement => placement.revealed && placement.owner === owner);
}

export function meetsLocationCondition(
  condition: LocationCondition,
  revealed: readonly Deployment[],
  power: number,
): boolean {
  switch (condition.kind) {
    case 'subtypeCount': {
      const need = Math.max(1, condition.count ?? 1);
      const cls = condition.cardClass;
      if (!cls) return false;
      return revealed.filter(placement => classOf(placement.card) === cls).length >= need;
    }
    case 'subtypePair': {
      const a = condition.cardClassA, b = condition.cardClassB;
      if (!a || !b) return false;
      const classes = new Set(revealed.map(placement => classOf(placement.card)).filter(Boolean) as CardClass[]);
      return classes.has(a) && classes.has(b);
    }
    case 'powerThreshold': {
      const amount = condition.amount ?? 0;
      return (condition.comparison ?? 'orMore') === 'orLess' ? power <= amount : power >= amount;
    }
    case 'cardCountThreshold': {
      const amount = condition.amount ?? 0;
      const count = revealed.length;
      return (condition.comparison ?? 'orMore') === 'orLess' ? count <= amount : count >= amount;
    }
  }
}

const article = (cls: CardClass) => (/^[AEIOU]/i.test(cls) ? 'an' : 'a');

/** Printed predicate for a Location condition (without the reward effects). */
export function describeConditionPredicate(condition: LocationCondition): string {
  switch (condition.kind) {
    case 'subtypeCount': {
      const n = Math.max(1, condition.count ?? 1);
      const cls = condition.cardClass ?? 'Action';
      return n === 1
        ? `if you have ${article(cls)} ${cls} card here`
        : `if you have ${n} or more ${cls} cards here`;
    }
    case 'subtypePair': {
      const a = condition.cardClassA ?? 'Attack';
      const b = condition.cardClassB ?? 'Horror';
      return `if you have ${article(a)} ${a} and ${article(b)} ${b} here`;
    }
    case 'powerThreshold': {
      const amount = condition.amount ?? 0;
      const cmp = (condition.comparison ?? 'orMore') === 'orLess' ? 'or less' : 'or more';
      return `if you have ${amount} ${cmp} Power here`;
    }
    case 'cardCountThreshold': {
      const amount = condition.amount ?? 0;
      const cmp = (condition.comparison ?? 'orMore') === 'orLess' ? 'or less' : 'or more';
      return `if you have ${amount} ${cmp} cards here`;
    }
  }
}

/** Validation errors for one condition (empty when valid). */
export function validateLocationCondition(condition: LocationCondition, path: string): string[] {
  const errors: string[] = [];
  if (!condition.id || typeof condition.id !== 'string') errors.push(`${path}.id: expected a non-empty id`);
  if (!LOCATION_CONDITION_KINDS.includes(condition.kind)) errors.push(`${path}.kind: expected a known condition kind`);
  if (!Array.isArray(condition.effects)) errors.push(`${path}.effects: expected an effect list`);
  switch (condition.kind) {
    case 'subtypeCount':
      if (!CARD_CLASSES.includes(condition.cardClass as CardClass)) errors.push(`${path}.cardClass: expected a card class`);
      if (typeof condition.count !== 'number' || !Number.isInteger(condition.count) || condition.count < 1 || condition.count > 8) {
        errors.push(`${path}.count: expected integer from 1 to 8`);
      }
      break;
    case 'subtypePair':
      if (!CARD_CLASSES.includes(condition.cardClassA as CardClass)) errors.push(`${path}.cardClassA: expected a card class`);
      if (!CARD_CLASSES.includes(condition.cardClassB as CardClass)) errors.push(`${path}.cardClassB: expected a card class`);
      break;
    case 'powerThreshold':
    case 'cardCountThreshold':
      if (typeof condition.amount !== 'number' || !Number.isFinite(condition.amount) || condition.amount < 0 || condition.amount > 99) {
        errors.push(`${path}.amount: expected a number from 0 to 99`);
      }
      if (condition.comparison !== undefined && !CONDITION_COMPARISONS.includes(condition.comparison)) {
        errors.push(`${path}.comparison: expected orMore or orLess`);
      }
      break;
  }
  return errors;
}

/** Fresh condition with a unique id for the authoring UI. */
export function createLocationCondition(kind: LocationConditionKind = 'subtypeCount'): LocationCondition {
  const id = `cond-${Math.random().toString(36).slice(2, 10)}`;
  switch (kind) {
    case 'subtypeCount':
      return { id, kind, count: 2, cardClass: 'Attack', effects: [] };
    case 'subtypePair':
      return { id, kind, cardClassA: 'Attack', cardClassB: 'Horror', effects: [] };
    case 'powerThreshold':
      return { id, kind, amount: 5, comparison: 'orMore', effects: [] };
    case 'cardCountThreshold':
      return { id, kind, amount: 3, comparison: 'orMore', effects: [] };
  }
}
