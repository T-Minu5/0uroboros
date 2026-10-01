import { z } from 'zod';

import { CANONICAL_VERSION } from './config';

export const AdvisoryRoleSchema = z.enum([
  'product',
  'ux',
  'engineering',
  'systems',
  'research',
  'lookdev',
  'content',
  'worldbuilding',
  'reviewer',
]);
export type AdvisoryRole = z.infer<typeof AdvisoryRoleSchema>;

export const ProposalClassificationSchema = z.enum([
  'OBSERVATION',
  'RECOMMENDATION',
  'PROPOSED_ADDITION',
  'POTENTIAL_RULE_CONFLICT',
  'IMPLEMENTATION_DECISION',
  'CONTRACT_REQUEST',
  'PROVISIONAL_MOCK',
]);

export const ProposalAuthoritySchema = z.enum([
  'RULES',
  'TECH',
  'UX',
  'LOOKDEV',
  'CONTENT',
  'WORLD',
  'RESEARCH',
  'GOVERNANCE',
]);

export const ProposalStatusSchema = z.enum([
  'DRAFT',
  'NEEDS_REVIEW',
  'NEEDS_APPROVAL',
  'APPROVED',
  'REJECTED',
  'HOLD_FOR_PLAYTEST',
  'IMPLEMENTABLE',
]);

export const QueueTargetSchema = z.enum([
  'CANDIDATE',
  'REVIEW',
  'CONTRACT_REQUEST',
  'CONFLICT',
  'IMPLEMENTATION',
  'APPROVAL',
  'EXECUTION_RESULT',
]);

export const StaleCheckStatusSchema = z.enum(['CURRENT', 'NEEDS_CHECK', 'REVALIDATED']);

export const AuthorityLevelSchema = z.enum([
  'ADVISORY',
  'IMPLEMENTATION',
  'CANONICAL_MUTATION',
  'DESTRUCTIVE',
]);
export type AuthorityLevel = z.infer<typeof AuthorityLevelSchema>;

const nonEmptyString = z.string().min(1);

export const WorkOrderSchema = z.object({
  id: nonEmptyString,
  objective: nonEmptyString,
  context: z.string(),
  constraints: z.array(z.string()),
  acceptance_criteria: z.array(z.string()),
  requested_expertise: z.array(AdvisoryRoleSchema),
  out_of_scope: z.array(z.string()),
  canonical_version: nonEmptyString,
});
export type WorkOrder = z.infer<typeof WorkOrderSchema>;

export const SpecialistAssignmentSchema = z.object({
  assignment_id: nonEmptyString,
  work_order_id: nonEmptyString,
  role: AdvisoryRoleSchema,
  objective: nonEmptyString,
  canonical_context_ids: z.array(z.string()),
  context_excerpt_refs: z.array(z.string()),
  questions: z.array(z.string()),
  constraints: z.array(z.string()),
  expected_output: z.array(z.string()),
  proposal_limit: z.number().int().min(0).max(5),
  authority_boundary: nonEmptyString,
});
export type SpecialistAssignment = z.infer<typeof SpecialistAssignmentSchema>;

export const RecommendationSchema = z.object({
  title: nonEmptyString,
  rationale: nonEmptyString,
  priority: z.enum(['low', 'medium', 'high']),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const SpecialistResponseSchema = z.object({
  agent: AdvisoryRoleSchema,
  assignment_id: nonEmptyString,
  summary: nonEmptyString,
  findings: z.array(z.string()),
  recommendations: z.array(RecommendationSchema).max(5),
  risks: z.array(z.string()),
  assumptions: z.array(z.string()),
  dependencies: z.array(z.string()),
  open_questions: z.array(z.string()),
  canonical_ids_referenced: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
export type SpecialistResponse = z.infer<typeof SpecialistResponseSchema>;

export const SystemsFindingKindSchema = z.enum([
  'CANONICAL_MATCH',
  'IMPLEMENTATION_MISMATCH',
  'RULE_AMBIGUITY',
  'CONTEXT_OMISSION',
  'PRESENTATION_DECISION',
  'CONTRACT_GAP',
  'STALE_SOURCE',
  'CANONICAL_COMPLETENESS_GAP',
]);
export type SystemsFindingKind = z.infer<typeof SystemsFindingKindSchema>;

export const EvidenceTypeSchema = z.enum([
  'REPOSITORY_OBSERVATION',
  'CANONICAL_RECORD',
  'MODEL_CLAIM',
  'EXTERNAL_RESEARCH',
  'FIRST_PARTY_VISUAL_ASSET',
  'FIRST_PARTY_WORLD_KNOWLEDGE',
]);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export const EvidenceAuthoritySchema = z.enum([
  'HARNESS_VERIFIED_EVIDENCE',
  'FIRST_PARTY_WORLD_KNOWLEDGE',
  'FIRST_PARTY_VISUAL_ASSET',
  'USER_CURATED_REFERENCE_GUIDANCE',
  'EXTERNAL_RESEARCH_EVIDENCE',
  'MODEL_CLAIM',
]);
export type EvidenceAuthority = z.infer<typeof EvidenceAuthoritySchema>;

export const VisualReferenceKindSchema = z.enum([
  'VISUAL_QUALITY_BENCHMARK',
  'MOTION_THEATRICS_REFERENCE',
  'INTERACTION_REFERENCE',
  'TECHNIQUE_REFERENCE',
  'MATERIAL_SHADER_REFERENCE',
  'CARD_RENDERING_REFERENCE',
  'GAMEPLAY_PRESENTATION_REFERENCE',
  'THEMING_REFERENCE',
  'INSPIRATION_ONLY',
]);
export type VisualReferenceKind = z.infer<typeof VisualReferenceKindSchema>;

export const TheatricsTierSchema = z.enum(['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4']);
export type TheatricsTier = z.infer<typeof TheatricsTierSchema>;

export const UsageConstraintSchema = z.enum([
  'STUDY_PRINCIPLES_AND_TECHNIQUES',
  'DO_NOT_RECREATE_EXACT_ANIMATION_SEQUENCES',
  'DO_NOT_REPRODUCE_ANOTHER_GAME_VISUAL_IDENTITY',
  'DO_NOT_COPY_CARD_ART',
  'DO_NOT_COPY_EXACT_LAYOUTS',
  'DO_NOT_REUSE_PROPRIETARY_UI_EXPRESSION',
  'DO_NOT_LIFT_CODE_BLINDLY',
  'REMAIN_NATIVE_TO_CYBERPUNK_QUANTUM_OCCULT',
  'GAMEPLAY_READABILITY_OVERRIDES_SPECTACLE',
  'EFFECTS_SCALE_WITH_GAMEPLAY_IMPACT',
  'SMALL_EFFECTS_REMAIN_SMALL',
  'MAJOR_EVENTS_MAY_BE_CINEMATIC',
  'CARD_LOCATION_RESOLUTION_COMMUNICATES_CAUSE_TARGET_MAGNITUDE_OUTCOME',
  'WAVE_COLLAPSE_STRONGEST_CINEMATIC',
  'TECHNIQUE_REFERENCES_ARE_INSPIRATION_NOT_COPY_TARGETS',
  'SINGULARITY_LIQUID_WAVE_IS_PROMISING_NOT_LOCKED',
  'QUALITY_BENCHMARK_NOT_TEMPLATE',
]);
export type UsageConstraint = z.infer<typeof UsageConstraintSchema>;

export const RetrievalStatusSchema = z.enum([
  'NOT_RETRIEVED',
  'OK',
  'BLOCKED',
  'VISUAL_ONLY',
  'METADATA_ONLY',
  'FAILED',
]);
export type RetrievalStatus = z.infer<typeof RetrievalStatusSchema>;

export const GuidanceProvenanceSchema = z.enum([
  'USER_CURATED_REFERENCE_GUIDANCE',
  'RESOURCE_LIBRARY_NOTE',
  'SECTION_SEMANTICS',
]);
export type GuidanceProvenance = z.infer<typeof GuidanceProvenanceSchema>;

export const VisualVsTechniqueSchema = z.enum([
  'VISUAL_REFERENCE',
  'TECHNIQUE_REFERENCE',
  'VISUAL_AND_TECHNIQUE',
]);
export type VisualVsTechnique = z.infer<typeof VisualVsTechniqueSchema>;

export const ResearchSourceTypeSchema = z.enum([
  'OFFICIAL_DOCUMENTATION',
  'PRIMARY_SOURCE',
  'ACADEMIC',
  'INDUSTRY_PUBLICATION',
  'REVIEW',
  'COMMUNITY_DISCUSSION',
  'CODE_REPOSITORY',
  'DEMO',
  'VIDEO',
  'REFERENCE_GAME',
  'OTHER',
]);
export type ResearchSourceType = z.infer<typeof ResearchSourceTypeSchema>;

export const ResearchSourceQualitySchema = z.enum([
  'PRIMARY_HIGH',
  'SECONDARY_HIGH',
  'SECONDARY_MEDIUM',
  'COMMUNITY_SIGNAL',
  'INSPIRATION_ONLY',
]);
export type ResearchSourceQuality = z.infer<typeof ResearchSourceQualitySchema>;

export const ResearchSourceModeSchema = z.enum(['CURATED', 'LIVE', 'MIXED']);
export type ResearchSourceMode = z.infer<typeof ResearchSourceModeSchema>;

export const ResearchObservationKindSchema = z.enum([
  'INTERPRETATION',
  'EXTERNAL_SYSTEM_FACT',
  'EXTERNAL_EVIDENCE_CHALLENGE',
  'COMPARISON',
  'INSPIRATION',
]);
export type ResearchObservationKind = z.infer<typeof ResearchObservationKindSchema>;

export const EvidenceRecordSchema = z.object({
  evidence_type: EvidenceTypeSchema,
  source: nonEmptyString,
  source_location: nonEmptyString,
  verified_by: z.enum(['HARNESS', 'SPECIALIST', 'ASTRA']),
  observed_value: nonEmptyString,
  canonical_ids: z.array(z.string()),
  authority: EvidenceAuthoritySchema,
});
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

export const ExternalEvidenceRecordSchema = z.object({
  evidence_id: nonEmptyString,
  evidence_type: z.literal('EXTERNAL_RESEARCH'),
  authority: z.literal('EXTERNAL_RESEARCH_EVIDENCE'),
  source_type: ResearchSourceTypeSchema,
  title: z.string(),
  url: z.string(),
  publisher_or_author: z.string(),
  retrieved_at: z.string(),
  published_at: z.string(),
  summary: nonEmptyString,
  claims: z.array(z.string()),
  relevance: z.string(),
  limitations: z.array(z.string()),
  canonical_ids_related: z.array(z.string()),
  reference_tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  source_quality: ResearchSourceQualitySchema,
  research_run_id: z.string(),
  visual_reference_kinds: z.array(VisualReferenceKindSchema).default([]),
  theatrics_tiers: z.array(TheatricsTierSchema).default([]),
  usage_constraints: z.array(UsageConstraintSchema).default([]),
  user_guidance: z.array(z.string()).default([]),
  retrieval_status: RetrievalStatusSchema.optional(),
  visual_inspected: z.boolean().default(false),
  visual_vs_technique: VisualVsTechniqueSchema.optional(),
});
export type ExternalEvidenceRecord = z.infer<typeof ExternalEvidenceRecordSchema>;

export const CuratedResourceRecordSchema = z.object({
  resource_id: nonEmptyString,
  url: nonEmptyString,
  title: z.string().optional(),
  tags: z.array(z.string()),
  user_guidance: z.array(z.string()).default([]),
  reference_types: z.array(VisualReferenceKindSchema).default([]),
  theatrics_tiers: z.array(TheatricsTierSchema).default([]),
  source_mode: ResearchSourceModeSchema.default('CURATED'),
  usage_constraints: z.array(UsageConstraintSchema).default([]),
  retrieval_status: RetrievalStatusSchema.default('NOT_RETRIEVED'),
  retrieved_content_ref: z.string().optional(),
  last_retrieved_at: z.string().optional(),
  notes: z.string().default(''),
  category: z.string().default('General'),
  categories: z.array(z.string()).default([]),
  visual_vs_technique: VisualVsTechniqueSchema.optional(),
  expected_retrievability: z
    .enum(['TEXT', 'GITHUB', 'VISUAL_DEMO', 'VIDEO', 'AMBIGUOUS'])
    .optional(),
});
export type CuratedResourceRecord = z.infer<typeof CuratedResourceRecordSchema>;

export const RetrievedContentSchema = z.object({
  url: nonEmptyString,
  resource_id: z.string().optional(),
  status_code: z.number().int(),
  content_type: z.string().default(''),
  retrieval_status: RetrievalStatusSchema,
  title: z.string().default(''),
  extracted_text: z.string().default(''),
  headings: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.string()).default({}),
  companion_files: z
    .array(
      z.object({
        path: z.string(),
        extracted_text: z.string(),
      }),
    )
    .default([]),
  visual_inspected: z.boolean().default(false),
  visual_behavior_claims: z.array(z.string()).default([]),
  transcript_available: z.boolean().default(false),
  visual_inspection_seam: z
    .object({
      supported: z.boolean(),
      reason: z.string(),
    })
    .default({
      supported: false,
      reason: 'No visual-inspection tool is wired. Text extraction cannot see animation.',
    }),
  user_guidance: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
});
export type RetrievedContent = z.infer<typeof RetrievedContentSchema>;

export const DesignTokenTypeSchema = z.enum(['COLOR', 'TYPE', 'CONSTRAINT']);
export type DesignTokenType = z.infer<typeof DesignTokenTypeSchema>;

export const DesignTokenSchema = z.object({
  token_id: nonEmptyString,
  token_type: DesignTokenTypeSchema,
  name: nonEmptyString,
  value: nonEmptyString,
  usage: z.string().default(''),
  constraints: z.string().default(''),
  canonical_id: z.string(),
});
export type DesignToken = z.infer<typeof DesignTokenSchema>;

export const VisualReferencePacketSchema = z.object({
  objective: nonEmptyString,
  canonical_ids: z.array(z.string()).max(16),
  resource_ids: z.array(z.string()).max(8),
  user_guidance: z
    .array(
      z.object({
        resource_id: z.string(),
        text: z.string(),
        provenance: GuidanceProvenanceSchema,
      }),
    )
    .max(12),
  reference_classifications: z.array(VisualReferenceKindSchema),
  extracted_excerpts: z
    .array(
      z.object({
        resource_id: z.string(),
        url: z.string(),
        retrieval_status: RetrievalStatusSchema,
        text: z.string(),
      }),
    )
    .max(8),
  approved_palette: z.array(z.string()).max(12),
  approved_typography: z.array(z.string()).max(6),
  theatrics_tier_target: z.array(TheatricsTierSchema).max(4),
  gameplay_event: z.string().default(''),
  usage_constraints: z.array(UsageConstraintSchema),
  unanswered_visual_questions: z.array(z.string()).max(8),
  visual_vs_technique: z.array(VisualVsTechniqueSchema).default([]),
  first_party_asset_ids: z.array(z.string()).max(12).default([]),
  associated_card_or_character: z.array(z.string()).max(8).default([]),
  relevant_icon_ids: z.array(z.string()).max(8).default([]),
  stats_ui_asset_ids: z.array(z.string()).max(4).default([]),
  resolved_tokens: z.array(DesignTokenSchema).max(24).default([]),
  gameplay_canonical_ids: z.array(z.string()).max(28).default([]),
  contract_fields: z.array(z.string()).max(12).default([]),
});
export type VisualReferencePacket = z.infer<typeof VisualReferencePacketSchema>;

export const FirstPartyAssetTypeSchema = z.enum([
  'CARD_ART',
  'CHARACTER_ART',
  'ICON',
  'UI_REFERENCE',
  'STATS_UI_REFERENCE',
  'BACKGROUND',
  'TEXTURE',
  'LOGO',
  'OTHER',
]);
export type FirstPartyAssetType = z.infer<typeof FirstPartyAssetTypeSchema>;

export const AssetInspectionStatusSchema = z.enum([
  'NOT_INSPECTED',
  'INSPECTED_VECTOR',
  'INSPECTED_RASTER',
  'METADATA_ONLY',
  'UNSUPPORTED',
  'FAILED',
]);
export type AssetInspectionStatus = z.infer<typeof AssetInspectionStatusSchema>;

export const FirstPartyAssetRecordSchema = z.object({
  asset_id: nonEmptyString,
  relative_path: nonEmptyString,
  file_name: nonEmptyString,
  extension: z.string(),
  asset_type: FirstPartyAssetTypeSchema,
  category: z.string().default(''),
  associated_card_or_character: z.string().default(''),
  associated_game_system: z.string().default(''),
  dimensions: z
    .object({
      width: z.number().nullable(),
      height: z.number().nullable(),
    })
    .default({ width: null, height: null }),
  file_size: z.number().int().nonnegative(),
  first_party: z.literal(true),
  notes: z.string().default(''),
  inspection_status: AssetInspectionStatusSchema.default('NOT_INSPECTED'),
  observed_colors: z.array(z.string()).default([]),
  visual_observations: z.array(z.string()).default([]),
  identity_locked: z.boolean().default(false),
  ux_requirement: z.boolean().default(false),
  authority: z.literal('FIRST_PARTY_VISUAL_ASSET').default('FIRST_PARTY_VISUAL_ASSET'),
  semantic_confidence: z.enum(['CERTAIN', 'UNCERTAIN', 'UNKNOWN']).default('UNKNOWN'),
  selection_role: z
    .enum(['IDENTITY_SPECIFIC', 'REPRESENTATIVE_REFERENCE', 'SYSTEM_ICON', 'UI_REFERENCE', 'UNSET'])
    .default('UNSET'),
});
export type FirstPartyAssetRecord = z.infer<typeof FirstPartyAssetRecordSchema>;

export const FirstPartyVisualObservationSchema = z.object({
  asset_id: nonEmptyString,
  inspection_status: AssetInspectionStatusSchema,
  subject: z.string().default(''),
  visible_motifs: z.array(z.string()).default([]),
  silhouette_notes: z.string().default(''),
  materials: z.array(z.string()).default([]),
  lighting: z.string().default(''),
  palette_observations: z.array(z.string()).default([]),
  cyberpunk_signals: z.array(z.string()).default([]),
  quantum_signals: z.array(z.string()).default([]),
  occult_signals: z.array(z.string()).default([]),
  subgenre_signals: z.array(z.string()).default([]),
  recurring_symbols: z.array(z.string()).default([]),
  presentation_opportunities: z.array(z.string()).default([]),
  uncertainties: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0),
  inspection_model: z.string().default(''),
  schema_version: z.string().default('visual-observation-v1'),
  asset_hash: z.string().default(''),
  authority: z.literal('FIRST_PARTY_VISUAL_ASSET').default('FIRST_PARTY_VISUAL_ASSET'),
  not_lore: z.literal(true).default(true),
});
export type FirstPartyVisualObservation = z.infer<typeof FirstPartyVisualObservationSchema>;

export const LookDevRecommendationKindSchema = z.enum([
  'PRIMARY',
  'ALTERNATIVE',
  'TECHNIQUE_RECOMMENDATION',
  'VISUAL_DIRECTION',
]);
export type LookDevRecommendationKind = z.infer<typeof LookDevRecommendationKindSchema>;

export const PresentationEventMappingSchema = z.object({
  game_event: nonEmptyString,
  presentation_event: nonEmptyString,
  theatrics_tier: TheatricsTierSchema,
  notes: z.string().default(''),
});
export type PresentationEventMapping = z.infer<typeof PresentationEventMappingSchema>;

export const LookDevAssignmentSchema = SpecialistAssignmentSchema.extend({
  role: z.literal('lookdev'),
  theatrics_tier_target: z.array(TheatricsTierSchema).default([]),
  gameplay_event: z.string().default(''),
  allow_alternatives: z.boolean().default(false),
});
export type LookDevAssignment = z.infer<typeof LookDevAssignmentSchema>;

export const LookDevResponseSchema = z.object({
  agent: z.literal('lookdev'),
  assignment_id: nonEmptyString,
  summary: nonEmptyString,
  asset_observations: z
    .array(
      z.object({
        asset_id: z.string(),
        observation: z.string(),
        inspection_status: AssetInspectionStatusSchema,
      }),
    )
    .max(8)
    .default([]),
  visual_findings: z.array(z.string()).max(5).default([]),
  presentation_event_mappings: z.array(PresentationEventMappingSchema).max(8).default([]),
  recommendations: z
    .array(
      z.object({
        title: nonEmptyString,
        rationale: nonEmptyString,
        priority: z.enum(['low', 'medium', 'high']),
        kind: LookDevRecommendationKindSchema,
        first_party_asset_ids: z.array(z.string()).default([]),
        reference_evidence_ids: z.array(z.string()).default([]),
      }),
    )
    .max(5)
    .default([]),
  reference_evidence_ids: z.array(z.string()).default([]),
  first_party_asset_ids: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  technical_questions: z.array(z.string()).default([]),
  ux_questions: z.array(z.string()).default([]),
  open_questions: z.array(z.string()).default([]),
  canonical_ids_referenced: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});
export type LookDevResponse = z.infer<typeof LookDevResponseSchema>;

export const ContentTypeSchema = z.enum([
  'CHARACTER',
  'BASE',
  'CHAOS',
  'VP',
  'CRYPTO',
  'LOCATION',
  'CIRCUIT_REWARD',
  'MOD',
  'GENERATED',
  'EFFECT_TEXT',
]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const MechanicStatusSchema = z.enum([
  'APPROVED_PRIMITIVE',
  'NEW_COMBINATION',
  'BALANCE_VARIANT',
  'RULE_CHANGE_REQUIRED',
  'UNRESOLVED',
]);
export type MechanicStatus = z.infer<typeof MechanicStatusSchema>;

export const MechanicUsageSchema = z.object({
  mechanic: nonEmptyString,
  canonical_ids: z.array(z.string()).default([]),
  status: MechanicStatusSchema,
});
export type MechanicUsage = z.infer<typeof MechanicUsageSchema>;

export const ContentProposalSchema = z.object({
  concept_id: nonEmptyString,
  content_type: ContentTypeSchema,
  name: nonEmptyString,
  concept: nonEmptyString,
  proposed_effect: nonEmptyString,
  strategic_purpose: nonEmptyString,
  gameplay_role: z.string().default(''),
  existing_rules_used: z.array(z.string()).default([]),
  mechanics_used: z.array(MechanicUsageSchema).default([]),
  power: z.number().optional(),
  draft_cost: z.number().optional(),
  rule_change_required: z.boolean(),
  thematic_rationale: z.string().default(''),
  related_first_party_evidence: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});
export type ContentProposal = z.infer<typeof ContentProposalSchema>;

export const ContentModelMechanicUsageSchema = z.object({
  mechanic: nonEmptyString,
  canonical_ids: z.array(z.string()).default([]),
  status: MechanicStatusSchema.default('UNRESOLVED'),
});

export const ContentModelProposalSchema = z.object({
  concept_id: z.string().default(''),
  content_type: ContentTypeSchema.default('CHARACTER'),
  name: nonEmptyString,
  concept: nonEmptyString,
  proposed_effect: nonEmptyString,
  strategic_purpose: nonEmptyString,
  gameplay_role: z.string().default(''),
  existing_rules_used: z.array(z.string()).default([]),
  mechanics_used: z.array(ContentModelMechanicUsageSchema).default([]),
  power: z.number().nullable().default(null),
  draft_cost: z.number().nullable().default(null),
  rule_change_required: z.boolean().default(false),
  thematic_rationale: z.string().default(''),
  related_first_party_evidence: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
});

/** Lean SDK output. Harness stamps assignment_id, concept_id, and provenance. */
export const ContentModelOutputSchema = z.object({
  summary: nonEmptyString,
  content_proposals: z.array(ContentModelProposalSchema).max(5).default([]),
  synergy_observations: z.array(z.string()).default([]),
  rules_touched: z.array(z.string()).default([]),
  rule_changes_required: z.boolean().default(false),
  risks: z.array(z.string()).default([]),
  balance_questions: z.array(z.string()).default([]),
  open_questions: z.array(z.string()).default([]),
  canonical_ids_referenced: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type ContentModelOutput = z.infer<typeof ContentModelOutputSchema>;

export const ContentAssignmentSchema = SpecialistAssignmentSchema.extend({
  role: z.literal('content'),
  shared_concept_ids: z.array(z.string()).default([]),
  first_party_asset_ids: z.array(z.string()).default([]),
});
export type ContentAssignment = z.infer<typeof ContentAssignmentSchema>;

export const ContentResponseSchema = z.object({
  agent: z.literal('content'),
  assignment_id: nonEmptyString,
  summary: nonEmptyString,
  content_proposals: z.array(ContentProposalSchema).max(5).default([]),
  synergy_observations: z.array(z.string()).default([]),
  rules_touched: z.array(z.string()).default([]),
  rule_changes_required: z.boolean().default(false),
  first_party_asset_ids: z.array(z.string()).default([]),
  research_evidence_ids: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  balance_questions: z.array(z.string()).default([]),
  open_questions: z.array(z.string()).default([]),
  canonical_ids_referenced: z.array(z.string()).default([]),
  context_omissions: z
    .array(
      z.object({
        kind: z.literal('CONTEXT_OMISSION'),
        summary: nonEmptyString,
        evidence: z.array(z.string()).default([]),
        canonical_ids: z.array(z.string()).default([]),
        required_action: nonEmptyString,
      }),
    )
    .default([]),
  confidence: z.number().min(0).max(1),
});
export type ContentResponse = z.infer<typeof ContentResponseSchema>;

export const WorldEvidenceKindSchema = z.enum([
  'ESTABLISHED_FACT',
  'FIRST_PARTY_WORLD_KNOWLEDGE',
  'ESTABLISHED_WORLD_LORE',
  'FIRST_PARTY_WORLD_DRAFT',
  'FIRST_PARTY_VISUAL_OBSERVATION',
  'VISUAL_INFERENCE',
  'EXTERNAL_EVIDENCE',
  'PROPOSED_LORE',
  'PROPOSED_CHARACTER_LORE',
  'PROPOSED_WORLD_EXTENSION',
  'WORLD_PROPOSAL',
  'WORLD_EVIDENCE_TENSION',
]);
export type WorldEvidenceKind = z.infer<typeof WorldEvidenceKindSchema>;

export const CurrentVaultProfileSchema = z.object({
  world_story_lore: z.boolean().default(true),
  plotline: z.boolean().default(true),
  setting_lore: z.boolean().default(true),
  gameplay_rules: z.boolean().default(false),
  character_specific_canon: z.boolean().default(false),
});
export type CurrentVaultProfile = z.infer<typeof CurrentVaultProfileSchema>;

export const WorldNoteStatusSchema = z.enum([
  'ESTABLISHED_LORE',
  'APPROVED_WORLD_FACT',
  'DRAFT_LORE',
  'WORLD_PROPOSAL',
  'REFERENCE_NOTE',
  'DEPRECATED',
  'UNKNOWN_STATUS',
]);
export type WorldNoteStatus = z.infer<typeof WorldNoteStatusSchema>;

export const WorldKnowledgeExcerptSchema = z.object({
  note_path: nonEmptyString,
  title: z.string().default(''),
  status: WorldNoteStatusSchema,
  text: nonEmptyString,
});
export type WorldKnowledgeExcerpt = z.infer<typeof WorldKnowledgeExcerptSchema>;

export const WorldKnowledgeNoteSchema = z.object({
  path: nonEmptyString,
  title: nonEmptyString,
  status: WorldNoteStatusSchema,
  status_reason: z.string().default(''),
  evidence_kind: WorldEvidenceKindSchema,
  tags: z.array(z.string()).default([]),
  properties: z.record(z.string(), z.string()).default({}),
  linked_concepts: z.array(z.string()).default([]),
  excerpts: z.array(WorldKnowledgeExcerptSchema).max(4).default([]),
});
export type WorldKnowledgeNote = z.infer<typeof WorldKnowledgeNoteSchema>;

export const WorldEvidenceTensionSchema = z.object({
  kind: z.literal('WORLD_EVIDENCE_TENSION'),
  summary: nonEmptyString,
  vault_note_path: nonEmptyString,
  asset_id: z.string().default(''),
  lore_excerpt: z.string().default(''),
  visual_excerpt: z.string().default(''),
});
export type WorldEvidenceTension = z.infer<typeof WorldEvidenceTensionSchema>;

export const WorldKnowledgePacketSchema = z.object({
  objective: nonEmptyString,
  searched: z.boolean(),
  vault_reachable: z.boolean(),
  vault_name: z.string().default(''),
  canonical_world_ids: z.array(z.string()).max(16).default([]),
  notes: z.array(WorldKnowledgeNoteSchema).max(8).default([]),
  excerpts: z.array(WorldKnowledgeExcerptSchema).max(12).default([]),
  linked_concepts: z.array(z.string()).max(12).default([]),
  card_or_character_names: z.array(z.string()).max(12).default([]),
  first_party_asset_ids: z.array(z.string()).max(8).default([]),
  visual_observations: z.array(FirstPartyVisualObservationSchema).max(4).default([]),
  user_guidance: z.array(z.string()).max(8).default([]),
  unresolved_questions: z.array(z.string()).max(8).default([]),
  evidence_tensions: z.array(WorldEvidenceTensionSchema).max(4).default([]),
  provenance: z.array(z.string()).max(8).default([]),
  search_outcome: z
    .enum(['NOT_SEARCHED', 'MATCHED', 'WORLD_KNOWLEDGE_NO_MATCH', 'UNAVAILABLE'])
    .default('NOT_SEARCHED'),
  queries_used: z.array(z.string()).max(8).default([]),
  vault_profile: CurrentVaultProfileSchema.default({
    world_story_lore: true,
    plotline: true,
    setting_lore: true,
    gameplay_rules: false,
    character_specific_canon: false,
  }),
});
export type WorldKnowledgePacket = z.infer<typeof WorldKnowledgePacketSchema>;

export const WorldProposalSchema = z.object({
  concept_id: nonEmptyString,
  title: nonEmptyString,
  statement: nonEmptyString,
  evidence_kind: WorldEvidenceKindSchema,
  related_names: z.array(z.string()).default([]),
  related_first_party_evidence: z.array(z.string()).default([]),
  challenges_established: z.array(z.string()).default([]),
});
export type WorldProposal = z.infer<typeof WorldProposalSchema>;

export const WorldRelationshipSchema = z.object({
  from: nonEmptyString,
  to: nonEmptyString,
  relation: nonEmptyString,
  evidence_kind: WorldEvidenceKindSchema.optional(),
});
export type WorldRelationship = z.infer<typeof WorldRelationshipSchema>;

export const WorldbuildingAssignmentSchema = SpecialistAssignmentSchema.extend({
  role: z.literal('worldbuilding'),
  shared_concept_ids: z.array(z.string()).default([]),
});
export type WorldbuildingAssignment = z.infer<typeof WorldbuildingAssignmentSchema>;

export const WorldbuildingResponseSchema = z.object({
  agent: z.literal('worldbuilding'),
  assignment_id: nonEmptyString,
  summary: nonEmptyString,
  established_facts_used: z.array(z.string()).default([]),
  visual_observations_used: z.array(z.string()).default([]),
  world_proposals: z.array(WorldProposalSchema).max(5).default([]),
  naming_proposals: z.array(z.string()).max(5).default([]),
  relationships: z.array(WorldRelationshipSchema).max(12).default([]),
  obsidian_links: z.array(WorldRelationshipSchema).max(12).default([]),
  risks: z.array(z.string()).default([]),
  canon_questions: z.array(z.string()).default([]),
  open_questions: z.array(z.string()).default([]),
  canonical_ids_referenced: z.array(z.string()).default([]),
  first_party_asset_ids: z.array(z.string()).default([]),
  research_evidence_ids: z.array(z.string()).default([]),
  vault_searched: z.boolean().default(false),
  vault_note_paths: z.array(z.string()).default([]),
  note_statuses: z
    .array(
      z.object({
        path: nonEmptyString,
        status: WorldNoteStatusSchema,
      }),
    )
    .default([]),
  evidence_tensions: z.array(WorldEvidenceTensionSchema).max(4).default([]),
  confidence: z.number().min(0).max(1),
});
export type WorldbuildingResponse = z.infer<typeof WorldbuildingResponseSchema>;

export const SpecialistFailureClassSchema = z.enum([
  'MODEL_OUTPUT_SCHEMA_FAILURE',
  'SPECIALIST_RUNTIME_FAILURE',
  'RESULT_PERSISTENCE_FAILURE',
  'HARNESS_VALIDATION_FAILURE',
  'BUDGET_FAILURE',
  'CONCEPT_ID_MISMATCH',
  'UNKNOWN_SPECIALIST_FAILURE',
]);
export type SpecialistFailureClass = z.infer<typeof SpecialistFailureClassSchema>;

export const SpecialistFailureRecordSchema = z.object({
  code: z.literal('SPECIALIST_FAILURE'),
  specialist: z.enum(['content', 'worldbuilding']),
  assignment_id: z.string(),
  concept_id: z.string(),
  model: z.string(),
  error_class: SpecialistFailureClassSchema,
  schema_name: z.string(),
  schema_version: z.string().default('1'),
  error_message: z.string(),
  validation_paths: z.array(z.string()).default([]),
  usage: z
    .object({
      requests: z.number().nullable(),
      input_tokens: z.number().nullable(),
      output_tokens: z.number().nullable(),
      total_tokens: z.number().nullable(),
    })
    .nullable()
    .default(null),
  model_output_redacted: z.boolean().default(false),
  fatal: z.boolean().default(true),
});
export type SpecialistFailureRecord = z.infer<typeof SpecialistFailureRecordSchema>;

export const CandidateStatusSchema = z.enum(['CANDIDATE', 'INCOMPLETE', 'REJECTED']);
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;

export const CandidateConceptEnvelopeSchema = z.object({
  concept_id: nonEmptyString,
  candidate_name: z.string().default(''),
  candidate_type: z.string().default('CHARACTER'),
  status: CandidateStatusSchema,
  content_contribution: ContentResponseSchema.nullable().default(null),
  worldbuilding_contribution: WorldbuildingResponseSchema.nullable().default(null),
  mechanics_used: z.array(MechanicUsageSchema).default([]),
  balance_values: z.object({
    power: z.number().nullable().default(null),
    draft_cost: z.number().nullable().default(null),
    effect: z.string().default(''),
    gameplay_role: z.string().default(''),
  }),
  first_party_visual_evidence: z.array(z.string()).default([]),
  world_knowledge_evidence: z.array(z.string()).default([]),
  canonical_ids: z.array(z.string()).default([]),
  alternative_names: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  open_questions: z.array(z.string()).default([]),
  unresolved_fields: z.array(z.string()).default([]),
  specialists_contributing: z.array(z.string()).default([]),
  specialist_failures: z.array(SpecialistFailureRecordSchema).default([]),
  approved: z.literal(false).default(false),
});
export type CandidateConceptEnvelope = z.infer<typeof CandidateConceptEnvelopeSchema>;

export const ResearchObservationSchema = z.object({
  statement: nonEmptyString,
  evidence_ids: z.array(z.string()),
  kind: ResearchObservationKindSchema,
});
export type ResearchObservation = z.infer<typeof ResearchObservationSchema>;

export const ResearchRecommendationSchema = z.object({
  title: nonEmptyString,
  rationale: nonEmptyString,
  priority: z.enum(['low', 'medium', 'high']),
  evidence_ids: z.array(z.string()),
});
export type ResearchRecommendation = z.infer<typeof ResearchRecommendationSchema>;

export const ResearchAssignmentSchema = SpecialistAssignmentSchema.extend({
  role: z.literal('research'),
  source_mode: ResearchSourceModeSchema,
  allowed_reference_tags: z.array(z.string()),
});
export type ResearchAssignment = z.infer<typeof ResearchAssignmentSchema>;

export const ResearchResponseSchema = z.object({
  agent: z.literal('research'),
  assignment_id: nonEmptyString,
  summary: nonEmptyString,
  evidence: z.array(ExternalEvidenceRecordSchema),
  observations: z.array(ResearchObservationSchema),
  recommendations: z.array(ResearchRecommendationSchema),
  risks: z.array(z.string()),
  limitations: z.array(z.string()),
  open_questions: z.array(z.string()),
  canonical_ids_referenced: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
export type ResearchResponse = z.infer<typeof ResearchResponseSchema>;

export const SystemsFindingSchema = z.object({
  kind: SystemsFindingKindSchema,
  summary: nonEmptyString,
  evidence: z.array(z.string()),
  evidence_records: z.array(EvidenceRecordSchema),
  canonical_ids: z.array(z.string()),
  required_action: nonEmptyString,
});
export type SystemsFinding = z.infer<typeof SystemsFindingSchema>;

export const SystemsFixtureSchema = z.object({
  name: nonEmptyString,
  setup: nonEmptyString,
  expected: nonEmptyString,
});
export type SystemsFixture = z.infer<typeof SystemsFixtureSchema>;

export const SystemsResponseSchema = z.object({
  agent: z.literal('systems'),
  assignment_id: nonEmptyString,
  summary: nonEmptyString,
  rule_findings: z.array(SystemsFindingSchema),
  implementation_mismatches: z.array(SystemsFindingSchema),
  presentation_distinctions: z.array(SystemsFindingSchema),
  ambiguities: z.array(SystemsFindingSchema),
  open_questions: z.array(z.string()),
  recommendations: z.array(RecommendationSchema).max(5),
  canonical_ids_referenced: z.array(z.string()),
  fixtures: z.array(SystemsFixtureSchema),
  risks: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
export type SystemsResponse = z.infer<typeof SystemsResponseSchema>;

export const ProposalEnvelopeSchema = z
  .object({
    id: nonEmptyString,
    canonical_version: nonEmptyString,
    created_at: nonEmptyString,
    agent: nonEmptyString,
    classification: ProposalClassificationSchema,
    authority: ProposalAuthoritySchema,
    status: ProposalStatusSchema,
    rules_changed: z.boolean(),
    requirements_touched: z.array(z.string()),
    contracts_required: z.array(z.string()),
    summary: nonEmptyString,
    rationale: nonEmptyString,
    risks: z.array(z.string()).min(1),
    provenance: z.array(z.string()),
    stale_check_status: StaleCheckStatusSchema,
    human_approval_required: z.boolean(),
    queue_target: QueueTargetSchema,
    authorized_by: z.array(z.string()).optional(),
    contract_request_id: z.string().optional(),
    runtime_run_id: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.classification === 'IMPLEMENTATION_DECISION' && !value.authorized_by?.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'IMPLEMENTATION_DECISION requires authorized_by IDs.',
        path: ['authorized_by'],
      });
    }
    if (value.rules_changed) {
      if (value.status !== 'NEEDS_APPROVAL') {
        ctx.addIssue({
          code: 'custom',
          message: 'rules_changed proposals must have status NEEDS_APPROVAL.',
          path: ['status'],
        });
      }
      if (!value.human_approval_required) {
        ctx.addIssue({
          code: 'custom',
          message: 'rules_changed proposals require human_approval_required.',
          path: ['human_approval_required'],
        });
      }
    }
    if (value.classification === 'PROVISIONAL_MOCK' && !value.contract_request_id) {
      ctx.addIssue({
        code: 'custom',
        message: 'PROVISIONAL_MOCK requires contract_request_id.',
        path: ['contract_request_id'],
      });
    }
  });
export type ProposalEnvelope = z.infer<typeof ProposalEnvelopeSchema>;

export const WorkPackageSchema = z.object({
  id: nonEmptyString,
  objective: nonEmptyString,
  owner_role: nonEmptyString,
  authorized_rule_ids: z.array(z.string()),
  authorized_tech_ids: z.array(z.string()),
  scope: z.array(z.string()),
  files_or_domains_allowed: z.array(z.string()),
  dependencies: z.array(z.string()),
  acceptance_criteria: z.array(z.string()).min(1),
  tests_required: z.array(z.string()),
  proposed_authority_level: AuthorityLevelSchema.optional(),
  authority_level: AuthorityLevelSchema,
  approval_required: z.boolean(),
  execution_tools_allowed: z.array(z.string()),
  canonical_version: nonEmptyString,
});
export type WorkPackage = z.infer<typeof WorkPackageSchema>;

export const ExecutionStatusSchema = z.enum([
  'SUCCESS',
  'VALIDATION_FAILED',
  'SCOPE_VIOLATION',
  'AUTHORIZATION_MISSING',
  'AUTHORIZATION_STALE',
  'WORKTREE_CONFLICT',
  'EXECUTOR_FAILURE',
  'INCOMPLETE',
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const ExecutionAuthorizationSchema = z.object({
  authorization_id: nonEmptyString,
  work_package_id: nonEmptyString,
  work_package_hash: nonEmptyString,
  authorized_by: nonEmptyString,
  authorized_at: nonEmptyString,
  operation: nonEmptyString,
  execution_authorized: z.literal(true),
  read_scope: z.array(z.string()).max(16),
  write_scope: z.array(z.string()).max(16),
  permitted_commands: z.array(z.string()).max(12),
  canonical_version: nonEmptyString,
  authorized_target_files: z.array(z.string()).max(16),
});
export type ExecutionAuthorization = z.infer<typeof ExecutionAuthorizationSchema>;

export const ExecutionPacketSchema = z.object({
  execution_id: nonEmptyString,
  work_package_id: nonEmptyString,
  objective: nonEmptyString,
  operation: nonEmptyString,
  canonical_ids: z.array(z.string()).max(16),
  canonical_excerpts: z.array(z.string()).max(8),
  harness_verified_evidence: z.array(z.string()).max(8),
  read_scope: z.array(z.string()).max(16),
  write_scope: z.array(z.string()).max(16),
  acceptance_criteria: z.array(z.string()).max(12),
  permitted_commands: z.array(z.string()).max(12),
  constraints: z.array(z.string()).max(16),
  authorization: ExecutionAuthorizationSchema,
});
export type ExecutionPacket = z.infer<typeof ExecutionPacketSchema>;

export const ExecutionCommandResultSchema = z.object({
  command: nonEmptyString,
  exit_code: z.number().int(),
  stdout: z.string().default(''),
  stderr: z.string().default(''),
  duration_ms: z.number().nullable().default(null),
  permitted: z.boolean(),
});
export type ExecutionCommandResult = z.infer<typeof ExecutionCommandResultSchema>;

export const ExecutionResultSchema = z.object({
  execution_id: nonEmptyString,
  work_package_id: nonEmptyString,
  authorization_id: z.string().default(''),
  status: ExecutionStatusSchema,
  files_read: z.array(z.string()).default([]),
  files_modified: z.array(z.string()).default([]),
  files_created: z.array(z.string()).default([]),
  files_deleted: z.array(z.string()).default([]),
  commands_run: z.array(ExecutionCommandResultSchema).default([]),
  validation_results: z.array(ExecutionCommandResultSchema).default([]),
  diff_summary: z.string().default(''),
  acceptance_criteria_results: z.array(z.string()).default([]),
  scope_violations: z.array(z.string()).default([]),
  unresolved_issues: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  execution_model: z.string().default(''),
  started_at: nonEmptyString,
  completed_at: nonEmptyString,
  claimed_files_modified: z.array(z.string()).default([]),
});
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

export const ExecutionModelOutputSchema = z.object({
  summary: nonEmptyString,
  claimed_files_modified: z.array(z.string()).default([]),
  unresolved_issues: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
});
export type ExecutionModelOutput = z.infer<typeof ExecutionModelOutputSchema>;

export const BudgetUsageSchema = z.object({
  max_turns: z.number().int(),
  max_total_agent_calls: z.number().int(),
  max_specialist_calls: z.number().int(),
  max_review_calls: z.number().int(),
  max_research_calls: z.number().int().default(1),
  max_research_sources: z.number().int().default(6),
  max_research_findings: z.number().int().default(5),
  max_research_proposals: z.number().int().default(5),
  max_lookdev_calls: z.number().int().default(1),
  max_lookdev_findings: z.number().int().default(5),
  max_lookdev_recommendations: z.number().int().default(5),
  max_lookdev_concepts: z.number().int().default(3),
  max_content_calls: z.number().int().default(1),
  max_content_proposals: z.number().int().default(5),
  max_worldbuilding_calls: z.number().int().default(1),
  max_worldbuilding_concepts: z.number().int().default(5),
  max_creative_concepts: z.number().int().default(5),
  max_conflict_rounds: z.number().int(),
  max_proposals_per_assignment: z.number().int(),
  retry_limit: z.number().int(),
  turns_used: z.number().int().min(0),
  total_agent_calls: z.number().int().min(0),
  specialist_calls: z.number().int().min(0),
  review_calls: z.number().int().min(0),
  research_calls: z.number().int().min(0).default(0),
  lookdev_calls: z.number().int().min(0).default(0),
  content_calls: z.number().int().min(0).default(0),
  worldbuilding_calls: z.number().int().min(0).default(0),
  max_execution_calls: z.number().int().default(1),
  execution_calls: z.number().int().min(0).default(0),
  conflict_rounds: z.number().int().min(0),
  retries: z.number().int().min(0),
  exhausted: z.string().nullable(),
});
export type BudgetUsage = z.infer<typeof BudgetUsageSchema>;

export const ConflictKindSchema = z.enum([
  'GENUINE_CANONICAL',
  'IMPLEMENTATION_MISMATCH',
  'MISSING_REQUIREMENT',
  'CROSS_FUNCTIONAL',
  'STALE_SOURCE',
  'FALSE_POSITIVE',
]);
export type ConflictKind = z.infer<typeof ConflictKindSchema>;

export const ConflictRecordSchema = z.object({
  id: nonEmptyString,
  summary: nonEmptyString,
  positions: z.array(z.string()),
  affected_ids: z.array(z.string()),
  recommended_default: z.string(),
  escalated: z.boolean(),
  kind: ConflictKindSchema.optional(),
});
export type ConflictRecord = z.infer<typeof ConflictRecordSchema>;

export const ContractRequestDispositionSchema = z.enum([
  'GENUINELY_MISSING',
  'ALREADY_IN_CONTRACT',
  'DERIVED_PRESENTATION',
  'CLIENT_SIDE',
  'NEEDS_SYSTEMS',
]);
export type ContractRequestDisposition = z.infer<typeof ContractRequestDispositionSchema>;

export const ContractRequestSchema = z.object({
  id: nonEmptyString,
  summary: nonEmptyString,
  missing_state: z.array(z.string()),
  linked_provisional_mock_id: z.string().nullable(),
  disposition: ContractRequestDispositionSchema.optional(),
  mapped_fields: z.array(z.string()).optional(),
});
export type ContractRequest = z.infer<typeof ContractRequestSchema>;

export const PlanningItemKindSchema = z.enum([
  'OPEN_QUESTION',
  'DEPENDENCY',
  'HUMAN_DESIGN_DECISION',
  'AUTHORITY_APPROVAL',
  'REVISION_REQUIRED',
]);
export type PlanningItemKind = z.infer<typeof PlanningItemKindSchema>;

export const HumanGateKindSchema = z.enum([
  'OPEN_QUESTION',
  'DEPENDENCY',
  'HUMAN_DESIGN_DECISION',
  'AUTHORITY_APPROVAL',
  'STANDING_REMINDER',
]);
export type HumanGateKind = z.infer<typeof HumanGateKindSchema>;

export const PlanningItemSchema = z.object({
  id: nonEmptyString,
  reason: nonEmptyString,
  source: z.enum([
    'work_package',
    'proposal',
    'conflict',
    'human_gate',
    'specialist',
    'systems',
    'contract_request',
  ]),
  kind: PlanningItemKindSchema,
});
export type PlanningItem = z.infer<typeof PlanningItemSchema>;

export const OrchestrationResultSchema = z.object({
  objective: nonEmptyString,
  summary: nonEmptyString,
  decisions: z.array(z.string()),
  specialists_consulted: z.array(z.string()),
  work_packages: z.array(WorkPackageSchema),
  candidate_proposals: z.array(ProposalEnvelopeSchema),
  contract_requests: z.array(ContractRequestSchema),
  conflicts: z.array(ConflictRecordSchema),
  review_requests: z.array(z.string()),
  risks: z.array(z.string()),
  human_approvals_required: z.array(z.string()),
  open_questions: z.array(PlanningItemSchema).default([]),
  dependencies: z.array(PlanningItemSchema).default([]),
  human_design_decisions: z.array(PlanningItemSchema).default([]),
  specialist_role_ids: z.array(AdvisoryRoleSchema).default([]),
  systems_findings: z.array(SystemsFindingSchema).default([]),
  verified_evidence: z.array(EvidenceRecordSchema).default([]),
  research_evidence: z.array(ExternalEvidenceRecordSchema).default([]),
  research_observations: z.array(ResearchObservationSchema).default([]),
  lookdev_results: z.array(LookDevResponseSchema).default([]),
  content_results: z.array(ContentResponseSchema).default([]),
  worldbuilding_results: z.array(WorldbuildingResponseSchema).default([]),
  candidate_envelopes: z.array(CandidateConceptEnvelopeSchema).default([]),
  specialist_failures: z.array(SpecialistFailureRecordSchema).default([]),
  first_party_asset_ids: z.array(z.string()).default([]),
  canonical_completeness_gaps: z.array(SystemsFindingSchema).default([]),
  context_omissions: z.array(SystemsFindingSchema).default([]),
  review_triggers: z.array(z.string()).default([]),
  review_verdict: z
    .enum(['PASS', 'PASS_WITH_NOTES', 'REVISE', 'ESCALATE'])
    .nullable()
    .default(null),
  canonical_version: nonEmptyString,
  budget_usage: BudgetUsageSchema,
});
export type OrchestrationResult = z.infer<typeof OrchestrationResultSchema>;

/**
 * Model-owned Astra synthesis. No run IDs, timestamps, queues, usage, or
 * freshness bookkeeping. Those fields are added by the harness.
 * All fields are required so the SDK JSON Schema stays strict and optional-free.
 */
export const AstraWorkPackageIntentSchema = z.object({
  objective: nonEmptyString,
  owner_role: nonEmptyString,
  scope: z.array(z.string()),
  acceptance_criteria: z.array(z.string()),
  tests_required: z.array(z.string()),
  authorized_rule_ids: z.array(z.string()),
  authorized_tech_ids: z.array(z.string()),
  dependencies: z.array(z.string()),
  approval_required: z.boolean(),
});

export const AstraCandidateNoteSchema = z.object({
  title: nonEmptyString,
  rationale: nonEmptyString,
  classification: z.enum([
    'OBSERVATION',
    'RECOMMENDATION',
    'PROPOSED_ADDITION',
    'POTENTIAL_RULE_CONFLICT',
    'IMPLEMENTATION_DECISION',
    'CONTRACT_REQUEST',
    'PROVISIONAL_MOCK',
  ]),
  canonical_ids: z.array(z.string()),
  approval_required: z.boolean(),
  selected: z.boolean().default(false),
});

export const AstraContractIntentSchema = z.object({
  summary: nonEmptyString,
  missing_state: z.array(z.string()),
});

export const AstraConflictIntentSchema = z.object({
  summary: nonEmptyString,
  positions: z.array(z.string()),
  affected_ids: z.array(z.string()),
  recommended_default: nonEmptyString,
});

export const AstraSynthesisSchema = z.object({
  summary: nonEmptyString,
  decisions: z.array(z.string()),
  specialists_consulted: z.array(z.string()),
  work_package_intents: z.array(AstraWorkPackageIntentSchema),
  candidate_notes: z.array(AstraCandidateNoteSchema),
  contract_requests: z.array(AstraContractIntentSchema),
  conflicts: z.array(AstraConflictIntentSchema),
  review_requests: z.array(z.string()),
  risks: z.array(z.string()),
  human_approvals_required: z.array(z.string()),
  selected_candidate_name: z.string().default(''),
  alternative_working_names: z.array(z.string()).default([]),
  shared_concept_id: z.string().default(''),
});
export type AstraSynthesis = z.infer<typeof AstraSynthesisSchema>;

/** @deprecated Use AstraSynthesis. Kept only as a name alias for older call sites. */
export const AstraPlanSchema = AstraSynthesisSchema;
export type AstraPlan = AstraSynthesis;

export const RunQueuesSchema = z.object({
  candidate: z.array(ProposalEnvelopeSchema),
  review: z.array(z.string()),
  contract_request: z.array(ContractRequestSchema),
  conflict: z.array(ConflictRecordSchema),
  implementation: z.array(WorkPackageSchema),
  approval: z.array(
    z.object({
      id: nonEmptyString,
      reason: nonEmptyString,
      source: z.enum(['work_package', 'proposal', 'conflict', 'human_gate']),
    }),
  ),
  open_question: z.array(PlanningItemSchema).default([]),
  dependency: z.array(PlanningItemSchema).default([]),
  human_design_decision: z.array(PlanningItemSchema).default([]),
  execution_result: z.array(z.unknown()),
});
export type RunQueues = z.infer<typeof RunQueuesSchema>;

export const ReviewTriggerSchema = z.enum([
  'IMPLEMENTATION_CANDIDATE',
  'CANONICAL_MUTATION',
  'AUTHORITY_EXPANSION',
  'VERIFIED_EVIDENCE_DISAGREEMENT',
  'GENUINE_CANONICAL_CONFLICT',
  'HIGH_IMPACT_ARCHITECTURE',
  'EXPLICIT_USER_REQUEST',
]);
export type ReviewTrigger = z.infer<typeof ReviewTriggerSchema>;

export const ReviewVerdictSchema = z.enum([
  'PASS',
  'PASS_WITH_NOTES',
  'REVISE',
  'ESCALATE',
]);
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;

export const ReviewFindingKindSchema = z.enum([
  'UNSUPPORTED_CLAIM',
  'CANONICAL_CONFLICT',
  'IMPLEMENTATION_MISMATCH',
  'AUTHORITY_VIOLATION',
  'EVIDENCE_CONFLICT',
  'MISSING_ACCEPTANCE_CRITERIA',
  'SCOPE_MISMATCH',
  'TECHNICAL_RISK',
  'PRODUCT_RISK',
  'GOVERNANCE_RISK',
  'EXTERNAL_EVIDENCE_CHALLENGE',
  'NO_MATERIAL_ISSUE',
]);
export type ReviewFindingKind = z.infer<typeof ReviewFindingKindSchema>;

export const ReviewFindingSchema = z.object({
  kind: ReviewFindingKindSchema,
  summary: nonEmptyString,
  evidence: z.array(z.string()),
});
export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;

export const ReviewerResponseSchema = z.object({
  review_id: nonEmptyString,
  verdict: ReviewVerdictSchema,
  summary: nonEmptyString,
  findings: z.array(ReviewFindingSchema),
  required_revisions: z.array(z.string()),
  risks: z.array(z.string()),
  canonical_ids_referenced: z.array(z.string()),
  evidence_ids_referenced: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});
export type ReviewerResponse = z.infer<typeof ReviewerResponseSchema>;

export const ReviewPacketSchema = z.object({
  review_id: nonEmptyString,
  triggers: z.array(ReviewTriggerSchema),
  objective: nonEmptyString,
  artifact_kind: z.enum(['orchestration_result', 'work_package', 'proposal']),
  artifact_ids: z.array(z.string()),
  astra_summary: nonEmptyString,
  relevant_work_packages: z.array(WorkPackageSchema),
  relevant_canonical_ids: z.array(z.string()),
  canonical_excerpts: z.array(
    z.object({
      id: nonEmptyString,
      text: nonEmptyString,
    }),
  ),
  systems_findings: z.array(SystemsFindingSchema),
  verified_evidence: z.array(EvidenceRecordSchema),
  research_evidence: z.array(ExternalEvidenceRecordSchema).default([]),
  risks: z.array(z.string()),
  conflicts: z.array(ConflictRecordSchema),
  authority_level: AuthorityLevelSchema,
  canonical_version: nonEmptyString,
});
export type ReviewPacket = z.infer<typeof ReviewPacketSchema>;

export function defaultCanonicalVersion(): string {
  return CANONICAL_VERSION;
}
