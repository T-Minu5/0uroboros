import {
  assembleApprovedMechanicsPacket,
  classifyProposedEffect,
  contentContextOmissionForApprovedPrimitive,
  formatApprovedMechanicsPacket,
  mechanicStatusRequiresRuleChange,
} from './approvedMechanics';
import type { RunBudgetConfig } from './config';
import type { CanonicalIndex } from './context';
import { formatCanonicalExcerpts, retrieveCanonical } from './context';
import type {
  ContentAssignment,
  ContentProposal,
  ContentResponse,
  FirstPartyAssetRecord,
  FirstPartyVisualObservation,
} from './contracts';
import {
  ContentAssignmentSchema,
  ContentModelOutputSchema,
  ContentProposalSchema,
  ContentResponseSchema,
} from './contracts';
import { GovernanceError } from './errors';
import {
  approvedStarterForName,
  dedupeContentProposals,
  formatCachedObservations,
  proposalLimitForCreativeTask,
  relevantAssetsForObjective,
  sharedConceptId,
  starterRules,
} from './creative';
import { resolveAssignmentContext } from './assignmentContext';

import { isHarnessInfrastructureRequest } from './harnessRouting';

const CONTENT_OBJECTIVE_RE =
  /\b(new (?:chaos |base )?card|character (?:concept|card)|card (?:concept|effect|synerg|combination)|location reward|circuit reward|\bmods?\b|generated cards?|draft[- ]pool|game content|content specialist|\bimprove\b|propose .{0,40}location)\b/i;

const CONTENT_BLOCKED_RE =
  /\b(pure lore|world bible only|visual effect work|shader|animation aesthetics|implementation mismatch|backend architecture|current sdk|known rule interpretation)\b/i;

const RULE_CHANGE_RE =
  /\b(change|alter|modify|rewrite|replace)\b.{0,40}\b(runtime|wave collapse|draft structure|action rules|data center|victory condition|node control)\b/i;

export function shouldConsultContent(objective: string): boolean {
  if (isHarnessInfrastructureRequest(objective)) return false;
  if (CONTENT_BLOCKED_RE.test(objective)) return false;
  if (CONTENT_OBJECTIVE_RE.test(objective)) return true;
  if (/\b(location|circuit reward|chaos character|base card|vp card|crypto card)\b/i.test(objective) &&
    /\b(propos|concept|design|new|improv)\b/i.test(objective)) {
    return true;
  }
  return false;
}

export function contentCannotExecute(): boolean {
  return true;
}

export function contentCannotInvokeAgents(): boolean {
  return true;
}

export function contentCreatesWorkPackages(_response: ContentResponse): never[] {
  return [];
}

export function validateContentAssignment(
  value: unknown,
  budget: RunBudgetConfig,
): ContentAssignment {
  const assignment = ContentAssignmentSchema.parse({
    ...(value && typeof value === 'object' ? value : {}),
    role: 'content',
  });
  const objective = assignment.objective;
  const limited = {
    ...assignment,
    proposal_limit: proposalLimitForCreativeTask(objective, assignment.proposal_limit),
  };
  if (limited.proposal_limit > budget.max_content_proposals) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `Content assignment ${limited.assignment_id} proposal_limit exceeds MAX_CONTENT_PROPOSALS ${budget.max_content_proposals}.`,
    );
  }
  if (limited.proposal_limit > budget.max_proposals_per_assignment) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `Content assignment ${limited.assignment_id} proposal_limit exceeds configured maximum.`,
    );
  }
  return limited;
}

export function validateContentResponse(
  value: unknown,
  assignment: ContentAssignment,
  budget: RunBudgetConfig,
  index?: CanonicalIndex,
): ContentResponse {
  const response = parseContentOutput(value, assignment);
  const harnessConceptId =
    assignment.shared_concept_ids[0] || defaultSharedConcept(assignment.objective);
  const classified = dedupeContentProposals(response.content_proposals).map((proposal) =>
    annotateProposalMechanics({
      ...proposal,
      concept_id: harnessConceptId,
      rule_change_required:
        proposal.rule_change_required ||
        proposalRequiresRuleChange(
          `${proposal.proposed_effect} ${proposal.concept} ${proposal.strategic_purpose}`,
        ),
    }),
  );
  const omissions = [
    ...response.context_omissions,
    ...classified.flatMap((item) => (item.omission ? [item.omission] : [])),
  ];
  const proposals = classified.map((item) =>
    protectStarterProposal(rejectLoreAsRuleAuthority(item.proposal), assignment, index),
  );
  if (proposals.length > Math.min(assignment.proposal_limit, budget.max_content_proposals)) {
    throw new GovernanceError(
      'PROPOSAL_LIMIT',
      `Content returned ${proposals.length} proposals; limit is ${Math.min(assignment.proposal_limit, budget.max_content_proposals)}.`,
    );
  }
  return {
    ...response,
    agent: 'content',
    assignment_id: assignment.assignment_id,
    content_proposals: proposals,
    first_party_asset_ids: uniqueStrings([
      ...response.first_party_asset_ids,
      ...assignment.first_party_asset_ids,
    ]),
    context_omissions: omissions,
    rule_changes_required: proposals.some((item) => item.rule_change_required),
  };
}

export function contentConceptIdMismatches(
  value: unknown,
  harnessConceptId: string,
): string[] {
  const parsed = ContentModelOutputSchema.safeParse(value);
  const proposals = parsed.success
    ? parsed.data.content_proposals
    : ContentResponseSchema.safeParse(value).success
      ? ContentResponseSchema.parse(value).content_proposals
      : [];
  return uniqueStrings(
    proposals
      .map((proposal) => proposal.concept_id)
      .filter((id) => id.trim().length > 0 && id !== harnessConceptId),
  );
}

function parseContentOutput(value: unknown, assignment: ContentAssignment): ContentResponse {
  const model = ContentModelOutputSchema.safeParse(value);
  if (model.success) {
    return ContentResponseSchema.parse({
      agent: 'content',
      assignment_id: assignment.assignment_id,
      summary: model.data.summary,
      content_proposals: model.data.content_proposals.map((proposal) =>
        ContentProposalSchema.parse({
          ...proposal,
          concept_id: proposal.concept_id || assignment.shared_concept_ids[0] || 'concept-untitled',
          power: proposal.power ?? undefined,
          draft_cost: proposal.draft_cost ?? undefined,
        }),
      ),
      synergy_observations: model.data.synergy_observations,
      rules_touched: model.data.rules_touched,
      rule_changes_required: model.data.rule_changes_required,
      risks: model.data.risks,
      balance_questions: model.data.balance_questions,
      open_questions: model.data.open_questions,
      canonical_ids_referenced: model.data.canonical_ids_referenced,
      confidence: model.data.confidence,
    });
  }
  return ContentResponseSchema.parse(value);
}

export function protectStarterProposal(
  proposal: ContentProposal,
  assignment: ContentAssignment,
  index?: CanonicalIndex,
): ContentProposal {
  if (!index) return proposal;
  const starter = approvedStarterForName(index, proposal.name);
  if (!starter) return proposal;
  const contradicts =
    Boolean(proposal.proposed_effect) &&
    !starter.text.toLowerCase().includes(proposal.proposed_effect.toLowerCase().slice(0, 24));
  if (!proposal.rule_change_required && contradicts && assignment.objective.toLowerCase().includes(proposal.name.toLowerCase())) {
    return {
      ...proposal,
      rule_change_required: true,
      risks: [
        ...proposal.risks,
        `${proposal.name} has approved starter mechanics in ${starter.id}. This proposal cannot silently overwrite it.`,
      ],
    };
  }
  if (!proposal.rule_change_required) {
    return {
      ...proposal,
      risks: [
        ...proposal.risks,
        `${starter.id} remains authoritative for ${proposal.name}.`,
      ],
    };
  }
  return proposal;
}

export function annotateProposalMechanics(proposal: ContentProposal): {
  proposal: ContentProposal;
  omission: ContentResponse['context_omissions'][number] | null;
} {
  const mechanics_used =
    proposal.mechanics_used.length > 0
      ? proposal.mechanics_used
      : classifyProposedEffect(proposal.proposed_effect);
  const classified = classifyProposedEffect(proposal.proposed_effect);
  const usages = classified.length > 0 ? classified : mechanics_used;
  const structuralChange = proposalRequiresRuleChange(
    `${proposal.proposed_effect} ${proposal.concept} ${proposal.strategic_purpose}`,
  );
  const requiresNewMechanic = mechanicStatusRequiresRuleChange(usages) || structuralChange;
  const falseRuleChange =
    proposal.rule_change_required &&
    !requiresNewMechanic &&
    usages.some(
      (item) =>
        item.status === 'APPROVED_PRIMITIVE' ||
        item.status === 'NEW_COMBINATION' ||
        item.status === 'BALANCE_VARIANT',
    );
  const rawOmission = falseRuleChange ? contentContextOmissionForApprovedPrimitive(usages) : null;
  const omission = rawOmission
    ? {
        kind: 'CONTEXT_OMISSION' as const,
        summary: rawOmission.summary,
        evidence: rawOmission.evidence,
        canonical_ids: rawOmission.canonical_ids,
        required_action: rawOmission.required_action,
      }
    : null;
  return {
    proposal: {
      ...proposal,
      mechanics_used: usages,
      existing_rules_used: uniqueStrings([
        ...proposal.existing_rules_used,
        ...usages.flatMap((item) => item.canonical_ids),
      ]),
      rule_change_required: requiresNewMechanic,
      risks: uniqueStrings([
        ...proposal.risks,
        ...(falseRuleChange
          ? [
              'CONTEXT_OMISSION: approved mechanic primitives were treated as a new subsystem. Packet repair, not a Mel redesign.',
            ]
          : []),
      ]),
    },
    omission,
  };
}

export function proposalRequiresRuleChange(text: string): boolean {
  return RULE_CHANGE_RE.test(text);
}

export function contentCannotTreatLoreAsRuleAuthority(): boolean {
  return true;
}

export function proposalTreatsLoreAsRules(text: string): boolean {
  return (
    /\b(lore|world bible|obsidian|faction)\b.{0,80}\b(authoriz(?:es|ed)?|creates? (?:a )?new (?:subsystem|mechanic|rule)|new probability subsystem)\b/i.test(
      text,
    ) ||
    /\bnew (?:subsystem|mechanic|rule)\b.{0,80}\b(lore|world bible|obsidian)\b/i.test(text)
  );
}

export function rejectLoreAsRuleAuthority(proposal: ContentProposal): ContentProposal {
  const text = `${proposal.concept} ${proposal.proposed_effect} ${proposal.thematic_rationale}`;
  if (!proposalTreatsLoreAsRules(text)) return proposal;
  return {
    ...proposal,
    rule_change_required: true,
    risks: [
      ...proposal.risks,
      'Obsidian lore cannot authorize new gameplay mechanics. Use existing approved rules only.',
    ],
  };
}

export function assembleContentPacket(input: {
  objective: string;
  index: CanonicalIndex;
  assets: FirstPartyAssetRecord[];
  observations?: FirstPartyVisualObservation[];
  shared_concept_ids?: string[];
  liveAssetIds?: string[];
}): {
  canonical_ids: string[];
  excerpt_text: string;
  established_names: string[];
  starter_ids: string[];
  first_party_asset_ids: string[];
  observation_text: string;
  shared_concept_ids: string[];
  mechanics_packet_text: string;
  asset_roles: Array<{ asset_id: string; selection_role: FirstPartyAssetRecord['selection_role'] }>;
  constraints: string[];
} {
  const gameplay = resolveAssignmentContext(input.objective, input.index);
  const starters = starterRules(input.index);
  const namedAssets = relevantAssetsForObjective(input.objective, input.assets, {
    liveAssetIds: input.liveAssetIds,
  });
  const mechanics = assembleApprovedMechanicsPacket(input.index);
  const theme = retrieveCanonical(input.index, {
    ids: ['WORLD-CORE-001', 'WORLD-CORE-002', 'WORLD-CORE-003', 'LOOKDEV-COLLAPSE-003'],
  });
  const characterTask = /\b(character|chaos|base card|card concept)\b/i.test(input.objective);
  const actionGainIds = characterTask
    ? ['RULE-ACTION-004', 'RULE-ACTION-001', 'RULE-STARTER-002', 'RULE-STARTER-003', 'RULE-STARTER-004', 'RULE-STARTER-005']
    : [];
  const relevantStarters = starters.filter((item) => {
    if (actionGainIds.includes(item.id)) return true;
    if (namedAssets.some((asset) => item.text.includes(asset.associated_card_or_character))) {
      return true;
    }
    return /\brezz-razor\b/i.test(input.objective) && item.id === 'RULE-STARTER-004';
  });
  const ids = uniqueStrings([
    ...gameplay.canonical_ids.slice(0, 8),
    ...relevantStarters.map((item) => item.id),
    ...actionGainIds,
    ...mechanics.canonical_ids.slice(0, 16),
    ...theme.map((item) => item.id),
  ]).slice(0, 28);
  const excerpts = retrieveCanonical(input.index, { ids });
  const shared = uniqueStrings(input.shared_concept_ids ?? []);
  return {
    canonical_ids: ids,
    excerpt_text: formatCanonicalExcerpts(excerpts),
    established_names: uniqueStrings(namedAssets.map((item) => item.associated_card_or_character)),
    starter_ids: uniqueStrings([...relevantStarters.map((item) => item.id), ...actionGainIds]),
    first_party_asset_ids: namedAssets.map((item) => item.asset_id),
    observation_text: formatCachedObservations(
      (input.observations ?? []).filter((item) =>
        namedAssets.some((asset) => asset.asset_id === item.asset_id),
      ),
      namedAssets,
    ),
    shared_concept_ids: shared.length > 0 ? shared.slice(0, 1) : [defaultSharedConcept(input.objective)],
    mechanics_packet_text: formatApprovedMechanicsPacket(mechanics),
    asset_roles: namedAssets.map((item) => ({
      asset_id: item.asset_id,
      selection_role: item.selection_role,
    })),
    constraints: [
      'Use existing approved mechanics only unless rule_change_required is true.',
      'Gain 1 Action / +1 Action is an APPROVED_PRIMITIVE (RULE-ACTION-004, starter Characters). It is not a new mechanic.',
      'A new arrangement of approved primitives is NEW_COMBINATION, not a rule change.',
      'A different Power, Draft cost, or Drain amount is BALANCE_VARIANT.',
      'Representative first-party art is established visual language, not the new character.',
      'Do not silently overwrite RULE-STARTER-* definitions.',
      'First-party visual observations are inspiration, not mechanics.',
      'Obsidian lore cannot authorize new mechanics or subsystems.',
      'Do not dump the full asset library.',
    ],
  };
}

export function formatContentPacket(packet: ReturnType<typeof assembleContentPacket>): string {
  return [
    'Content packet. Propose game content inside approved mechanics.',
    `Shared concept IDs: ${packet.shared_concept_ids.join(', ') || '(assign one per new concept)'}`,
    `Established names (do not overwrite): ${packet.established_names.join(', ') || '(none named)'}`,
    `Starter rule IDs: ${packet.starter_ids.join(', ') || '(none)'}`,
    `First-party assets: ${packet.asset_roles.map((item) => `${item.asset_id}=${item.selection_role}`).join(', ') || '(none)'}`,
    'Constraints:',
    packet.constraints.join('\n'),
    packet.mechanics_packet_text,
    'Canonical excerpts:',
    packet.excerpt_text,
    'Cached visual observations (not lore):',
    packet.observation_text,
  ].join('\n');
}

export function defaultSharedConcept(objective: string): string {
  if (/\bchaos character\b/i.test(objective)) return sharedConceptId('chaos-character');
  return sharedConceptId(objective.slice(0, 40));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
