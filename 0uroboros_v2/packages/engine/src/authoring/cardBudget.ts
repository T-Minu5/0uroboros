/**
 * Deterministic card-efficiency budget for Content Studio (post-Actions economy).
 *
 * Efficiency E = V / B(cost) + cryptoFloorPenalty.
 * Anchors Mel named as balanced (Chrome Mitchell, ∆-Wave, Dash-Dot, …) calibrate mean E ≈ 1.
 * Soft (unquantifiable) effects are flagged; duration hooks discount positive credits.
 *
 * Drain/Restore scale against full Server integrity (Primary + Backup).
 *
 * Astra (2026-11): flat durationFactor 0.75; crypto floors softFlagPlusPenalty (2→3, 3→6, 5→9);
 * novel aura/bump/scry stay soft; curve retuned so Mel’s exemplars land near band.
 */
import { serverMaximums, type Card } from '../game';
import { migrateEffects } from '../effects/migrate';
import type { ActionId, EffectStep } from '../effects/types';

export type BudgetBand = 'under' | 'near' | 'over';
export type BudgetPart = { id: string; label: string; credit: number };
export type SoftFlag = { id: string; reason: string };

export type CardBudgetScore = {
  efficiency: number;
  deltaPct: number;
  value: number;
  baseline: number;
  band: BudgetBand;
  parts: BudgetPart[];
  soft: SoftFlag[];
  /** Power ÷ board slots (hologram counts as a second slot). Display only. */
  density: number | null;
  /** Draft-cost floor implied by free Crypto income; 0 when none / waived. */
  cryptoFloor: number;
  formula: string;
};

/**
 * Mel’s balanced exemplars (definitionId / id).
 * Chrome Mitchell + ∆-Wave + Dash-Dot are the post-Actions calibration core.
 */
export const ANCHOR_CARD_IDS = [
  'chrome-mitchell',
  'delta-wave',
  'dash-dot',
  'slash-dot',
  'rezz-blade',
  'rezz-razor',
  'cowl-obscyra',
  'quantum-telementry',
] as const;

/** Near band: within ±15% of baseline. */
export const BAND_THRESHOLDS = { under: 0.85, over: 1.15 } as const;

/**
 * Free Crypto income → minimum draft cost (Mel). Waived when that Crypto sits behind
 * a linked self discard / trash / payCrypto cost.
 */
export const CRYPTO_COST_FLOORS: readonly { minGain: number; minCost: number }[] = [
  { minGain: 5, minCost: 9 },
  { minGain: 3, minCost: 6 },
  { minGain: 2, minCost: 3 },
];

/**
 * Effect credits. Tuned so Mel’s anchors average efficiency ≈ 1.
 * Astra preserved most effect weights; drain bumped so mid/high Attack packages
 * (Chrome / ∆-Wave) sit with Dash-Dot on the character curve.
 */
export const BUDGET_WEIGHTS = {
  power: 1.0,
  crypto: 1.15,
  draw: 1.28,
  /** Multiplier on (damage / serverIntegrity). */
  drain: 48,
  restore: 30,
  vp: 2.2,
  hologramPower: 0.85,
  changePower: 0.9,
  /** Fixed-amount Node Power push/pull — positional, not full Power. */
  transferPower: 0.35,
  /** Optional / then payoffs are not guaranteed. */
  optionalFactor: 0.65,
  /** Costs paid to unlock `then` (discard/trash/payCrypto). */
  costDiscard: 0.55,
  costTrash: 0.7,
  costPayCrypto: 1.0,
  /** Positive credits on recurring / schedule ticks (Mel / Astra flat 0.75). */
  durationFactor: 0.75,
  /**
   * Added to E per draft-cost point below the Mel crypto floor for free Crypto income.
   * Pushes underpriced free Crypto packages into the OVER band.
   */
  cryptoFloorPenalty: 1.0,
} as const;

/**
 * B(c) = α + β·c + γ·c^1.35.
 * Calibrated so Dash-Dot (3), Chrome Mitchell (7), and ∆-Wave (9) land near E≈1
 * with the post-Actions weight table.
 */
export const BASELINE_CURVES = {
  character: { alpha: 3.35, beta: 0.68, gamma: 0.015 },
  crypto: { alpha: 0.2, beta: 0.7, gamma: 0.08 },
  vp: { alpha: 0.4, beta: 0.9, gamma: 0.28 },
} as const;

const SOFT_ACTIONS: Partial<Record<ActionId, string>> = {
  copyPreviousOnReveal: 'Copies another card’s On Reveal — value depends on the board.',
  morph: 'Morph/evolve transforms are context-dependent.',
  choice: 'Player choice branches are not fixed value.',
  random: 'Random branches are not fixed value.',
  scry: 'Inspect/reorder without a fixed card gain.',
  recover: 'Recovery value depends on Trash/Discard contents.',
  stealCrypto: 'Steal depends on the opponent’s wallet.',
  bump: 'Bump value depends on what sits in Bank/wallet.',
  mill: 'Mill without a fixed resource credit.',
  destroyCard: 'Destroying a board card is situational.',
  trashCard: 'Trashing a board card is situational.',
  attachModifier: 'Mod attachment value depends on the host.',
  removeModifier: 'Removing mods is situational.',
  destroyServer: 'Instantly zeroing a Server is not scaled like Drain.',
  gainCard: 'Gaining a specific/random card needs a fixed template to score.',
  healCard: 'Restoring card Power is situational vs printed Power.',
  restoreCard: 'Resetting card Power is situational.',
  moveCard: 'Moving cards is positional.',
};

type Curve = { alpha: number; beta: number; gamma: number };
type Timing = 'instant' | 'duration';

export type BudgetCard = Omit<Card, 'art' | 'effect' | 'powerSource'> & {
  art?: string;
  effect?: string;
  onReveal?: EffectStep[];
  onCollapse?: EffectStep[];
  recurring?: EffectStep[];
  schedule?: { effects?: EffectStep[] }[];
  cryptoValue?: number;
  vp?: number;
  selfMove?: string;
  aura?: number;
  powerSource?: string;
  definitionId?: string;
};

export function fullServerIntegrity(): number {
  return serverMaximums.primary + serverMaximums.backup;
}

export function baselineForCost(cost: number, curve: Curve): number {
  const c = Math.max(0, cost);
  return curve.alpha + curve.beta * c + curve.gamma * Math.pow(c, 1.35);
}

function curveFor(card: Pick<Card, 'type'>): Curve {
  if (card.type === 'Crypto') return BASELINE_CURVES.crypto;
  if (card.type === 'VP') return BASELINE_CURVES.vp;
  return BASELINE_CURVES.character;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function bandOf(efficiency: number): BudgetBand {
  if (efficiency < BAND_THRESHOLDS.under) return 'under';
  if (efficiency > BAND_THRESHOLDS.over) return 'over';
  return 'near';
}

type WalkResult = { credit: number; parts: BudgetPart[]; soft: SoftFlag[] };

function pushSoft(into: WalkResult, id: string, reason: string) {
  if (into.soft.some(flag => flag.id === id)) return;
  into.soft.push({ id, reason });
}

function isSelfTarget(step: EffectStep): boolean {
  const who = step.target && 'who' in step.target ? step.target.who : 'self';
  return who === 'self' || who === undefined;
}

function isSelfCostGate(step: EffectStep): boolean {
  if (!isSelfTarget(step)) return false;
  return step.action === 'payCrypto'
    || step.action === 'discardCards'
    || step.action === 'trashCards';
}

/**
 * Largest Crypto gain that is not behind a linked self discard / trash / payCrypto gate.
 * Used for Mel’s draft-cost floors.
 */
export function freeCryptoGain(card: BudgetCard): number {
  let max = 0;
  const visit = (steps: readonly EffectStep[] | undefined, gated: boolean) => {
    if (!steps?.length) return;
    for (const step of migrateEffects(steps, 'card')) {
      if (step.action === 'gainCrypto' && !gated) max = Math.max(max, step.amount ?? 0);
      const childGated = gated || isSelfCostGate(step);
      if (step.then?.length) visit(step.then, childGated);
      if (step.options?.length) {
        for (const option of step.options) {
          // Option costs gate that option’s effects.
          const optionGated = childGated || !!(option.cost?.length);
          if (option.cost?.length) visit(option.cost as EffectStep[], true);
          if (option.effects?.length) visit(option.effects, optionGated);
        }
      }
    }
  };
  if (card.type === 'Crypto') max = Math.max(max, card.cryptoValue ?? 0);
  else visit(card.onReveal, false);
  visit(card.onCollapse, false);
  visit(card.recurring, false);
  for (const entry of card.schedule ?? []) visit(entry.effects, false);
  return max;
}

/** Mel floor cost for a free Crypto gain amount; 0 if below +2. */
export function cryptoFloorForGain(gain: number): number {
  for (const row of CRYPTO_COST_FLOORS) {
    if (gain >= row.minGain) return row.minCost;
  }
  return 0;
}

/**
 * Walk effect steps. `factor` already includes parent optional/then discounts.
 * Duration timing multiplies positive credits only (Astra: discount benefits, not payments).
 */
function walkSteps(
  steps: readonly EffectStep[] | undefined,
  factor: number,
  into: WalkResult,
  serverIntegrity: number,
  cardPower: number,
  timing: Timing,
): void {
  if (!steps?.length) return;
  for (const step of migrateEffects(steps, 'card')) {
    const softReason = SOFT_ACTIONS[step.action];
    const optionalMul = step.optional ? BUDGET_WEIGHTS.optionalFactor : 1;
    const childFactor = factor * optionalMul;

    if (softReason) {
      pushSoft(into, step.action, softReason);
      if (step.options?.length) {
        pushSoft(into, `${step.action}:options`, 'Choice/random option payoffs are not averaged into the hard score.');
        for (const option of step.options) {
          if (option.cost?.length) walkSteps(option.cost as EffectStep[], childFactor, into, serverIntegrity, cardPower, timing);
          if (option.effects?.length) walkSteps(option.effects, childFactor, into, serverIntegrity, cardPower, timing);
        }
      }
      if (step.then?.length) walkSteps(step.then, childFactor, into, serverIntegrity, cardPower, timing);
      continue;
    }

    const amount = step.amount ?? 0;
    let credit = 0;
    let label: string = step.action;

    switch (step.action) {
      case 'draw':
        credit = BUDGET_WEIGHTS.draw * amount;
        label = `Draw ${amount}`;
        break;
      case 'gainCrypto':
        credit = BUDGET_WEIGHTS.crypto * amount;
        label = `+${amount} Crypto`;
        break;
      case 'payCrypto':
        credit = -BUDGET_WEIGHTS.costPayCrypto * amount;
        label = `Pay ${amount} Crypto`;
        break;
      case 'gainVP':
        credit = BUDGET_WEIGHTS.vp * amount;
        label = `${amount >= 0 ? '+' : ''}${amount} VP`;
        break;
      case 'damageServer':
        credit = BUDGET_WEIGHTS.drain * (amount / Math.max(1, serverIntegrity));
        label = `Drain ${amount} (${round2((100 * amount) / serverIntegrity)}% of Servers)`;
        break;
      case 'repairServer':
        credit = BUDGET_WEIGHTS.restore * (amount / Math.max(1, serverIntegrity));
        label = `Restore ${amount} (${round2((100 * amount) / serverIntegrity)}% of Servers)`;
        break;
      case 'changePower': {
        const who = step.target && 'who' in step.target ? step.target.who : 'self';
        if (who === 'self' || who === undefined) {
          credit = BUDGET_WEIGHTS.changePower * amount;
          label = `${amount >= 0 ? '+' : ''}${amount} Power (printed change)`;
        } else {
          pushSoft(into, 'changePower:other', 'Stealing/removing enemy Power is situational.');
        }
        break;
      }
      case 'transferPower':
        credit = BUDGET_WEIGHTS.transferPower * Math.abs(amount || 1);
        label = `Node Power shift ${amount || 1}`;
        break;
      case 'createHologram':
        credit = BUDGET_WEIGHTS.hologramPower * Math.max(0, cardPower);
        label = `Hologram (~${cardPower} Power on mirror)`;
        break;
      case 'discardCards': {
        if (!isSelfTarget(step)) {
          pushSoft(into, 'discardCards:foe', 'Forcing another seat to discard is situational disruption.');
          break;
        }
        if (!step.optional || step.then?.length) {
          credit = -BUDGET_WEIGHTS.costDiscard * amount;
          label = step.then?.length
            ? `Discard up to ${amount} (cost)`
            : `Discard ${amount} (mandatory)`;
        } else {
          pushSoft(into, 'discardCards', 'Optional discard without a scored payoff is thinning/tempo, not a fixed credit.');
        }
        break;
      }
      case 'trashCards': {
        if (!isSelfTarget(step)) {
          pushSoft(into, 'trashCards:foe', 'Forcing another seat to trash is situational disruption.');
          break;
        }
        if (step.then?.length) {
          credit = -BUDGET_WEIGHTS.costTrash * amount;
          label = `Trash up to ${amount} (cost)`;
        } else {
          pushSoft(into, 'trashCards', 'Trash without a scored payoff is deck thinning — flagged, not scored.');
        }
        break;
      }
      default:
        pushSoft(into, step.action, `No hard budget mapping for ${step.action}.`);
        break;
    }

    if (credit !== 0) {
      let delta = credit * childFactor;
      if (timing === 'duration' && credit > 0) delta *= BUDGET_WEIGHTS.durationFactor;
      const durationNote = timing === 'duration' && credit > 0 ? ' · duration' : '';
      into.parts.push({
        id: `${step.action}:${into.parts.length}`,
        label: `${step.optional ? `${label} (optional)` : label}${durationNote}`,
        credit: round2(delta),
      });
      into.credit += delta;
    }

    if (step.then?.length) walkSteps(step.then, childFactor, into, serverIntegrity, cardPower, timing);
  }
}

/** Score a card (authored or runtime Card shape with effect hooks). */
export function scoreCard(card: BudgetCard, opts?: { serverIntegrity?: number }): CardBudgetScore {
  const serverIntegrity = opts?.serverIntegrity ?? fullServerIntegrity();
  const power = card.power ?? 0;
  const parts: BudgetPart[] = [];
  const soft: SoftFlag[] = [];
  let value = 0;

  if (card.type !== 'Crypto' && power !== 0) {
    const credit = BUDGET_WEIGHTS.power * power;
    parts.push({ id: 'power', label: `Power ${power}`, credit: round2(credit) });
    value += credit;
  }
  // Crypto pile: score printed cryptoValue only (On Reveal gainCrypto on these is the same payout).
  if (card.type === 'Crypto' && (card.cryptoValue ?? 0)) {
    const amount = card.cryptoValue ?? 0;
    const credit = BUDGET_WEIGHTS.crypto * amount;
    parts.push({ id: 'cryptoValue', label: `Crypto value ${amount}`, credit: round2(credit) });
    value += credit;
  } else if (card.type === 'VP' && card.vp) {
    const credit = BUDGET_WEIGHTS.vp * card.vp;
    parts.push({ id: 'vp', label: `Printed VP ${card.vp}`, credit: round2(credit) });
    value += credit;
  } else if (card.vp && card.type !== 'VP') {
    const credit = BUDGET_WEIGHTS.vp * card.vp;
    parts.push({ id: 'vp', label: `Printed VP ${card.vp}`, credit: round2(credit) });
    value += credit;
  }
  // Astra: aura stays soft (board-dependent); residual flag only.
  if (card.aura) soft.push({ id: 'aura', reason: 'Power aura depends on other allies at the Location.' });
  if (card.powerSource) {
    soft.push({ id: 'powerSource', reason: 'Live Power bonus depends on game state.' });
  }
  if (card.selfMove) soft.push({ id: 'selfMove', reason: 'Self-move is mobility utility, not a fixed resource credit.' });

  const walk: WalkResult = { credit: 0, parts: [], soft: [] };
  if (card.type !== 'Crypto') {
    walkSteps(card.onReveal, 1, walk, serverIntegrity, power, 'instant');
  }
  walkSteps(card.onCollapse, 1, walk, serverIntegrity, power, 'instant');
  walkSteps(card.recurring, 1, walk, serverIntegrity, power, 'duration');
  for (const entry of card.schedule ?? []) walkSteps(entry.effects, 1, walk, serverIntegrity, power, 'duration');

  for (const flag of walk.soft) {
    if (!soft.some(existing => existing.id === flag.id)) soft.push(flag);
  }
  parts.push(...walk.parts);
  value += walk.credit;

  const freeCrypto = freeCryptoGain(card);
  const cryptoFloor = cryptoFloorForGain(freeCrypto);
  const cost = card.cost ?? 0;
  let floorPenalty = 0;
  if (cryptoFloor > 0 && cost < cryptoFloor) {
    floorPenalty = BUDGET_WEIGHTS.cryptoFloorPenalty * (cryptoFloor - cost);
    soft.push({
      id: 'cryptoFloor',
      reason: `Free +${freeCrypto} Crypto usually wants draft cost ≥ ${cryptoFloor} (Mel). E += ${BUDGET_WEIGHTS.cryptoFloorPenalty} per missing cost point → OVER.`,
    });
  }

  const baseline = Math.max(0.01, baselineForCost(cost, curveFor(card)));
  const efficiency = value / baseline + floorPenalty;
  const hasHologram = [...(card.onReveal ?? []), ...(card.onCollapse ?? []), ...(card.recurring ?? [])]
    .some(step => step.action === 'createHologram');
  const density = card.type === 'Character' ? round2(power / (hasHologram ? 2 : 1)) : null;

  return {
    efficiency: round2(efficiency),
    deltaPct: round2((efficiency - 1) * 100),
    value: round2(value),
    baseline: round2(baseline),
    band: bandOf(efficiency),
    parts,
    soft,
    density,
    cryptoFloor,
    formula: 'E = V / B(cost) + cryptoFloorPenalty; B = α + β·c + γ·c^1.35; duration ×0.75 on positive recurring/schedule credits; free +2/+3/+5 Crypto floors cost 3/6/9 unless paid for; soft effects flagged only.',
  };
}

/** Mean efficiency of anchor cards in a document-like card list (for calibration tests). */
export function meanAnchorEfficiency(
  cards: readonly BudgetCard[],
  opts?: { serverIntegrity?: number; /** Skip anchors whose score is mostly soft (e.g. Night Scythe). */ hardOnly?: boolean },
): number {
  const anchors = ANCHOR_CARD_IDS
    .map(id => cards.find(card => (card.definitionId ?? card.id) === id))
    .filter((card): card is BudgetCard => !!card)
    .map(card => ({ card, score: scoreCard(card, opts) }))
    .filter(({ score }) => {
      if (!opts?.hardOnly) return true;
      const soft = score.soft.filter(flag => flag.id !== 'selfMove' && flag.id !== 'cryptoFloor');
      return soft.length === 0;
    });
  if (!anchors.length) return 0;
  const sum = anchors.reduce((total, { score }) => total + score.efficiency, 0);
  return round2(sum / anchors.length);
}
