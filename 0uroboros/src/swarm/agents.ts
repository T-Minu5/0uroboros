import { Agent, tool, webSearchTool, type Tool } from '@openai/agents';
import { z } from 'zod';

import type { SwarmConfig, SwarmModels } from './config';
import { resolveModelForTask } from './config';
import {
  AstraSynthesisSchema,
  LookDevAssignmentSchema,
  LookDevResponseSchema,
  ContentAssignmentSchema,
  ContentModelOutputSchema,
  WorldbuildingAssignmentSchema,
  WorldbuildingResponseSchema,
  ResearchAssignmentSchema,
  ResearchResponseSchema,
  ReviewerResponseSchema,
  SpecialistAssignmentSchema,
  SpecialistResponseSchema,
  SystemsResponseSchema,
  type LookDevAssignment,
  type LookDevResponse,
  type ContentAssignment,
  type ContentResponse,
  type WorldbuildingAssignment,
  type WorldbuildingResponse,
  type ResearchAssignment,
  type ResearchResponse,
  type SpecialistAssignment,
  type SpecialistFailureRecord,
  type SystemsResponse,
  type WorldKnowledgePacket,
} from './contracts';
import { formatCanonicalExcerpts, retrieveCanonical, type CanonicalIndex } from './context';
import { mergeAssignmentContextIds, resolveAssignmentContext } from './assignmentContext';
import type { BudgetTracker } from './budget';
import {
  FORBIDDEN_PLANNING_TOOLS,
  validateLookDevAssignment,
  validateLookDevResponse,
  validateContentAssignment,
  validateContentResponse,
  validateWorldbuildingAssignment,
  validateWorldbuildingResponse,
  validateResearchAssignment,
  validateResearchResponse,
  validateSpecialistAssignment,
  validateSpecialistResponse,
  validateSystemsResponse,
} from './governance';
import {
  collectHarnessVerifiedEvidence,
  formatVerifiedEvidence,
} from './evidence';
import {
  assertApprovedResearchUrl,
  formatResourceLibraryForAssignment,
  shouldConsultResearch,
} from './research';
import {
  githubRawReadmeUrl,
  ingestCuratedSource,
  isGitHubRepoUrl,
} from './ingestion';
import {
  inventoryFirstPartyAssets,
  inspectFirstPartyAsset,
  queryFirstPartyAssets,
} from './assets';
import {
  AUTHORITATIVE_GAME_EVENTS,
  assembleLookDevPacket,
  formatLookDevPacket,
  shouldConsultLookDev,
} from './lookdev';
import {
  assembleContentPacket,
  contentConceptIdMismatches,
  formatContentPacket,
  shouldConsultContent,
  defaultSharedConcept,
} from './content';
import {
  assembleWorldbuildingPacket,
  formatWorldbuildingPacket,
  shouldConsultWorldbuilding,
  worldbuildingConceptIdMismatches,
} from './worldbuilding';
import { inspectFirstPartyVisuals, liveCachedAssetIds } from './visualInspection';
import { relevantAssetsForObjective } from './creative';
import { shouldEnableSystemsTool } from './systems';
import { shouldConsultLead } from './leadRouting';
import { findResourceByUrl, loadResourceLibrary, queryResourceLibrary } from './resourceLibrary';
import { retrieveWorldKnowledgePacket } from './worldKnowledge';
import {
  buildSpecialistFailure,
  CONTENT_SCHEMA_NAME,
  persistSpecialistFailure,
  specialistFailureToolPayload,
  WORLDBUILDING_SCHEMA_NAME,
} from './specialistFailure';
import type { ArtifactStore } from './artifacts';

export const SPECIALIST_TOOL_NAMES = {
  product: 'productLead',
  ux: 'uxLead',
  engineering: 'leadEngineer',
  systems: 'systemsRules',
  research: 'competitiveResearch',
  lookdev: 'lookDevMotion',
  content: 'contentDesign',
  worldbuilding: 'worldbuilding',
} as const;

export interface PlanningRuntimeContext {
  budget: BudgetTracker;
  canonical: CanonicalIndex;
  objective?: string;
  specialistResults: ReturnType<typeof SpecialistResponseSchema.parse>[];
  systemsResults: SystemsResponse[];
  researchResults: ResearchResponse[];
  lookdevResults: LookDevResponse[];
  contentResults: ContentResponse[];
  worldbuildingResults: WorldbuildingResponse[];
  assignments: SpecialistAssignment[];
  researchAssignments: ResearchAssignment[];
  lookdevAssignments: LookDevAssignment[];
  contentAssignments: ContentAssignment[];
  worldbuildingAssignments: WorldbuildingAssignment[];
  worldKnowledgePacket?: WorldKnowledgePacket;
  researchSourceMode: ResearchAssignment['source_mode'] | null;
  reviewerInvoked: boolean;
  sharedConceptId?: string;
  specialistFailures?: SpecialistFailureRecord[];
  artifactStore?: ArtifactStore;
  runId?: string;
  specialistModel?: string;
}

function specialistInstructions(role: 'product' | 'ux' | 'engineering'): string {
  const shared = [
    'You are an advisory specialist in the 0uroboros Swarm v2.0 planning runtime.',
    'Return only the structured SpecialistResponse schema.',
    'Cite existing canonical IDs. Never invent RULE, TECH, UX, or CONTRACT IDs.',
    'Do not approve rules. Do not mutate files. Do not spawn agents or call tools.',
    'Separate facts from assumptions. Stay inside the assignment authority_boundary.',
    'Keep recommendations at or below the assignment proposal_limit.',
  ];

  if (role === 'product') {
    return [
      'You are Product Lead. Default model class is Terra.',
      ...shared,
      'Focus on player need, scope, MVP vs later, sequencing, acceptance criteria, risks, and dependencies.',
      'You have no mechanic-approval authority.',
    ].join('\n');
  }

  if (role === 'ux') {
    return [
      'You are UX Lead. Default model class is Terra.',
      ...shared,
      'Focus on interaction, hierarchy, comprehension, accessibility, player feedback, and flows.',
      'If a required authoritative Game Contract fact is missing, emit a CONTRACT_REQUEST in findings or recommendation titles.',
      'Authoritative facts belong in the Game Contract. Presentation-ready derivatives do not.',
      'Do not request formatted strings, labels, loading chrome, or values already listed as cycle, Runtime turn, Actions, Action carryover, VP, Data Center current/max/destroyed, Node P1/P2 Power, Node/Runtime priority, view class, or event sequence.',
      'HUD nicknames such as Node Power or reveal priority are Systems interpretation questions, not automatic new contract fields.',
      'You may mention a PROVISIONAL_MOCK only if it is linked to a CONTRACT_REQUEST.',
      'Never invent canonical gameplay state.',
    ].join('\n');
  }

  return [
    'You are Lead Engineering. Default model class is Sol.',
    ...shared,
    'Focus on architecture, Game Contract implications, server/client boundaries, testing, concurrency, and decomposition.',
    'TECH-INT-001 covers internal implementation choices with zero new gameplay semantics.',
    'If asked to invent an unstated rule, surface an open question or conflict. Do not invent the rule.',
  ].join('\n');
}

export function createProductLead(models: SwarmModels) {
  return new Agent({
    name: 'Product Lead',
    model: resolveModelForTask(models, 'specialist'),
    instructions: specialistInstructions('product'),
    tools: [],
    handoffs: [],
    outputType: SpecialistResponseSchema,
  });
}

export function createUxLead(models: SwarmModels) {
  return new Agent({
    name: 'UX Lead',
    model: resolveModelForTask(models, 'specialist'),
    instructions: specialistInstructions('ux'),
    tools: [],
    handoffs: [],
    outputType: SpecialistResponseSchema,
  });
}

export function createLeadEngineering(models: SwarmModels) {
  return new Agent({
    name: 'Lead Engineering',
    model: resolveModelForTask(models, 'engineering'),
    instructions: specialistInstructions('engineering'),
    tools: [],
    handoffs: [],
    outputType: SpecialistResponseSchema,
  });
}

export function createSystemsRules(models: SwarmModels) {
  return new Agent({
    name: 'Systems / Rules',
    model: resolveModelForTask(models, 'specialist'),
    instructions: [
      'You are Systems / Rules. Default model class is Terra. Use Sol only if the assignment explicitly asks for a difficult review.',
      'You interpret approved 0uroboros gameplay semantics. You do not create rules.',
      'Return only the structured SystemsResponse schema. Use empty arrays when a list has nothing to report.',
      'Classify each finding as CANONICAL_MATCH, IMPLEMENTATION_MISMATCH, RULE_AMBIGUITY, CONTEXT_OMISSION, PRESENTATION_DECISION, CONTRACT_GAP, STALE_SOURCE, or CANONICAL_COMPLETENESS_GAP.',
      'CANONICAL_COMPLETENESS_GAP means approved source material exists but structured canonical records omitted it. Do not ask Mel to redesign a recoverable decision.',
      'CONTEXT_OMISSION means the authoritative answer exists in canonical knowledge but this assignment did not receive it. That is a harness/packet issue, not a Mel redesign.',
      'RULE_AMBIGUITY is only for questions the approved design has not answered.',
      'Attach supplied HARNESS_VERIFIED_EVIDENCE records on IMPLEMENTATION_MISMATCH findings. Do not invent repository provenance.',
      'Canonical current IDs win over implementation and over superseded historical IDs such as HIST-DECK-4-4-2.',
      'RULE-DECK-001 is 5 Character, 3 Crypto, 2 VP. A 4/4/2 STARTING_DECK is an IMPLEMENTATION_MISMATCH, not ambiguity.',
      'Do not treat HUD nicknames such as Node Power or reveal priority as CONTRACT_GAP when Node P1/P2 Power and Runtime/Node priority already exist.',
      'Formatted values such as 1,450 / 2,000 are PRESENTATION_DECISION, not contract fields.',
      'CONTRACT_GAP only when approved rules require authoritative state the Game Contract does not expose.',
      'If canonical material does not determine an answer, return RULE_AMBIGUITY and require a human game-design decision. Do not invent an ordering or rule.',
      'Cite existing canonical IDs only. Never invent RULE, TECH, UX, or CONTRACT IDs.',
      'Do not approve rules, mutate files, spawn agents, or call tools.',
      'Keep recommendations at or below the assignment proposal_limit. Findings are not proposals.',
    ].join('\n'),
    tools: [],
    handoffs: [],
    outputType: SystemsResponseSchema,
  });
}

export function createResearch(models: SwarmModels, runtime?: PlanningRuntimeContext) {
  const retrievalTools = createResearchRetrievalTools(runtime);
  return new Agent({
    name: 'Competitive Research',
    model: resolveModelForTask(models, 'specialist'),
    instructions: [
      'You are Competitive Research. Default model class is Terra.',
      'Return only the structured ResearchResponse schema. Use empty arrays and empty strings when a value is unknown. Do not invent metadata.',
      'Distinguish evidence (what a source supports), observations (your interpretation), and recommendations (optional 0uroboros ideas).',
      'Most work ends at evidence plus observations. Do not emit WorkPackages, queues, or canonical mutations.',
      'EXTERNAL_RESEARCH_EVIDENCE has zero canonical authority. It cannot override RULE, TECH, CONTRACT, UX, or DESIGN requirements.',
      'If external evidence disagrees with a current rule, classify the observation as EXTERNAL_EVIDENCE_CHALLENGE. That is not a CANONICAL_CONFLICT.',
      'Official current technical documentation may establish EXTERNAL_SYSTEM_FACT about an external API or library. That is not 0uroboros project authority.',
      'Prefer curated Resource Library references when they match the assignment. Use web_search only for LIVE or MIXED source_mode.',
      'Source quality informs synthesis. It does not grant rule authority. Reddit is COMMUNITY_SIGNAL. Visual inspiration is INSPIRATION_ONLY.',
      'Cite existing canonical IDs only. Never invent RULE, TECH, UX, or CONTRACT IDs.',
      'You may not modify files, approve proposals, invoke Astra, specialists, or Reviewer, or treat inspiration as authority.',
    ].join('\n'),
    tools: retrievalTools,
    handoffs: [],
    outputType: ResearchResponseSchema,
  });
}

export function createLookDev(models: SwarmModels, _runtime?: PlanningRuntimeContext) {
  return new Agent({
    name: 'LookDev / Motion',
    model: resolveModelForTask(models, 'specialist'),
    instructions: [
      'You are LookDev / Motion. Default model class is Terra. Sol is only for deeply technical visual architecture review, which you do not perform here.',
      'Return only the structured LookDevResponse schema. Use empty arrays when unknown. Do not invent visual observations for files you did not inspect.',
      'You propose visual language, motion, presentation events, theatrics tiers, and technique recommendations. You do not implement.',
      'First-party 0uroboros assets outrank external inspiration for visual identity. Do not replace existing card/Character art. Do not rename characters. Do not redesign mechanics from appearance.',
      'Stats UI assets are FIRST_PARTY_UI_REFERENCE, not automatic UX requirements. UX owns information hierarchy and accessibility. You own presentation, motion, material, and polish.',
      'Technical effect ideas are TECHNIQUE_RECOMMENDATION. Engineering decides fitness.',
      'Canonical palette and Inter/Orbitron stay unless you emit a candidate design proposal. Do not add fonts. Do not recolor first-party art in this mission.',
      'Map authoritative Game Events to Presentation Events. Never determine gameplay outcomes or selected Nodes.',
      'Wave Collapse is short but theatrical. Singularity plus liquid-wave is a promising bespoke direction, not a copy target. Readability is mandatory.',
      'Use resolved design-token values from the packet. Token IDs without values are incomplete.',
      'Uncertain icon filename associations stay uncertain. Do not invent gameplay meaning from a filename.',
      'Representative first-party art is not the triggering card unless selection_role is IDENTITY_SPECIFIC.',
      'First-party visual observations are evidence about existing pixels. They are not lore, biography, or faction membership.',
      'Critical information must not rely on color alone. Existing icons may support UX-A11Y-001.',
      'At most one PRIMARY recommendation unless the assignment allow_alternatives flag is true. At most two ALTERNATIVE directions when asked for options.',
      'Keep findings implementation-useful. Avoid moodboard prose.',
      'You may not modify assets, modify production code, execute shaders, invoke Astra, specialists, or Reviewer, or treat external references as identity.',
      'Cite existing canonical IDs only. Never invent RULE, TECH, UX, or CONTRACT IDs.',
    ].join('\n'),
    tools: createLookDevAssetTools(),
    handoffs: [],
    outputType: LookDevResponseSchema,
  });
}

export function createContent(models: SwarmModels, _runtime?: PlanningRuntimeContext) {
  return new Agent({
    name: 'Content',
    model: resolveModelForTask(models, 'specialist'),
    instructions: [
      'You are Content, the advisory game-content specialist for 0uroboros. Default model class is Terra.',
      'Return only the lean Content contribution schema. Use empty arrays when unknown.',
      'Propose cards, Locations, Circuit Rewards, Mods, generated cards, and effect-text concepts that use the existing engine.',
      'You do not redesign Runtime, Node control, Wave Collapse, Draft, Actions, Data Centers, or victory conditions.',
      'Use the approved mechanics capability map. Gain 1 Action / +1 Action is an APPROVED_PRIMITIVE, not a new mechanic.',
      'A new arrangement of approved primitives is NEW_COMBINATION. A different Power, cost, or Drain number is BALANCE_VARIANT.',
      'Set mechanics_used with mechanic, canonical_ids, and status for every proposed effect.',
      'If an idea requires a genuinely new timing hook or resource, set rule_change_required true. Do not label every new card as a new mechanic.',
      'Preserve approved starter-card mechanics such as RULE-STARTER-004 Rezz-Razor. Do not casually overwrite them.',
      'Preserve existing character names and first-party art identity. Representative references (Rezz-Razor, Glitch-Witch.exe) are visual language samples, not the new character.',
      'Do not write lore, factions, or naming systems. That is Worldbuilding.',
      'Use the harness-supplied concept_id exactly. Do not invent a replacement ID. Candidate name is separate from concept_id.',
      'Do not emit timestamps, queues, approval state, canonical versions, or budget fields.',
      'Obsidian lore is theme, not rule authority. It cannot authorize a new subsystem.',
      'Do not emit WorkPackages. Do not invoke Astra, specialists, or Reviewer. Do not modify files.',
      'Keep proposal_limit. Prefer one shared concept_id when the harness supplied one.',
      'Cite existing canonical IDs only.',
    ].join('\n'),
    tools: [],
    handoffs: [],
    outputType: ContentModelOutputSchema,
  });
}

export function createWorldbuilding(models: SwarmModels, _runtime?: PlanningRuntimeContext) {
  return new Agent({
    name: 'Worldbuilding',
    model: resolveModelForTask(models, 'specialist'),
    instructions: [
      'You are Worldbuilding for 0uroboros. Default model class is Terra.',
      'Return only the structured WorldbuildingResponse schema. Use empty arrays when unknown.',
      'Propose lore, factions, naming, relationships, Location identity, and Obsidian-oriented links.',
      'You do not define gameplay mechanics, alter starter cards, or change the Game Contract.',
      'The Obsidian vault currently holds Mel-authored world story, plotline, and setting lore. It does not currently hold gameplay rules or character-specific canon. That profile can evolve.',
      'Distinguish ESTABLISHED_WORLD_LORE, PROPOSED_CHARACTER_LORE, PROPOSED_WORLD_EXTENSION, VISUAL_INFERENCE, FIRST_PARTY_WORLD_KNOWLEDGE, FIRST_PARTY_WORLD_DRAFT, WORLD_PROPOSAL, and PROPOSED_LORE.',
      'Ask what established world or story concepts are relevant to a proposed character. Do not ask what the vault says about that character.',
      'Search high-signal world concepts first. A character-name miss is expected and is not a defect.',
      'If the packet records WORLD_KNOWLEDGE_NO_MATCH, that is valid. Propose new identity as PROPOSED_CHARACTER_LORE. Do not fabricate vault evidence. An empty match does not make the candidate incomplete.',
      'A proposed relationship to a world event or representative character is PROPOSED_CHARACTER_LORE unless the vault establishes that relationship.',
      'Story implications are thematic only. Lore cannot override RULE, TECH, CONTRACT, or approved gameplay.',
      'Draft, deprecated, and UNKNOWN_STATUS notes are not canon. Do not promote drafts.',
      'A visible motif is VISUAL_INFERENCE. Meaning assigned to a motif is PROPOSED_CHARACTER_LORE until Mel approves it.',
      'Representative first-party art informs established visual language. It is not the new character being designed.',
      'Use the harness-supplied concept_id exactly. Do not invent a replacement ID. Candidate name is separate from concept_id.',
      'If an alternative would challenge established lore, emit WORLD_PROPOSAL and name the fact. Do not silently overwrite it.',
      'WORLD_EVIDENCE_TENSION is vault/art mismatch, not a gameplay rule conflict.',
      'Preserve Cyberpunk + Quantum Physics + Occult. Solarpunk, Lunarpunk, and Psychobilly remain sparse accents.',
      'Do not write into the Obsidian vault. Emit structured relationships only.',
      'Do not emit WorkPackages. Do not invoke specialists, Reviewer, or Astra. Do not modify files.',
      'Keep proposal_limit. Prefer one shared concept_id when Astra supplied one.',
      'Cite existing canonical IDs only.',
    ].join('\n'),
    tools: [],
    handoffs: [],
    outputType: WorldbuildingResponseSchema,
  });
}

function createLookDevAssetTools(): Tool[] {
  const query = tool({
    name: 'queryFirstPartyAssets',
    description:
      'Search the read-only 0uroboros first-party asset inventory. Results are visual evidence, not gameplay rules.',
    parameters: z.object({
      query: z.string(),
      types: z.array(z.string()),
    }),
    execute: async ({ query, types }) => {
      const matches = queryFirstPartyAssets(inventoryFirstPartyAssets(), {
        query,
        types: types.filter((item): item is 'CARD_ART' | 'CHARACTER_ART' | 'ICON' | 'UI_REFERENCE' | 'STATS_UI_REFERENCE' | 'BACKGROUND' | 'TEXTURE' | 'LOGO' | 'OTHER' =>
          [
            'CARD_ART',
            'CHARACTER_ART',
            'ICON',
            'UI_REFERENCE',
            'STATS_UI_REFERENCE',
            'BACKGROUND',
            'TEXTURE',
            'LOGO',
            'OTHER',
          ].includes(item),
        ),
        maxResults: 8,
      });
      return JSON.stringify(
        matches.map((item) => ({
          asset_id: item.asset_id,
          relative_path: item.relative_path,
          asset_type: item.asset_type,
          associated_card_or_character: item.associated_card_or_character,
          associated_game_system: item.associated_game_system,
          identity_locked: item.identity_locked,
          ux_requirement: item.ux_requirement,
          semantic_confidence: item.semantic_confidence,
          selection_role: item.selection_role,
        })),
      );
    },
  });
  const inspect = tool({
    name: 'inspectFirstPartyAsset',
    description:
      'Read one first-party asset without mutation. Returns metadata, SVG colors when present, and raster dimensions. Does not invent pixel descriptions.',
    parameters: z.object({
      asset_id: z.string(),
    }),
    execute: async ({ asset_id }) => {
      const found = inventoryFirstPartyAssets().find((item) => item.asset_id === asset_id);
      if (!found) {
        return JSON.stringify({
          error: 'Unknown asset_id',
          visual_observations: [],
        });
      }
      const inspected = inspectFirstPartyAsset(found);
      return JSON.stringify({
        asset_id: inspected.asset_id,
        relative_path: inspected.relative_path,
        inspection_status: inspected.inspection_status,
        dimensions: inspected.dimensions,
        observed_colors: inspected.observed_colors,
        associated_card_or_character: inspected.associated_card_or_character,
        visual_observations: inspected.visual_observations,
        notes: inspected.notes,
        identity_locked: inspected.identity_locked,
        ux_requirement: inspected.ux_requirement,
        semantic_confidence: inspected.semantic_confidence,
        selection_role: inspected.selection_role,
      });
    },
  });
  return [query, inspect];
}

export function createReviewer(models: SwarmModels) {
  return new Agent({
    name: 'Game Design Reviewer',
    model: resolveModelForTask(models, 'reviewer'),
    instructions: [
      'You are the independent gated Reviewer for 0uroboros Swarm v2.0.',
      'Default model class is Sol. You are quality control, not a second Astra.',
      'Return only the structured ReviewerResponse schema. Use empty arrays when a list has nothing to report.',
      'Verdicts: PASS, PASS_WITH_NOTES, REVISE, ESCALATE. Do not return APPROVED_FOR_EXECUTION.',
      'PASS means the reviewed artifact satisfied the review criteria. Execution authorization remains separate.',
      'Inspect only the supplied ReviewPacket. Do not invent repository provenance or gameplay rules.',
      'Finding kinds: UNSUPPORTED_CLAIM, CANONICAL_CONFLICT, IMPLEMENTATION_MISMATCH, AUTHORITY_VIOLATION, EVIDENCE_CONFLICT, MISSING_ACCEPTANCE_CRITERIA, SCOPE_MISMATCH, TECHNICAL_RISK, PRODUCT_RISK, GOVERNANCE_RISK, EXTERNAL_EVIDENCE_CHALLENGE, NO_MATERIAL_ISSUE.',
      'IMPLEMENTATION_MISMATCH: evidenced implementation does not conform to a current authoritative canonical requirement.',
      'CANONICAL_CONFLICT: two or more current authoritative canonical requirements materially contradict one another. Historical or superseded rules and implementation disagreement are not canonical conflicts.',
      'EXTERNAL_EVIDENCE_CHALLENGE: external research suggests reconsidering an approved decision. It does not invalidate the current rule.',
      'Do not force findings where none exist.',
      'You may not modify canonical rules, modify game code, execute WorkPackages, approve your own changes, invent gameplay semantics, invoke specialists or Astra, or broaden WorkPackage authority.',
      'You have no tools and no handoffs.',
      'If a genuine gameplay ambiguity remains, ESCALATE to Mel. Do not resolve it yourself.',
    ].join('\n'),
    tools: [],
    handoffs: [],
    outputType: ReviewerResponseSchema,
  });
}

function formatAssignmentInput(
  assignment: SpecialistAssignment,
  index: CanonicalIndex,
): string {
  const resolved = resolveAssignmentContext(assignment.objective, index, {
    includePresentationDefaults: assignment.role === 'lookdev',
  });
  const ids = mergeAssignmentContextIds(assignment.canonical_context_ids, resolved.canonical_ids);
  assignment.canonical_context_ids = ids;
  const excerpts = formatCanonicalExcerpts(retrieveCanonical(index, { ids }));
  return [
    `Assignment ${assignment.assignment_id} for ${assignment.role}.`,
    `Objective: ${assignment.objective}`,
    `Authority boundary: ${assignment.authority_boundary}`,
    `Proposal limit: ${assignment.proposal_limit}`,
    `Questions: ${assignment.questions.join(' | ') || '(none)'}`,
    `Constraints: ${assignment.constraints.join(' | ') || '(none)'}`,
    `Expected output: ${assignment.expected_output.join(' | ') || '(structured specialist output)'}`,
    assignment.role === 'systems' || assignment.role === 'research' || assignment.role === 'lookdev'
      ? (() => {
          const records = collectHarnessVerifiedEvidence(assignment.objective);
          return records.length > 0 ? formatVerifiedEvidence(records) : '';
        })()
      : '',
    resolved.contract_fields.length > 0
      ? `Relevant Game Contract fields: ${resolved.contract_fields.join(', ')}.`
      : '',
    'Canonical excerpts:',
    excerpts,
  ]
    .filter(Boolean)
    .join('\n');
}

function specialistTool(
  agent: Agent<unknown, typeof SpecialistResponseSchema>,
  toolName: string,
  description: string,
  role: SpecialistAssignment['role'],
  config: SwarmConfig,
  runtime: PlanningRuntimeContext,
): Tool {
  return agent.asTool({
    toolName,
    toolDescription: description,
    parameters: SpecialistAssignmentSchema,
    isEnabled: () =>
      runtime.budget.canCallSpecialist() &&
      (role === 'product' || role === 'ux' || role === 'engineering'
        ? shouldConsultLead(role, runtime.objective ?? '')
        : true),
    inputBuilder: ({ params }) => {
      runtime.budget.consumeAgentCall('specialist');
      const assignment = validateSpecialistAssignment(
        { ...params, role },
        config.budget,
      );
      runtime.assignments.push(assignment);
      return formatAssignmentInput(assignment, runtime.canonical);
    },
    customOutputExtractor: (result) => {
      const parsed = validateSpecialistResponse(result.finalOutput, {
        ...runtime.assignments[runtime.assignments.length - 1],
        role,
      } as SpecialistAssignment);
      runtime.specialistResults.push(parsed);
      return JSON.stringify(parsed);
    },
    runOptions: {
      maxTurns: Math.min(4, config.budget.max_turns),
    },
  });
}

function systemsTool(
  agent: Agent<unknown, typeof SystemsResponseSchema>,
  config: SwarmConfig,
  runtime: PlanningRuntimeContext,
): Tool {
  return agent.asTool({
    toolName: SPECIALIST_TOOL_NAMES.systems,
    toolDescription:
      'Consult Systems / Rules for canonical gameplay meaning, aliases, timing, implementation drift, and true ambiguities. Do not use for typography, shaders, or ordinary layout.',
    parameters: SpecialistAssignmentSchema,
    isEnabled: () =>
      runtime.budget.canCallSpecialist() &&
      shouldEnableSystemsTool(runtime.objective ?? '', runtime.contentResults),
    inputBuilder: ({ params }) => {
      runtime.budget.consumeAgentCall('specialist');
      const assignment = validateSpecialistAssignment(
        { ...params, role: 'systems' },
        config.budget,
      );
      runtime.assignments.push(assignment);
      return formatAssignmentInput(assignment, runtime.canonical);
    },
    customOutputExtractor: (result) => {
      const parsed = validateSystemsResponse(result.finalOutput, {
        ...runtime.assignments[runtime.assignments.length - 1],
        role: 'systems',
      } as SpecialistAssignment);
      runtime.systemsResults.push(parsed);
      return JSON.stringify(parsed);
    },
    runOptions: {
      maxTurns: Math.min(4, config.budget.max_turns),
    },
  });
}

function createResearchRetrievalTools(runtime?: PlanningRuntimeContext): Tool[] {
  const library = tool({
    name: 'resourceLibrary',
    description:
      'Search the approved 0uroboros Resource Library. Results are research inputs, not canonical rules.',
    parameters: z.object({
      query: z.string(),
      tags: z.array(z.string()),
    }),
    execute: async ({ query, tags }) => {
      const matches = queryResourceLibrary(loadResourceLibrary(), {
        query,
        tags,
        maxResults: runtime?.budget.config.max_research_sources ?? 6,
      });
      return JSON.stringify(matches);
    },
  });
  const retrieve = tool({
    name: 'retrieveApprovedUrl',
    description:
      'Fetch one Resource Library URL and extract readable text or structured fallback metadata. Rejects URLs that are not in the curated library. Does not crawl. GitHub may include README plus up to three requested files.',
    parameters: z.object({
      url: z.string(),
      requested_files: z.array(z.string()).max(3).optional(),
    }),
    execute: async ({ url, requested_files }) => {
      assertApprovedResearchUrl(url);
      const resource = findResourceByUrl(url);
      const response = await fetch(url, {
        headers: { 'User-Agent': '0uroborosResearch/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      const body = await response.text();
      const companions = isGitHubRepoUrl(url)
        ? await fetchGitHubCompanions(url, requested_files ?? ['README.md'])
        : [];
      const retrieved = ingestCuratedSource({
        url,
        status_code: response.status,
        content_type: response.headers.get('content-type') ?? '',
        body,
        companions,
        resource,
      });
      return JSON.stringify(retrieved);
    },
  });
  const search = webSearchTool({
    searchContextSize: 'low',
  });
  return [library, retrieve, search];
}

function researchTool(
  agent: Agent<unknown, typeof ResearchResponseSchema>,
  config: SwarmConfig,
  runtime: PlanningRuntimeContext,
): Tool {
  return agent.asTool({
    toolName: SPECIALIST_TOOL_NAMES.research,
    toolDescription:
      'Consult Competitive Research only when external evidence is needed: current docs, reference games, comparisons, or source verification. Do not use for canonical rules, repository mismatches, or typography.',
    parameters: ResearchAssignmentSchema,
    isEnabled: () =>
      runtime.budget.canCallResearch() &&
      shouldConsultResearch(runtime.objective ?? ''),
    inputBuilder: ({ params }) => {
      runtime.budget.consumeAgentCall('research');
      const assignment = validateResearchAssignment(params, config.budget);
      runtime.researchAssignments.push(assignment);
      runtime.researchSourceMode = assignment.source_mode;
      runtime.assignments.push(assignment);
      return [
        formatAssignmentInput(assignment, runtime.canonical),
        `Source mode: ${assignment.source_mode}. Allowed tags: ${assignment.allowed_reference_tags.join(', ') || '(none)'}.`,
        assignment.source_mode === 'CURATED'
          ? 'Do not use web_search. Stay inside curated Resource Library URLs.'
          : 'web_search is allowed only for current external verification.',
        formatResourceLibraryForAssignment(assignment),
      ].join('\n');
    },
    customOutputExtractor: (result) => {
      const parsed = validateResearchResponse(
        result.finalOutput,
        runtime.researchAssignments[runtime.researchAssignments.length - 1]!,
        config.budget,
      );
      runtime.researchResults.push(parsed);
      return JSON.stringify({
        assignment_id: parsed.assignment_id,
        summary: parsed.summary,
        evidence: parsed.evidence.map((item) => ({
          evidence_id: item.evidence_id,
          title: item.title,
          url: item.url,
          source_quality: item.source_quality,
          claims: item.claims,
          limitations: item.limitations,
        })),
        observations: parsed.observations,
        recommendations: parsed.recommendations,
        risks: parsed.risks,
        limitations: parsed.limitations,
      });
    },
    runOptions: {
      maxTurns: Math.min(4, config.budget.max_turns),
    },
  });
}

function lookdevTool(
  agent: Agent<unknown, typeof LookDevResponseSchema>,
  config: SwarmConfig,
  runtime: PlanningRuntimeContext,
): Tool {
  return agent.asTool({
    toolName: SPECIALIST_TOOL_NAMES.lookdev,
    toolDescription:
      'Consult LookDev / Motion for visual language, motion, theatrics, first-party art/icon integration, and Game Event to Presentation Event mapping. Do not use for rules, backend, or implementation mismatches.',
    parameters: LookDevAssignmentSchema,
    isEnabled: () =>
      runtime.budget.canCallLookDev() && shouldConsultLookDev(runtime.objective ?? ''),
    inputBuilder: ({ params }) => {
      runtime.budget.consumeAgentCall('lookdev');
      const assignment = validateLookDevAssignment(
        {
          ...params,
          allow_alternatives: /\b(alternative|options|directions)\b/i.test(
            String(params.objective ?? runtime.objective ?? ''),
          ),
        },
        config.budget,
      );
      runtime.lookdevAssignments.push(assignment);
      runtime.assignments.push(assignment);
      const packet = assembleLookDevPacket({
        objective: assignment.objective || runtime.objective || '',
        assets: inventoryFirstPartyAssets(),
        resources: loadResourceLibrary(),
        gameplay_event: assignment.gameplay_event,
        canonical: runtime.canonical,
      });
      return [
        formatAssignmentInput(assignment, runtime.canonical),
        `Authoritative Game Events: ${AUTHORITATIVE_GAME_EVENTS.join(', ')}.`,
        'Presentation Events are derived. Gameplay outcomes stay server-authoritative.',
        formatLookDevPacket(packet),
      ].join('\n');
    },
    customOutputExtractor: (result) => {
      const parsed = validateLookDevResponse(
        result.finalOutput,
        runtime.lookdevAssignments[runtime.lookdevAssignments.length - 1]!,
        config.budget,
      );
      runtime.lookdevResults.push(parsed);
      return JSON.stringify({
        assignment_id: parsed.assignment_id,
        summary: parsed.summary,
        visual_findings: parsed.visual_findings,
        recommendations: parsed.recommendations,
        first_party_asset_ids: parsed.first_party_asset_ids,
        reference_evidence_ids: parsed.reference_evidence_ids,
        presentation_event_mappings: parsed.presentation_event_mappings,
        ux_questions: parsed.ux_questions,
        technical_questions: parsed.technical_questions,
      });
    },
    runOptions: {
      maxTurns: Math.min(4, config.budget.max_turns),
    },
  });
}

function contentTool(
  agent: Agent<unknown, typeof ContentModelOutputSchema>,
  config: SwarmConfig,
  runtime: PlanningRuntimeContext,
): Tool {
  return agent.asTool({
    toolName: SPECIALIST_TOOL_NAMES.content,
    toolDescription:
      'Consult Content for new cards, Locations, Circuit Rewards, Mods, and effect concepts that use existing mechanics. Do not use for lore, visual effects, or rule interpretation.',
    parameters: ContentAssignmentSchema,
    isEnabled: () =>
      runtime.budget.canCallContent() && shouldConsultContent(runtime.objective ?? ''),
    inputBuilder: ({ params }) => {
      runtime.budget.consumeAgentCall('content');
      const objective = String(params.objective ?? runtime.objective ?? '');
      const shared = runtime.sharedConceptId
        ? [runtime.sharedConceptId]
        : params.shared_concept_ids?.length
          ? params.shared_concept_ids
          : [defaultSharedConcept(objective)];
      const assets = inventoryFirstPartyAssets();
      const liveAssetIds = liveCachedAssetIds(assets);
      const relevant = relevantAssetsForObjective(objective, assets, {
        liveAssetIds,
      });
      const assignment = validateContentAssignment(
        {
          ...params,
          shared_concept_ids: shared,
          first_party_asset_ids: relevant.map((item) => item.asset_id),
        },
        config.budget,
      );
      runtime.contentAssignments.push(assignment);
      runtime.assignments.push(assignment);
      const packet = assembleContentPacket({
        objective: assignment.objective || objective,
        index: runtime.canonical,
        assets,
        observations: inspectFirstPartyVisuals(relevant, {
          cwd: process.cwd(),
        }),
        shared_concept_ids: assignment.shared_concept_ids,
        liveAssetIds,
      });
      return [formatAssignmentInput(assignment, runtime.canonical), formatContentPacket(packet)].join('\n');
    },
    customOutputExtractor: (result) => {
      const assignment = runtime.contentAssignments[runtime.contentAssignments.length - 1]!;
      const harnessId = assignment.shared_concept_ids[0] || runtime.sharedConceptId || '';
      try {
        const mismatches = contentConceptIdMismatches(result.finalOutput, harnessId);
        if (mismatches.length > 0) {
          recordRuntimeFailure(
            runtime,
            buildSpecialistFailure({
              specialist: 'content',
              assignment_id: assignment.assignment_id,
              concept_id: harnessId,
              model: runtime.specialistModel ?? config.models.specialist,
              error_class: 'CONCEPT_ID_MISMATCH',
              schema_name: CONTENT_SCHEMA_NAME,
              fatal: false,
              error: new Error(`Content returned concept_id ${mismatches.join(', ')}; harness ID ${harnessId} wins.`),
            }),
          );
        }
        const parsed = validateContentResponse(
          result.finalOutput,
          assignment,
          config.budget,
          runtime.canonical,
        );
        runtime.contentResults.push(parsed);
        return JSON.stringify({
          assignment_id: parsed.assignment_id,
          concept_id: harnessId,
          summary: parsed.summary,
          content_proposals: parsed.content_proposals,
          rule_changes_required: parsed.rule_changes_required,
          first_party_asset_ids: parsed.first_party_asset_ids,
        });
      } catch (error) {
        const failure = buildSpecialistFailure({
          specialist: 'content',
          assignment_id: assignment.assignment_id,
          concept_id: harnessId,
          model: runtime.specialistModel ?? config.models.specialist,
          schema_name: CONTENT_SCHEMA_NAME,
          error,
        });
        recordRuntimeFailure(runtime, failure);
        return specialistFailureToolPayload(failure);
      }
    },
    runOptions: {
      maxTurns: Math.min(4, config.budget.max_turns),
    },
  });
}

function worldbuildingTool(
  agent: Agent<unknown, typeof WorldbuildingResponseSchema>,
  config: SwarmConfig,
  runtime: PlanningRuntimeContext,
): Tool {
  return agent.asTool({
    toolName: SPECIALIST_TOOL_NAMES.worldbuilding,
    toolDescription:
      'Consult Worldbuilding for lore, factions, naming, Location identity, and Obsidian-oriented relationships. Do not use for card mechanics, balance, or implementation mismatches.',
    parameters: WorldbuildingAssignmentSchema,
    isEnabled: () =>
      runtime.budget.canCallWorldbuilding() && shouldConsultWorldbuilding(runtime.objective ?? ''),
    inputBuilder: async ({ params }) => {
      runtime.budget.consumeAgentCall('worldbuilding');
      const objective = String(params.objective ?? runtime.objective ?? '');
      const shared = runtime.sharedConceptId
        ? [runtime.sharedConceptId]
        : params.shared_concept_ids?.length
          ? params.shared_concept_ids
          : runtime.contentAssignments.at(-1)?.shared_concept_ids ?? [defaultSharedConcept(objective)];
      const assets = inventoryFirstPartyAssets();
      const liveAssetIds = liveCachedAssetIds(assets);
      const relevant = relevantAssetsForObjective(objective, assets, { liveAssetIds });
      const assignment = validateWorldbuildingAssignment(
        { ...params, shared_concept_ids: shared },
        config.budget,
      );
      runtime.worldbuildingAssignments.push(assignment);
      runtime.assignments.push(assignment);
      const content = runtime.contentResults[0];
      const observations = inspectFirstPartyVisuals(relevant, {
        cwd: process.cwd(),
      });
      runtime.worldKnowledgePacket = await retrieveWorldKnowledgePacket({
        objective: assignment.objective || objective,
        index: runtime.canonical,
        assets,
        observations,
        cwd: process.cwd(),
        content_summary: content?.summary,
        content_concept: [content?.content_proposals[0]?.concept, content?.content_proposals[0]?.thematic_rationale]
          .filter(Boolean)
          .join(' '),
        candidate_name: content?.content_proposals[0]?.name,
        candidate_type: content?.content_proposals[0]?.content_type,
      });
      const packet = assembleWorldbuildingPacket({
        objective: assignment.objective || objective,
        index: runtime.canonical,
        assets,
        observations,
        shared_concept_ids: assignment.shared_concept_ids,
        world_knowledge: runtime.worldKnowledgePacket,
        liveAssetIds,
      });
      return [
        formatAssignmentInput(assignment, runtime.canonical),
        formatWorldbuildingPacket(packet),
      ].join('\n');
    },
    customOutputExtractor: (result) => {
      const assignment = runtime.worldbuildingAssignments[runtime.worldbuildingAssignments.length - 1]!;
      const harnessId = assignment.shared_concept_ids[0] || runtime.sharedConceptId || '';
      try {
        const mismatches = worldbuildingConceptIdMismatches(result.finalOutput, harnessId);
        if (mismatches.length > 0) {
          recordRuntimeFailure(
            runtime,
            buildSpecialistFailure({
              specialist: 'worldbuilding',
              assignment_id: assignment.assignment_id,
              concept_id: harnessId,
              model: runtime.specialistModel ?? config.models.specialist,
              error_class: 'CONCEPT_ID_MISMATCH',
              schema_name: WORLDBUILDING_SCHEMA_NAME,
              fatal: false,
              error: new Error(
                `Worldbuilding returned concept_id ${mismatches.join(', ')}; harness ID ${harnessId} wins.`,
              ),
            }),
          );
        }
        const parsed = validateWorldbuildingResponse(
          result.finalOutput,
          assignment,
          config.budget,
          runtime.worldKnowledgePacket,
        );
        runtime.worldbuildingResults.push(parsed);
        return JSON.stringify({
          assignment_id: parsed.assignment_id,
          concept_id: harnessId,
          summary: parsed.summary,
          world_proposals: parsed.world_proposals,
          relationships: parsed.relationships,
          obsidian_links: parsed.obsidian_links,
        });
      } catch (error) {
        const failure = buildSpecialistFailure({
          specialist: 'worldbuilding',
          assignment_id: assignment.assignment_id,
          concept_id: harnessId,
          model: runtime.specialistModel ?? config.models.specialist,
          schema_name: WORLDBUILDING_SCHEMA_NAME,
          error,
        });
        recordRuntimeFailure(runtime, failure);
        return specialistFailureToolPayload(failure);
      }
    },
    runOptions: {
      maxTurns: Math.min(4, config.budget.max_turns),
    },
  });
}

function recordRuntimeFailure(
  runtime: PlanningRuntimeContext,
  failure: SpecialistFailureRecord,
): void {
  runtime.specialistFailures = runtime.specialistFailures ?? [];
  runtime.specialistFailures.push(failure);
  persistSpecialistFailure(runtime.artifactStore, failure);
}

export function createAstra(
  config: SwarmConfig,
  runtime: PlanningRuntimeContext,
  modelOverride?: string,
) {
  const product = createProductLead(config.models);
  const ux = createUxLead(config.models);
  const engineering = createLeadEngineering(config.models);
  const systems = createSystemsRules(config.models);
  const research = createResearch(config.models, runtime);
  const lookdev = createLookDev(config.models, runtime);
  const content = createContent(config.models, runtime);
  const worldbuilding = createWorldbuilding(config.models, runtime);
  const model = modelOverride ?? config.models.astra;
  const tools = [
    specialistTool(
      product,
      SPECIALIST_TOOL_NAMES.product,
      'Consult Product Lead for player need, scope, sequencing, and acceptance criteria.',
      'product',
      config,
      runtime,
    ),
    specialistTool(
      ux,
      SPECIALIST_TOOL_NAMES.ux,
      'Consult UX Lead for interaction, hierarchy, accessibility, and contract gaps.',
      'ux',
      config,
      runtime,
    ),
    specialistTool(
      engineering,
      SPECIALIST_TOOL_NAMES.engineering,
      'Consult Lead Engineering for architecture, feasibility, testing, and Game Contract implications.',
      'engineering',
      config,
      runtime,
    ),
    systemsTool(systems, config, runtime),
    researchTool(research, config, runtime),
    lookdevTool(lookdev, config, runtime),
    contentTool(content, config, runtime),
    worldbuildingTool(worldbuilding, config, runtime),
  ];

  return new Agent({
    name: 'Astra',
    model,
    instructions: [
      'You are Astra, Executive Planner for 0uroboros Swarm v2.0.',
      'You own the user conversation. Specialists are tools. Do not hand off.',
      'Use the smallest useful specialist set. Ask which domains are involved, which specialists add distinct expertise, which are unnecessary, whether gameplay-semantic uncertainty needs Systems, and whether you can finish without another call.',
      'Consult Systems / Rules only when there is a genuine rules-semantic question, a specialist flags semantic uncertainty, canonical mechanics appear contradictory, implementation is being compared against canonical rules, or an effect cannot be classified from the supplied approved-mechanics map.',
      'Do not consult Systems merely because a creative brief mentions approved mechanics, Actions, Wave Collapse, Draft, or Runtime. Using approved primitives in a new card is not a Systems question.',
      'Do not consult Systems merely for visual hierarchy, typography, shaders, animation aesthetics, marketing copy, presentational formatting, or ordinary technical work where gameplay meaning is already settled.',
      'Do not consult Product, UX, or Engineering unless the objective materially needs player-facing product requirements, interaction/HUD design, or implementation architecture. Creative Content plus Worldbuilding work does not enable them.',
      'Harness infrastructure is not specialist work. Do not call any specialist to verify whether Obsidian search ran, a packet was bounded, a concept ID was preserved, a result persisted, or routing occurred. Use deterministic harness evidence.',
      'WORLD_KNOWLEDGE_NO_MATCH means no relevant world lore was retrieved. If required Content and Worldbuilding contributions exist, that empty match does not make the candidate incomplete.',
      'Systems answers what the game means. Engineering answers how approved behavior should be implemented. UX answers how to communicate those semantics. Ordinary layout disagreements are not Systems conflicts.',
      'HARNESS_VERIFIED_EVIDENCE is repository observation from the harness. You may disagree about interpretation, but you must not discard the observed value or treat it as unsourced.',
      'A verified implementation mismatch against an unambiguous approved rule may become an implementation correction WorkPackage only when the WorkOrder materially touches starting deck, deck setup, card composition, or implementation compliance. It still does not execute. Do not attach RULE-DECK-001 correction work to unrelated creative tasks.',
      'Repository evidence cannot override approved canonical rules. HIST-DECK-4-4-2 cannot override RULE-DECK-001.',
      'Consult Competitive Research only when external evidence materially improves the objective: current SDK/API/docs, reference-game analysis, market or UX research, source verification, or an explicit research request.',
      'When calling Research, set source_mode to CURATED, LIVE, or MIXED and pass Resource Library tags. Prefer CURATED for approved references.',
      'Do not consult Research for a known approved rule, a repository implementation mismatch, a typography or design-system choice, creative Content/Worldbuilding work solvable from canonical, assets, and vault, or any question canonical or harness evidence already answers.',
      'Routing order: deterministic code, then canonical knowledge, then harness-verified repository evidence, then an existing specialist, and only then Research.',
      'Research evidence is not a 0uroboros recommendation. If you adopt a Research idea, emit an explicit candidate_note. Do not turn Research output into implementation WorkPackages.',
      'Consult LookDev / Motion when the objective materially involves visual design, motion, animation, shaders, effects, 3D presentation, card rendering or staging, icons, visual hierarchy, phase announcements, cinematic feedback, Wave Collapse presentation, asset integration, or presentation polish.',
      'Do not consult LookDev merely because artwork or cached visual observations are supplied. Cached observations are evidence. LookDev is for presentation questions.',
      'LookDev is optional. First-party assets outrank external inspiration for visual identity. Research does not instruct LookDev. The harness supplies a bounded visual packet.',
      'Do not consult Research merely because a LookDev brief mentions inspiration, theatrics, or 3js technique references. Prefer LookDev for presentation work. Do not ask LookDev to replace existing card art.',
      'LookDev recommendations do not trigger Reviewer by themselves.',
      'Consult Content when the objective materially involves new cards, card effects, Locations, Circuit Rewards, Mods, generated cards, synergies, or draft-pool ideas inside existing rules.',
      'Do not consult Content for pure lore, visual-effect work, rule interpretation, backend architecture, or SDK research.',
      'Consult Worldbuilding when the objective materially involves lore, naming, factions, world relationships, character or Location identity, symbolic systems, thematic cohesion, or Obsidian world structure.',
      'Do not consult Worldbuilding for balance analysis, implementation mismatch, technical research, simple animation, or known rule interpretation.',
      'Content asks what a card or Location does. Worldbuilding asks what it is in the world. They do not call each other. You decide whether one or both are needed.',
      'When both are used, the harness assigns ONE shared concept_id before they work. Pass that exact ID to both. Do not let specialists invent replacement IDs. Candidate name is not the concept ID.',
      'Prefer Content before Worldbuilding so vault search can use the gameplay concept. You may call Worldbuilding first when lore must lead.',
      'If a specialist tool returns SPECIALIST_FAILURE, record that failure. Do not invent that specialist\'s substantive contribution. Content-owned fields are Power, effect, Draft cost, gameplay role, and mechanic provenance. Worldbuilding-owned fields are biography, faction, history, relationships, symbolic meaning, and lore identity.',
      'Synthesize exactly ONE integrated candidate. Emit at most one candidate_note for that candidate. List discarded working names in alternative_working_names.',
      'Keep the aggregate creative concept count at or below the configured maximum. A one-candidate validation task must produce one integrated concept, not five plus five.',
      'Content and Worldbuilding output remains unapproved Candidate material. Do not invoke Reviewer merely because they proposed ideas. Using approved primitives is not canonical mutation. Proposed lore is not canon unless promotion is requested.',
      'Do not emit implementation WorkPackages for unapproved creative candidates.',
      'Create bounded SpecialistAssignment objects. Keep proposal_limit at or below the configured maximum.',
      'Give specialists only relevant canonical IDs, not the whole package.',
      'Synthesize a structured AstraSynthesis object only.',
      'Emit work_package_intents, not full WorkPackages. Do not invent run IDs, timestamps, queues, budget, or stale_check_status.',
      'Authority labels are proposals. The harness normalizes WorkPackage authority and review routing.',
      'Do not modify game files, rewrite rules, approve rule changes, or spawn unregistered agents.',
      'You cannot invoke Reviewer as a tool. Deterministic governance may require review independently. You cannot suppress a mandatory review trigger.',
      'Record a review_request only when later gated review is justified. Cheap deterministic problems do not need Reviewer.',
      'If specialists disagree on canonical meaning, record a conflict instead of inventing a resolution that changes rules.',
      'Layout, hierarchy, and preference disagreements belong in decisions, not conflicts.',
      'human_approvals_required is only for authority gates: canonical mutation, implementation authorization, destructive work, deployment, or tool-authority expansion.',
      'Open questions, dependencies, and human design choices are not approval gates.',
      'Use empty arrays when a field has nothing to report.',
    ].join('\n'),
    tools,
    handoffs: [],
    outputType: AstraSynthesisSchema,
    modelSettings: config.models.astraReasoningEffort
      ? { reasoning: { effort: config.models.astraReasoningEffort } }
      : {},
  });
}

async function fetchGitHubCompanions(
  repoUrl: string,
  requestedFiles: string[],
): Promise<Array<{ path: string; status_code: number; body: string }>> {
  const files = uniqueRequestedGitHubFiles(requestedFiles);
  const companions: Array<{ path: string; status_code: number; body: string }> = [];
  for (const path of files) {
    const rawUrl = githubCompanionRawUrl(repoUrl, path);
    if (!rawUrl) continue;
    try {
      const response = await fetch(rawUrl, {
        headers: { 'User-Agent': '0uroborosResearch/1.0' },
        signal: AbortSignal.timeout(8000),
      });
      companions.push({
        path,
        status_code: response.status,
        body: await response.text(),
      });
    } catch {
      companions.push({ path, status_code: 0, body: '' });
    }
  }
  return companions;
}

function uniqueRequestedGitHubFiles(requestedFiles: string[]): string[] {
  const files = requestedFiles.length > 0 ? requestedFiles : ['README.md'];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const file of files) {
    if (!isSafeGitHubPath(file) || seen.has(file)) continue;
    seen.add(file);
    result.push(file);
    if (result.length >= 3) break;
  }
  return result;
}

function isSafeGitHubPath(path: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(path) && !path.includes('..') && !path.startsWith('/');
}

function githubCompanionRawUrl(repoUrl: string, path: string): string | null {
  if (/readme/i.test(path)) return githubRawReadmeUrl(repoUrl);
  const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/i);
  if (!match) return null;
  return `https://raw.githubusercontent.com/${match[1]}/HEAD/${path}`;
}

export function createPlanningTeam(
  config: SwarmConfig,
  runtime: PlanningRuntimeContext,
  modelOverride?: string,
) {
  const astra = createAstra(config, runtime, modelOverride);
  return {
    astra,
    reviewer: createReviewer(config.models),
    specialistAgents: {
      product: createProductLead(config.models),
      ux: createUxLead(config.models),
      engineering: createLeadEngineering(config.models),
      systems: createSystemsRules(config.models),
      research: createResearch(config.models, runtime),
      lookdev: createLookDev(config.models, runtime),
      content: createContent(config.models, runtime),
      worldbuilding: createWorldbuilding(config.models, runtime),
    },
  };
}

type InspectableAgent = {
  name: string;
  tools: ReadonlyArray<{ name?: string; type: string }>;
};

export function toolNames(agent: InspectableAgent): string[] {
  return agent.tools.map((tool) => ('name' in tool ? String(tool.name) : 'unknown'));
}

export function toolTypes(agent: InspectableAgent): string[] {
  return agent.tools.map((tool) => String(tool.type));
}

export function assertNoPlanningMutationTools(agent: InspectableAgent): void {
  for (const tool of agent.tools) {
    const name = 'name' in tool ? String(tool.name) : '';
    const type = String(tool.type);
    if (FORBIDDEN_PLANNING_TOOLS.has(name) || FORBIDDEN_PLANNING_TOOLS.has(type)) {
      throw new Error(`Planning agent ${agent.name} must not receive mutation tool ${name || type}.`);
    }
  }
}
