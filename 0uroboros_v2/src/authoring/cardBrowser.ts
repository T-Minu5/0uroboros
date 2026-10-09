import { HISTORIC_SOURCE_METADATA } from '@0uroboros/engine/historicCatalog';
import { CARD_CLASSES, VP_CLASSES, type CardClass } from '@0uroboros/engine/game';
import type { AuthoredCard } from '@0uroboros/engine/authoring/contentModel';

export const primaryCardFilters = ['All', 'Base', 'Chaos', 'VP', 'Crypto', 'Generated', 'Disabled'] as const;
export type PrimaryCardFilter = typeof primaryCardFilters[number];

export const baseSubFilters = ['Action', 'Utility', 'Runtime'] as const;
export const chaosSubFilters = ['Attack', 'Hacker', 'Horror'] as const;
export const vpSubFilters = ['Volume', 'Solar-monk'] as const;
export type BaseSubFilter = typeof baseSubFilters[number];
export type ChaosSubFilter = typeof chaosSubFilters[number];

/** Flat filter used by list matching; primary tabs + Base/Chaos/VP subtype tabs. */
export const cardFilters = [...primaryCardFilters, ...baseSubFilters, ...chaosSubFilters, ...vpSubFilters] as const;
export type CardFilter = typeof cardFilters[number];

export type CardSort = 'name' | 'cost' | 'power' | 'vp';
export type { CardClass };
/** Character subtypes; VP subtypes are chosen separately. */
export const cardClasses: readonly CardClass[] = CARD_CLASSES.filter(cardClass => !VP_CLASSES.includes(cardClass));
export const vpClasses = VP_CLASSES;

const chaosClasses = new Set<CardClass>(['Attack', 'Hacker', 'Horror']);
const baseClasses = new Set<CardClass>(['Action', 'Utility', 'Runtime']);

export function isGeneratedCard(card: Pick<AuthoredCard, 'generated'>): boolean {
  return card.generated === true;
}

/** A card's subtype; VP cards without one are Volumes. */
export function cardClassOf(card: Pick<AuthoredCard, 'cardClass' | 'definitionId' | 'id' | 'durationPeriod'> & Partial<Pick<AuthoredCard, 'type'>>): CardClass {
  if (card.cardClass) return card.cardClass;
  if (card.type === 'VP') return 'Volume';
  const types = HISTORIC_SOURCE_METADATA[card.definitionId ?? card.id]?.types ?? [];
  if (types.includes('power')) return 'Horror';
  if (types.includes('attack')) return 'Attack';
  if (card.durationPeriod === 'runtime') return 'Runtime';
  if (types.includes('action')) return 'Action';
  return 'Utility';
}

export function isChaosClass(cardClass: CardClass): boolean {
  return chaosClasses.has(cardClass);
}

export function isBaseClass(cardClass: CardClass): boolean {
  return baseClasses.has(cardClass);
}

/** Pool derived from type/class — Draft pool is not author-editable. */
export function poolForClass(type: AuthoredCard['type'], cardClass?: CardClass): AuthoredCard['pool'] {
  if (type === 'VP') return 'VP';
  if (type === 'Crypto') return 'Crypto';
  if (cardClass && isChaosClass(cardClass)) return 'Chaos';
  return 'Base';
}

export function primaryFilterOf(filter: CardFilter): PrimaryCardFilter {
  if ((baseSubFilters as readonly string[]).includes(filter)) return 'Base';
  if ((chaosSubFilters as readonly string[]).includes(filter)) return 'Chaos';
  if ((vpSubFilters as readonly string[]).includes(filter)) return 'VP';
  return filter as PrimaryCardFilter;
}

export function secondaryFiltersFor(primary: PrimaryCardFilter): readonly CardFilter[] | null {
  if (primary === 'Base') return baseSubFilters;
  if (primary === 'Chaos') return chaosSubFilters;
  if (primary === 'VP') return vpSubFilters;
  return null;
}

export function matchesCardFilter(card: AuthoredCard, filter: CardFilter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Disabled') return !card.enabled;
  if (filter === 'Generated') return isGeneratedCard(card);
  if (filter === 'Base' || filter === 'Chaos' || filter === 'VP' || filter === 'Crypto') {
    return !isGeneratedCard(card) && card.pool === filter;
  }
  return !isGeneratedCard(card) && card.type !== 'Crypto' && cardClassOf(card) === filter;
}

/** Subtype first, then type: `Action · Base`, `Solar-monk · VP`, `Utility · Generated`. */
export function cardCategoryLabel(card: AuthoredCard): string {
  const kind = card.type !== 'Crypto' ? cardClassOf(card) : isGeneratedCard(card) ? card.type : null;
  return [kind, isGeneratedCard(card) ? 'Generated' : card.pool, !card.enabled ? 'Disabled' : null].filter(Boolean).join(' · ');
}

export function sortCards(cards: readonly AuthoredCard[], key: CardSort, direction: 'asc' | 'desc'): AuthoredCard[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...cards].sort((a, b) => {
    if ((key === 'power' || key === 'vp') && (a[key] === undefined || b[key] === undefined)) {
      if (a[key] === undefined && b[key] !== undefined) return 1;
      if (b[key] === undefined && a[key] !== undefined) return -1;
    }
    const comparison = key === 'name' ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) : (a[key] ?? 0) - (b[key] ?? 0);
    return factor * comparison || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

export function newCardCategory(filter: CardFilter): Pick<AuthoredCard, 'pool' | 'type' | 'cardClass' | 'generated'> {
  if (filter === 'VP' || filter === 'Volume') return { pool: 'VP', type: 'VP', cardClass: 'Volume', generated: false };
  if (filter === 'Solar-monk') return { pool: 'VP', type: 'VP', cardClass: 'Solar-monk', generated: false };
  if (filter === 'Crypto') return { pool: filter, type: filter, generated: false };
  if (filter === 'Generated') return { pool: 'Base', type: 'Character', cardClass: 'Utility', generated: true };
  if (filter === 'Disabled' || filter === 'All') return { pool: 'Base', type: 'Character', cardClass: 'Utility', generated: false };
  if ((cardClasses as readonly string[]).includes(filter)) {
    const cardClass = filter as CardClass;
    return { pool: poolForClass('Character', cardClass), type: 'Character', cardClass, generated: false };
  }
  if (filter === 'Chaos') return { pool: 'Chaos', type: 'Character', cardClass: 'Attack', generated: false };
  return { pool: 'Base', type: 'Character', cardClass: 'Utility', generated: false };
}
