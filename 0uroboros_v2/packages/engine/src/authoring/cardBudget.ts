/**
 * Deterministic card-efficiency budget for Content Studio.
 *
 * Efficiency E = printed value V / baseline B(cost). Anchors Mel named as balanced
 * are calibrated so mean E ≈ 1. Soft (unquantifiable) effects are flagged, not scored.
 *
 * Drain/Restore scale against full Server integrity (Primary + Backup).
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
  formula: string;
};

/** Mel's "completely balanced" exemplars (definitionId / id). */
export const ANCHOR_CARD_IDS = [
  'card-vls0e5lo', // Doom Loop
  'night-scythe',
  'dash-dot',
  'slash-dot',
  'dotkrawler',
  'rezz-blade',
  'rezz-razor',
  'cowl-obscyra',
  'quantum-telementry', // pack spelling
  'byte-coin',
] as const;

/** Near band: within ±15% of baseline. */
export const BAND_THRESHOLDS = { under: 0.85, over: 1.15 } as const;

/**
 * Effect credits. Tuned so anchor cards average efficiency ≈ 1.
 * Retune here when Mel redefines "balanced."
 */
export const BUDGET_WEIGHTS = {
  power: 1.0,
  crypto: 1.15,
  draw: 1.28,
  actions: 1.42,
  /** Multiplier on (damage / serverIntegrity). */
  drain: 36,
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
} as const;

/**
 * B(c) = α + β·c + γ·c^1.35.
 * Relatively high α (slot/tempo overhead) + mild γ so dense mid-cost packages
 * and lean high-cost bodies can both sit near E≈1 for Mel’s anchors.
 */
export const BASELINE_CURVES = {
  character: { alpha: 2.2, beta: 1.2, gamma: 0.08 },
  crypto: { alpha: 0.15, beta: 0.65, gamma: 0.1 },
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

export type BudgetCard = Card & {
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

/**
 * Walk effect steps. `factor` already includes parent optional/then discounts.
 * An optional step of its own multiplies positive credits (and its `then`) by optionalFactor.
 */
function walkSteps(
  steps: readonly EffectStep[] | undefined,
  factor: number,
  into: WalkResult,
  serverIntegrity: number,
  cardPower: number,
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
          if (option.cost?.length) walkSteps(option.cost as EffectStep[], childFactor, into, serverIntegrity, cardPower);
          if (option.effects?.length) walkSteps(option.effects, childFactor, into, serverIntegrity, cardPower);
        }
      }
      if (step.then?.length) walkSteps(step.then, childFactor, into, serverIntegrity, cardPower);
      continue;
    }

    const amount = step.amount ?? 0;
    let credit = 0;
    let label = step.action;

    switch (step.action) {
      case 'draw':
        credit = BUDGET_WEIGHTS.draw * amount;
        label = `Draw ${amount}`;
        break;
      case 'gainActions':
        credit = BUDGET_WEIGHTS.actions * amount;
        label = `+${amount} Action${amount === 1 ? '' : 's'}`;
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
        if (who === 'self' || who === 'ally' || who === undefined) {
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
      case 'discardCards':
        if (step.then?.length) {
          credit = -BUDGET_WEIGHTS.costDiscard * amount;
          label = `Discard up to ${amount} (cost)`;
        } else {
          pushSoft(into, 'discardCards', 'Discard without a scored payoff is thinning/tempo, not a fixed credit.');
        }
        break;
      case 'trashCards':
        if (step.then?.length) {
          credit = -BUDGET_WEIGHTS.costTrash * amount;
          label = `Trash up to ${amount} (cost)`;
        } else {
          pushSoft(into, 'trashCards', 'Trash without a scored payoff is deck thinning — flagged, not scored.');
        }
        break;
      default:
        pushSoft(into, step.action, `No hard budget mapping for ${step.action}.`);
        break;
    }

    if (credit !== 0) {
      const delta = credit * childFactor;
      into.parts.push({
        id: `${step.action}:${into.parts.length}`,
        label: step.optional ? `${label} (optional)` : label,
        credit: round2(delta),
      });
      into.credit += delta;
    }

    if (step.then?.length) walkSteps(step.then, childFactor, into, serverIntegrity, cardPower);
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
  if (card.aura) soft.push({ id: 'aura', reason: 'Power aura depends on other allies at the Location.' });
  if (card.powerSource && card.powerSource !== 'none') {
    soft.push({ id: 'powerSource', reason: 'Live Power bonus depends on game state.' });
  }
  if (card.selfMove) soft.push({ id: 'selfMove', reason: 'Self-move is mobility utility, not a fixed resource credit.' });

  const walk: WalkResult = { credit: 0, parts: [], soft: [] };
  // Skip On Reveal crypto gains on Crypto cards — already counted via cryptoValue.
  if (card.type !== 'Crypto') {
    walkSteps(card.onReveal, 1, walk, serverIntegrity, power);
  }
  walkSteps(card.onCollapse, 1, walk, serverIntegrity, power);
  walkSteps(card.recurring, 1, walk, serverIntegrity, power);
  for (const entry of card.schedule ?? []) walkSteps(entry.effects, 1, walk, serverIntegrity, power);

  for (const flag of walk.soft) {
    if (!soft.some(existing => existing.id === flag.id)) soft.push(flag);
  }
  parts.push(...walk.parts);
  value += walk.credit;

  const baseline = Math.max(0.01, baselineForCost(card.cost ?? 0, curveFor(card)));
  const efficiency = value / baseline;
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
    formula: 'E = V / B(cost); B = α + β·c + γ·c^1.35; Drain/Restore ÷ Server integrity; soft effects flagged only.',
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
    .filter(({ score }) => !opts?.hardOnly || score.soft.length === 0 || (score.soft.length === 1 && score.soft[0]?.id === 'selfMove'));
  if (!anchors.length) return 0;
  const sum = anchors.reduce((total, { score }) => total + score.efficiency, 0);
  return round2(sum / anchors.length);
}
