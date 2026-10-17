import { createHash } from 'node:crypto';
import { versionLabel, type StrategyProfile } from '@0uroboros/engine/ai/strategy';
import type { SelfPlayResult } from '@0uroboros/engine/ai/selfPlay';
import type { CompiledContent, ContentDocument } from '@0uroboros/engine/authoring/contentModel';
import { sealEvidence, type GameEvidence, type StratGEvidence } from './evidence';
import type { EcoStrat } from './ecoStrat';

/**
 * Runs seeded AI-vs-AI cohorts under normal rules. Content and the Strat-G profile are read
 * once and frozen for the whole cohort, so nothing changes between games; Strat-G itself is not
 * involved (no debriefs, no learning) and Eco-Strat only receives the sealed results.
 */
export type SelfPlayHarness = {
  compileForSelfPlay: (document: ContentDocument) => CompiledContent;
  playSelfPlayGame: (options: { content: CompiledContent; seed: number; strategy: StrategyProfile; recordDecisions?: boolean }) => SelfPlayResult;
};
export type CohortOptions = {
  kind: 'baseline' | 'evaluation';
  target: number;
  eco: Pick<EcoStrat, 'beginCohort' | 'updateCohort' | 'observe' | 'report'>;
  harness: () => Promise<SelfPlayHarness>;
  document: () => Promise<ContentDocument>;
  stratG: { profile: StrategyProfile; version: number; mode: string; plan: string };
  seedBase?: number;
  /** Attempts allowed beyond the target before the cohort is declared failed. */
  maxExtraAttempts?: number;
  shouldStop?: () => boolean;
  onProgress?: (state: { cohortId: string; valid: number; invalid: number; target: number }) => void;
  log?: (message: string) => void;
};

export const profileHash = (profile: StrategyProfile) => createHash('sha256').update(JSON.stringify(profile)).digest('hex').slice(0, 10);

export async function runCohort(options: CohortOptions) {
  const log = options.log ?? (() => undefined);
  const harness = await options.harness();
  const document = structuredClone(await options.document());
  const content = harness.compileForSelfPlay(document);
  const strategy = Object.freeze(structuredClone(options.stratG.profile));
  const strategyHash = profileHash(strategy);
  const cohortId = await options.eco.beginCohort({ kind: options.kind, target: options.target, seeds: [], strategyHash, strategyVersion: versionLabel(options.stratG.version) });
  const stratG: StratGEvidence = { version: options.stratG.version, mode: options.stratG.mode, plan: options.stratG.plan, notes: [], theories: [] };
  const seedBase = options.seedBase ?? 1001;
  let valid = 0, invalid = 0;
  log(`${cohortId}: ${options.target} games, Strat-G ${versionLabel(options.stratG.version)} profile ${strategyHash}.`);
  for (let attempt = 0; valid < options.target && attempt < options.target + (options.maxExtraAttempts ?? options.target); attempt++) {
    if (options.shouldStop?.()) { await options.eco.updateCohort(cohortId, { status: 'cancelled', note: `stopped after ${valid} valid games` }); return { cohortId, valid, invalid, status: 'cancelled' as const }; }
    const seed = seedBase + attempt;
    // Let the dev server answer requests between games (every few games is enough for /api/agents/status).
    if (attempt % 8 === 0) await new Promise(resolve => setImmediate(resolve));
    const result = harness.playSelfPlayGame({ content, seed, strategy: structuredClone(strategy), recordDecisions: true });
    await options.eco.updateCohort(cohortId, { seed });
    if (result.report) {
      const evidence: GameEvidence = {
        id: `${cohortId}-s${seed}`, source: 'self-play', recordedAt: new Date().toISOString(), seed, cohortId, strategyHash, durationMs: result.durationMs,
        valid: result.valid, ...(result.invalidReason ? { invalidReason: result.invalidReason } : {}), report: result.report, stratG,
      };
      await options.eco.observe(sealEvidence(evidence));
      if (result.valid) await options.eco.updateCohort(cohortId, { validGame: evidence.id });
    }
    if (result.valid) valid++;
    else { invalid++; await options.eco.updateCohort(cohortId, { invalid: { seed, reason: result.invalidReason ?? 'unknown' } }); log(`${cohortId}: seed ${seed} invalid (${result.invalidReason}).`); }
    options.onProgress?.({ cohortId, valid, invalid, target: options.target });
  }
  const complete = valid >= options.target;
  await options.eco.updateCohort(cohortId, { status: complete ? 'complete' : 'failed', ...(complete ? {} : { note: `only ${valid} valid games in the allowed attempts` }) });
  log(`${cohortId}: ${valid} valid, ${invalid} invalid.`);
  if (complete) await options.eco.report(options.kind === 'baseline' ? 'baseline' : 'manual', cohortId);
  return { cohortId, valid, invalid, status: complete ? 'complete' as const : 'failed' as const };
}
