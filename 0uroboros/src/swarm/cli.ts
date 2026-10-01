import { loadLocalEnv } from '../../scripts/openai-connection-config';

import { resolveSwarmConfig } from './config';
import { LiveEnvError } from './errors';
import {
  HUD_SMOKE_OBJECTIVE,
  CREATIVE_VALIDATION_OBJECTIVE,
  LOOKDEV_VALIDATION_OBJECTIVE,
  RESEARCH_VALIDATION_OBJECTIVE,
  REVIEWER_VALIDATION_OBJECTIVE,
  WORLDBUILDING_VALIDATION_OBJECTIVE,
  runPlanningHarness,
} from './harness';
import { formatWorldKnowledgePacket } from './worldKnowledge';
import { inspectFirstPartyVisualsLive } from './visualInspection';

function parseArgs(argv: string[]): {
  objective: string;
  verbose: boolean;
  smoke: boolean;
  reviewer: boolean;
  research: boolean;
  lookdev: boolean;
  inspectVisuals: boolean;
  creative: boolean;
  worldbuilding: boolean;
  worldKnowledge: boolean;
} {
  const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
  const objective = argv.filter((arg) => !arg.startsWith('--')).join(' ').trim();
  return {
    objective,
    verbose: flags.has('--verbose'),
    smoke: flags.has('--smoke'),
    reviewer: flags.has('--reviewer'),
    research: flags.has('--research'),
    lookdev: flags.has('--lookdev'),
    inspectVisuals: flags.has('--inspect-visuals'),
    creative: flags.has('--creative'),
    worldbuilding: flags.has('--worldbuilding'),
    worldKnowledge: flags.has('--world-knowledge'),
  };
}

function printResult(
  output: Awaited<ReturnType<typeof runPlanningHarness>>,
  verbose: boolean,
): void {
  console.log('0uroboros Swarm planning run');
  console.log(`Run: ${output.runId}`);
  console.log(`Status: ${output.manifest.status}`);
  if (output.manifest.stop_reason) {
    console.log(`Stop reason: ${output.manifest.stop_reason}`);
  }
  if (output.manifest.fallback_events.length > 0) {
    for (const event of output.manifest.fallback_events) {
      console.error(event);
    }
  }
  if (output.worldKnowledgePacket) {
    console.log('');
    console.log(`Vault searched: ${output.worldKnowledgePacket.searched}`);
    console.log(`Vault reachable: ${output.worldKnowledgePacket.vault_reachable}`);
    console.log(`Vault notes: ${output.worldKnowledgePacket.notes.length}`);
    console.log(
      `Note statuses: ${output.worldKnowledgePacket.notes.map((note) => `${note.title}=${note.status}`).join(', ') || '(none)'}`,
    );
  }
  if (output.result) {
    console.log('');
    console.log(output.result.summary);
    console.log('');
    console.log(`Specialists: ${output.result.specialists_consulted.join(', ') || '(none)'}`);
    console.log(`WorkPackages: ${output.result.work_packages.length} (not executed)`);
    console.log(`Open questions: ${output.queues?.open_question.length ?? 0}`);
    console.log(`Dependencies: ${output.queues?.dependency.length ?? 0}`);
    console.log(`Human design decisions: ${output.queues?.human_design_decision.length ?? 0}`);
    console.log(`Approvals required: ${output.queues?.approval.length ?? 0}`);
    console.log(`Contract requests: ${output.queues?.contract_request.length ?? 0}`);
    console.log(`Conflicts: ${output.queues?.conflict.length ?? 0}`);
    console.log(`Research evidence: ${output.result.research_evidence.length}`);
    console.log(`LookDev results: ${output.lookdevResults.length}`);
    console.log(`Content results: ${output.contentResults.length}`);
    console.log(`Worldbuilding results: ${output.worldbuildingResults.length}`);
    const envelope = output.result.candidate_envelopes[0];
    if (envelope) {
      console.log(
        `Candidate envelope: ${envelope.candidate_name || '(unnamed)'} ${envelope.concept_id} status=${envelope.status} approved=${envelope.approved}`,
      );
    }
    console.log(`Specialist failures: ${output.result.specialist_failures.length}`);
    console.log(`Reviewer invoked: ${output.manifest.reviewer_invoked ? 'yes' : 'no'}`);
    if (output.reviewResult) {
      console.log(`Reviewer verdict: ${output.reviewResult.verdict}`);
    }
  }
  console.log('');
  console.log(
    `Usage: requests=${output.usage.requests ?? 'n/a'} input=${output.usage.input_tokens ?? 'n/a'} output=${output.usage.output_tokens ?? 'n/a'} total=${output.usage.total_tokens ?? 'n/a'}`,
  );
  console.log(`Artifacts: ${output.artifactDir}`);
  console.log('Inspect traces in the OpenAI dashboard Trace viewer.');
  if (verbose && output.worldKnowledgePacket) {
    console.log('');
    console.log(formatWorldKnowledgePacket(output.worldKnowledgePacket));
  }
  if (verbose && output.result) {
    console.log('');
    console.log(JSON.stringify(output.result, null, 2));
  }
  if (output.errors.length > 0) {
    console.error('');
    console.error('Errors:');
    for (const error of output.errors) {
      console.error(typeof error === 'object' ? JSON.stringify(error) : error);
    }
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.inspectVisuals) {
    process.env.VISUAL_INSPECTION_LIVE = 'true';
    const inspection = await inspectFirstPartyVisualsLive();
    console.log('0uroboros first-party visual inspection');
    console.log(`Ran: ${inspection.ran}`);
    console.log(`Failed: ${inspection.failed}`);
    console.log(`Model: ${inspection.model}`);
    console.log(`API calls: ${inspection.api_calls}`);
    console.log(`From cache: ${inspection.from_cache.join(', ') || '(none)'}`);
    console.log(`Substitutions: ${inspection.substitutions.join('; ') || '(none)'}`);
    console.log(inspection.reason);
    for (const observation of inspection.observations) {
      console.log('');
      console.log(`${observation.asset_id} (${observation.subject})`);
      console.log(`status=${observation.inspection_status} confidence=${observation.confidence} not_lore=${observation.not_lore}`);
      console.log(`motifs: ${observation.visible_motifs.join(', ') || '(none)'}`);
      console.log(`materials: ${observation.materials.join(', ') || '(none)'}`);
      console.log(`lighting: ${observation.lighting || '(none)'}`);
    }
    process.exit(inspection.failed ? 1 : 0);
  }
  const objective = args.worldKnowledge || args.worldbuilding
    ? WORLDBUILDING_VALIDATION_OBJECTIVE
    : args.creative
      ? CREATIVE_VALIDATION_OBJECTIVE
      : args.lookdev
        ? LOOKDEV_VALIDATION_OBJECTIVE
        : args.research
          ? RESEARCH_VALIDATION_OBJECTIVE
          : args.reviewer
            ? REVIEWER_VALIDATION_OBJECTIVE
            : args.smoke
              ? HUD_SMOKE_OBJECTIVE
              : args.objective;
  if (!objective) {
    console.error('Usage: npm run swarm -- "<objective>"');
    console.error('       npm run swarm -- --smoke');
    console.error('       npm run swarm -- --research');
    console.error('       npm run swarm -- --lookdev');
    console.error('       npm run swarm -- --inspect-visuals');
    console.error('       npm run swarm -- --creative');
    console.error('       npm run swarm -- --world-knowledge');
    console.error('       npm run swarm -- --worldbuilding');
    process.exit(1);
  }

  try {
    if (!args.worldKnowledge) {
      resolveSwarmConfig();
    }
  } catch (error) {
    const message = error instanceof LiveEnvError ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }

  const output = await runPlanningHarness({
    objective,
    skipModel: args.worldKnowledge,
  });
  printResult(output, args.verbose || args.worldKnowledge);
  process.exit(output.exitCode);
}

void main();
