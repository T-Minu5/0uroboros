import { describe, expect, it } from 'vitest';
import authored from '../content/authored-content.json';
import {
  ANCHOR_CARD_IDS,
  BUDGET_WEIGHTS,
  fullServerIntegrity,
  meanAnchorEfficiency,
  scoreCard,
  type BudgetCard,
} from '../packages/engine/src/authoring/cardBudget';

const packCards = authored.document.cards as BudgetCard[];

function anchor(id: (typeof ANCHOR_CARD_IDS)[number]): BudgetCard {
  const card = packCards.find(entry => (entry.definitionId ?? entry.id) === id);
  if (!card) throw new Error(`Missing anchor ${id}`);
  return card;
}

describe('cardBudget', () => {
  it('calibrates Mel’s hard-scored anchors near efficiency 1', () => {
    const mean = meanAnchorEfficiency(packCards, { hardOnly: true });
    expect(mean).toBeGreaterThanOrEqual(0.95);
    expect(mean).toBeLessThanOrEqual(1.05);

    for (const id of ANCHOR_CARD_IDS) {
      const score = scoreCard(anchor(id));
      const softExcuse = score.soft.length > 0;
      if (softExcuse) continue;
      expect(score.efficiency).toBeGreaterThanOrEqual(0.75);
      expect(score.efficiency).toBeLessThanOrEqual(1.25);
    }
  });

  it('lists Night Scythe trash as soft, not scored', () => {
    const score = scoreCard(anchor('night-scythe'));
    expect(score.soft.some(flag => flag.id === 'trashCards')).toBe(true);
    expect(score.parts.every(part => !part.id.startsWith('trashCards'))).toBe(true);
    expect(score.value).toBe(score.parts.find(part => part.id === 'power')?.credit ?? 0);
  });

  it('scales Drain credit with Server integrity', () => {
    const blade = anchor('rezz-blade');
    const atFull = scoreCard(blade, { serverIntegrity: fullServerIntegrity() });
    const atHalf = scoreCard(blade, { serverIntegrity: fullServerIntegrity() / 2 });
    const drainFull = atFull.parts.find(part => part.id.startsWith('damageServer'))!.credit;
    const drainHalf = atHalf.parts.find(part => part.id.startsWith('damageServer'))!.credit;
    expect(drainHalf).toBeCloseTo(drainFull * 2, 5);
    expect(atHalf.efficiency).toBeGreaterThan(atFull.efficiency);
  });

  it('discounts optional then packages', () => {
    const card: BudgetCard = {
      id: 'budget-optional',
      name: 'Optional Draw',
      type: 'Character',
      cost: 2,
      power: 0,
      onReveal: [
        {
          action: 'discardCards',
          amount: 1,
          optional: true,
          target: { type: 'card', who: 'self', where: 'hand' },
          then: [{ action: 'draw', amount: 2, target: { type: 'player', who: 'self' } }],
        },
      ],
    };
    const score = scoreCard(card);
    const draw = score.parts.find(part => part.id.startsWith('draw'));
    const cost = score.parts.find(part => part.id.startsWith('discardCards'));
    expect(draw?.credit).toBeCloseTo(BUDGET_WEIGHTS.draw * 2 * BUDGET_WEIGHTS.optionalFactor, 2);
    expect(cost?.credit).toBeCloseTo(-BUDGET_WEIGHTS.costDiscard * 1 * BUDGET_WEIGHTS.optionalFactor, 2);
    expect(Math.abs(draw!.credit)).toBeLessThan(BUDGET_WEIGHTS.draw * 2);
  });

  it('flags copyPreviousOnReveal as soft without a credit', () => {
    const score = scoreCard({
      id: 'budget-copy',
      name: 'Copycat',
      type: 'Character',
      cost: 3,
      power: 2,
      onReveal: [{ action: 'copyPreviousOnReveal' }],
    });
    expect(score.soft.some(flag => flag.id === 'copyPreviousOnReveal')).toBe(true);
    expect(score.parts.some(part => part.id.startsWith('copyPreviousOnReveal'))).toBe(false);
    expect(score.value).toBeCloseTo(BUDGET_WEIGHTS.power * 2, 5);
  });

  it('does not double-count Crypto value and On Reveal gainCrypto', () => {
    const score = scoreCard(anchor('byte-coin'));
    expect(score.parts.filter(part => part.id === 'cryptoValue' || part.id.startsWith('gainCrypto'))).toHaveLength(1);
  });
});
