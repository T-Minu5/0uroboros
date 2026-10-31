/**
 * Join static cardBudget efficiency E to Eco cardDemand rows for disagreement flags.
 */
import { scoreCard, type BudgetBand, type BudgetCard } from '@0uroboros/engine/authoring/cardBudget';
import type { CardDemand } from './ecoMetrics';

export type BudgetDemandRow = {
  definitionId: string;
  name: string;
  cost: number;
  category: string;
  efficiency: number;
  band: BudgetBand;
  softCount: number;
  pickRate: number;
  buyerWinRate: number | null;
  winDelta: number | null;
  offers: number;
  affordable: number;
  picks: number;
      aiRefused: number;
      flag: BudgetDisagreement | null;
    };

export type BudgetDisagreement =
  | 'high-E-high-win'
  | 'high-E-low-pick'
  | 'low-E-high-pick'
  | 'soft-only';

const MIN_AFFORDABLE = 6;

function cardKey(card: BudgetCard) {
  return card.definitionId ?? card.id;
}

/**
 * Enrich demand rows with scoreCard(E). `seatWinRate` is the cohort base rate for winDelta
 * (buyerWinRate − seatWinRate); pass 0.5 when unknown.
 */
export function enrichDemandWithBudget(
  catalogCards: readonly BudgetCard[],
  demand: CardDemand,
  seatWinRate = 0.5,
): BudgetDemandRow[] {
  const byId = new Map(catalogCards.map(card => [cardKey(card), card]));
  return demand.cards.map(row => {
    const card = byId.get(row.id);
    const score = card ? scoreCard(card) : null;
    const buyerWinRate = row.buyerWinRate;
    const winDelta = buyerWinRate === null ? null : Math.round((buyerWinRate - seatWinRate) * 100) / 100;
    const softCount = score?.soft.length ?? 0;
    const efficiency = score?.efficiency ?? 0;
    const band = score?.band ?? 'near';
    const sampleOk = row.affordable >= MIN_AFFORDABLE;
    let flag: BudgetDisagreement | null = null;
    if (score && softCount > 0 && efficiency < 0.85 && (!sampleOk || (row.pickRate ?? 0) < 0.15)) {
      flag = 'soft-only';
    } else if (sampleOk && score) {
      if (efficiency >= 1.15 && winDelta !== null && winDelta >= 0.08) flag = 'high-E-high-win';
      else if (efficiency >= 1.15 && row.pickRate <= 0.1) flag = 'high-E-low-pick';
      else if (efficiency <= 0.85 && (row.pickRate >= 0.35 || (winDelta !== null && winDelta >= 0.08))) flag = 'low-E-high-pick';
    }
    return {
      definitionId: row.id,
      name: row.name,
      cost: row.cost,
      category: row.category,
      efficiency,
      band,
      softCount,
      pickRate: row.pickRate,
      buyerWinRate,
      winDelta,
      offers: row.offers,
      affordable: row.affordable,
      picks: row.picks,
      aiRefused: row.aiRefused,
      flag,
    };
  });
}

export function focalBudgetRow(rows: readonly BudgetDemandRow[], cardId: string): BudgetDemandRow | null {
  return rows.find(row => row.definitionId === cardId) ?? null;
}
