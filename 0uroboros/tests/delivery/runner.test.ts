import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  AutonomousExitWithoutStopReason,
  DemoDeliveryRunner,
  compactDeliveryContext,
  defaultDeliveryState,
  freshCycleAllowsCheckpoint,
} from '../../src/delivery/runner';
import { loadDeliveryState, saveDeliveryState } from '../../src/delivery/state';
import { computeReviewCheckpointScore, inspectRepo, type RepoEvidence } from '../../src/delivery/score';
import {
  AUTONOMOUS_CONFIDENCE_CHECKPOINT,
  DEFAULT_OBJECTIVES,
  MAX_WORKPACKAGE_REPAIR_ATTEMPTS,
  REPLAN_OBJECTIVES,
} from '../../src/delivery/policy';
import { isProtectedWritePath } from '../../src/swarm/executionPolicy';

function harness() {
  const root = mkdtempSync(join(tmpdir(), '0uro-delivery-'));
  mkdirSync(join(root, 'tools/agent-harness/delivery'), { recursive: true });
  return root;
}

describe('DemoDeliveryRunner', () => {
  it('persists state across a simulated restart', async () => {
    const root = harness();
    const runner = new DemoDeliveryRunner({
      root,
      worker: () => ({ status: 'completed' }),
    });
    const first = await runner.step(defaultDeliveryState('persist'));
    expect(first.state.iteration).toBe(1);
    const reloaded = loadDeliveryState(root);
    expect(reloaded.iteration).toBe(1);
    expect(reloaded.completed_work_packages.length).toBeGreaterThan(0);
  });

  it('does not treat specialist final output as mission complete', () => {
    const root = harness();
    const runner = new DemoDeliveryRunner({ root });
    let state = defaultDeliveryState();
    state = runner.ingestAgentFinalOutput(state, 'I am done. The game is complete.');
    expect(state.stop_reason).toBe('NONE');
    expect(state.next_objective).toBeTruthy();
  });

  it('bounds WorkPackage repair attempts then asks for decompose', () => {
    const root = harness();
    const runner = new DemoDeliveryRunner({ root });
    let state = defaultDeliveryState();
    for (let i = 0; i < MAX_WORKPACKAGE_REPAIR_ATTEMPTS; i += 1) {
      state = runner.failWorkPackage(state, 'wp-draft-overlay');
    }
    expect(state.blocked_work_packages).toContain('wp-draft-overlay');
    expect(state.next_objective).toBe('replan:wp-draft-overlay');
  });

  it('persists budget and stops at the $200 ceiling', () => {
    const root = harness();
    const runner = new DemoDeliveryRunner({ root });
    let state = defaultDeliveryState();
    state = runner.recordSpend(state, 200, 'gpt-6-astra');
    expect(state.stop_reason).toBe('BUDGET_LIMIT');
    saveDeliveryState(root, state);
    expect(loadDeliveryState(root).budget.known_spend_usd).toBe(200);
  });

  it('does not treat unknown prior spend as zero', () => {
    const state = defaultDeliveryState();
    expect(state.budget.unknown_prior).toBe(true);
    expect(state.budget.ceiling_usd).toBe(200);
  });

  it('rule integrity gate prevents an 80% pass', () => {
    const state = defaultDeliveryState();
    state.completed_work_packages = [...Array(12)].map((_, i) => `wp-${i}`);
    const score = computeReviewCheckpointScore(state, {
      ...inspectRepo(process.cwd()),
      rules_intact: false,
      tests_passed: true,
      collapse_theater_ready: true,
      collapse_draft_broken: false,
      visual_evidence_reviewed: true,
      effect_ref_work: true,
    });
    expect(score.blocked_by_gate).toBe(true);
    expect(score.overall).toBeLessThan(AUTONOMOUS_CONFIDENCE_CHECKPOINT);
  });

  it('protected files remain protected', () => {
    const root = harness();
    const runner = new DemoDeliveryRunner({ root });
    expect(runner.refuseProtectedWrite('0uroboros_swarm_v3_0/00_README.md')).toBe(true);
    expect(runner.refuseProtectedWrite('src/swarm/config.ts')).toBe(true);
    expect(isProtectedWritePath('src/client/GameTable.tsx')).toBe(false);
  });

  it('dirty worktree still cannot promote protected paths', () => {
    const root = harness();
    const runner = new DemoDeliveryRunner({ root, dirtyWorktree: true });
    expect(runner.refuseDirtyProtectedPromotion(true, 'docs/phase-1-handoff.md')).toBe(true);
  });

  it('failed execution does not erase completed work', async () => {
    const root = harness();
    const runner = new DemoDeliveryRunner({
      root,
      worker: (state) =>
        state.completed_work_packages.length === 0
          ? { status: 'completed' }
          : { status: 'failed' },
    });
    const first = await runner.step(defaultDeliveryState());
    const completed = [...first.state.completed_work_packages];
    const second = await runner.step(first.state);
    expect(second.state.completed_work_packages).toEqual(completed);
  });

  it('compaction keeps critical fields and not transcript soup', () => {
    const state = defaultDeliveryState();
    state.last_agent_final_output = 'x'.repeat(4000);
    const packet = compactDeliveryContext(state);
    expect(packet.next_objective).toBeTruthy();
    expect(JSON.stringify(packet).length).toBeLessThan(2000);
    expect(packet).not.toHaveProperty('last_agent_final_output');
  });

  it('visual critique schedules another iteration instead of success', () => {
    const root = harness();
    const runner = new DemoDeliveryRunner({ root });
    let state = defaultDeliveryState();
    state = runner.completeWorkPackage(state, 'wp-original-fx', true);
    state = runner.applyVisualCritique(state, false);
    expect(state.visual_quality.passed).toBe(false);
    expect(state.stop_reason).toBe('NONE');
    expect(state.next_objective).toBeTruthy();
  });

  it('quality failure does not auto-report success', () => {
    const root = harness();
    const runner = new DemoDeliveryRunner({ root });
    const state = runner.completeWorkPackage(defaultDeliveryState(), 'wp-draft-overlay', false);
    expect(state.quality_gate.passed).toBe(false);
    expect(state.stop_reason).toBe('NONE');
  });

  it('human checkpoint pauses future autonomous work', async () => {
    const root = harness();
    const runner = new DemoDeliveryRunner({
      root,
      worker: () => ({ status: 'completed' }),
    });
    let state = defaultDeliveryState();
    state.stop_reason = 'HUMAN_DIRECTION_CHECKPOINT';
    state.paused_for_human = true;
    const result = await runner.step(state);
    expect(result.stopped).toBe(true);
    expect(result.state.iteration).toBe(0);
  });

  it('resume continues from the next objective', async () => {
    const root = harness();
    const runner = new DemoDeliveryRunner({
      root,
      worker: () => ({ status: 'completed' }),
    });
    const first = await runner.step(defaultDeliveryState());
    const second = await runner.step(first.state);
    expect(second.state.next_objective).not.toBe(first.state.completed_work_packages[0]);
  });

  it('requires a valid stop reason to leave the loop early', async () => {
    const root = harness();
    const runner = new DemoDeliveryRunner({
      root,
      worker: () => ({ status: 'noop' }),
    });
    const result = await runner.loop(2);
    expect(['NONE', 'HUMAN_DIRECTION_CHECKPOINT', 'BUDGET_LIMIT']).toContain(result.reason);
    if (!result.stopped) expect(result.reason).toBe('NONE');
  });
});

describe('autonomous lifecycle', () => {
  it('does not treat four iterations and NONE as a successful exit', async () => {
    const root = harness();
    const state = defaultDeliveryState();
    state.iteration = 4;
    state.confidence.overall = 0.73;
    state.stop_reason = 'NONE';
    state.next_objective = 'wp-fx-storytelling';
    saveDeliveryState(root, state);
    const runner = new DemoDeliveryRunner({
      root,
      testsPassed: true,
      worker: () => ({ status: 'noop' }),
    });
    await expect(runner.autonomous({ safetyIterationCap: 6 })).rejects.toBeInstanceOf(
      AutonomousExitWithoutStopReason,
    );
    const after = loadDeliveryState(root);
    expect(after.iteration).toBeGreaterThan(4);
    expect(after.stop_reason).toBe('NONE');
  });

  it('reopens visual product packages when the queue is empty below 0.80', async () => {
    const root = harness();
    const runner = new DemoDeliveryRunner({
      root,
      testsPassed: true,
      worker: () => ({ status: 'noop' }),
    });
    const state = defaultDeliveryState();
    state.completed_work_packages = [...DEFAULT_OBJECTIVES, ...REPLAN_OBJECTIVES];
    state.next_objective = null;
    state.confidence.overall = 0.73;
    state.stop_reason = 'NONE';
    const result = await runner.step(state);
    expect(result.stopped).toBe(false);
    expect(result.reason).toBe('NONE');
    expect(result.state.next_objective).toBe('wp-visual-hierarchy');
    expect(result.state.replans).toBeGreaterThan(0);
    expect(result.state.completed_work_packages).not.toContain('wp-visual-hierarchy');
  });

  it('does not checkpoint from file evidence alone without fresh agent cycle', async () => {
    const root = harness();
    const evidence = richEvidence();
    const runner = new DemoDeliveryRunner({
      root,
      testsPassed: true,
      evidence,
      worker: () => ({ status: 'completed', workerMode: 'DETERMINISTIC', liveAgent: false }),
    });
    const state = defaultDeliveryState();
    state.completed_work_packages = [...Array(10)].map((_, i) => `wp-${i}`);
    state.known_defects = [];
    state.visual_quality = { last: 'below_competitive_bar', passed: false };
    const result = await runner.step(state);
    expect(result.reason).toBe('NONE');
    expect(freshCycleAllowsCheckpoint(result.state)).toBe(false);
  });

  it('exits successfully at 0.80 only with fresh live agent evidence', async () => {
    const root = harness();
    const evidence = richEvidence();
    const runner = new DemoDeliveryRunner({
      root,
      testsPassed: true,
      evidence,
      worker: () => ({
        status: 'completed',
        workerMode: 'LIVE_OPENAI',
        liveAgent: true,
        astraInvoked: true,
        specialistsInvoked: ['Astra', 'LookDev', 'ux'],
        requests: 3,
        spendUsd: 0.12,
        critiquePass: true,
        qualityCritique: {
          fresh: true,
          source: 'test',
          at: new Date().toISOString(),
          visual_direction: 0.84,
          ux_comprehension: 0.82,
          reference_bar: 0.8,
          spectacle_quality: 0.8,
          thematic_cohesion: 0.8,
          card_physicality_quality: 0.8,
          deficiencies: [],
          specialists: ['lookdev', 'ux'],
          passed_competitive_bar: true,
        },
      }),
    });
    let state = defaultDeliveryState();
    state.completed_work_packages = [...Array(10)].map((_, i) => `wp-${i}`);
    state.known_defects = [];
    state.fresh_cycle = {
      astra_invocations: 2,
      specialist_invocations: 4,
      live_requests: 6,
      substantive_iterations: 3,
      quality_critique_at: new Date().toISOString(),
      cycle_spend_usd: 0.4,
      last_invalidation: null,
    };
    state.quality_critique = {
      fresh: true,
      source: 'test',
      at: new Date().toISOString(),
      visual_direction: 0.9,
      ux_comprehension: 0.88,
      reference_bar: 0.86,
      spectacle_quality: 0.88,
      thematic_cohesion: 0.86,
      card_physicality_quality: 0.86,
      deficiencies: [],
      specialists: ['lookdev', 'ux'],
      passed_competitive_bar: true,
    };
    state.visual_quality = { last: 'competitive_bar_pass', passed: true };
    const score = computeReviewCheckpointScore(state, evidence);
    expect(score.blocked_by_gate).toBe(false);
    expect(score.overall).toBeGreaterThanOrEqual(AUTONOMOUS_CONFIDENCE_CHECKPOINT);
    expect(freshCycleAllowsCheckpoint(state)).toBe(true);
    const result = await runner.step(state);
    expect(result.reason).toBe('HUMAN_DIRECTION_CHECKPOINT');
    expect(result.stopped).toBe(true);
  });

  it('stops at BUDGET_LIMIT before exceeding $200', async () => {
    const root = harness();
    const runner = new DemoDeliveryRunner({
      root,
      testsPassed: true,
      worker: () => ({ status: 'completed', spendUsd: 2 }),
    });
    const state = defaultDeliveryState();
    state.budget.known_spend_usd = 199;
    state.confidence.overall = 0.73;
    const result = await runner.step(state);
    expect(result.reason).toBe('BUDGET_LIMIT');
    expect(result.state.budget.known_spend_usd).toBe(199);
    expect(result.state.budget.known_spend_usd).toBeLessThanOrEqual(200);
  });

  it('invalidates a false checkpoint back to NONE', () => {
    const root = harness();
    const runner = new DemoDeliveryRunner({ root, testsPassed: true });
    const state = defaultDeliveryState();
    state.stop_reason = 'HUMAN_DIRECTION_CHECKPOINT';
    state.paused_for_human = true;
    state.confidence.overall = 0.8;
    saveDeliveryState(root, state);
    const next = runner.invalidateFalseCheckpoint('CHECKPOINT_INVALIDATED_NO_FRESH_AGENT_EVIDENCE');
    expect(next.stop_reason).toBe('NONE');
    expect(next.paused_for_human).toBe(false);
    expect(next.checkpoint_notes).toContain('CHECKPOINT_INVALIDATED_NO_FRESH_AGENT_EVIDENCE');
    expect(next.visual_quality.passed).toBe(false);
  });
});

function richEvidence(): RepoEvidence {
  return {
    v3_readme: true,
    runner_file: true,
    registry_count: 30,
    collapse_theater_ready: true,
    flight_ondone_cancel: true,
    original_svg_kinds: true,
    shader_or_wavefield: true,
    provenance_file: true,
    board_concept_files: true,
    tests_passed: true,
    rules_intact: true,
    authority_ok: true,
    collapse_draft_broken: false,
    effect_ref_work: true,
    visual_evidence_reviewed: true,
    fx_storytelling: true,
    collapse_spectacle: true,
    card_physicality: true,
    table_depth: true,
  };
}
