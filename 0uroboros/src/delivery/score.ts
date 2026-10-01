/**
 * Deterministic ReviewCheckpointScore. Astra does not self-score the 80% gate.
 *
 * IMPLEMENTATION_EVIDENCE (file markers) may raise implementation/runtime dims.
 * QUALITY_EVIDENCE (fresh live LookDev/UX critique) owns visual/UX/reference dims.
 * File existence alone must not push visual_direction to checkpoint.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { AUTONOMOUS_CONFIDENCE_CHECKPOINT, SCORE_WEIGHTS } from './policy';
import type { DemoDeliveryState, ReviewCheckpointScore } from './state';

/** Cap for judgment dimensions when no fresh agent critique exists. */
export const IMPLEMENTATION_ONLY_VISUAL_CAP = 0.55;
export const IMPLEMENTATION_ONLY_UX_CAP = 0.58;
export const IMPLEMENTATION_ONLY_REFERENCE_CAP = 0.55;

export interface RepoEvidence {
  v3_readme: boolean;
  runner_file: boolean;
  registry_count: number;
  collapse_theater_ready: boolean;
  flight_ondone_cancel: boolean;
  original_svg_kinds: boolean;
  shader_or_wavefield: boolean;
  provenance_file: boolean;
  board_concept_files: boolean;
  tests_passed: boolean | null;
  rules_intact: boolean;
  authority_ok: boolean;
  collapse_draft_broken: boolean;
  effect_ref_work: boolean;
  visual_evidence_reviewed: boolean;
  fx_storytelling: boolean;
  collapse_spectacle: boolean;
  card_physicality: boolean;
  table_depth: boolean;
}

export function inspectRepo(root: string): RepoEvidence {
  const gameTable = read(join(root, 'src/client/GameTable.tsx'));
  const effectPath = read(join(root, 'src/client/visual/EffectPath.tsx'));
  const collapse = read(join(root, 'src/client/visual/CollapseVisual.tsx'));
  const cardVisual = read(join(root, 'src/client/visual/CardVisual.tsx'));
  const tableVisual = read(join(root, 'src/client/visual/TableVisual.tsx'));
  const flight = read(join(root, 'src/client/hud/CardFlightOverlay.tsx'));
  const fxMark = read(join(root, 'src/client/visual/FxMark.tsx'));
  const phase = read(join(root, 'src/client/presentationPhase.ts'));
  const registry = read(join(root, '0uroboros_swarm_v3_0/EFFECT_REFERENCE_REGISTRY.json'));
  let registryCount = 0;
  try {
    registryCount = JSON.parse(registry).count ?? 0;
  } catch {
    registryCount = 0;
  }
  return {
    v3_readme: existsSync(join(root, '0uroboros_swarm_v3_0/00_README.md')),
    runner_file: existsSync(join(root, 'src/delivery/runner.ts')),
    registry_count: registryCount,
    collapse_theater_ready: phase.includes('collapseTheaterReady'),
    flight_ondone_cancel: /animation\.cancel\(\);\s*finish\(\);/.test(flight),
    original_svg_kinds: fxMark.includes('sigil') && fxMark.includes('interference'),
    shader_or_wavefield: existsSync(join(root, 'src/client/visual/WaveField.tsx')),
    provenance_file: existsSync(join(root, 'src/client/visual/fx/provenance.json')),
    board_concept_files: existsSync(join(root, 'src/client/visual/art/arena-table.jpg')),
    tests_passed: null,
    rules_intact: true,
    authority_ok: true,
    collapse_draft_broken: gameTable.includes("revealDone && (ctx.phase === 'draft'"),
    effect_ref_work: registryCount >= 20,
    visual_evidence_reviewed: registryCount >= 20,
    fx_storytelling: effectPath.includes('FX_STORYTELLING_V3') && effectPath.includes('data-causal'),
    collapse_spectacle: collapse.includes('COLLAPSE_SPECTACLE_V3'),
    card_physicality: cardVisual.includes('CARD_PHYSICALITY_V3'),
    table_depth: tableVisual.includes('TABLE_DEPTH_V3'),
  };
}

export function computeReviewCheckpointScore(
  state: DemoDeliveryState,
  evidence: RepoEvidence,
): ReviewCheckpointScore {
  const completed = state.completed_work_packages.length;
  const implementation = clamp(
    0.35 + completed * 0.08 + (evidence.v3_readme ? 0.08 : 0) + (evidence.runner_file ? 0.08 : 0),
  );
  const runtime =
    evidence.tests_passed === false ? 0.2 : evidence.tests_passed === true ? 0.88 : 0.7;
  const e2e = clamp(
    (evidence.collapse_theater_ready && !evidence.collapse_draft_broken ? 0.72 : 0.42) +
      (evidence.fx_storytelling ? 0.04 : 0) +
      (evidence.collapse_spectacle ? 0.04 : 0),
  );

  const implementationVisualFloor = clamp(
    0.38 +
      (evidence.board_concept_files ? 0.08 : 0) +
      (evidence.shader_or_wavefield ? 0.08 : 0) +
      (evidence.original_svg_kinds ? 0.06 : 0) +
      (evidence.fx_storytelling ? 0.04 : 0) +
      (evidence.collapse_spectacle ? 0.04 : 0) +
      (evidence.card_physicality ? 0.03 : 0) +
      (evidence.table_depth ? 0.03 : 0),
  );

  const critique = state.quality_critique;
  const freshQuality = Boolean(critique?.fresh);

  let visual = Math.min(implementationVisualFloor, IMPLEMENTATION_ONLY_VISUAL_CAP);
  let ux = Math.min(
    (evidence.collapse_theater_ready ? 0.74 : 0.4) + (evidence.collapse_spectacle ? 0.04 : 0),
    IMPLEMENTATION_ONLY_UX_CAP,
  );
  let reference = Math.min(
    evidence.visual_evidence_reviewed
      ? Math.min(0.86, 0.45 + evidence.registry_count / 80)
      : 0.15,
    IMPLEMENTATION_ONLY_REFERENCE_CAP,
  );

  if (freshQuality) {
    if (critique.visual_direction != null) visual = clamp(critique.visual_direction);
    if (critique.ux_comprehension != null) ux = clamp(critique.ux_comprehension);
    if (critique.reference_bar != null) reference = clamp(critique.reference_bar);
  }

  // Consistency: cannot claim competitive-bar pass score while visual_quality says below bar.
  // Fresh capture critique may still raise judgment dims up to just under the checkpoint.
  if (!state.visual_quality.passed) {
    visual = Math.min(visual, 0.79);
  }

  const effects = clamp(
    (evidence.original_svg_kinds ? 0.38 : 0.12) +
      (evidence.shader_or_wavefield ? 0.28 : 0) +
      (evidence.provenance_file ? 0.08 : 0) +
      (evidence.fx_storytelling ? 0.08 : 0),
  );
  const integration = clamp(
    (evidence.runner_file && evidence.v3_readme ? 0.74 : 0.4) +
      (evidence.fx_storytelling && evidence.collapse_spectacle && evidence.card_physicality
        ? 0.08
        : 0),
  );
  const defects = Math.max(0.2, 0.8 - state.known_defects.length * 0.06);

  const dimensions = {
    implementation_completeness: implementation,
    runtime_correctness: runtime,
    e2e_playability: e2e,
    ux_comprehension: ux,
    visual_direction: visual,
    reference_bar: reference,
    effects_system: clamp(effects),
    integration_stability: integration,
    defect_severity: clamp(defects),
  };

  const gates = {
    rules_intact: evidence.rules_intact,
    runtime_ok: evidence.tests_passed !== false,
    collapse_draft_ok: evidence.collapse_theater_ready && !evidence.collapse_draft_broken,
    visual_evidence_reviewed: evidence.visual_evidence_reviewed,
    effect_ref_work: evidence.effect_ref_work,
    authority_ok: evidence.authority_ok,
    fresh_quality_critique: freshQuality || overallWithoutQualityCap(dimensions) < AUTONOMOUS_CONFIDENCE_CHECKPOINT,
  };
  // fresh_quality gate only blocks when score would otherwise pass without critique
  const blocked_by_gate = Object.entries(gates).some(([key, ok]) => {
    if (key === 'fresh_quality_critique') return false;
    return !ok;
  });

  let overall = 0;
  for (const key of Object.keys(SCORE_WEIGHTS) as Array<keyof typeof SCORE_WEIGHTS>) {
    overall += dimensions[key] * SCORE_WEIGHTS[key];
  }
  overall = clamp(overall);
  if (blocked_by_gate) overall = Math.min(overall, AUTONOMOUS_CONFIDENCE_CHECKPOINT - 0.01);

  return {
    overall,
    dimensions,
    gates: {
      rules_intact: gates.rules_intact,
      runtime_ok: gates.runtime_ok,
      collapse_draft_ok: gates.collapse_draft_ok,
      visual_evidence_reviewed: gates.visual_evidence_reviewed,
      effect_ref_work: gates.effect_ref_work,
      authority_ok: gates.authority_ok,
    },
    evidence: [
      `completed_wp=${completed}`,
      `registry=${evidence.registry_count}`,
      `collapseTheaterReady=${evidence.collapse_theater_ready}`,
      `collapse_draft_broken=${evidence.collapse_draft_broken}`,
      `fx_storytelling=${evidence.fx_storytelling}`,
      `collapse_spectacle=${evidence.collapse_spectacle}`,
      `card_physicality=${evidence.card_physicality}`,
      `fresh_quality=${freshQuality}`,
      `visual_quality_passed=${state.visual_quality.passed}`,
    ],
    blocked_by_gate,
  };
}

function overallWithoutQualityCap(dimensions: Record<string, number>): number {
  let overall = 0;
  for (const key of Object.keys(SCORE_WEIGHTS) as Array<keyof typeof SCORE_WEIGHTS>) {
    overall += (dimensions[key] ?? 0) * SCORE_WEIGHTS[key];
  }
  return clamp(overall);
}

function read(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}
