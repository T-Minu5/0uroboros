import { describe, expect, it } from 'vitest';
import authored from '../content/authored-content.json';
import {
  ANCHOR_CARD_IDS,
  BUDGET_WEIGHTS,
  freeCryptoGain,
  fullServerIntegrity,
  meanAnchorEfficiency,
  scoreCard,
  type BudgetCard,
} from '../packages/engine/src/authoring/cardBudget';

const packCards = authored.document.cards as BudgetCard[];

function byId(id: string): BudgetCard {
  const card = packCards.find(entry => (entry.definitionId ?? entry.id) === id);
  if (!card) throw new Error(`Missing card ${id}`);
  return card;
}

function anchor(id: (typeof ANCHOR_CARD_IDS)[number]): BudgetCard {
  return byId(id);
}

describe('cardBudget', () => {
  it('calibrates Mel’s hard-scored anchors near efficiency 1 (Chrome, ∆-Wave, Dash-Dot)', () => {
    const mean = meanAnchorEfficiency(packCards, { hardOnly: true });
    expect(mean).toBeGreaterThanOrEqual(0.95);
    expect(mean).toBeLessThanOrEqual(1.10);

    for (const id of ['chrome-mitchell', 'delta-wave', 'dash-dot'] as const) {
      const score = scoreCard(anchor(id));
      expect(score.efficiency, id).toBeGreaterThanOrEqual(0.85);
      expect(score.efficiency, id).toBeLessThanOrEqual(1.15);
      expect(score.band, id).toBe('near');
    }

    for (const id of ANCHOR_CARD_IDS) {
      const score = scoreCard(anchor(id));
      const softExcuse = score.soft.some(flag => flag.id !== 'cryptoFloor' && flag.id !== 'selfMove');
      if (softExcuse) continue;
      expect(score.efficiency).toBeGreaterThanOrEqual(0.75);
      expect(score.efficiency).toBeLessThanOrEqual(1.45);
    }
  });

  it('lists Night Scythe trash as soft, not scored', () => {
    const score = scoreCard(byId('night-scythe'));
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

  it('hard-scores Summon the Acolytes discard as a mandatory cost', () => {
    const card = packCards.find(entry => (entry.definitionId ?? entry.id) === 'summon-the-acolytes');
    expect(card).toBeTruthy();
    const score = scoreCard(card!);
    const discard = score.parts.find(part => part.id.startsWith('discardCards'));
    expect(discard?.credit).toBeCloseTo(-BUDGET_WEIGHTS.costDiscard * 3, 5);
    expect(score.soft.some(flag => flag.id === 'discardCards')).toBe(false);
    expect(score.efficiency).toBeLessThanOrEqual(1.35);
  });

  it('hard-scores mandatory self-discard on complete draw packages (Summon-like)', () => {
    const score = scoreCard({
      id: 'budget-summon',
      name: 'Summon-like',
      type: 'Character',
      cost: 3,
      power: 2,
      onReveal: [
        { action: 'draw', amount: 4, target: { type: 'player', who: 'self' } },
        { action: 'discardCards', amount: 3, target: { type: 'card', who: 'self', where: 'hand' }, pick: { mode: 'choose' } },
        { action: 'gainCrypto', amount: 1, target: { type: 'player', who: 'self' } },
      ],
    });
    const draw = score.parts.find(part => part.id.startsWith('draw'));
    const discard = score.parts.find(part => part.id.startsWith('discardCards'));
    expect(draw?.credit).toBeCloseTo(BUDGET_WEIGHTS.draw * 4, 5);
    expect(discard?.credit).toBeCloseTo(-BUDGET_WEIGHTS.costDiscard * 3, 5);
    expect(discard?.label).toMatch(/mandatory/);
    expect(score.soft.some(flag => flag.id === 'discardCards')).toBe(false);
    expect(score.value).toBeCloseTo(
      BUDGET_WEIGHTS.power * 2 + BUDGET_WEIGHTS.draw * 4 - BUDGET_WEIGHTS.costDiscard * 3 + BUDGET_WEIGHTS.crypto * 1,
      5,
    );
  });

  it('does not charge opponent discard as a self-cost', () => {
    const score = scoreCard({
      id: 'budget-foe-discard',
      name: 'Force Discard',
      type: 'Character',
      cost: 4,
      power: 2,
      onReveal: [
        { action: 'discardCards', amount: 2, target: { type: 'card', who: 'opponent', where: 'hand' }, pick: { mode: 'choose', chooser: 'opponent' } },
      ],
    });
    expect(score.parts.some(part => part.id.startsWith('discardCards'))).toBe(false);
    expect(score.soft.some(flag => flag.id === 'discardCards:foe')).toBe(true);
    expect(score.value).toBeCloseTo(BUDGET_WEIGHTS.power * 2, 5);
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
    const score = scoreCard(byId('byte-coin'));
    expect(score.parts.filter(part => part.id === 'cryptoValue' || part.id.startsWith('gainCrypto'))).toHaveLength(1);
  });

  it('marks free +2 Crypto under cost 3 as OVER via Mel floor penalty', () => {
    const cheap: BudgetCard = {
      id: 'budget-cheap-crypto',
      name: 'Cheap Crypto',
      type: 'Character',
      cost: 2,
      power: 1,
      onReveal: [{ action: 'gainCrypto', amount: 2, target: { type: 'player', who: 'self' } }],
    };
    const score = scoreCard(cheap);
    expect(freeCryptoGain(cheap)).toBe(2);
    expect(score.cryptoFloor).toBe(3);
    expect(score.soft.some(flag => flag.id === 'cryptoFloor')).toBe(true);
    expect(score.band).toBe('over');
    expect(score.efficiency).toBeGreaterThan(1.15);
  });

  it('waives the crypto floor when Crypto is behind a sacrifice cost (Sigil)', () => {
    const score = scoreCard(byId('sacrifical-sigil'));
    expect(score.cryptoFloor).toBe(0);
    expect(score.soft.some(flag => flag.id === 'cryptoFloor')).toBe(false);
    expect(freeCryptoGain(byId('sacrifical-sigil'))).toBe(0);
  });

  it('applies durationFactor to positive recurring and schedule credits only', () => {
    const instant = scoreCard({
      id: 'budget-draw-now',
      name: 'Draw Now',
      type: 'Character',
      cost: 3,
      power: 0,
      onReveal: [{ action: 'draw', amount: 2, target: { type: 'player', who: 'self' } }],
    });
    const duration = scoreCard({
      id: 'budget-draw-later',
      name: 'Draw Later',
      type: 'Character',
      cost: 3,
      power: 0,
      recurring: [{ action: 'draw', amount: 2, target: { type: 'player', who: 'self' } }],
    });
    const scheduled = scoreCard({
      id: 'budget-draw-sched',
      name: 'Draw Sched',
      type: 'Character',
      cost: 3,
      power: 0,
      schedule: [{ at: 1, effects: [{ action: 'draw', amount: 2, target: { type: 'player', who: 'self' } }] }] as never,
    });
    const instantDraw = instant.parts.find(part => part.id.startsWith('draw'))!.credit;
    const recurringDraw = duration.parts.find(part => part.id.startsWith('draw'))!.credit;
    const scheduleDraw = scheduled.parts.find(part => part.id.startsWith('draw'))!.credit;
    expect(instantDraw).toBeCloseTo(BUDGET_WEIGHTS.draw * 2, 5);
    expect(recurringDraw).toBeCloseTo(BUDGET_WEIGHTS.draw * 2 * BUDGET_WEIGHTS.durationFactor, 5);
    expect(scheduleDraw).toBeCloseTo(BUDGET_WEIGHTS.draw * 2 * BUDGET_WEIGHTS.durationFactor, 5);
    expect(duration.parts.find(part => part.id.startsWith('draw'))!.label).toMatch(/duration/);
  });

  it('keeps Dash-Dot free +2 Crypto at Mel’s cost-3 floor without a floor penalty', () => {
    const score = scoreCard(anchor('dash-dot'));
    expect(freeCryptoGain(anchor('dash-dot'))).toBe(2);
    expect(score.cryptoFloor).toBe(3);
    expect(score.soft.some(flag => flag.id === 'cryptoFloor')).toBe(false);
    expect(score.band).toBe('near');
  });
});
