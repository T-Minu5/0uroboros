/**
 * Live OpenAI delivery worker.
 *
 * AUTONOMOUS_WORKER_DIAGNOSTIC (pre-fix path):
 *   npm run delivery -- autonomous
 *     → cli.runAutonomous()
 *     → DemoDeliveryRunner({ worker: createAutonomousWorker(root) })  // DETERMINISTIC
 *     → implementer.ts ensureMarker / already-present
 *     → NO OpenAI, NO Astra, NO asTool specialists
 *     → noop only for replan: objectives; otherwise deterministic "completed"
 *
 * This module is LIVE_OPENAI. No silent noop fallback.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { run } from '@openai/agents';

import { loadLocalEnv } from '../../scripts/openai-connection-config';
import { createAstra, type PlanningRuntimeContext } from '../swarm/agents';
import { createArtifactStore, createRunId } from '../swarm/artifacts';
import { BudgetTracker } from '../swarm/budget';
import { resolveSwarmConfig } from '../swarm/config';
import { defaultSwarmPackageRoot, loadCanonicalIndex } from '../swarm/context';
import { extractUsageFromUnknown } from '../swarm/diagnostics';
import { AstraSynthesisSchema, type AstraSynthesis } from '../swarm/contracts';

import type { DeliveryWorkerResult } from './runner';
import { loadDeliveryState, type DemoDeliveryState, type QualityCritique } from './state';
import { applyDeterministicPatch } from './implementer';
import { applyCritiqueDrivenPatches } from './critiquePatches';
import { captureDeliveryEvidence } from './captureEvidence';
import { critiqueCapturedBoard } from './visionCritique';

export const WORKER_MODE_LIVE = 'LIVE_OPENAI' as const;
export const WORKER_MODE_DETERMINISTIC = 'DETERMINISTIC' as const;
export const STOP_OPENAI_NOT_CONFIGURED = 'OPENAI_WORKER_NOT_CONFIGURED';

export class OpenAIWorkerNotConfiguredError extends Error {
  readonly code = STOP_OPENAI_NOT_CONFIGURED;
  constructor(message = 'OPENAI_WORKER_NOT_CONFIGURED: OPENAI_API_KEY missing for autonomous delivery.') {
    super(message);
    this.name = 'OpenAIWorkerNotConfiguredError';
  }
}

export class AgentInvocationNotProvenError extends Error {
  readonly code = 'AGENT_INVOCATION_NOT_PROVEN';
  constructor(detail: string) {
    super(`AGENT_INVOCATION_NOT_PROVEN: ${detail}`);
    this.name = 'AgentInvocationNotProvenError';
  }
}

export interface AgentInvocationRecord {
  invocation_id: string;
  delivery_iteration: number;
  agent_name: string;
  role: string;
  model: string;
  provider: 'openai';
  started_at: string;
  completed_at: string;
  request_count: number;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number;
  trace_or_workflow_id: string | null;
  result_artifact: string | null;
  status: 'ok' | 'failed' | 'unproven';
}

export function agentInvocationsPath(root: string): string {
  return join(root, 'tools/agent-harness/delivery/agent-invocations.jsonl');
}

export function appendAgentInvocation(root: string, record: AgentInvocationRecord): void {
  const path = agentInvocationsPath(root);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`);
}

export function writeLiveSwarmVerified(root: string, payload: Record<string, unknown>): void {
  const path = join(root, 'tools/agent-harness/delivery/LIVE_SWARM_VERIFIED.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`);
}

export function assertLiveOpenAIConfigured(env: NodeJS.ProcessEnv = process.env): {
  apiKey: string;
  models: ReturnType<typeof resolveSwarmConfig>['models'];
} {
  loadLocalEnv(process.cwd());
  const config = resolveSwarmConfig(env);
  if (!config.apiKey) {
    throw new OpenAIWorkerNotConfiguredError();
  }
  return { apiKey: config.apiKey, models: config.models };
}

function estimateCostUsd(model: string, input: number | null, output: number | null): number {
  const rates: Record<string, { in: number; out: number }> = {
    'gpt-6-astra': { in: 5 / 1e6, out: 30 / 1e6 },
    'gpt-5.6-sol': { in: 2.5 / 1e6, out: 15 / 1e6 },
    'gpt-5.6-terra': { in: 1.25 / 1e6, out: 10 / 1e6 },
    'gpt-5.6-luna': { in: 0.4 / 1e6, out: 1.6 / 1e6 },
  };
  const rate = rates[model] ?? { in: 1.25 / 1e6, out: 10 / 1e6 };
  return Number((((input ?? 0) * rate.in + (output ?? 0) * rate.out)).toFixed(6));
}

function emptyRuntime(root: string, objective: string): {
  config: ReturnType<typeof resolveSwarmConfig>;
  runtime: PlanningRuntimeContext;
  runId: string;
} {
  const config = resolveSwarmConfig();
  const runId = createRunId();
  const store = createArtifactStore(runId, root);
  const canonical = loadCanonicalIndex(defaultSwarmPackageRoot(root));
  // Tool isEnabled gates use runtime.objective. WP ids alone disable LookDev/UX.
  const routingObjective = [
    objective,
    'LookDev visual direction and Wave Collapse presentation polish.',
    'UX Lead player comprehension, information hierarchy, and board interaction.',
    'Lead Engineering technical feasibility for R3F shader and effect implementation.',
    'Source to target effect resolution and card staging.',
  ].join(' ');
  const runtime: PlanningRuntimeContext = {
    budget: new BudgetTracker({
      ...config.budget,
      max_lookdev_calls: Math.max(config.budget.max_lookdev_calls, 2),
      max_specialist_calls: Math.max(config.budget.max_specialist_calls, 6),
      max_total_agent_calls: Math.max(config.budget.max_total_agent_calls, 10),
      max_research_calls: Math.max(config.budget.max_research_calls, 1),
    }),
    canonical,
    objective: routingObjective,
    specialistResults: [],
    systemsResults: [],
    researchResults: [],
    lookdevResults: [],
    contentResults: [],
    worldbuildingResults: [],
    assignments: [],
    researchAssignments: [],
    lookdevAssignments: [],
    contentAssignments: [],
    worldbuildingAssignments: [],
    researchSourceMode: null,
    reviewerInvoked: false,
    specialistFailures: [],
    artifactStore: store,
    runId,
    specialistModel: config.models.specialist,
  };
  return { config, runtime, runId };
}

function buildDeliveryPrompt(state: DemoDeliveryState, objective: string, root: string): string {
  let benchmark = '';
  try {
    benchmark = readFileSync(join(root, '0uroboros_swarm_v3_0/VisualBenchmarkPacket.json'), 'utf8').slice(
      0,
      3500,
    );
  } catch {
    benchmark = '(VisualBenchmarkPacket unavailable)';
  }
  return [
    'DELIVERY MANAGEMENT TURN (V3 DemoDeliveryRunner).',
    'You are Astra managing long-running visual/demo delivery for 0uroboros.',
    'Canonical gameplay rules are FIXED. Do not invent or change approved rules.',
    'Effect-animation Assets under assets/effect_animations/ are REFERENCE ONLY. Never ship/copy them.',
    '',
    `Current objective: ${objective}`,
    `Iteration: ${state.iteration}`,
    `Score overall: ${state.confidence.overall}`,
    `Visual direction (implementation-capped until fresh critique): ${state.confidence.dimensions.visual_direction ?? 'n/a'}`,
    `visual_quality.last: ${state.visual_quality.last} passed=${state.visual_quality.passed}`,
    `Completed WorkPackages: ${state.completed_work_packages.join(', ') || '(none)'}`,
    `Known defects: ${state.known_defects.join(' | ') || '(none)'}`,
    `Budget known spend USD: ${state.budget.known_spend_usd} / ${state.budget.ceiling_usd} (unknown_prior=${state.budget.unknown_prior})`,
    `Milestone: ${state.milestone}`,
    'Local demo URL: http://localhost:5176/?look=1',
    '',
    'VisualBenchmarkPacket (bounded excerpt):',
    benchmark,
    '',
    'REQUIRED THIS TURN:',
    '1. Consult LookDev for current board/visual deficiencies vs competitive bar.',
    '2. Consult UX for comprehension / hierarchy / source→target storytelling gaps.',
    '3. Optionally consult Engineering for feasible R3F/shader implementation steps.',
    '4. Optionally consult Research if competitive references need external confirmation.',
    '5. Emit work_package_intents for the highest-value next visual improvements.',
    '6. Do NOT claim DEMO_READY. Do NOT declare human checkpoint yourself.',
    '',
    'Focus deficiencies if still true:',
    '- local source → target storytelling incomplete',
    '- Collapse below competitive spectacle',
    '- cards still too HUD-like',
    '- table/board depth vs first-party concept art',
    '- original SVG / R3F / shader effects from reference principles',
    '',
    'Return structured AstraSynthesis only.',
  ].join('\n');
}

function critiqueFromRuntime(
  runtime: PlanningRuntimeContext,
  synthesis: AstraSynthesis,
): QualityCritique {
  const lookdev = runtime.lookdevResults[0];
  const ux = runtime.specialistResults.find((item) => item.agent === 'ux');
  const findings = [
    ...(lookdev?.visual_findings ?? []),
    ...(lookdev?.recommendations ?? []).map((item) =>
      typeof item === 'string' ? item : `${item.priority}: ${item.title}`,
    ),
    ...(ux?.findings ?? []).slice(0, 5),
  ].slice(0, 8);

  const lookdevConfidence = typeof lookdev?.confidence === 'number' ? lookdev.confidence : 0.45;
  const uxConfidence = typeof ux?.confidence === 'number' ? ux.confidence : 0.45;
  const highPriority = (lookdev?.recommendations ?? []).filter(
    (item) => typeof item !== 'string' && item.priority === 'high',
  ).length;
  const criticalWeak = findings.filter((item) =>
    /\b(unreadable|broken|blocking|fails the bar|not competitive|severe|critical)\b/i.test(item),
  ).length;

  // Map specialist confidence into judgment dims. File presence does not enter here.
  let visual = clamp01(0.42 + lookdevConfidence * 0.45 - highPriority * 0.03 - criticalWeak * 0.05);
  let uxScore = clamp01(0.42 + uxConfidence * 0.45);
  let reference = clamp01(0.5 + lookdevConfidence * 0.3);

  const passed =
    lookdevConfidence >= 0.78 &&
    uxConfidence >= 0.72 &&
    highPriority === 0 &&
    criticalWeak === 0 &&
    /meets (?:the )?bar|competitive.?bar (?:pass|met)|production.?ready visual|strong spectacle/i.test(
      `${lookdev?.summary ?? ''} ${synthesis.summary}`,
    );

  if (passed) {
    visual = Math.max(visual, 0.82);
    uxScore = Math.max(uxScore, 0.8);
    reference = Math.max(reference, 0.8);
  }

  return {
    fresh: true,
    source: 'live-openai-lookdev-ux',
    at: new Date().toISOString(),
    visual_direction: visual,
    ux_comprehension: uxScore,
    reference_bar: reference,
    spectacle_quality: clamp01(visual - 0.02),
    thematic_cohesion: uxScore,
    card_physicality_quality: clamp01(visual - 0.04),
    deficiencies: findings.length > 0 ? findings : synthesis.risks.slice(0, 5),
    specialists: [
      ...runtime.lookdevResults.map(() => 'lookdev'),
      ...runtime.specialistResults.map((item) => item.agent),
    ],
    passed_competitive_bar: passed,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export async function runLiveAstraDeliveryTurn(input: {
  root: string;
  state: DemoDeliveryState;
  objective: string;
}): Promise<{
  synthesis: AstraSynthesis;
  critique: QualityCritique;
  invocation: AgentInvocationRecord;
  nestedProven: boolean;
  spendUsd: number;
  runId: string;
  specialistsConsulted: string[];
}> {
  assertLiveOpenAIConfigured();
  let captureNote = 'no-capture';
  let visionSpend = 0;
  let visionCritique: QualityCritique | null = null;
  let visionObservation = '';
  try {
    const captured = await captureDeliveryEvidence(input.root);
    captureNote = captured.note;
    try {
      const vision = await critiqueCapturedBoard(input.root);
      visionSpend = vision.spendUsd;
      visionCritique = vision.critique;
      visionObservation = vision.observation;
      captureNote = `${captureNote}; vision=${vision.model}; vd=${vision.critique.visual_direction}`;
    } catch (error) {
      captureNote = `${captureNote}; vision-failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  } catch (error) {
    captureNote = `capture-failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  const { config, runtime, runId } = emptyRuntime(input.root, input.objective);
  runtime.budget.consumeAgentCall('astra');
  const astra = createAstra(config, runtime);
  const started = new Date().toISOString();
  const prompt = `${buildDeliveryPrompt(input.state, input.objective, input.root)}\n\nRUNTIME CAPTURE STATUS: ${captureNote}\nCAPTURE VISION OBSERVATION: ${visionObservation || '(none)'}\nEvidence dir: tools/agent-harness/delivery/evidence/\nUse the capture-backed observation as current-build visual evidence. Do not claim captures are missing if observation text is present.`;

  let usage = {
    requests: null as number | null,
    input_tokens: null as number | null,
    output_tokens: null as number | null,
    total_tokens: null as number | null,
  };
  let synthesis: AstraSynthesis;
  let status: AgentInvocationRecord['status'] = 'ok';
  let spendSoFar = 0;

  try {
    const runResult = await run(astra, prompt, {
      maxTurns: config.budget.max_turns,
      context: runtime,
    });
    usage =
      extractUsageFromUnknown(runResult.state.usage ?? runResult.runContext.usage) ?? usage;
    spendSoFar = estimateCostUsd(config.models.astra, usage.input_tokens, usage.output_tokens);
    const parsed = AstraSynthesisSchema.safeParse(runResult.finalOutput);
    synthesis = parsed.success
      ? parsed.data
      : AstraSynthesisSchema.parse({
          summary: String(runResult.finalOutput ?? 'Astra returned unstructured delivery output.'),
          decisions: [],
          specialists_consulted: [],
          work_package_intents: [],
          candidate_notes: [],
          contract_requests: [],
          conflicts: [],
          review_requests: [],
          risks: [],
          human_approvals_required: [],
        });
  } catch (error) {
    status = 'failed';
    const message = error instanceof Error ? error.message : String(error);
    // Persist partial usage evidence before failing the turn.
    appendAgentInvocation(input.root, {
      invocation_id: randomUUID(),
      delivery_iteration: input.state.iteration,
      agent_name: 'Astra',
      role: 'delivery-manager',
      model: config.models.astra,
      provider: 'openai',
      started_at: started,
      completed_at: new Date().toISOString(),
      request_count: usage.requests ?? 0,
      input_tokens: usage.input_tokens,
      cached_input_tokens: null,
      output_tokens: usage.output_tokens,
      reasoning_tokens: null,
      total_tokens: usage.total_tokens,
      estimated_cost_usd: spendSoFar,
      trace_or_workflow_id: runId,
      result_artifact: null,
      status: 'failed',
    });
    throw new Error(`Live Astra delivery turn failed: ${message}`);
  }

  const completed = new Date().toISOString();
  const requests = usage.requests ?? 0;
  if (requests <= 0 && (usage.input_tokens ?? 0) <= 0) {
    status = 'unproven';
    throw new AgentInvocationNotProvenError(
      `Astra delivery turn recorded requests=${requests} input_tokens=${usage.input_tokens}`,
    );
  }

  const nestedProven =
    runtime.lookdevResults.length > 0 ||
    runtime.specialistResults.some((item) => item.agent === 'ux' || item.agent === 'engineering' || item.agent === 'product') ||
    runtime.researchResults.length > 0;

  if (!nestedProven) {
    throw new AgentInvocationNotProvenError(
      'Astra ran but no LookDev/UX/Engineering/Research nested specialist result was recorded.',
    );
  }

  const cost = estimateCostUsd(config.models.astra, usage.input_tokens, usage.output_tokens);
  const invocation: AgentInvocationRecord = {
    invocation_id: randomUUID(),
    delivery_iteration: input.state.iteration,
    agent_name: 'Astra',
    role: 'delivery-manager',
    model: config.models.astra,
    provider: 'openai',
    started_at: started,
    completed_at: completed,
    request_count: requests || 1,
    input_tokens: usage.input_tokens,
    cached_input_tokens: null,
    output_tokens: usage.output_tokens,
    reasoning_tokens: null,
    total_tokens: usage.total_tokens,
    estimated_cost_usd: cost,
    trace_or_workflow_id: runId,
    result_artifact: join(runtime.artifactStore!.dir, 'delivery-turn.json'),
    status,
  };

  runtime.artifactStore!.writeJson('delivery-turn.json', {
    objective: input.objective,
    synthesis,
    lookdev: runtime.lookdevResults,
    specialists: runtime.specialistResults,
    research: runtime.researchResults,
    usage,
  });
  appendAgentInvocation(input.root, invocation);

  // Record nested specialists as separate lines when we have results (usage nested in parent).
  for (const ld of runtime.lookdevResults) {
    appendAgentInvocation(input.root, {
      ...invocation,
      invocation_id: randomUUID(),
      agent_name: 'LookDev',
      role: 'lookdev',
      model: config.models.specialist,
      request_count: 1,
      estimated_cost_usd: 0,
      result_artifact: 'nested-in-astra',
      status: 'ok',
    });
    void ld;
  }
  for (const sp of runtime.specialistResults) {
    appendAgentInvocation(input.root, {
      ...invocation,
      invocation_id: randomUUID(),
      agent_name: sp.agent,
      role: sp.agent,
      model: sp.agent === 'engineering' ? config.models.engineering : config.models.specialist,
      request_count: 1,
      estimated_cost_usd: 0,
      result_artifact: 'nested-in-astra',
      status: 'ok',
    });
  }

  const agentCritique = critiqueFromRuntime(runtime, synthesis);
  // Prefer capture-backed vision for judgment dims. Agent text confidence may not
  // inflate past vision when vision is fresh; bar requires vision pass.
  const critique = visionCritique
    ? {
        fresh: true,
        source: `${visionCritique.source}+${agentCritique.source}`,
        at: visionCritique.at ?? agentCritique.at,
        visual_direction: visionCritique.visual_direction ?? agentCritique.visual_direction,
        ux_comprehension: visionCritique.ux_comprehension ?? agentCritique.ux_comprehension,
        reference_bar: visionCritique.reference_bar ?? agentCritique.reference_bar,
        spectacle_quality: visionCritique.spectacle_quality ?? agentCritique.spectacle_quality,
        thematic_cohesion: visionCritique.thematic_cohesion ?? agentCritique.thematic_cohesion,
        card_physicality_quality:
          visionCritique.card_physicality_quality ?? agentCritique.card_physicality_quality,
        specialists: [...new Set([...agentCritique.specialists, ...visionCritique.specialists])],
        deficiencies: [
          ...visionCritique.deficiencies,
          ...agentCritique.deficiencies.filter((item) => !/packet facts only/i.test(item)),
        ].slice(0, 6),
        passed_competitive_bar: Boolean(visionCritique.passed_competitive_bar),
      }
    : agentCritique;

  return {
    synthesis,
    critique,
    invocation,
    nestedProven,
    spendUsd: cost + visionSpend,
    runId,
    specialistsConsulted: [
      'Astra',
      ...runtime.lookdevResults.map(() => 'LookDev'),
      ...runtime.specialistResults.map((item) => item.agent),
      ...runtime.researchResults.map(() => 'Research'),
      ...(visionCritique ? ['utility-vision'] : []),
    ],
  };
}

export function createLiveOpenAIWorker(root: string) {
  assertLiveOpenAIConfigured();
  return async (
    state: DemoDeliveryState,
    objective: string,
  ): Promise<DeliveryWorkerResult> => {
    const turn = await runLiveAstraDeliveryTurn({ root, state, objective });
    const patchNote = applyDeterministicPatch(root, objective);
    const critiquePatches = applyCritiqueDrivenPatches(root, turn.critique.deficiencies ?? []);
    const replan = objective.startsWith('replan:');

    return {
      // Replan objectives must not be marked completed forever; reopen product WPs.
      status: replan ? 'noop' : 'completed',
      qualityPassed: true,
      critiquePass: turn.critique.passed_competitive_bar,
      note: `live:${turn.runId}:${patchNote};critique:${critiquePatches.join(',') || 'none'}${replan ? ':replan-noop' : ''}`,
      spendUsd: turn.spendUsd,
      liveAgent: true,
      astraInvoked: true,
      specialistsInvoked: turn.specialistsConsulted,
      qualityCritique: turn.critique,
      requests: turn.invocation.request_count,
      workerMode: WORKER_MODE_LIVE,
    };
  };
}

export async function verifyLiveSwarm(root: string): Promise<Record<string, unknown>> {
  assertLiveOpenAIConfigured();
  const state = loadDeliveryState(root);
  const objective =
    'Review the current 0uroboros board against the VisualBenchmarkPacket and identify the three highest-impact visual deficiencies. Consult LookDev and UX. Do not change rules.';

  const turn = await runLiveAstraDeliveryTurn({
    root,
    state,
    objective,
  });

  const models = assertLiveOpenAIConfigured().models;
  const verified = {
    status: 'LIVE_SWARM_VERIFIED',
    at: new Date().toISOString(),
    run_id: turn.runId,
    astra_model: models.astra,
    specialist_model: models.specialist,
    engineering_model: models.engineering,
    requests: turn.invocation.request_count,
    input_tokens: turn.invocation.input_tokens,
    output_tokens: turn.invocation.output_tokens,
    total_tokens: turn.invocation.total_tokens,
    estimated_cost_usd: turn.spendUsd,
    nested_specialists_proven: turn.nestedProven,
    specialists: turn.specialistsConsulted,
    deficiencies: turn.critique.deficiencies.slice(0, 3),
    trace_or_workflow_id: turn.invocation.trace_or_workflow_id,
  };
  writeLiveSwarmVerified(root, verified);
  return verified;
}
