import type { CanonicalIndex } from './context';
import { retrieveCanonical } from './context';
import {
  VisualReferencePacketSchema,
  type CuratedResourceRecord,
  type ExternalEvidenceRecord,
  type RetrievedContent,
  type TheatricsTier,
  type UsageConstraint,
  type VisualReferenceKind,
  type VisualReferencePacket,
  type VisualVsTechnique,
} from './contracts';
import { DEFAULT_USAGE_CONSTRAINTS } from './resourceGuidance';
import { queryResourceLibrary } from './resourceLibrary';

export const MAX_VISUAL_PACKET_RESOURCES = 6;
export const MAX_PACKET_EXCERPT_CHARS = 1200;
export const MAX_PACKET_TOTAL_EXCERPT_CHARS = 4000;

export const LOOKDEV_ALLOWED = [
  'propose visual language',
  'propose motion',
  'propose shader/effect techniques',
  'propose phase/reveal/Collapse presentation',
  'map authoritative Game Events to Presentation Events',
  'use approved visual references',
  'create visual specifications',
] as const;

export const LOOKDEV_FORBIDDEN = [
  'determine gameplay outcome',
  'invent Game Contract state',
  'create card mechanics',
  'change rules',
  'treat reference-game behavior as 0uroboros behavior',
  'modify first-party assets',
  'modify production code during advisory planning',
  'copy exact visual expression',
] as const;

export const VISUAL_AUTHORITY_LADDER = [
  'canonical design / LookDev requirements',
  'first-party 0uroboros visual assets and Mel-authored project guidance',
  'harness-verified project implementation evidence',
  'user-curated reference guidance',
  'external visual/reference evidence',
  'model claim',
] as const;

export function visualReferenceCannotBecomeCanonical(): boolean {
  return true;
}

export function lookDevAgentIsInstantiated(): boolean {
  return true;
}

export interface VisualPacketInput {
  objective: string;
  resources: CuratedResourceRecord[];
  retrievals?: RetrievedContent[];
  research_evidence?: ExternalEvidenceRecord[];
  canonical?: CanonicalIndex;
  canonical_ids?: string[];
  theatrics_tier_target?: TheatricsTier[];
  gameplay_event?: string;
  unanswered_visual_questions?: string[];
}

export function assembleVisualReferencePacket(input: VisualPacketInput): VisualReferencePacket {
  const relevant = queryResourceLibrary(input.resources, {
    query: input.objective,
    maxResults: MAX_VISUAL_PACKET_RESOURCES,
  });
  const retrievalByUrl = new Map((input.retrievals ?? []).map((item) => [item.url, item]));
  const excerpts = boundExcerpts(relevant, retrievalByUrl);
  const guidance = relevant.flatMap((resource) =>
    resource.user_guidance.map((text) => ({
      resource_id: resource.resource_id,
      text,
      provenance: 'USER_CURATED_REFERENCE_GUIDANCE' as const,
    })),
  );
  const classifications = uniqueKinds(relevant.flatMap((item) => item.reference_types));
  const constraints = uniqueConstraints([
    ...DEFAULT_USAGE_CONSTRAINTS,
    ...relevant.flatMap((item) => item.usage_constraints),
  ]);
  const canonicalIds = selectCanonicalIds(input);
  const palette = canonicalIds.filter((id) => id.startsWith('DESIGN-COLOR'));
  const typography = canonicalIds.filter((id) => id.startsWith('DESIGN-TYPE'));
  const questions = [
    ...(input.unanswered_visual_questions ?? []),
    ...excerpts
      .filter((item) => item.retrieval_status === 'VISUAL_ONLY' || item.retrieval_status === 'METADATA_ONLY')
      .map((item) => `No visual inspection of ${item.url}. Do not invent motion or look.`),
  ].slice(0, 8);

  return VisualReferencePacketSchema.parse({
    objective: input.objective,
    canonical_ids: canonicalIds.slice(0, 16),
    resource_ids: relevant.map((item) => item.resource_id).slice(0, 8),
    user_guidance: guidance.slice(0, 12),
    reference_classifications: classifications,
    extracted_excerpts: excerpts,
    approved_palette: palette.length > 0 ? palette : ['DESIGN-COLOR-001'],
    approved_typography: typography.length > 0 ? typography : ['DESIGN-TYPE-001', 'DESIGN-TYPE-002'],
    theatrics_tier_target: input.theatrics_tier_target ?? inferTierTarget(relevant, input.gameplay_event),
    gameplay_event: input.gameplay_event ?? '',
    usage_constraints: constraints,
    unanswered_visual_questions: questions,
    visual_vs_technique: uniqueVisualKinds(relevant),
  });
}

export function researchToLookDevHandoff(input: {
  research_evidence: ExternalEvidenceRecord[];
  resources: CuratedResourceRecord[];
  retrievals?: RetrievedContent[];
  objective: string;
  canonical?: CanonicalIndex;
  gameplay_event?: string;
  theatrics_tier_target?: TheatricsTier[];
}): {
  path: ['research', 'astra', 'visual_reference_packet', 'lookdev'];
  packet: VisualReferencePacket;
  research_instructs_lookdev: false;
} {
  const relevantEvidence = input.research_evidence.filter((item) =>
    input.resources.some((resource) => resource.url === item.url),
  );
  const urls = new Set(relevantEvidence.map((item) => item.url));
  const resources =
    urls.size === 0
      ? input.resources
      : input.resources.filter((item) => urls.has(item.url));
  return {
    path: ['research', 'astra', 'visual_reference_packet', 'lookdev'],
    packet: assembleVisualReferencePacket({
      objective: input.objective,
      resources,
      retrievals: input.retrievals,
      research_evidence: relevantEvidence,
      canonical: input.canonical,
      gameplay_event: input.gameplay_event,
      theatrics_tier_target: input.theatrics_tier_target,
    }),
    research_instructs_lookdev: false,
  };
}

function boundExcerpts(
  resources: CuratedResourceRecord[],
  retrievals: Map<string, RetrievedContent>,
): VisualReferencePacket['extracted_excerpts'] {
  let remaining = MAX_PACKET_TOTAL_EXCERPT_CHARS;
  const excerpts: VisualReferencePacket['extracted_excerpts'] = [];
  for (const resource of resources) {
    const retrieved = retrievals.get(resource.url);
    const raw = retrieved?.extracted_text ?? '';
    const take = Math.min(MAX_PACKET_EXCERPT_CHARS, remaining, raw.length);
    const text = raw.slice(0, take);
    remaining -= text.length;
    excerpts.push({
      resource_id: resource.resource_id,
      url: resource.url,
      retrieval_status: retrieved?.retrieval_status ?? resource.retrieval_status,
      text,
    });
    if (remaining <= 0) break;
  }
  return excerpts.slice(0, 8);
}

function selectCanonicalIds(input: VisualPacketInput): string[] {
  if (input.canonical_ids?.length) return uniqueStrings(input.canonical_ids);
  const ids = [
    'LOOKDEV-FX-001',
    'LOOKDEV-FX-002',
    'LOOKDEV-FX-004',
    'LOOKDEV-EFFECT-001',
    'LOOKDEV-COLLAPSE-001',
    'LOOKDEV-COLLAPSE-002',
    'LOOKDEV-COLLAPSE-003',
    'UX-A11Y-002',
    'DESIGN-TYPE-001',
    'DESIGN-TYPE-002',
    'DESIGN-COLOR-001',
  ];
  if (!input.canonical) return ids;
  return retrieveCanonical(input.canonical, { ids })
    .map((item) => item.id)
    .slice(0, 16);
}

function inferTierTarget(resources: CuratedResourceRecord[], event?: string): TheatricsTier[] {
  if (/wave collapse|collapse/i.test(event ?? '')) return ['TIER_4'];
  const fromResources = uniqueStrings(resources.flatMap((item) => item.theatrics_tiers)) as TheatricsTier[];
  return fromResources.slice(0, 4);
}

function uniqueKinds(values: VisualReferenceKind[]): VisualReferenceKind[] {
  return uniqueStrings(values) as VisualReferenceKind[];
}

function uniqueConstraints(values: UsageConstraint[]): UsageConstraint[] {
  return uniqueStrings(values) as UsageConstraint[];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueVisualKinds(resources: CuratedResourceRecord[]): VisualVsTechnique[] {
  return uniqueStrings(
    resources
      .map((item) => item.visual_vs_technique)
      .filter((item): item is VisualVsTechnique => Boolean(item)),
  ) as VisualVsTechnique[];
}
