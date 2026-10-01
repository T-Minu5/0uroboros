/**
 * Long-running demo delivery loop.
 *
 * One OpenAI Agents SDK run is not this loop. Specialist finalOutput is stored
 * and ignored as a mission-complete signal.
 */

import { isProtectedWritePath } from '../swarm/executionPolicy';
import { writeHeartbeat } from './heartbeat';
import {
  AUTONOMOUS_CONFIDENCE_CHECKPOINT,
  DEFAULT_OBJECTIVES,
  MAX_WORKPACKAGE_REPAIR_ATTEMPTS,
  MIN_FRESH_ASTRA_INVOCATIONS,
  MIN_FRESH_SPECIALIST_INVOCATIONS,
  MIN_FRESH_SUBSTANTIVE_ITERATIONS,
  REPLAN_OBJECTIVES,
  REPLAN_PREFIX,
  STALL_REASSESS_AFTER,
  STALL_UNRECOVERABLE_AFTER,
  STOP_AUTHORITY,
  STOP_BUDGET,
  STOP_HUMAN_CHECKPOINT,
  STOP_NONE,
  STOP_TECHNICAL,
  VALID_AUTONOMOUS_STOPS,
  type StopReason,
} from './policy';
import { computeReviewCheckpointScore, inspectRepo, type RepoEvidence } from './score';
import { reopenVisualObjectives, shouldReopenVisualQueue } from './implementer';
import {
  defaultDeliveryState,
  loadDeliveryState,
  saveDeliveryState,
  type DemoDeliveryState,
  type QualityCritique,
} from './state';

export interface DeliveryStepResult {
  state: DemoDeliveryState;
  stopped: boolean;
  reason: StopReason;
}

export class AutonomousExitWithoutStopReason extends Error {
  readonly code = 'AUTONOMOUS_EXIT_WITHOUT_STOP_REASON';
  constructor(public readonly state: DemoDeliveryState) {
    super(
      `AUTONOMOUS_EXIT_WITHOUT_STOP_REASON: process reached completion with stop_reason=${state.stop_reason} score=${state.confidence.overall} iteration=${state.iteration} next=${state.next_objective}`,
    );
    this.name = 'AutonomousExitWithoutStopReason';
  }
}

export interface AutonomousOptions {
  /** Tests only. If hit with NONE, throw harness failure instead of returning success. */
  safetyIterationCap?: number;
  cancelled?: () => boolean;
}

export interface DeliveryRunnerOptions {
  root: string;
  testsPassed?: boolean | null;
  dirtyWorktree?: boolean;
  evidence?: RepoEvidence;
  worker?: DeliveryWorker;
  requireLiveWorker?: boolean;
}

export interface DeliveryWorkerResult {
  status: 'completed' | 'failed' | 'blocked' | 'noop';
  note?: string;
  spendUsd?: number;
  qualityPassed?: boolean;
  critiquePass?: boolean;
  authorityViolation?: boolean;
  ruleDecisionRequired?: boolean;
  liveAgent?: boolean;
  astraInvoked?: boolean;
  specialistsInvoked?: string[];
  qualityCritique?: QualityCritique;
  requests?: number;
  workerMode?: 'LIVE_OPENAI' | 'DETERMINISTIC' | 'NOOP';
}

export type DeliveryWorker = (
  state: DemoDeliveryState,
  objective: string,
) => DeliveryWorkerResult | Promise<DeliveryWorkerResult>;

export function compactDeliveryContext(state: DemoDeliveryState): Record<string, string> {
  return {
    next_objective: state.next_objective ?? '',
    milestone: state.milestone,
    completed: state.completed_work_packages.join(','),
    defects: state.known_defects.slice(0, 6).join('|'),
    score: String(state.confidence.overall),
    budget_known: String(state.budget.known_spend_usd),
    stop: state.stop_reason,
    last_wp: state.current_work_packages[0]?.id ?? '',
  };
}

export class DemoDeliveryRunner {
  constructor(private readonly options: DeliveryRunnerOptions) {}

  load(): DemoDeliveryState {
    return loadDeliveryState(this.options.root);
  }

  save(state: DemoDeliveryState): void {
    saveDeliveryState(this.options.root, state);
  }

  assess(state: DemoDeliveryState, evidence?: RepoEvidence): DemoDeliveryState {
    const repo = evidence ?? this.options.evidence ?? inspectRepo(this.options.root);
    if (this.options.testsPassed !== undefined) repo.tests_passed = this.options.testsPassed;
    let next = applyEvidenceCompletions({ ...state }, repo);
    next.effect_reference_coverage = {
      registry_count: repo.registry_count,
      inspected: repo.effect_ref_work,
    };
    next.effect_implementation_coverage = {
      original_svg: repo.original_svg_kinds,
      original_r3f_or_shader: repo.shader_or_wavefield,
    };
    next.implementation_guide_completion = Math.min(
      0.72,
      0.52 + next.completed_work_packages.length * 0.03,
    );
    const picked = pickNextObjective(next);
    if (picked?.startsWith(REPLAN_PREFIX) && picked !== state.next_objective) {
      next.replans += 1;
    }
    next.next_objective = picked;
    next.confidence = computeReviewCheckpointScore(next, repo);
    next.confidence_evidence = next.confidence.evidence;
    next.compacted = compactDeliveryContext(next);
    return next;
  }

  ingestAgentFinalOutput(state: DemoDeliveryState, text: string): DemoDeliveryState {
    const next = { ...state, last_agent_final_output: text };
    if (next.stop_reason === STOP_NONE) {
      next.next_objective = pickNextObjective(next);
    }
    return next;
  }

  recordSpend(state: DemoDeliveryState, usd: number, model: string): DemoDeliveryState {
    const next = clone(state);
    const projected = next.budget.known_spend_usd + usd;
    if (projected > next.budget.ceiling_usd) {
      next.stop_reason = STOP_BUDGET;
      next.paused_for_human = true;
      return next;
    }
    next.budget = {
      ...next.budget,
      known_spend_usd: projected,
    };
    next.model_usage = mergeUsage(next.model_usage, model);
    if (next.budget.known_spend_usd >= next.budget.ceiling_usd) {
      next.stop_reason = STOP_BUDGET;
      next.paused_for_human = true;
    }
    return next;
  }

  completeWorkPackage(state: DemoDeliveryState, id: string, qualityPassed = true): DemoDeliveryState {
    const next = clone(state);
    next.completed_work_packages = [...new Set([...next.completed_work_packages, id])];
    next.current_work_packages = next.current_work_packages.filter((item) => item.id !== id);
    next.known_defects = next.known_defects.filter((item) => !item.includes(id));
    if (!qualityPassed) {
      next.quality_gate = { last: id, passed: false };
      next.next_objective = id;
      return next;
    }
    next.quality_gate = { last: id, passed: true };
    next.last_successful_integration = id;
    next.next_objective = pickNextObjective(next);
    return next;
  }

  failWorkPackage(state: DemoDeliveryState, id: string): DemoDeliveryState {
    const next = clone(state);
    const current = next.current_work_packages.find((item) => item.id === id) ?? {
      id,
      status: 'repair' as const,
      repair_attempts: 0,
    };
    current.repair_attempts += 1;
    current.status = current.repair_attempts >= MAX_WORKPACKAGE_REPAIR_ATTEMPTS ? 'blocked' : 'repair';
    next.current_work_packages = [
      current,
      ...next.current_work_packages.filter((item) => item.id !== id),
    ];
    if (current.status === 'blocked') {
      next.blocked_work_packages = [...new Set([...next.blocked_work_packages, id])];
      next.failed_work_packages += 1;
      next.next_objective = `${REPLAN_PREFIX}${id}`;
    } else {
      next.repairs += 1;
      next.next_objective = id;
    }
    return next;
  }

  applyVisualCritique(state: DemoDeliveryState, pass: boolean): DemoDeliveryState {
    const next = clone(state);
    next.visual_quality = { last: pass ? 'pass' : 'fail', passed: pass };
    if (!pass) {
      next.next_objective = next.next_objective ?? 'wp-original-fx';
      next.stop_reason = STOP_NONE;
    }
    return next;
  }

  refuseProtectedWrite(path: string): boolean {
    return isProtectedWritePath(path);
  }

  refuseDirtyProtectedPromotion(dirty: boolean, path: string): boolean {
    return dirty && isProtectedWritePath(path);
  }

  async step(state: DemoDeliveryState): Promise<DeliveryStepResult> {
    if (state.paused_for_human && state.stop_reason !== STOP_NONE) {
      return { state, stopped: true, reason: state.stop_reason };
    }
    if (state.stop_reason !== STOP_NONE) {
      return { state, stopped: true, reason: state.stop_reason };
    }

    let next = this.assess(state);
    next = this.maybeCheckpoint(next);
    if (next.stop_reason !== STOP_NONE) {
      this.save(next);
      writeHeartbeat(this.options.root, next, { status: 'exited' });
      return { state: next, stopped: true, reason: next.stop_reason };
    }
    next.iteration += 1;
    this.save(next);

    if (next.budget.known_spend_usd >= next.budget.ceiling_usd) {
      next.stop_reason = STOP_BUDGET;
      next.paused_for_human = true;
      this.save(next);
      return { state: next, stopped: true, reason: STOP_BUDGET };
    }

    const objective = next.next_objective;
    if (!objective) {
      next = this.replanIfNeeded(next);
    }

    const resolved = next.next_objective;
    if (!resolved) {
      next = this.maybeCheckpoint(next);
      if (next.stop_reason === STOP_NONE && next.confidence.overall < AUTONOMOUS_CONFIDENCE_CHECKPOINT) {
        next = this.replanIfNeeded(next);
      }
      this.save(next);
      writeHeartbeat(this.options.root, next, {
        last_iteration_completed: new Date().toISOString(),
        status: next.stop_reason === STOP_NONE ? 'working' : 'exited',
      });
      return { state: next, stopped: next.stop_reason !== STOP_NONE, reason: next.stop_reason };
    }

    writeHeartbeat(this.options.root, next, {
      last_iteration_started: new Date().toISOString(),
      active_specialist: resolved.startsWith(REPLAN_PREFIX) ? 'astra-replan' : 'delivery-worker',
      status: 'working',
    });

    const worker = this.options.worker ?? ((): DeliveryWorkerResult => ({ status: 'noop' }));
    if (this.options.requireLiveWorker) {
      // Worker must be provided by CLI as LIVE_OPENAI; default noop is forbidden.
    }
    const result: DeliveryWorkerResult = await Promise.resolve(worker(next, resolved));

    if (this.options.requireLiveWorker && result.workerMode !== 'LIVE_OPENAI') {
      throw new Error(
        `AUTONOMOUS worker_mode=${result.workerMode ?? 'missing'} expected LIVE_OPENAI`,
      );
    }

    if (result.authorityViolation) {
      next.stop_reason = STOP_AUTHORITY;
      next.paused_for_human = true;
      this.save(next);
      return { state: next, stopped: true, reason: STOP_AUTHORITY };
    }
    if (result.ruleDecisionRequired) {
      next.stop_reason = 'HUMAN_RULE_DECISION_REQUIRED';
      next.paused_for_human = true;
      this.save(next);
      return { state: next, stopped: true, reason: 'HUMAN_RULE_DECISION_REQUIRED' };
    }
    if (result.spendUsd) {
      if (next.budget.known_spend_usd + result.spendUsd > next.budget.ceiling_usd) {
        next.stop_reason = STOP_BUDGET;
        next.paused_for_human = true;
        this.save(next);
        writeHeartbeat(this.options.root, next, { status: 'exited' });
        return { state: next, stopped: true, reason: STOP_BUDGET };
      }
      next = this.recordSpend(next, result.spendUsd, result.workerMode === 'LIVE_OPENAI' ? 'live-openai' : 'worker');
    }

    next = this.applyWorkerEvidence(next, result);

    if (result.status === 'completed') {
      next = this.completeWorkPackage(next, stripDecompose(resolved), result.qualityPassed !== false);
      if (result.critiquePass === false) next = this.applyVisualCritique(next, false);
      if (result.critiquePass === true) next = this.applyVisualCritique(next, true);
    } else if (result.status === 'failed') {
      next = this.failWorkPackage(next, stripDecompose(resolved));
    } else if (result.status === 'blocked') {
      next.blocked_work_packages = [...new Set([...next.blocked_work_packages, resolved])];
      next = this.replanIfNeeded(next);
    } else if (result.status === 'noop' && resolved.startsWith(REPLAN_PREFIX)) {
      next = this.applyReplan(next, resolved);
    }

    next = this.assess(next);
    next = this.trackStall(next, resolved);
    next = this.maybeCheckpoint(next);
    next.compacted = compactDeliveryContext(next);
    this.save(next);
    writeHeartbeat(this.options.root, next, {
      last_iteration_completed: new Date().toISOString(),
      status: next.stop_reason === STOP_NONE ? 'working' : 'exited',
    });
    return {
      state: next,
      stopped: next.stop_reason !== STOP_NONE,
      reason: next.stop_reason,
    };
  }

  applyWorkerEvidence(state: DemoDeliveryState, result: DeliveryWorkerResult): DemoDeliveryState {
    const next = clone(state);
    if (!next.fresh_cycle) {
      next.fresh_cycle = {
        astra_invocations: 0,
        specialist_invocations: 0,
        live_requests: 0,
        substantive_iterations: 0,
        quality_critique_at: null,
        cycle_spend_usd: 0,
        last_invalidation: null,
      };
    }
    if (!next.quality_critique) {
      next.quality_critique = {
        fresh: false,
        source: 'none',
        at: null,
        visual_direction: null,
        ux_comprehension: null,
        reference_bar: null,
        spectacle_quality: null,
        thematic_cohesion: null,
        card_physicality_quality: null,
        deficiencies: [],
        specialists: [],
        passed_competitive_bar: false,
      };
    }
    if (!next.checkpoint_notes) next.checkpoint_notes = [];
    if (result.workerMode) next.worker_mode = result.workerMode;
    if (result.astraInvoked) {
      next.fresh_cycle.astra_invocations += 1;
      next.fresh_cycle.substantive_iterations += 1;
    }
    if (result.specialistsInvoked?.length) {
      next.fresh_cycle.specialist_invocations += result.specialistsInvoked.length;
    }
    if (typeof result.requests === 'number') {
      next.fresh_cycle.live_requests += result.requests;
    }
    if (result.spendUsd) {
      next.fresh_cycle.cycle_spend_usd += result.spendUsd;
    }
    if (result.qualityCritique?.fresh) {
      next.quality_critique = result.qualityCritique;
      next.fresh_cycle.quality_critique_at = result.qualityCritique.at;
      next.visual_quality = {
        last: result.qualityCritique.passed_competitive_bar
          ? 'competitive_bar_pass'
          : 'below_competitive_bar',
        passed: result.qualityCritique.passed_competitive_bar,
      };
      if (result.qualityCritique.deficiencies.length > 0) {
        next.known_defects = [
          ...new Set([
            ...next.known_defects.filter((item) => !item.startsWith('visual:')),
            ...result.qualityCritique.deficiencies.slice(0, 5).map((item) => `visual: ${item}`),
          ]),
        ];
      }
    }
    if (result.liveAgent && result.astraInvoked && (result.requests ?? 0) <= 0) {
      next.checkpoint_notes.push('AGENT_INVOCATION_NOT_PROVEN');
    }
    return next;
  }

  /** Batch / debug. May return with NONE. Not autonomous mode. */
  async batch(iterations: number): Promise<DeliveryStepResult> {
    return this.loop(iterations);
  }

  async loop(maxSteps: number): Promise<DeliveryStepResult> {
    let state = this.load();
    let last: DeliveryStepResult = { state, stopped: false, reason: STOP_NONE };
    for (let i = 0; i < maxSteps; i += 1) {
      last = await this.step(state);
      state = last.state;
      if (last.stopped) return last;
    }
    this.save(state);
    return last;
  }

  /**
   * Production long-run. Continues until a valid stop. Returning with NONE is a
   * harness failure, not success.
   */
  async autonomous(options: AutonomousOptions = {}): Promise<DeliveryStepResult> {
    let state = this.load();
    let last: DeliveryStepResult = { state, stopped: false, reason: STOP_NONE };
    while (true) {
      if (options.cancelled?.()) {
        state.stop_reason = 'USER_CANCELLED';
        state.paused_for_human = true;
        this.save(state);
        writeHeartbeat(this.options.root, state, { status: 'exited' });
        return { state, stopped: true, reason: 'USER_CANCELLED' };
      }
      last = await this.step(state);
      state = last.state;
      if (last.stopped && VALID_AUTONOMOUS_STOPS.includes(last.reason)) {
        return last;
      }
      if (last.stopped && last.reason !== STOP_NONE) {
        return last;
      }
      if (options.safetyIterationCap && state.iteration >= options.safetyIterationCap) {
        this.save(state);
        throw new AutonomousExitWithoutStopReason(state);
      }
    }
  }

  replanIfNeeded(state: DemoDeliveryState): DemoDeliveryState {
    if (state.stop_reason !== STOP_NONE) return state;
    if (state.confidence.overall >= AUTONOMOUS_CONFIDENCE_CHECKPOINT && !state.confidence.blocked_by_gate) {
      return this.maybeCheckpoint(state);
    }
    let next = clone(state);
    if (shouldReopenVisualQueue(next)) {
      next = reopenVisualObjectives(next);
      next.replans += 1;
      next.checkpoint_notes = [
        ...(next.checkpoint_notes ?? []),
        `reopened-visual-queue-pass-${next.replans}`,
      ];
      return next;
    }
    const scheduled = pickNextObjective(next);
    if (scheduled) {
      next.next_objective = scheduled;
      return next;
    }
    next.replans += 1;
    next.next_objective = `${REPLAN_PREFIX}visual-pass-${next.replans}`;
    return next;
  }

  applyReplan(state: DemoDeliveryState, objective: string): DemoDeliveryState {
    let next = clone(state);
    next.replans = Math.max(next.replans, 1);
    if (shouldReopenVisualQueue(next) || objective.startsWith(`${REPLAN_PREFIX}visual-pass`)) {
      next = reopenVisualObjectives(next);
      next.checkpoint_notes = [
        ...(next.checkpoint_notes ?? []).filter((note) => !note.startsWith('replan-applied:')).slice(-12),
        `replan-applied:${objective}`,
      ];
      return next;
    }
    next = this.replanIfNeeded(next);
    if (!next.next_objective || next.next_objective === objective) {
      const candidate = REPLAN_OBJECTIVES.find(
        (id) => !next.completed_work_packages.includes(id) && !next.blocked_work_packages.includes(id),
      );
      next.next_objective = candidate ?? `wp-visual-pass-${next.replans}`;
    }
    return next;
  }

  trackStall(state: DemoDeliveryState, objective: string): DemoDeliveryState {
    const next = clone(state);
    const signature = next.confidence.overall.toFixed(3);
    if (next.last_score > 0 && signature === next.last_score.toFixed(3)) {
      next.stall_count += 1;
    } else {
      next.stall_count = 0;
    }
    next.last_objective_signature = `${objective}:${signature}`;
    next.last_score = next.confidence.overall;
    if (next.stall_count >= STALL_UNRECOVERABLE_AFTER) {
      next.stop_reason = STOP_TECHNICAL;
      next.paused_for_human = true;
    } else if (next.stall_count >= STALL_REASSESS_AFTER && next.stop_reason === STOP_NONE) {
      next.next_objective = `${REPLAN_PREFIX}stall-${next.stall_count}`;
    }
    return next;
  }

  maybeCheckpoint(state: DemoDeliveryState): DemoDeliveryState {
    const next = clone(state);
    if (
      next.confidence.overall >= AUTONOMOUS_CONFIDENCE_CHECKPOINT &&
      !next.confidence.blocked_by_gate &&
      freshCycleAllowsCheckpoint(next)
    ) {
      next.stop_reason = STOP_HUMAN_CHECKPOINT;
      next.paused_for_human = true;
    }
    return next;
  }

  invalidateFalseCheckpoint(
    reason = 'CHECKPOINT_INVALIDATED_NO_FRESH_AGENT_EVIDENCE',
  ): DemoDeliveryState {
    const state = this.load();
    let next = clone(state);
    next.checkpoint_notes = [...(next.checkpoint_notes ?? []), reason];
    next.fresh_cycle = {
      ...next.fresh_cycle,
      astra_invocations: 0,
      specialist_invocations: 0,
      live_requests: 0,
      substantive_iterations: 0,
      quality_critique_at: null,
      cycle_spend_usd: 0,
      last_invalidation: reason,
    };
    next.quality_critique = {
      fresh: false,
      source: 'invalidated',
      at: null,
      visual_direction: null,
      ux_comprehension: null,
      reference_bar: null,
      spectacle_quality: null,
      thematic_cohesion: null,
      card_physicality_quality: null,
      deficiencies: next.quality_critique?.deficiencies ?? [],
      specialists: [],
      passed_competitive_bar: false,
    };
    next.visual_quality = { last: 'below_competitive_bar', passed: false };
    next.stop_reason = STOP_NONE;
    next.paused_for_human = false;
    next.next_objective = 'wp-visual-pass-critique';
    next = this.assess(next);
    this.save(next);
    writeHeartbeat(this.options.root, next, { status: 'working' });
    return next;
  }
}

export function freshCycleAllowsCheckpoint(state: DemoDeliveryState): boolean {
  const cycle = state.fresh_cycle;
  if (!cycle) return false;
  if (cycle.astra_invocations < MIN_FRESH_ASTRA_INVOCATIONS) return false;
  if (cycle.specialist_invocations < MIN_FRESH_SPECIALIST_INVOCATIONS) return false;
  if (cycle.live_requests < 1) return false;
  if (cycle.substantive_iterations < MIN_FRESH_SUBSTANTIVE_ITERATIONS) return false;
  if (!state.quality_critique?.fresh) return false;
  if (cycle.cycle_spend_usd <= 0) return false;
  // Judgment dims cannot pass while visual_quality still says below bar.
  if (!state.visual_quality.passed && (state.confidence.dimensions.visual_direction ?? 0) >= 0.8) {
    return false;
  }
  return true;
}

export function applyEvidenceCompletions(
  state: DemoDeliveryState,
  evidence: RepoEvidence,
): DemoDeliveryState {
  const done: Array<[string, boolean]> = [
    ['wp-draft-overlay', evidence.collapse_theater_ready && !evidence.collapse_draft_broken],
    ['wp-flight-ondone', evidence.flight_ondone_cancel],
    ['wp-effect-registry', evidence.effect_ref_work],
    ['wp-original-fx', evidence.original_svg_kinds && evidence.shader_or_wavefield],
    ['wp-board-concept', evidence.board_concept_files],
    ['wp-fx-storytelling', evidence.fx_storytelling],
    ['wp-collapse-spectacle', evidence.collapse_spectacle],
    ['wp-card-physicality', evidence.card_physicality],
    ['wp-table-depth', evidence.table_depth],
  ];
  let next = state;
  for (const [id, ok] of done) {
    if (ok && !next.completed_work_packages.includes(id)) {
      next = {
        ...next,
        completed_work_packages: [...next.completed_work_packages, id],
        last_successful_integration: id,
      };
    }
  }
  if (next.completed_work_packages.includes('wp-draft-overlay')) {
    next = {
      ...next,
      known_defects: next.known_defects.filter(
        (item) => !item.includes('Draft overlay') && !item.includes('leftover revealQueue'),
      ),
    };
  }
  return next;
}

export function pickNextObjective(state: DemoDeliveryState): string | null {
  if (state.paused_for_human && state.stop_reason !== STOP_NONE) return null;
  const repairing = state.current_work_packages.find((item) => item.status === 'repair');
  if (repairing) return repairing.id;
  if (
    state.next_objective?.startsWith(REPLAN_PREFIX) &&
    !state.completed_work_packages.includes(state.next_objective)
  ) {
    return state.next_objective;
  }
  for (const id of DEFAULT_OBJECTIVES) {
    if (!state.completed_work_packages.includes(id) && !state.blocked_work_packages.includes(id)) {
      return id;
    }
  }
  for (const id of REPLAN_OBJECTIVES) {
    if (!state.completed_work_packages.includes(id) && !state.blocked_work_packages.includes(id)) {
      return id;
    }
  }
  if (state.stop_reason === STOP_NONE && state.confidence.overall < AUTONOMOUS_CONFIDENCE_CHECKPOINT) {
    return `${REPLAN_PREFIX}visual-pass-${Math.max(1, state.replans + 1)}`;
  }
  return null;
}

export function seedDeliveryState(root: string, missionId?: string): DemoDeliveryState {
  const existing = loadDeliveryState(root);
  if (existing.iteration > 0 || existing.completed_work_packages.length > 0) return existing;
  const seeded = defaultDeliveryState(missionId);
  saveDeliveryState(root, seeded);
  return seeded;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stripDecompose(id: string): string {
  if (id.startsWith('decompose:')) return id.slice('decompose:'.length);
  if (id.startsWith(REPLAN_PREFIX)) return id.slice(REPLAN_PREFIX.length);
  return id;
}

function mergeUsage(
  usage: DemoDeliveryState['model_usage'],
  model: string,
): DemoDeliveryState['model_usage'] {
  const found = usage.find((row) => row.model === model);
  if (!found) return [...usage, { model, calls: 1 }];
  return usage.map((row) => (row.model === model ? { ...row, calls: row.calls + 1 } : row));
}

export { defaultDeliveryState };
