/**
 * Up to three Astra reconciliation rounds for the starter-deck WorkPackage.
 * Advisory only. Does not execute, authorize, or mutate game code.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadLocalEnv } from './openai-connection-config';
import { CANONICAL_VERSION, requireLiveApiKey, resolveSwarmConfig } from '../src/swarm/config';
import {
  STARTER_DECK_OPERATION,
  STARTER_DECK_PERMITTED_COMMANDS,
  STARTER_DECK_READ_SCOPE,
  STARTER_DECK_WRITE_SCOPE,
  STARTER_RECONCILE_OBJECTIVE,
} from '../src/swarm/evidence';
import { runPlanningHarness } from '../src/swarm/harness';
import { advisoryRoutingEligibility } from '../src/swarm/leadRouting';
import type { ReviewerResponse, WorkPackage } from '../src/swarm/contracts';

const MAX_ROUNDS = 3;

function sanitizeForObjective(text: string): string {
  return text
    .replace(/acceptance criteria/gi, 'success checks')
    .replace(/\bhud\b/gi, 'presentation layer')
    .replace(/\bproduct lead\b/gi, 'planning lead')
    .slice(0, 1500);
}

function persistWorkPackage(
  workPackage: WorkPackage | null,
  review: ReviewerResponse | null,
  runId: string,
  round: number,
): void {
  mkdirSync(join(process.cwd(), 'tools/agent-harness/workpackages'), { recursive: true });
  writeFileSync(
    join(process.cwd(), 'tools/agent-harness/workpackages/wp-starter-deck-alignment.json'),
    `${JSON.stringify(
      {
        work_package: workPackage,
        execution_authorized: false,
        reuse_auth_8af9ce4d: false,
        operation: STARTER_DECK_OPERATION,
        read_scope: [...STARTER_DECK_READ_SCOPE],
        write_scope: [...STARTER_DECK_WRITE_SCOPE],
        permitted_commands: [...STARTER_DECK_PERMITTED_COMMANDS],
        reviewer: review
          ? {
              run_id: runId,
              round,
              verdict: review.verdict,
              summary: review.summary,
              required_revisions: review.required_revisions,
              findings: review.findings,
            }
          : { run_id: runId, round, verdict: null },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

function pickStarterPackage(packages: WorkPackage[]): WorkPackage | null {
  return (
    packages.find(
      (item) =>
        item.authorized_rule_ids.includes('RULE-DECK-001') ||
        item.scope.some((scope) => scope.includes('cards.ts')),
    ) ??
    packages[0] ??
    null
  );
}

async function main(): Promise<void> {
  loadLocalEnv();
  const config = resolveSwarmConfig();
  requireLiveApiKey(config);
  const routing = advisoryRoutingEligibility(STARTER_RECONCILE_OBJECTIVE);
  if (
    routing.product ||
    routing.ux ||
    routing.research ||
    routing.lookdev ||
    routing.content ||
    routing.worldbuilding ||
    !routing.systems ||
    !routing.engineering
  ) {
    throw new Error(`Unexpected starter reconciliation routing: ${JSON.stringify(routing)}`);
  }

  const rounds: Array<Record<string, unknown>> = [];
  let objective = STARTER_RECONCILE_OBJECTIVE;
  let stopReason = 'ROUNDS_EXHAUSTED';
  let readiness: 'READY_FOR_REAUTHORIZATION' | 'NOT_READY' | 'HUMAN_RULE_DECISION_REQUIRED' =
    'NOT_READY';
  let finalPackage: WorkPackage | null = null;
  let finalReview: ReviewerResponse | null = null;

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    console.log(`Starter reconciliation round ${round}`);
    const output = await runPlanningHarness({
      objective,
      config,
    });
    const workPackage = output.result ? pickStarterPackage(output.result.work_packages) : null;
    const review = output.reviewResult;
    persistWorkPackage(workPackage, review, output.runId, round);
    const packetError = output.errors.find(
      (item) => (item as { code?: string }).code === 'REVIEW_PACKET_INCOMPLETE',
    );
    const modelError = output.errors.find((item) => {
      const code = (item as { code?: string }).code;
      return code !== 'REVIEW_PACKET_INCOMPLETE' && code !== 'MAX_REVIEW_CALLS';
    });
    const record = {
      round,
      run_id: output.runId,
      artifact_dir: output.artifactDir,
      specialists_consulted: output.result?.specialists_consulted ?? [],
      reviewer_invoked: output.manifest.reviewer_invoked,
      verdict: review?.verdict ?? null,
      summary: review?.summary ?? output.result?.summary ?? null,
      findings: review?.findings ?? [],
      required_revisions: review?.required_revisions ?? [],
      packet_error: packetError ?? null,
      errors: output.errors,
      work_package_id: workPackage?.id ?? null,
      execution_authorized: false,
    };
    rounds.push(record);
    finalPackage = workPackage;
    finalReview = review;

    if (modelError && !review) {
      stopReason = 'MODEL_CALL_FAILED';
      readiness = 'NOT_READY';
      break;
    }
    if (packetError) {
      stopReason = 'REVIEW_PACKET_INCOMPLETE';
      readiness = 'NOT_READY';
      break;
    }
    if (!review) {
      stopReason = 'REVIEWER_NOT_INVOKED';
      readiness = 'NOT_READY';
      break;
    }
    if (review.verdict === 'PASS' || review.verdict === 'PASS_WITH_NOTES') {
      stopReason = round === 1 ? 'PASS_EARLY' : 'PASS';
      readiness = 'READY_FOR_REAUTHORIZATION';
      break;
    }
    if (review.verdict === 'ESCALATE') {
      stopReason = 'ESCALATE';
      readiness = 'HUMAN_RULE_DECISION_REQUIRED';
      break;
    }
    if (review.verdict === 'REVISE' && round < MAX_ROUNDS) {
      const revisions = [...review.required_revisions, ...review.findings.map((item) => item.summary)]
        .map(sanitizeForObjective)
        .join(' | ');
      objective = `${STARTER_RECONCILE_OBJECTIVE} Address Reviewer required revisions without changing canonical rules: ${revisions}. Do not invoke research. Do not invoke lookdev.`;
      continue;
    }
    stopReason = 'REVISE_AFTER_FINAL_ROUND';
    readiness = 'NOT_READY';
  }

  const report = {
    execution_authorized: false,
    execution_status: 'NOT_EXECUTED',
    readiness,
    stop_reason: stopReason,
    rounds_used: rounds.length,
    rounds,
    work_package: finalPackage,
    reviewer: finalReview
      ? {
          verdict: finalReview.verdict,
          summary: finalReview.summary,
          required_revisions: finalReview.required_revisions,
          findings: finalReview.findings,
        }
      : null,
    canonical_version: CANONICAL_VERSION,
  };
  mkdirSync(join(process.cwd(), 'tools/agent-harness/workpackages'), { recursive: true });
  writeFileSync(
    join(process.cwd(), 'tools/agent-harness/workpackages/starter-reconciliation-report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
