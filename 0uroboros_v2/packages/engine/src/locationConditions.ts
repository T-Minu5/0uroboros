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
  /**
   * subtypePair: 2–4 required classes (at least one revealed card of each).
   * Prefer this over legacy `cardClassA` / `cardClassB`.
   */
  cardClasses?: CardClass[];
  /** @deprecated Use `cardClasses`. Still read when `cardClasses` is absent. */
  cardClassA?: CardClass;
  /** @deprecated Use `cardClasses`. Still read when `cardClasses` is absent. */
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
  subtypePair: 'Subtype combo',
  powerThreshold: 'Power threshold',
  cardCountThreshold: 'Card count threshold',
};

export const SUBTYPE_COMBO_MIN = 2;
export const SUBTYPE_COMBO_MAX = 4;

const classOf = (card: Card): CardClass | undefined =>
  card.cardClass ?? (card.type === 'VP' ? 'Volume' : undefined);

const isCardClass = (value: unknown): value is CardClass =>
  typeof value === 'string' && CARD_CLASSES.includes(value as CardClass);

/** Required subtypes for a subtypePair condition (legacy A/B folded in). */
export function subtypeClassesOf(condition: LocationCondition): CardClass[] {
  if (Array.isArray(condition.cardClasses) && condition.cardClasses.length) {
    return condition.cardClasses.filter(isCardClass).slice(0, SUBTYPE_COMBO_MAX);
  }
  return [condition.cardClassA, condition.cardClassB].filter(isCardClass);
}

/** Drop legacy A/B fields and ensure subtypePair uses `cardClasses`. */
export function normalizeLocationCondition(condition: LocationCondition): LocationCondition {
  if (condition.kind !== 'subtypePair') return condition;
  const classes = subtypeClassesOf(condition);
  const cardClasses = classes.length >= SUBTYPE_COMBO_MIN
    ? classes.slice(0, SUBTYPE_COMBO_MAX)
    : (['Attack', 'Horror'] as CardClass[]);
  const { cardClassA: _a, cardClassB: _b, ...rest } = condition;
  return { ...rest, cardClasses };
}

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
      const need = subtypeClassesOf(condition);
      if (need.length < SUBTYPE_COMBO_MIN) return false;
      const classes = new Set(revealed.map(placement => classOf(placement.card)).filter(Boolean) as CardClass[]);
      return need.every(cls => classes.has(cls));
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

/** Indefinite article for printed class names ("an Attack", "a Utility"). */
const article = (cls: CardClass) => (cls === 'Attack' || cls === 'Action' ? 'an' : 'a');

function describeSubtypeList(classes: readonly CardClass[]): string {
  const parts = classes.map(cls => `${article(cls)} ${cls}`);
  if (parts.length <= 1) return parts[0] ?? 'a card';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

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
      const classes = subtypeClassesOf(condition);
      const list = classes.length >= SUBTYPE_COMBO_MIN ? classes : (['Attack', 'Horror'] as CardClass[]);
      return `if you have ${describeSubtypeList(list)} here`;
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
    case 'subtypePair': {
      const classes = subtypeClassesOf(condition);
      if (classes.length < SUBTYPE_COMBO_MIN || classes.length > SUBTYPE_COMBO_MAX) {
        errors.push(`${path}.cardClasses: expected ${SUBTYPE_COMBO_MIN}–${SUBTYPE_COMBO_MAX} card classes`);
      }
      classes.forEach((cls, at) => {
        if (!isCardClass(cls)) errors.push(`${path}.cardClasses.${at}: expected a card class`);
      });
      if (new Set(classes).size !== classes.length) {
        errors.push(`${path}.cardClasses: subtypes must be unique`);
      }
      break;
    }
    case 'powerThreshold':
      if (typeof condition.amount !== 'number' || !Number.isFinite(condition.amount) || condition.amount < -99 || condition.amount > 99) {
        errors.push(`${path}.amount: expected a number from -99 to 99`);
      }
      if (condition.comparison !== undefined && !CONDITION_COMPARISONS.includes(condition.comparison)) {
        errors.push(`${path}.comparison: expected orMore or orLess`);
      }
      break;
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
      return { id, kind, cardClasses: ['Attack', 'Horror'], effects: [] };
    case 'powerThreshold':
      return { id, kind, amount: 5, comparison: 'orMore', effects: [] };
    case 'cardCountThreshold':
      return { id, kind, amount: 3, comparison: 'orMore', effects: [] };
  }
}
