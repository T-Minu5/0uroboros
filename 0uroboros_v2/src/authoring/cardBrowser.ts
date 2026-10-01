import { HISTORIC_SOURCE_METADATA } from '../historicCatalog';
import type { AuthoredCard } from './contentModel';

export const primaryCardFilters = ['All', 'Base', 'Chaos', 'VP', 'Crypto', 'Generated', 'Disabled'] as const;
export type PrimaryCardFilter = typeof primaryCardFilters[number];

export const baseSubFilters = ['Action', 'Utility', 'Runtime'] as const;
export const chaosSubFilters = ['Attack', 'Hacker', 'Horror'] as const;
export type BaseSubFilter = typeof baseSubFilters[number];
export type ChaosSubFilter = typeof chaosSubFilters[number];

/** Flat filter used by list matching; primary tabs + Base/Chaos class tabs. */
export const cardFilters = [...primaryCardFilters, ...baseSubFilters, ...chaosSubFilters] as const;
export type CardFilter = typeof cardFilters[number];

export type CardSort = 'name' | 'cost' | 'power';
export type CardClass = 'Action' | 'Utility' | 'Runtime' | 'Attack' | 'Hacker' | 'Horror';
export const cardClasses: readonly CardClass[] = ['Action', 'Utility', 'Runtime', 'Attack', 'Hacker', 'Horror'];

const chaosClasses = new Set<CardClass>(['Attack', 'Hacker', 'Horror']);
const baseClasses = new Set<CardClass>(['Action', 'Utility', 'Runtime']);

export function isGeneratedCard(card: Pick<AuthoredCard, 'generated'>): boolean {
  return card.generated === true;
}

export function cardClassOf(card: Pick<AuthoredCard, 'cardClass' | 'definitionId' | 'id' | 'durationPeriod'>): CardClass {
  if (card.cardClass) return card.cardClass;
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
  return filter as PrimaryCardFilter;
}

export function secondaryFiltersFor(primary: PrimaryCardFilter): readonly CardFilter[] | null {
  if (primary === 'Base') return baseSubFilters;
  if (primary === 'Chaos') return chaosSubFilters;
  return null;
}

export function matchesCardFilter(card: AuthoredCard, filter: CardFilter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Disabled') return !card.enabled;
  if (filter === 'Generated') return isGeneratedCard(card);
  if (filter === 'Base' || filter === 'Chaos' || filter === 'VP' || filter === 'Crypto') {
    return !isGeneratedCard(card) && card.pool === filter;
  }
  return !isGeneratedCard(card) && card.type === 'Character' && cardClassOf(card) === filter;
}

export function cardCategoryLabel(card: AuthoredCard): string {
  const kind = card.type === 'Character' ? cardClassOf(card) : isGeneratedCard(card) ? card.type : null;
  return [isGeneratedCard(card) ? 'Generated' : card.pool, kind, !card.enabled ? 'Disabled' : null].filter(Boolean).join(' · ');
}

export function sortCards(cards: readonly AuthoredCard[], key: CardSort, direction: 'asc' | 'desc'): AuthoredCard[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...cards].sort((a, b) => {
    if (key === 'power' && (a.power === undefined || b.power === undefined)) {
      if (a.power === undefined && b.power !== undefined) return 1;
      if (b.power === undefined && a.power !== undefined) return -1;
    }
    const comparison = key === 'name' ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) : (a[key] ?? 0) - (b[key] ?? 0);
    return factor * comparison || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

export function newCardCategory(filter: CardFilter): Pick<AuthoredCard, 'pool' | 'type' | 'cardClass' | 'generated'> {
  if (filter === 'VP' || filter === 'Crypto') return { pool: filter, type: filter, generated: false };
  if (filter === 'Generated') return { pool: 'Base', type: 'Character', cardClass: 'Utility', generated: true };
  if (filter === 'Disabled' || filter === 'All') return { pool: 'Base', type: 'Character', cardClass: 'Utility', generated: false };
  if ((cardClasses as readonly string[]).includes(filter)) {
    const cardClass = filter as CardClass;
    return { pool: poolForClass('Character', cardClass), type: 'Character', cardClass, generated: false };
  }
  if (filter === 'Chaos') return { pool: 'Chaos', type: 'Character', cardClass: 'Attack', generated: false };
  return { pool: 'Base', type: 'Character', cardClass: 'Utility', generated: false };
}
