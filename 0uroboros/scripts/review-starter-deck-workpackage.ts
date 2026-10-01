/**
 * Reviewer-only advisory run for the reconciled starter-deck WorkPackage.
 * Does not execute, authorize, or mutate game code.
 */
import { run } from '@openai/agents';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadLocalEnv } from './openai-connection-config';
import { createReviewer } from '../src/swarm/agents';
import { createArtifactStore, createRunId, persistRunArtifacts } from '../src/swarm/artifacts';
import { BudgetTracker } from '../src/swarm/budget';
import { CANONICAL_VERSION, requireLiveApiKey, resolveSwarmConfig } from '../src/swarm/config';
import { ReviewerResponseSchema, WorkOrderSchema } from '../src/swarm/contracts';
import { defaultSwarmPackageRoot, loadCanonicalIndex } from '../src/swarm/context';
import { extractUsageFromUnknown } from '../src/swarm/diagnostics';
import {
  STARTER_DECK_OPERATION,
  STARTER_DECK_PERMITTED_COMMANDS,
  STARTER_DECK_READ_SCOPE,
  STARTER_DECK_WRITE_SCOPE,
  collectHarnessVerifiedEvidence,
  startingDeckCorrectionPackage,
} from '../src/swarm/evidence';
import { validateOrchestrationResult } from '../src/swarm/governance';
import {
  buildReviewPacket,
  detectReviewTriggers,
  formatReviewPacketInput,
  normalizeReviewerFindings,
  assertReviewPacketCompleteness,
} from '../src/swarm/review';
import { classifyGovernance } from '../src/swarm/routing';
import { classifyStartingDeckAuthority } from '../src/swarm/systems';

async function main(): Promise<void> {
  loadLocalEnv();
  const config = resolveSwarmConfig();
  requireLiveApiKey(config);
  const started = new Date();
  const runId = createRunId(started);
  const store = createArtifactStore(runId);
  const index = loadCanonicalIndex(defaultSwarmPackageRoot());
  const evidence = collectHarnessVerifiedEvidence(
    'implementation mismatch starting deck RULE-DECK-001',
  );
  const workPackage = startingDeckCorrectionPackage('starter-deck-alignment', CANONICAL_VERSION, evidence[0]!);
  const result = validateOrchestrationResult({
    objective:
      'Compare repository STARTING_DECK and CARD_DEFINITIONS against RULE-DECK-001 and RULE-STARTER-001 through RULE-STARTER-008, then produce one implementation-ready correction WorkPackage. Implementation mismatch. Implementation versus canonical. Implementation planning. Do not execute. Do not authorize execution.',
    summary:
      'Placeholder starter identities and 4/4/2 composition do not satisfy RULE-DECK-001 or RULE-STARTER-001 through RULE-STARTER-008. Minimum Action-economy and generic Restore support belong in this WorkPackage because the approved starters require them.',
    decisions: [
      'RULE-DECK-001 and RULE-STARTER-001 through RULE-STARTER-008 govern the correction.',
      'HIST-DECK-4-4-2 is superseded.',
      'Do not invent cards. Keep placeholder definitions as fixtures.',
      'Action spend, turn grants, and generic Restore fallback are in this WorkPackage.',
      'execution_authorized remains false.',
    ],
    specialists_consulted: ['Lead Engineering', 'Systems / Rules'],
    specialist_role_ids: ['engineering', 'systems'],
    work_packages: [workPackage],
    candidate_proposals: [],
    contract_requests: [],
    conflicts: [],
    review_requests: ['IMPLEMENTATION_CANDIDATE'],
    risks: [
      'Action gain on starter Characters cannot resolve until the Action economy exists.',
      'Vault Encryption has no printed static VP amount; this package does not invent one.',
    ],
    human_approvals_required: [
      'Future execution requires a new human authorization. Do not reuse auth-8af9ce4d.',
    ],
    systems_findings: [classifyStartingDeckAuthority(index)],
    verified_evidence: evidence,
    canonical_version: CANONICAL_VERSION,
    budget_usage: {
      ...config.budget,
      turns_used: 1,
      total_agent_calls: 1,
      specialist_calls: 0,
      review_calls: 0,
      conflict_rounds: 0,
      retries: 0,
      exhausted: null,
    },
  });
  const triggers = detectReviewTriggers(result, { objective: result.objective });
  if (!triggers.includes('IMPLEMENTATION_CANDIDATE')) {
    throw new Error(`Expected IMPLEMENTATION_CANDIDATE, got ${triggers.join(', ') || '(none)'}`);
  }
  const packet = buildReviewPacket(result, triggers, index, `rev-${runId}`);
  assertReviewPacketCompleteness(packet, result);
  const budget = new BudgetTracker(config.budget);
  budget.consumeAgentCall('reviewer');
  const reviewer = createReviewer(config.models);
  const reviewRun = await run(reviewer, formatReviewPacketInput(packet), {
    maxTurns: Math.min(2, config.budget.max_turns),
  });
  const parsed = normalizeReviewerFindings(
    ReviewerResponseSchema.parse(reviewRun.finalOutput),
    result,
  );
  const usage = extractUsageFromUnknown(reviewRun.state) ?? extractUsageFromUnknown(reviewRun.runContext);
  const reviewed = { ...result, review_triggers: triggers, review_verdict: parsed.verdict };
  const { queues } = classifyGovernance(reviewed, {
    conflictRoundsUsed: 0,
    maxConflictRounds: config.budget.max_conflict_rounds,
  });
  persistRunArtifacts(store, {
    manifest: {
      run_id: runId,
      started_at: started.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - started.getTime(),
      canonical_version: CANONICAL_VERSION,
      configured_models: {
        astra: config.models.astra,
        engineering: config.models.engineering,
        specialist: config.models.specialist,
        utility: config.models.utility,
        reviewer: config.models.reviewer,
      },
      actual_models: {
        astra: 'not_invoked',
        presented_as_astra: 'false',
        reviewer: config.models.reviewer,
      },
      fallback_events: [],
      agents_invoked: ['Game Design Reviewer'],
      reviewer_invoked: true,
      work_packages_executed: [],
      status: 'completed',
      stop_reason: 'REVIEWER_ONLY_NO_EXECUTION',
    },
    workOrder: WorkOrderSchema.parse({
      id: `wo-${runId}`,
      objective: result.objective,
      context: 'Starter-deck reconciliation. Advisory Reviewer only. No execution.',
      constraints: [
        'Do not execute.',
        'Do not authorize execution.',
        'Do not mutate game code, canonical rules, assets, or tests in this run.',
      ],
      acceptance_criteria: workPackage.acceptance_criteria,
      requested_expertise: ['engineering', 'systems', 'reviewer'],
      out_of_scope: [
        'Sandbox execution',
        'Host copy-back',
        'HUD and playerView',
        'Canonical mutation',
      ],
      canonical_version: CANONICAL_VERSION,
    }),
    specialistResults: [],
    systemsResults: [],
    orchestrationResult: reviewed,
    queues,
    usage: {
      run_id: runId,
      requests: usage?.requests ?? null,
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
      total_tokens: usage?.total_tokens ?? null,
      review_calls: 1,
      reviewer_invoked: true,
      notes: ['Reviewer-only advisory run. No execution model call. No host mutation.'],
    },
    errors: [],
    reviewPacket: packet,
    reviewResult: parsed,
  });
  store.writeJson('starter-deck-workpackage.json', workPackage);
  store.writeJson('starter-deck-execution-intent.json', {
    execution_authorized: false,
    reuse_auth_8af9ce4d: false,
    operation: STARTER_DECK_OPERATION,
    read_scope: [...STARTER_DECK_READ_SCOPE],
    write_scope: [...STARTER_DECK_WRITE_SCOPE],
    permitted_commands: [...STARTER_DECK_PERMITTED_COMMANDS],
  });
  mkdirSync(join(process.cwd(), 'tools/agent-harness/workpackages'), { recursive: true });
  writeFileSync(
    join(process.cwd(), 'tools/agent-harness/workpackages/wp-starter-deck-alignment.json'),
    `${JSON.stringify(
      {
        work_package: workPackage,
        execution_authorized: false,
        operation: STARTER_DECK_OPERATION,
        read_scope: [...STARTER_DECK_READ_SCOPE],
        write_scope: [...STARTER_DECK_WRITE_SCOPE],
        permitted_commands: [...STARTER_DECK_PERMITTED_COMMANDS],
        reviewer: {
          run_id: runId,
          verdict: parsed.verdict,
          summary: parsed.summary,
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log('Starter-deck WorkPackage review');
  console.log(`Run: ${runId}`);
  console.log(`WorkPackage: ${workPackage.id}`);
  console.log(`Triggers: ${triggers.join(', ')}`);
  console.log(`Verdict: ${parsed.verdict}`);
  console.log(`Summary: ${parsed.summary}`);
  console.log(`Artifacts: ${store.dir}`);
  console.log('execution_authorized: false');
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
