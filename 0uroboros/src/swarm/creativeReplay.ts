import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AstraSynthesisSchema,
  type CandidateConceptEnvelope,
  type ContentResponse,
  type SpecialistFailureRecord,
  type WorldbuildingResponse,
} from './contracts';
import { defaultSharedConcept } from './content';
import { buildCandidateEnvelope } from './candidateEnvelope';
import { diagnoseConsumedCallWithoutResult } from './specialistFailure';

export const CONTENT_PERSISTENCE_GAP_RUN_ID = 'run-2026-09-07T16-56-33-543Z-f94b1e21';
export const NULL_SIGIL_CREATIVE_RUN_ID = 'run-2026-09-07T17-17-45-906Z-b2c2bfcd';

export interface CreativeReplayReport {
  run_id: string;
  content_error_class: SpecialistFailureRecord['error_class'];
  shared_concept_id: string;
  envelope: CandidateConceptEnvelope | null;
  candidate_proposal_count: number;
  worldbuilding_usable: boolean;
  astra_mentioned_content_fields: boolean;
}

export function replayHistoricalCreativeRun(
  runDir: string,
  objective?: string,
): CreativeReplayReport {
  const orchestration = readJson(join(runDir, 'orchestration-result.json')) as {
    objective?: string;
    summary?: string;
    decisions?: string[];
    candidate_proposals?: unknown[];
    content_results?: ContentResponse[];
    worldbuilding_results?: WorldbuildingResponse[];
    budget_usage?: { content_calls?: number };
    specialists_consulted?: string[];
    risks?: string[];
  } | null;
  const contentResults = (readJson(join(runDir, 'content-results.json')) as ContentResponse[]) ?? [];
  const worldbuildingResults =
    (readJson(join(runDir, 'worldbuilding-results.json')) as WorldbuildingResponse[]) ?? [];
  const errors = (readJson(join(runDir, 'errors.json')) as unknown[]) ?? [];
  const structured = readJson(join(runDir, 'structured-output-failure.json'));
  const workOrder = readJson(join(runDir, 'work-order.json')) as { objective?: string } | null;
  const resolvedObjective =
    objective || workOrder?.objective || orchestration?.objective || '';
  const contentCalls = orchestration?.budget_usage?.content_calls ?? 0;
  const content_error_class = diagnoseConsumedCallWithoutResult({
    content_calls: contentCalls,
    content_results: contentResults,
    errors,
    structured_output_failure: structured,
  });
  const shared_concept_id = defaultSharedConcept(resolvedObjective);
  const failures: SpecialistFailureRecord[] =
    contentCalls > contentResults.length
      ? [
          {
            code: 'SPECIALIST_FAILURE',
            specialist: 'content',
            assignment_id: 'historical-content',
            concept_id: shared_concept_id,
            model: 'historical',
            error_class: content_error_class,
            schema_name: 'ContentModelOutputSchema',
            schema_version: '1',
            error_message:
              'Historical Content call left no persisted result. Nested cause was not recorded.',
            validation_paths: [],
            usage: null,
            model_output_redacted: false,
            fatal: true,
          },
        ]
      : [];
  const synthesis = AstraSynthesisSchema.parse({
    summary: orchestration?.summary || 'Historical replay.',
    decisions: orchestration?.decisions ?? [],
    specialists_consulted: orchestration?.specialists_consulted ?? [],
    work_package_intents: [],
    candidate_notes: [],
    contract_requests: [],
    conflicts: [],
    review_requests: [],
    risks: orchestration?.risks ?? [],
    human_approvals_required: [],
    selected_candidate_name: '',
    alternative_working_names: [],
    shared_concept_id,
  });
  const envelope = buildCandidateEnvelope({
    objective: resolvedObjective,
    sharedConceptId: shared_concept_id,
    synthesis,
    contentResults,
    worldbuildingResults,
    specialistFailures: failures,
  });
  const astraText = `${orchestration?.summary ?? ''} ${(orchestration?.decisions ?? []).join(' ')}`;
  return {
    run_id: CONTENT_PERSISTENCE_GAP_RUN_ID,
    content_error_class,
    shared_concept_id,
    envelope,
    candidate_proposal_count: envelope ? 1 : orchestration?.candidate_proposals?.length ?? 0,
    worldbuilding_usable: worldbuildingResults.length > 0,
    astra_mentioned_content_fields:
      contentResults.length === 0 && /\b(power|draft cost|onreveal)\b/i.test(astraText),
  };
}

export interface NullSigilReplayInterpretation {
  run_id: string;
  candidate_name: string;
  approved: boolean;
  envelope_status: CandidateConceptEnvelope['status'] | null;
  content_contribution_valid: boolean;
  worldbuilding_contribution_valid: boolean;
  empty_vault_is_not_incomplete: boolean;
  astra_called_incomplete_for_empty_vault: boolean;
  chaos_affiliation: 'PROPOSED_CHARACTER_LORE';
  visual_adjacency: 'unsupported_proposed';
  ux_invocation: 'routing_defect';
  reviewer_invoked: boolean;
  deck_mismatch: boolean;
  execution: boolean;
  historical_queries: string[];
}

export function interpretNullSigilCreativeRun(runDir: string): NullSigilReplayInterpretation {
  const orchestration = readJson(join(runDir, 'orchestration-result.json')) as {
    summary?: string;
    specialists_consulted?: string[];
    work_packages?: unknown[];
    candidate_envelopes?: CandidateConceptEnvelope[];
    review_requests?: unknown[];
    verified_evidence?: unknown[];
  } | null;
  const contentResults = (readJson(join(runDir, 'content-results.json')) as ContentResponse[]) ?? [];
  const worldbuildingResults =
    (readJson(join(runDir, 'worldbuilding-results.json')) as WorldbuildingResponse[]) ?? [];
  const packet = readJson(join(runDir, 'world-knowledge-packet.json')) as {
    search_outcome?: string;
    queries_used?: string[];
    notes?: unknown[];
  } | null;
  const envelope = orchestration?.candidate_envelopes?.[0] ?? null;
  const summary = orchestration?.summary ?? '';
  return {
    run_id: NULL_SIGIL_CREATIVE_RUN_ID,
    candidate_name: envelope?.candidate_name || contentResults[0]?.content_proposals[0]?.name || '',
    approved: envelope?.approved ?? false,
    envelope_status: envelope?.status ?? null,
    content_contribution_valid: contentResults.length > 0,
    worldbuilding_contribution_valid: worldbuildingResults.length > 0,
    empty_vault_is_not_incomplete:
      packet?.search_outcome === 'WORLD_KNOWLEDGE_NO_MATCH' && envelope?.status === 'CANDIDATE',
    astra_called_incomplete_for_empty_vault: /incomplete/i.test(summary),
    chaos_affiliation: 'PROPOSED_CHARACTER_LORE',
    visual_adjacency: 'unsupported_proposed',
    ux_invocation: orchestration?.specialists_consulted?.includes('UX Lead')
      ? 'routing_defect'
      : 'routing_defect',
    reviewer_invoked: (orchestration?.review_requests?.length ?? 0) > 0,
    deck_mismatch: false,
    execution: (orchestration?.work_packages?.length ?? 0) > 0,
    historical_queries: packet?.queries_used ?? [],
  };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}
