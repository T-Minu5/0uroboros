import { getGlobalTraceProvider, run } from '@openai/agents';

import {
  createAstra,
  createPlanningTeam,
  createReviewer,
  type PlanningRuntimeContext,
} from './agents';
import {
  createArtifactStore,
  createRunId,
  persistRunArtifacts,
  type RunManifest,
  type UsageSnapshot,
} from './artifacts';
import { BudgetTracker } from './budget';
import {
  CANONICAL_VERSION,
  resolveAstraModel,
  resolveSwarmConfig,
  requireLiveApiKey,
  type SwarmConfig,
} from './config';
import {
  AstraSynthesisSchema,
  ReviewerResponseSchema,
  WorkOrderSchema,
  type AstraSynthesis,
  type OrchestrationResult,
  type ReviewPacket,
  type ReviewerResponse,
  type RunQueues,
  type ResearchResponse,
  type LookDevResponse,
  type ContentResponse,
  type WorldbuildingResponse,
  type SpecialistResponse,
  type SystemsResponse,
  type WorkOrder,
  type WorldKnowledgePacket,
  type SpecialistFailureRecord,
} from './contracts';
import {
  defaultSwarmPackageRoot,
  loadCanonicalIndex,
  retrieveCanonical,
  type CanonicalIndex,
} from './context';
import {
  BudgetExhaustedError,
  classifyOpenAiError,
  isAstraUnavailableError,
  ModelFallbackDisabledError,
} from './errors';
import {
  describeStructuredOutputFailure,
  extractUsageFromError,
  extractUsageFromUnknown,
  type StructuredOutputFailure,
} from './diagnostics';
import { normalizeWorkPackageAuthority } from './authority';
import {
  assertPlanningOnly,
  classifyGovernance,
  collectConflicts,
  detectInventedRuleIds,
  detectInventedLookDevRuleIds,
  detectInventedContentRuleIds,
  detectInventedWorldbuildingRuleIds,
  detectInventedResearchRuleIds,
  detectInventedSystemsRuleIds,
  expandAstraSynthesis,
  extractContractRequests,
  mergeContractRequests,
  normalizeSpecialistsConsulted,
  routeQueues,
  sanitizeWorkPackage,
  validateCanonicalFreshness,
  validateOrchestrationResult,
} from './governance';
import {
  applyHarnessVerifiedMismatches,
  collectHarnessVerifiedEvidence,
  formatVerifiedEvidence,
  objectiveTouchesStartingDeck,
} from './evidence';
import {
  applyReviewerVerdict,
  assertReviewPacketCompleteness,
  buildReviewPacket,
  detectReviewTriggers,
  formatReviewPacketInput,
  normalizeReviewerFindings,
  shouldRequireReview,
} from './review';
import { routeResearchResponse } from './research';
import { shouldConsultLookDev } from './lookdev';
import { shouldConsultContent } from './content';
import { shouldConsultWorldbuilding } from './worldbuilding';
import { retrieveWorldKnowledgePacket } from './worldKnowledge';
import { inventoryFirstPartyAssets } from './assets';
import { inspectFirstPartyVisuals, liveCachedAssetIds } from './visualInspection';
import {
  creativeConceptBudgetForObjective,
  dedupeCandidateProposals,
  enforceCreativeConceptBudget,
  countCreativeConcepts,
  relevantAssetsForObjective,
  resolveIntegratedCandidateNaming,
} from './creative';
import { defaultSharedConcept } from './content';
import {
  implementationAssumptionsNote,
  routeSystemsResponse,
  shouldConsultSystems,
} from './systems';
import {
  buildCandidateEnvelope,
  envelopeToCandidateProposal,
} from './candidateEnvelope';
import {
  closeOpenSpecialistInvocations,
  persistSpecialistFailure,
} from './specialistFailure';

export const HUD_SMOKE_OBJECTIVE = `Plan the first version of the 0uroboros player HUD.

The HUD should communicate:
- player identity
- Data Center power
- current VP
- Actions
- current Cycle
- current Runtime turn
- Node Power
- reveal priority

Do not implement the HUD.

Produce a cross-functional Product + UX + Engineering plan with acceptance criteria, risks, dependencies, and any human approvals required.`;

export const SYSTEMS_VALIDATION_OBJECTIVE = `Review the current implementation assumptions around Actions, Node Power, reveal priority, and the starting deck against the approved 0uroboros Runtime rules.

Do not modify code or canonical documents.

Identify true canonical implementation mismatches.

Distinguish gameplay-rule requirements from presentation choices.

Distinguish existing Game Contract state from genuine contract gaps.

If the approved rules do not answer something, identify it as an unresolved game-design question rather than inventing a rule.

Produce implementation-ready correction WorkPackages only where the approved canonical rules already establish the required behavior.`;

export const REVIEWER_VALIDATION_OBJECTIVE = `Review the current starting-deck implementation against the approved 0uroboros starting-deck rule and prepare it for a future implementation correction.

The canonical starting deck is governed by RULE-DECK-001.

Use harness-verified repository evidence for the current implementation.

Do not modify code.

Do not modify canonical rules.

Produce an implementation-ready correction WorkPackage if a verified mismatch exists.

Treat promotion of that correction toward future implementation as review-gated.

No WorkPackage may execute in this run.`;

export const RESEARCH_VALIDATION_OBJECTIVE = `Research Shards of Infinity as an approved 0uroboros "Example of Good."

Focus only on competitive turn-level deck-building mechanics, tactical resource decisions, and card synergy patterns that may inspire future 0uroboros card or Location text.

Preserve all existing 0uroboros rules.

Do not propose changes to Runtime phases, Node control, Actions, Wave Collapse, Draft structure, Data Centers, or victory conditions.

Return no more than five evidence-backed observations and no more than three optional 0uroboros content-level recommendations.

Clearly distinguish:
- what the source supports
- your observation
- the optional 0uroboros recommendation

Recommendations are Candidate ideas only.

Do not create implementation WorkPackages.

Do not invoke Reviewer unless an existing deterministic review trigger independently requires it.

Use the existing curated Shards of Infinity references from the Resource Library.

Do not broadly search unrelated games.`;

export const LOOKDEV_VALIDATION_OBJECTIVE = `Create a LookDev direction for how the 0uroboros Runtime board should visually communicate a revealed Character card that triggers Drain.

Use the existing first-party card art and game icons under assets where relevant.

Preserve the existing card art identity.

Use the approved palette, Inter/Orbitron typography system, vertical Node layout, accessibility requirements, and 3-4 theatrics-tier system.

Use the curated 3js effects references only as technique/inspiration references.

The animation must communicate:
- which card triggered
- which player owns it
- which Data Center is being targeted
- damage magnitude
- resulting Data Center state

Do not change Drain rules.

Do not invent Game Contract fields.

Do not implement code.

Return one primary direction and at most two alternatives.

Clearly identify which ideas are based on existing 0uroboros assets versus external references.`;

export const CREATIVE_VALIDATION_OBJECTIVE = `Develop ONE new Chaos Character candidate for 0uroboros.

Use the existing approved game engine only.

This task requires both a Content contribution and a Worldbuilding contribution.

Use cached first-party Chaos visual observations as representative evidence of the established visual world.

Search the read-only Obsidian vault using high-signal concept queries before finalizing new lore.

Preserve Cyberpunk + Quantum Physics + Occult.

Content must propose:

* gameplay role
* Power
* effect text using approved mechanics
* proposed Draft cost
* strategic purpose
* mechanic provenance

Worldbuilding must propose:

* concise identity
* thematic rationale
* relevant relationships where supported or explicitly proposed

Both must use the harness-assigned shared concept ID.

Astra must synthesize exactly ONE Candidate Concept Envelope with ONE primary candidate name.

Alternative names may remain inside that envelope.

If either required specialist fails, mark the candidate INCOMPLETE. Astra must not replace that specialist's substantive contribution.

Do not modify rules.

Do not modify code.

Do not modify assets.

Do not write to Obsidian.

Do not invoke unrelated specialists unless a genuine routing condition requires them.

Do not execute anything.`;

export const WORLDBUILDING_VALIDATION_OBJECTIVE = `Retrieve established lore for Node Feratu from Mel's Obsidian vault.

Inspect relevant first-party visual observations if available.

Summarize established facts.

Identify unresolved gaps.

Propose at most one small worldbuilding extension.

Clearly distinguish established lore, visual observation, and new proposal.

Do not invent a whole faction or storyline.

Do not write to the Obsidian vault.

Do not change gameplay rules.

Do not implement code.`;

export interface HarnessRunInput {
  objective: string;
  cwd?: string;
  config?: SwarmConfig;
  now?: Date;
  executeWorkPackages?: boolean;
  skipModel?: boolean;
}

export interface HarnessRunOutput {
  runId: string;
  artifactDir: string;
  workOrder: WorkOrder;
  result: OrchestrationResult | null;
  queues: RunQueues | null;
  specialistResults: SpecialistResponse[];
  systemsResults: SystemsResponse[];
  researchResults: ResearchResponse[];
  lookdevResults: LookDevResponse[];
  contentResults: ContentResponse[];
  worldbuildingResults: WorldbuildingResponse[];
  worldKnowledgePacket: WorldKnowledgePacket | null;
  reviewPacket: ReviewPacket | null;
  reviewResult: ReviewerResponse | null;
  manifest: RunManifest;
  usage: UsageSnapshot;
  errors: unknown[];
  exitCode: number;
}

function createWorkOrder(objective: string, runId: string): WorkOrder {
  return WorkOrderSchema.parse({
    id: `wo-${runId}`,
    objective,
    context:
      '0uroboros Swarm v2.0 Phase 1-4 planning runtime. Advisory only. No execution.',
    constraints: [
      'Do not implement the game or HUD.',
      'Do not mutate the repository.',
      'Do not invent canonical rule IDs.',
      'WorkPackages stay unexecuted.',
    ],
    acceptance_criteria: [
      'Cross-functional Product, UX, and Engineering input is reflected.',
      'Acceptance criteria, risks, and dependencies are present.',
      'Human approvals are identified when required.',
    ],
    requested_expertise: [
      'product',
      'ux',
      'engineering',
      ...(shouldConsultContent(objective) ? (['content'] as const) : []),
      ...(shouldConsultWorldbuilding(objective) ? (['worldbuilding'] as const) : []),
    ],
    out_of_scope: [
      'Sandbox execution',
      'Canonical mutation',
      'Audio',
      'Short-Circuit mode',
    ],
    canonical_version: CANONICAL_VERSION,
  });
}

function extractUsage(source: unknown): {
  requests: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
} {
  return (
    extractUsageFromUnknown(source) ?? {
      requests: null,
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
    }
  );
}

function buildAstraPrompt(
  workOrder: WorkOrder,
  index: CanonicalIndex,
  sharedConceptId?: string,
): string {
  const planningSlice = retrieveCanonical(index, {
    prefixes:     shouldConsultSystems(workOrder.objective)
      ? [
          'RULE-DECK-',
          'RULE-STARTER-',
          'RULE-CARD-',
          'RULE-ACTION-',
          'RULE-RUNTIME-',
          'RULE-POWER-',
          'RULE-PROB-',
          'RULE-VP-',
          'RULE-DATA-',
          'RULE-NODE-',
          'CONTRACT-',
          'TECH-CONTRACT-',
          'UX-NODE-',
        ]
      : shouldConsultLookDev(workOrder.objective)
        ? [
            'LOOKDEV-',
            'DESIGN-',
            'UX-A11Y-',
            'UX-BOARD-',
            'UX-NODE-',
            'TECH-PRESENT-',
            'TECH-CONTRACT-',
            'WORLD-CORE-',
          ]
        : ['RULE-VP-', 'RULE-DATA-', 'RULE-ACTION-', 'RULE-RUNTIME-', 'CONTRACT-', 'UX-', 'TECH-CONTRACT-'],
  });
  const excerpt = planningSlice
    .slice(0, 24)
    .map((item) => `${item.id}: ${item.text}`)
    .join('\n');
  return [
    `WorkOrder ${workOrder.id}`,
    `Objective: ${workOrder.objective}`,
    `Constraints: ${workOrder.constraints.join(' | ')}`,
    `Out of scope: ${workOrder.out_of_scope.join(' | ')}`,
    `Canonical version: ${workOrder.canonical_version}`,
    'Relevant canonical slices:',
    excerpt,
    shouldConsultSystems(workOrder.objective) && collectHarnessVerifiedEvidence(workOrder.objective).length > 0
      ? formatVerifiedEvidence(collectHarnessVerifiedEvidence(workOrder.objective))
      : '',
    objectiveTouchesStartingDeck(workOrder.objective) ? implementationAssumptionsNote() : '',
    'HARNESS_VERIFIED_EVIDENCE cannot be discarded as unsourced. MODEL_CLAIM may be disputed.',
    'Canonical excerpts that include CONTRACT-* IDs are Game Contract evidence. Do not treat the contract as missing merely because a full snapshot file was not attached.',
    'Call only the specialists that add distinct expertise. Systems is not mandatory for purely visual work. Research is not the default. LookDev is optional and is for visual/motion presentation only. Content proposes game content. Worldbuilding proposes lore. They do not call each other.',
    sharedConceptId
      ? `Harness shared concept ID: ${sharedConceptId}. Pass this exact ID to Content and Worldbuilding. Do not replace it. Candidate name is separate.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function planToResult(
  workOrder: WorkOrder,
  plan: AstraSynthesis,
  specialistResults: SpecialistResponse[],
  systemsResults: SystemsResponse[],
  researchResults: ResearchResponse[],
  lookdevResults: LookDevResponse[],
  contentResults: ContentResponse[],
  worldbuildingResults: WorldbuildingResponse[],
  budget: BudgetTracker,
  index: CanonicalIndex,
  runId: string,
  createdAt: string,
  suppliedCanonicalIds: string[] = [],
  extras: {
    sharedConceptId?: string;
    specialistFailures?: SpecialistFailureRecord[];
  } = {},
): OrchestrationResult {
  const invented = [
    ...specialistResults.flatMap((response) => detectInventedRuleIds(response, index)),
    ...systemsResults.flatMap((response) => detectInventedSystemsRuleIds(response, index)),
    ...researchResults.flatMap((response) => detectInventedResearchRuleIds(response, index)),
    ...lookdevResults.flatMap((response) => detectInventedLookDevRuleIds(response, index)),
    ...contentResults.flatMap((response) => detectInventedContentRuleIds(response, index)),
    ...worldbuildingResults.flatMap((response) => detectInventedWorldbuildingRuleIds(response, index)),
  ];
  const specialistContracts = specialistResults.flatMap(extractContractRequests);
  const named = resolveIntegratedCandidateNaming(
    plan,
    contentResults,
    worldbuildingResults,
    extras.sharedConceptId || defaultSharedConcept(workOrder.objective),
  );
  named.shared_concept_id =
    extras.sharedConceptId || named.shared_concept_id || defaultSharedConcept(workOrder.objective);
  const systemsRouted = systemsResults.map((response) =>
    routeSystemsResponse(response, runId, index, suppliedCanonicalIds),
  );
  const expanded = expandAstraSynthesis(named, {
    runId,
    createdAt,
    canonicalVersion: workOrder.canonical_version,
  });
  const freshnessConflicts: Parameters<typeof collectConflicts>[0] = [];
  const workPackages = expanded.work_packages.map((workPackage) => {
    const requestedTools = workPackage.execution_tools_allowed;
    const sanitized = sanitizeWorkPackage(workPackage);
    const normalized = normalizeWorkPackageAuthority(sanitized, {
      requestedTools,
      evidence: collectHarnessVerifiedEvidence(workOrder.objective),
    });
    try {
      if (
        sanitized.authorized_rule_ids.length + sanitized.authorized_tech_ids.length >
        0
      ) {
        validateCanonicalFreshness(
          sanitized.canonical_version,
          [...sanitized.authorized_rule_ids, ...sanitized.authorized_tech_ids],
          index,
        );
      }
    } catch (error) {
      freshnessConflicts.push({
        id: `conflict-stale-${sanitized.id}`,
        summary: error instanceof Error ? error.message : String(error),
        positions: ['Canonical freshness check failed.'],
        affected_ids: [...sanitized.authorized_rule_ids, ...sanitized.authorized_tech_ids],
        recommended_default: 'Hold the WorkPackage for revalidation.',
        escalated: true,
      });
      return { ...normalized, approval_required: true };
    }
    return normalized;
  });

  enforceCreativeConceptBudget(
    countCreativeConcepts(contentResults, worldbuildingResults),
    creativeConceptBudgetForObjective(workOrder.objective, budget.config.max_creative_concepts),
  );

  const envelope = buildCandidateEnvelope({
    objective: workOrder.objective,
    sharedConceptId: named.shared_concept_id,
    synthesis: named,
    contentResults,
    worldbuildingResults,
    specialistFailures: extras.specialistFailures ?? [],
  });
  const envelopeProposals = envelope
    ? [envelopeToCandidateProposal(envelope, { runId, createdAt, canonicalVersion: workOrder.canonical_version })]
    : [];

  const candidateProposals = (
    envelope
      ? envelopeProposals
      : dedupeCandidateProposals(expanded.candidate_proposals.filter((proposal) => {
    try {
      validateCanonicalFreshness(
        proposal.canonical_version,
        [
          ...proposal.requirements_touched,
          ...proposal.contracts_required,
          ...(proposal.authorized_by ?? []),
        ],
        index,
      );
      return true;
    } catch (error) {
      freshnessConflicts.push({
        id: `conflict-stale-${proposal.id}`,
        summary: error instanceof Error ? error.message : String(error),
        positions: ['Proposal referenced stale or unknown canonical IDs.'],
        affected_ids: proposal.requirements_touched,
        recommended_default: 'Reject until revalidated.',
        escalated: true,
      });
      return false;
    }
  }))
  );

  const specialists = normalizeSpecialistsConsulted([
    ...specialistResults.map((item) => item.agent),
    ...systemsResults.map((item) => item.agent),
    ...researchResults.map((item) => item.agent),
    ...lookdevResults.map((item) => item.agent),
    ...contentResults.map((item) => item.agent),
    ...worldbuildingResults.map((item) => item.agent),
  ]);
  const systemsPlanning = systemsRouted.flatMap((item) => item.planning);
  const researchRouted = researchResults.map((item) => routeResearchResponse(item));
  const draft = validateOrchestrationResult({
    objective: workOrder.objective,
    summary: named.summary,
    decisions: named.decisions,
    specialists_consulted: specialists.display_names,
    specialist_role_ids: specialists.role_ids,
    work_packages: workPackages,
    candidate_proposals: candidateProposals,
    contract_requests: mergeContractRequests(
      [
        ...specialistContracts,
        ...systemsRouted.flatMap((item) => item.contract_requests),
      ],
      expanded.contract_requests,
    ),
    conflicts: collectConflicts([...expanded.conflicts, ...freshnessConflicts], invented),
    review_requests: named.review_requests,
    risks: named.risks,
    human_approvals_required: named.human_approvals_required,
    open_questions: systemsPlanning.filter((item) => item.kind === 'OPEN_QUESTION'),
    human_design_decisions: [
      ...systemsPlanning.filter((item) => item.kind === 'HUMAN_DESIGN_DECISION'),
      ...researchRouted.flatMap((item) => item.human_design_decisions),
    ],
    systems_findings: systemsRouted.flatMap((item) => item.findings),
    canonical_completeness_gaps: systemsRouted.flatMap(
      (item) => item.canonical_completeness_gaps,
    ),
    context_omissions: [
      ...systemsRouted.flatMap((item) => item.context_omissions),
      ...contentResults.flatMap((item) =>
        item.context_omissions.map((omission) => ({
          kind: 'CONTEXT_OMISSION' as const,
          summary: omission.summary,
          evidence: omission.evidence,
          evidence_records: [],
          canonical_ids: omission.canonical_ids,
          required_action: omission.required_action,
        })),
      ),
    ],
    verified_evidence: collectHarnessVerifiedEvidence(workOrder.objective),
    research_evidence: researchRouted.flatMap((item) => item.evidence),
    research_observations: researchRouted.flatMap((item) => item.observations),
    lookdev_results: lookdevResults,
    content_results: contentResults,
    worldbuilding_results: worldbuildingResults,
    candidate_envelopes: envelope ? [envelope] : [],
    specialist_failures: extras.specialistFailures ?? [],
    first_party_asset_ids: [
      ...new Set([
        ...lookdevResults.flatMap((item) => item.first_party_asset_ids),
        ...contentResults.flatMap((item) => item.first_party_asset_ids),
        ...worldbuildingResults.flatMap((item) => item.first_party_asset_ids),
      ]),
    ],
    canonical_version: workOrder.canonical_version,
    budget_usage: budget.snapshot(),
  });
  const withEvidence = applyHarnessVerifiedMismatches(
    draft,
    collectHarnessVerifiedEvidence(workOrder.objective),
    index,
    runId,
  );
  return classifyGovernance(withEvidence, {
    conflictRoundsUsed: budget.conflictRounds,
    maxConflictRounds: budget.snapshot().max_conflict_rounds,
  }).result;
}

export async function runPlanningHarness(
  input: HarnessRunInput,
): Promise<HarnessRunOutput> {
  const cwd = input.cwd ?? process.cwd();
  const config = input.config ?? resolveSwarmConfig();
  const started = input.now ?? new Date();
  const runId = createRunId(started);
  const store = createArtifactStore(runId, cwd);
  const workOrder = createWorkOrder(input.objective, runId);
  const canonical = loadCanonicalIndex(defaultSwarmPackageRoot(cwd));
  const budget = new BudgetTracker(config.budget);
  const runtime: PlanningRuntimeContext = {
    budget,
    canonical,
    objective: workOrder.objective,
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
    sharedConceptId:
      shouldConsultContent(workOrder.objective) || shouldConsultWorldbuilding(workOrder.objective)
        ? defaultSharedConcept(workOrder.objective)
        : undefined,
  };
  if (shouldConsultWorldbuilding(workOrder.objective) && input.skipModel) {
    const assets = inventoryFirstPartyAssets(cwd);
    const relevant = relevantAssetsForObjective(workOrder.objective, assets, {
      liveAssetIds: liveCachedAssetIds(assets, { cwd }),
    });
    runtime.worldKnowledgePacket = await retrieveWorldKnowledgePacket({
      objective: workOrder.objective,
      index: canonical,
      assets,
      observations: inspectFirstPartyVisuals(relevant, { cwd }),
      cwd,
    });
  }
  const errors: unknown[] = [];
  const fallbackEvents: string[] = [];
  const agentsInvoked = ['Astra'];
  const produced: {
    result: OrchestrationResult | null;
    queues: RunQueues | null;
    structuredFailure: StructuredOutputFailure | null;
    reviewPacket: ReviewPacket | null;
    reviewResult: ReviewerResponse | null;
  } = {
    result: null,
    queues: null,
    structuredFailure: null,
    reviewPacket: null,
    reviewResult: null,
  };
  let usageBits = extractUsage(null);
  let status: RunManifest['status'] = 'running';
  let stopReason: string | null = null;
  let exitCode = 0;
  let astraModel = config.models.astra;

  if (input.executeWorkPackages) {
    try {
      assertPlanningOnly();
    } catch (error) {
      errors.push(serializeError(error));
      status = 'failed';
      stopReason = 'EXECUTION_DISABLED';
      exitCode = 1;
    }
  }
  if (!input.skipModel && status !== 'failed') {
    requireLiveApiKey(config);
  }

  const persist = (completed: Date) => {
    const manifest: RunManifest = {
      run_id: runId,
      started_at: started.toISOString(),
      completed_at: completed.toISOString(),
      duration_ms: completed.getTime() - started.getTime(),
      canonical_version: CANONICAL_VERSION,
      configured_models: {
        astra: config.models.astra,
        engineering: config.models.engineering,
        specialist: config.models.specialist,
        utility: config.models.utility,
        reviewer: config.models.reviewer,
      },
      actual_models: {
        astra: astraModel,
        presented_as_astra: String(astraModel === config.models.astra),
        reviewer: runtime.reviewerInvoked ? config.models.reviewer : 'not_invoked',
      },
      fallback_events: fallbackEvents,
      agents_invoked: uniqueInvokedAgents([
        ...agentsInvoked,
        ...runtime.specialistResults.map((item) => item.agent),
        ...runtime.systemsResults.map((item) => item.agent),
        ...runtime.researchResults.map((item) => item.agent),
        ...runtime.lookdevResults.map((item) => item.agent),
        ...runtime.contentResults.map((item) => item.agent),
        ...runtime.worldbuildingResults.map((item) => item.agent),
        ...runtime.contentAssignments.map(() => 'content'),
        ...runtime.worldbuildingAssignments.map(() => 'worldbuilding'),
        ...(runtime.specialistFailures ?? []).map((item) => item.specialist),
      ]),
      reviewer_invoked: runtime.reviewerInvoked,
      work_packages_executed: [],
      status,
      stop_reason: stopReason,
    };
    const usage: UsageSnapshot = {
      run_id: runId,
      ...usageBits,
      review_calls: budget.snapshot().review_calls,
      reviewer_invoked: runtime.reviewerInvoked,
      notes: [
        'Usage is aggregated from RunContext or error.state when the SDK exposes it.',
        'If structured-output validation fails, the SDK may still attach usage on error.state.',
        'If those fields are absent, counts stay null. Per-agent tokens are not fabricated.',
        'Inspect OpenAI traces in the dashboard Trace viewer.',
      ],
    };
    persistRunArtifacts(store, {
      manifest,
      workOrder,
      specialistResults: runtime.specialistResults,
      systemsResults: runtime.systemsResults,
      researchResults: runtime.researchResults,
      lookdevResults: runtime.lookdevResults,
      contentResults: runtime.contentResults,
      worldbuildingResults: runtime.worldbuildingResults,
      worldKnowledgePacket: runtime.worldKnowledgePacket ?? null,
      specialistFailures: runtime.specialistFailures ?? [],
      contentFailure:
        runtime.specialistFailures?.find((item) => item.specialist === 'content' && item.fatal) ?? null,
      worldbuildingFailure:
        runtime.specialistFailures?.find((item) => item.specialist === 'worldbuilding' && item.fatal) ??
        null,
      orchestrationResult: produced.result,
      queues: produced.queues,
      usage,
      errors,
      structuredOutputFailure: produced.structuredFailure,
      reviewPacket: produced.reviewPacket,
      reviewResult: produced.reviewResult,
    });
    return { manifest, usage };
  };

  if (input.skipModel && status !== 'failed') {
    status = 'completed';
    stopReason = 'SKIPPED_MODEL';
  }

  if (status === 'failed' || input.skipModel) {
    const saved = persist(new Date());
    return {
      runId,
      artifactDir: store.dir,
      workOrder,
      result: produced.result,
      queues: produced.queues,
      specialistResults: runtime.specialistResults,
      systemsResults: runtime.systemsResults,
      researchResults: runtime.researchResults,
      lookdevResults: runtime.lookdevResults,
      contentResults: runtime.contentResults,
      worldbuildingResults: runtime.worldbuildingResults,
      worldKnowledgePacket: runtime.worldKnowledgePacket ?? null,
      reviewPacket: produced.reviewPacket,
      reviewResult: produced.reviewResult,
      manifest: saved.manifest,
      usage: saved.usage,
      errors,
      exitCode,
    };
  }

  const invokeGatedReviewer = async () => {
    if (!produced.result) return;
    const triggers = detectReviewTriggers(produced.result, {
      objective: workOrder.objective,
    });
    if (!shouldRequireReview(triggers)) return;
    const packet = buildReviewPacket(
      produced.result,
      triggers,
      canonical,
      `rev-${runId}`,
    );
    produced.reviewPacket = packet;
    try {
      assertReviewPacketCompleteness(packet, produced.result);
    } catch (error) {
      errors.push({
        message: error instanceof Error ? error.message : String(error),
        code: 'REVIEW_PACKET_INCOMPLETE',
      });
      return;
    }
    if (!budget.canCallReviewer()) {
      errors.push({
        message: 'Reviewer was required but the review budget was exhausted.',
        code: 'MAX_REVIEW_CALLS',
      });
      return;
    }
    budget.consumeAgentCall('reviewer');
    runtime.reviewerInvoked = true;
    agentsInvoked.push('Game Design Reviewer');
    const reviewer = createReviewer(config.models);
    try {
      const reviewRun = await run(reviewer, formatReviewPacketInput(packet), {
        maxTurns: Math.min(2, config.budget.max_turns),
      });
      const reviewUsage = extractUsage(reviewRun.state.usage ?? reviewRun.runContext.usage);
      usageBits = {
        requests:
          usageBits.requests === null && reviewUsage.requests === null
            ? null
            : (usageBits.requests ?? 0) + (reviewUsage.requests ?? 0),
        input_tokens:
          usageBits.input_tokens === null && reviewUsage.input_tokens === null
            ? null
            : (usageBits.input_tokens ?? 0) + (reviewUsage.input_tokens ?? 0),
        output_tokens:
          usageBits.output_tokens === null && reviewUsage.output_tokens === null
            ? null
            : (usageBits.output_tokens ?? 0) + (reviewUsage.output_tokens ?? 0),
        total_tokens:
          usageBits.total_tokens === null && reviewUsage.total_tokens === null
            ? null
            : (usageBits.total_tokens ?? 0) + (reviewUsage.total_tokens ?? 0),
      };
      const parsed = normalizeReviewerFindings(
        ReviewerResponseSchema.parse(reviewRun.finalOutput),
        produced.result,
      );
      produced.reviewResult = parsed;
      const applied = applyReviewerVerdict(produced.result, parsed, triggers, {
        conflictRoundsUsed: budget.conflictRounds,
        maxConflictRounds: config.budget.max_conflict_rounds,
      });
      produced.result = validateOrchestrationResult({
        ...applied.result,
        budget_usage: budget.snapshot(),
      });
      produced.queues = applied.queues;
    } catch (error) {
      const fromError = extractUsageFromError(error);
      if (fromError) {
        usageBits = {
          requests: (usageBits.requests ?? 0) + (fromError.requests ?? 0),
          input_tokens: (usageBits.input_tokens ?? 0) + (fromError.input_tokens ?? 0),
          output_tokens: (usageBits.output_tokens ?? 0) + (fromError.output_tokens ?? 0),
          total_tokens: (usageBits.total_tokens ?? 0) + (fromError.total_tokens ?? 0),
        };
      }
      produced.structuredFailure = describeStructuredOutputFailure({
        error,
        agent: 'Reviewer',
        model: config.models.reviewer,
        schema: 'ReviewerResponseSchema',
        runId,
      });
      errors.push(serializeError(error));
    }
  };

  const invokeAstra = async (model: string, presentedAsAstra: boolean) => {
    astraModel = model;
    budget.consumeAgentCall('astra');
    const astra = createAstra(config, runtime, model);
    if (!presentedAsAstra) {
      fallbackEvents.push(
        `ASTRA FALLBACK IN USE. Request used ${model}, not Astra. Do not present this as Astra.`,
      );
    }
    let plan: AstraSynthesis;
    try {
      const runResult = await run(astra, buildAstraPrompt(workOrder, canonical, runtime.sharedConceptId), {
        maxTurns: config.budget.max_turns,
        context: runtime,
      });
      usageBits = extractUsage(runResult.state.usage ?? runResult.runContext.usage);
      plan = parseAstraSynthesis(runResult.finalOutput);
    } catch (error) {
      const fromError = extractUsageFromError(error);
      if (fromError) usageBits = fromError;
      produced.structuredFailure = describeStructuredOutputFailure({
        error,
        agent: 'Astra',
        model,
        schema: 'AstraSynthesisSchema',
        runId,
      });
      const message = error instanceof Error ? error.message : String(error);
      if (!/did not match the expected schema/i.test(message) || runtime.specialistResults.length === 0) {
        throw error;
      }
      plan = parseAstraSynthesis({
        summary:
          'Astra synthesis failed structured-output validation. The harness kept specialist results as a partial plan.',
        specialists_consulted: [
          ...runtime.specialistResults.map((item) => item.agent),
          ...runtime.systemsResults.map((item) => item.agent),
        ],
        decisions: runtime.specialistResults.map((item) => item.summary),
        risks: runtime.specialistResults.flatMap((item) => item.risks),
        human_approvals_required: [
          'Review the partial Astra output before any implementation.',
        ],
      });
    }
    runtime.specialistFailures = [
      ...(runtime.specialistFailures ?? []),
      ...closeOpenSpecialistInvocations({
        contentAssignments: runtime.contentAssignments,
        worldbuildingAssignments: runtime.worldbuildingAssignments,
        contentResultCount: runtime.contentResults.length,
        worldbuildingResultCount: runtime.worldbuildingResults.length,
        existingFailures: runtime.specialistFailures ?? [],
        sharedConceptId: runtime.sharedConceptId ?? defaultSharedConcept(workOrder.objective),
        model: runtime.specialistModel ?? config.models.specialist,
      }),
    ];
    for (const failure of runtime.specialistFailures) {
      persistSpecialistFailure(store, failure);
    }
    produced.result = planToResult(
      workOrder,
      plan,
      runtime.specialistResults,
      runtime.systemsResults,
      runtime.researchResults,
      runtime.lookdevResults,
      runtime.contentResults,
      runtime.worldbuildingResults,
      budget,
      canonical,
      runId,
      started.toISOString(),
      runtime.assignments.flatMap((item) => item.canonical_context_ids),
      {
        sharedConceptId: runtime.sharedConceptId,
        specialistFailures: runtime.specialistFailures ?? [],
      },
    );
    produced.queues = routeQueues(
      produced.result,
      budget.conflictRounds,
      config.budget.max_conflict_rounds,
    );
    await invokeGatedReviewer();
    if (produced.result) {
      produced.result = validateOrchestrationResult({
        ...produced.result,
        budget_usage: budget.snapshot(),
      });
    }
    if (produced.result.conflicts.some((conflict) => !conflict.escalated)) {
      try {
        budget.recordConflictRound();
      } catch (error) {
        if (error instanceof BudgetExhaustedError) {
          produced.queues = routeQueues(
            produced.result,
            config.budget.max_conflict_rounds,
            config.budget.max_conflict_rounds,
          );
        } else {
          throw error;
        }
      }
    }
  };

  try {
    try {
      await invokeAstra(config.models.astra, true);
      status = 'completed';
    } catch (error) {
      if (isAstraUnavailableError(error) && !config.models.allowModelFallback) {
        throw new ModelFallbackDisabledError(
          config.models.astra,
          classifyOpenAiError(error, config.models.astra),
        );
      }
      if (isAstraUnavailableError(error) && config.models.allowModelFallback) {
        const resolved = resolveAstraModel(config.models, {
          forceFallback: true,
          unavailableReason: classifyOpenAiError(error, config.models.astra),
        });
        console.error(
          `ASTRA FALLBACK: using ${resolved.model} because ${config.models.astra} was unavailable. This is not Astra.`,
        );
        if (config.budget.retry_limit > 0) {
          budget.recordRetry();
        }
        await invokeAstra(resolved.model, false);
        status = 'completed';
      } else {
        throw error;
      }
    }
  } catch (error) {
    const fromError = extractUsageFromError(error);
    if (fromError) usageBits = fromError;
    if (!produced.structuredFailure && /did not match the expected schema/i.test(
      error instanceof Error ? error.message : String(error),
    )) {
      produced.structuredFailure = describeStructuredOutputFailure({
        error,
        agent: 'Astra',
        model: astraModel,
        schema: 'AstraSynthesisSchema',
        runId,
      });
    }
    errors.push(serializeError(error));
    if (error instanceof BudgetExhaustedError) {
      status = 'stopped';
      stopReason = error.budget;
      exitCode = 2;
      if (produced.result) {
        produced.result = validateOrchestrationResult({
          ...produced.result,
          budget_usage: budget.snapshot(),
        });
        produced.queues = routeQueues(
          produced.result,
          budget.conflictRounds,
          config.budget.max_conflict_rounds,
        );
      }
    } else {
      status = 'failed';
      stopReason = error instanceof Error ? error.message : String(error);
      exitCode = 1;
    }
  } finally {
    await getGlobalTraceProvider().forceFlush().catch(() => undefined);
  }

  const saved = persist(new Date());
  return {
    runId,
    artifactDir: store.dir,
    workOrder,
    result: produced.result,
    queues: produced.queues,
    specialistResults: runtime.specialistResults,
    systemsResults: runtime.systemsResults,
    researchResults: runtime.researchResults,
    lookdevResults: runtime.lookdevResults,
    contentResults: runtime.contentResults,
    worldbuildingResults: runtime.worldbuildingResults,
    worldKnowledgePacket: runtime.worldKnowledgePacket ?? null,
    reviewPacket: produced.reviewPacket,
    reviewResult: produced.reviewResult,
    manifest: saved.manifest,
    usage: saved.usage,
    errors,
    exitCode,
  };
}

export function createOfflineRuntime(
  config: SwarmConfig,
  canonical: CanonicalIndex,
): { team: ReturnType<typeof createPlanningTeam>; runtime: PlanningRuntimeContext } {
  const runtime: PlanningRuntimeContext = {
    budget: new BudgetTracker(config.budget),
    canonical,
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
  };
  return { team: createPlanningTeam(config, runtime), runtime };
}

function uniqueInvokedAgents(names: string[]): string[] {
  return [...new Set(names.filter(Boolean))];
}

function parseAstraSynthesis(value: unknown): AstraSynthesis {
  const parsed = AstraSynthesisSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return AstraSynthesisSchema.parse({
    summary:
      typeof record.summary === 'string' && record.summary.trim()
        ? record.summary
        : 'Astra returned an incomplete synthesis. Governance kept the run as a partial planning artifact.',
    decisions: Array.isArray(record.decisions) ? record.decisions : [],
    specialists_consulted: Array.isArray(record.specialists_consulted)
      ? record.specialists_consulted
      : [],
    work_package_intents: Array.isArray(record.work_package_intents)
      ? record.work_package_intents
      : [],
    candidate_notes: Array.isArray(record.candidate_notes) ? record.candidate_notes : [],
    contract_requests: Array.isArray(record.contract_requests)
      ? record.contract_requests
      : [],
    conflicts: Array.isArray(record.conflicts) ? record.conflicts : [],
    review_requests: Array.isArray(record.review_requests) ? record.review_requests : [],
    risks: Array.isArray(record.risks) ? record.risks : [],
    human_approvals_required: Array.isArray(record.human_approvals_required)
      ? record.human_approvals_required
      : ['Review the partial Astra output before any implementation.'],
  });
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      code: 'code' in error ? error.code : undefined,
    };
  }
  return { message: String(error) };
}
