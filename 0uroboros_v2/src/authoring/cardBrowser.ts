import { HISTORIC_SOURCE_METADATA } from '../historicCatalog';
import type { AuthoredCard } from './contentModel';

export const cardFilters = ['All', 'Base', 'Chaos', 'Hacker', 'VP', 'Crypto', 'Generated', 'Action', 'Utility', 'Runtime', 'Attack', 'Disabled'] as const;
export type CardFilter = typeof cardFilters[number];
export type CardSort = 'name' | 'cost' | 'power';
export type CardClass = 'Action' | 'Utility' | 'Runtime' | 'Attack' | 'Hacker';
export const cardClasses: readonly CardClass[] = ['Action', 'Utility', 'Runtime', 'Attack', 'Hacker'];

export function cardClassOf(card: AuthoredCard): CardClass {
  if (card.cardClass) return card.cardClass;
  const types = HISTORIC_SOURCE_METADATA[card.definitionId ?? card.id]?.types ?? [];
  if (types.includes('power')) return 'Hacker';
  if (types.includes('attack')) return 'Attack';
  if (card.durationPeriod === 'runtime') return 'Runtime';
  if (types.includes('action')) return 'Action';
  return 'Utility';
}

export function matchesCardFilter(card: AuthoredCard, filter: CardFilter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Disabled') return !card.enabled;
  if (filter === 'Generated') return Boolean(card.generated);
  if (['Base', 'Chaos', 'VP', 'Crypto'].includes(filter)) return !card.generated && card.pool === filter;
  return card.type === 'Character' && cardClassOf(card) === filter;
}

export function cardCategoryLabel(card: AuthoredCard): string {
  return [card.generated ? 'Generated' : card.pool, card.type === 'Character' ? cardClassOf(card) : null, !card.enabled ? 'Disabled' : null].filter(Boolean).join(' · ');
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
  const cardClass = cardClasses.includes(filter as CardClass) ? filter as CardClass : filter === 'Chaos' ? 'Attack' : 'Utility';
  return { pool: filter === 'Chaos' || cardClass === 'Hacker' || cardClass === 'Attack' ? 'Chaos' : 'Base', type: 'Character', cardClass, generated: filter === 'Generated' };
}
