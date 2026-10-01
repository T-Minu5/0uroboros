import type { AstraSynthesis } from './contracts';
import {
  CandidateConceptEnvelopeSchema,
  ProposalEnvelopeSchema,
  type CandidateConceptEnvelope,
  type ContentResponse,
  type ProposalEnvelope,
  type SpecialistFailureRecord,
  type WorldbuildingResponse,
} from './contracts';
import { shouldConsultContent } from './content';
import { normalizeCreativeName } from './creative';
import { shouldConsultWorldbuilding } from './worldbuilding';

export const CONTENT_OWNED_FIELDS = [
  'power',
  'effect',
  'draft_cost',
  'gameplay_role',
  'mechanic_provenance',
] as const;

export const WORLDBUILDING_OWNED_FIELDS = [
  'biography',
  'faction',
  'history',
  'relationships',
  'symbolic_meaning',
  'lore_identity',
] as const;

export function requiredCreativeSpecialists(
  objective: string,
): Array<'content' | 'worldbuilding'> {
  const roles: Array<'content' | 'worldbuilding'> = [];
  if (shouldConsultContent(objective)) roles.push('content');
  if (shouldConsultWorldbuilding(objective)) roles.push('worldbuilding');
  return roles;
}

export function buildCandidateEnvelope(input: {
  objective: string;
  sharedConceptId: string;
  synthesis: AstraSynthesis;
  contentResults: ContentResponse[];
  worldbuildingResults: WorldbuildingResponse[];
  specialistFailures: SpecialistFailureRecord[];
}): CandidateConceptEnvelope | null {
  const required = requiredCreativeSpecialists(input.objective);
  const content = input.contentResults[0] ?? null;
  const world = input.worldbuildingResults[0] ?? null;
  const failures = input.specialistFailures;
  if (!content && !world && failures.length === 0 && required.length === 0) {
    return null;
  }

  const contentFailed = required.includes('content') && !content;
  const worldFailed = required.includes('worldbuilding') && !world;
  const unresolved: string[] = [];
  if (contentFailed) unresolved.push(...CONTENT_OWNED_FIELDS);
  if (worldFailed) unresolved.push(...WORLDBUILDING_OWNED_FIELDS);

  const proposal = content?.content_proposals[0];
  const worldProposal = world?.world_proposals[0];
  const alternativeNames = uniqueStrings([
    ...input.synthesis.alternative_working_names,
    ...input.synthesis.candidate_notes
      .map((note) => note.title)
      .filter((title) => title.trim().length > 0),
    ...(content?.content_proposals.slice(1).map((item) => item.name) ?? []),
    ...(world?.naming_proposals ?? []),
    ...(world?.world_proposals.slice(1).map((item) => item.title) ?? []),
  ]);
  const candidate_name =
    input.synthesis.selected_candidate_name.trim() ||
    proposal?.name ||
    worldProposal?.title ||
    alternativeNames[0] ||
    '';
  const alternatives = alternativeNames.filter(
    (name) => normalizeCreativeName(name) !== normalizeCreativeName(candidate_name),
  );
  const status = contentFailed || worldFailed ? 'INCOMPLETE' : content && world ? 'CANDIDATE' : required.length > 0 ? 'INCOMPLETE' : 'CANDIDATE';
  const specialists = uniqueStrings([
    ...(content ? ['content'] : []),
    ...(world ? ['worldbuilding'] : []),
  ]);

  return CandidateConceptEnvelopeSchema.parse({
    concept_id: input.sharedConceptId,
    candidate_name,
    candidate_type: proposal?.content_type || 'CHARACTER',
    status,
    content_contribution: content,
    worldbuilding_contribution: world,
    mechanics_used: content ? proposal?.mechanics_used ?? [] : [],
    balance_values: {
      power: content ? proposal?.power ?? null : null,
      draft_cost: content ? proposal?.draft_cost ?? null : null,
      effect: content ? proposal?.proposed_effect ?? '' : '',
      gameplay_role: content ? proposal?.gameplay_role || proposal?.strategic_purpose || '' : '',
    },
    first_party_visual_evidence: uniqueStrings([
      ...(content?.first_party_asset_ids ?? []),
      ...(world?.first_party_asset_ids ?? []),
    ]),
    world_knowledge_evidence: uniqueStrings(world?.vault_note_paths ?? []),
    canonical_ids: uniqueStrings([
      ...(content?.canonical_ids_referenced ?? []),
      ...(proposal?.existing_rules_used ?? []),
      ...(proposal?.mechanics_used.flatMap((item) => item.canonical_ids) ?? []),
      ...(world?.canonical_ids_referenced ?? []),
    ]),
    alternative_names: alternatives,
    risks: uniqueStrings([
      ...input.synthesis.risks,
      ...(content?.risks ?? []),
      ...(world?.risks ?? []),
      ...failures.map((item) => `${item.code}: ${item.specialist} ${item.error_class}`),
    ]),
    open_questions: uniqueStrings([
      ...input.synthesis.review_requests,
      ...(content?.open_questions ?? []),
      ...(content?.balance_questions ?? []),
      ...(world?.open_questions ?? []),
      ...(world?.canon_questions ?? []),
    ]),
    unresolved_fields: uniqueStrings(unresolved),
    specialists_contributing: specialists,
    specialist_failures: failures,
    approved: false,
  });
}

export function envelopeToCandidateProposal(
  envelope: CandidateConceptEnvelope,
  options: { runId: string; createdAt: string; canonicalVersion: string },
): ProposalEnvelope {
  return ProposalEnvelopeSchema.parse({
    id: `prop-${options.runId}-envelope`,
    canonical_version: options.canonicalVersion,
    created_at: options.createdAt,
    agent: 'astra',
    classification: 'PROPOSED_ADDITION',
    authority: 'GOVERNANCE',
    status: 'DRAFT',
    rules_changed: false,
    requirements_touched: envelope.canonical_ids,
    contracts_required: [],
    summary: envelope.candidate_name || envelope.concept_id,
    rationale: `Candidate envelope ${envelope.concept_id} status ${envelope.status}.`,
    risks:
      envelope.risks.length > 0
        ? envelope.risks.slice(0, 8)
        : ['Candidate remains unapproved.'],
    provenance: ['candidate-concept-envelope', envelope.concept_id],
    stale_check_status: 'NEEDS_CHECK',
    human_approval_required: false,
    queue_target: 'CANDIDATE',
    authorized_by: envelope.canonical_ids.filter(
      (id) => id.startsWith('RULE-') || id.startsWith('TECH-'),
    ),
    runtime_run_id: options.runId,
  });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

export function envelopeRemainsCandidateDespiteEmptyVault(
  envelope: CandidateConceptEnvelope | null,
  searchOutcome: string,
): boolean {
  return envelope?.status === 'CANDIDATE' && searchOutcome === 'WORLD_KNOWLEDGE_NO_MATCH';
}
