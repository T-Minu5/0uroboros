/**
 * Runs a content A/B experiment: paired same-seed control vs patched document, publishes
 * each game into Eco-Strat arm-tagged cohorts, then writes an arm-compare report.
 */
import { createHash } from 'node:crypto';
import { applyCardPatch, runContentAb, type CardPatch, type ContentAbReport } from '@0uroboros/engine/ai/contentAb';
import { versionLabel, type StrategyProfile } from '@0uroboros/engine/ai/strategy';
import type { ContentDocument } from '@0uroboros/engine/authoring/contentModel';
import type { BudgetCard } from '@0uroboros/engine/authoring/cardBudget';
import { profileHash, type SelfPlayHarness } from './cohortRunner';
import { sealEvidence, type GameEvidence, type StratGEvidence } from './evidence';
import type { EcoStrat } from './ecoStrat';
import type { CohortArm } from './ecoJournal';

export const DEFAULT_CONTENT_AB_SEEDS = 40;

export type ContentAbRunnerOptions = {
  eco: Pick<EcoStrat, 'beginCohort' | 'updateCohort' | 'observe' | 'reportArmCompare'>;
  harness: () => Promise<SelfPlayHarness>;
  control: () => Promise<ContentDocument>;
  patch: CardPatch;
  stratG: { profile: StrategyProfile; version: number; mode: string; plan: string };
  /** Number of paired seeds (default 40 → 80 games). */
  seedCount?: number;
  seedBase?: number;
  experimentId?: string;
  shouldStop?: () => boolean;
  onProgress?: (state: { experimentId: string; seedIndex: number; seedCount: number }) => void;
  log?: (message: string) => void;
};

function docHash(doc: ContentDocument) {
  return createHash('sha256').update(JSON.stringify(doc)).digest('hex').slice(0, 10);
}

export async function runContentAbExperiment(options: ContentAbRunnerOptions) {
  const log = options.log ?? (() => undefined);
  const harness = await options.harness();
  const controlDoc = structuredClone(await options.control());
  const patchDoc = applyCardPatch(controlDoc, options.patch);
  const strategy = Object.freeze(structuredClone(options.stratG.profile));
  const strategyHash = profileHash(strategy);
  const seedCount = options.seedCount ?? DEFAULT_CONTENT_AB_SEEDS;
  const seedBase = options.seedBase ?? 50_000;
  const seeds = Array.from({ length: seedCount }, (_, i) => seedBase + i);
  const experimentId = options.experimentId ?? `cab-${options.patch.definitionId}-${Date.now().toString(36)}`;
  const cardId = options.patch.definitionId;
  const stratG: StratGEvidence = {
    version: options.stratG.version, mode: options.stratG.mode, plan: options.stratG.plan, notes: [], theories: [],
  };

  const armMeta = (role: CohortArm['role']): CohortArm => ({
    role, cardId, experimentId, label: role === 'control' ? 'control pack' : `patch ${cardId}`,
  });

  const controlCohortId = await options.eco.beginCohort({
    kind: 'evaluation',
    target: seedCount,
    seeds: [],
    strategyHash,
    strategyVersion: versionLabel(options.stratG.version),
    arm: armMeta('control'),
  });
  const patchCohortId = await options.eco.beginCohort({
    kind: 'evaluation',
    target: seedCount,
    seeds: [],
    strategyHash,
    strategyVersion: versionLabel(options.stratG.version),
    arm: armMeta('patch'),
  });

  log(`${experimentId}: ${seedCount} paired seeds, card ${cardId}, control ${docHash(controlDoc)} vs patch ${docHash(patchDoc)}.`);

  const ab: ContentAbReport = runContentAb({
    control: controlDoc,
    patch: patchDoc,
    strategy: structuredClone(strategy),
    seeds,
    harness,
    cardId,
    recordDecisions: true,
  });

  for (let i = 0; i < seeds.length; i++) {
    if (options.shouldStop?.()) {
      await options.eco.updateCohort(controlCohortId, { status: 'cancelled', note: 'stopped mid content A/B' });
      await options.eco.updateCohort(patchCohortId, { status: 'cancelled', note: 'stopped mid content A/B' });
      return { experimentId, controlCohortId, patchCohortId, status: 'cancelled' as const, ab };
    }
    if (i % 4 === 0) await new Promise(resolve => setImmediate(resolve));
    const seed = seeds[i]!;
    options.onProgress?.({ experimentId, seedIndex: i + 1, seedCount });

    for (const arm of ['control', 'patch'] as const) {
      const game = ab.games.find(entry => entry.seed === seed && entry.arm === arm);
      if (!game) continue;
      const cohortId = arm === 'control' ? controlCohortId : patchCohortId;
      await options.eco.updateCohort(cohortId, { seed });
      if (!game.result.report) {
        await options.eco.updateCohort(cohortId, { invalid: { seed, reason: game.result.invalidReason ?? 'no report' } });
        continue;
      }
      const evidence: GameEvidence = {
        id: `${cohortId}-s${seed}`,
        source: 'self-play',
        recordedAt: new Date().toISOString(),
        seed,
        cohortId,
        strategyHash,
        durationMs: game.result.durationMs,
        valid: game.result.valid,
        ...(game.result.invalidReason ? { invalidReason: game.result.invalidReason } : {}),
        report: game.result.report,
        stratG,
        arm: armMeta(arm),
      };
      await options.eco.observe(sealEvidence(evidence));
      if (game.result.valid) await options.eco.updateCohort(cohortId, { validGame: evidence.id });
      else await options.eco.updateCohort(cohortId, { invalid: { seed, reason: game.result.invalidReason ?? 'invalid' } });
    }
  }

  await options.eco.updateCohort(controlCohortId, { status: 'complete' });
  await options.eco.updateCohort(patchCohortId, { status: 'complete' });

  const catalog = controlDoc.cards as unknown as BudgetCard[];
  const compare = await options.eco.reportArmCompare({
    experimentId,
    controlCohortId,
    patchCohortId,
    cardId,
    ab,
    catalogCards: catalog,
  });

  log(`${experimentId}: done. patchWinRate=${ab.patchWinRate === null ? 'n/a' : Math.round(ab.patchWinRate * 100) + '%'}.`);
  return {
    experimentId,
    controlCohortId,
    patchCohortId,
    status: 'complete' as const,
    ab,
    compare,
  };
}
