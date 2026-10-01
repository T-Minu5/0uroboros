import { describe, expect, it } from 'vitest';

import { createPlanningTeam, SPECIALIST_TOOL_NAMES, toolNames } from '../../src/swarm/agents';
import { BudgetTracker } from '../../src/swarm/budget';
import { BudgetExhaustedError } from '../../src/swarm/errors';
import {
  communitySignalCannotBecomeCanonical,
  evidenceAuthorityRank,
  externalCannotOverrideCanonical,
  officialDocsAreNotProjectAuthority,
  officialDocsInformExternalFact,
  researchCreatesWorkPackages,
  routeResearchResponse,
  selectResearchEvidenceForReview,
  shouldConsultResearch,
  validateResearchAssignment,
  validateResearchResponse,
} from '../../src/swarm/research';
import { buildReviewPacket, detectReviewTriggers } from '../../src/swarm/review';
import { assertPlanningOnly, validateOrchestrationResult } from '../../src/swarm/governance';
import { loadResourceLibrary, queryResourceLibrary } from '../../src/swarm/resourceLibrary';
import { applyHarnessVerifiedMismatches, collectHarnessVerifiedEvidence } from '../../src/swarm/evidence';
import { startingDeckComposition } from '../../src/swarm/systems';
import type { ExternalEvidenceRecord, ResearchResponse } from '../../src/swarm/contracts';
import { assignment, emptyRuntime, testConfig, workPackage } from './fixtures';
import { hudSmokeOrchestrationResult } from './hud-smoke-fixture';

function evidence(
  overrides: Partial<ExternalEvidenceRecord> & Pick<ExternalEvidenceRecord, 'evidence_id'>,
): ExternalEvidenceRecord {
  return {
    evidence_type: 'EXTERNAL_RESEARCH',
    authority: 'EXTERNAL_RESEARCH_EVIDENCE',
    source_type: 'REVIEW',
    title: 'Example source',
    url: 'https://www.ultraboardgames.com/shards-of-infinity/game-rules.php',
    publisher_or_author: 'UltraBoardGames',
    retrieved_at: '2026-09-07T00:00:00.000Z',
    published_at: '',
    summary: 'Shards of Infinity turn-level deck building.',
    claims: ['Players adapt their deck during play.'],
    relevance: 'Draft volatility inspiration',
    limitations: ['Not 0uroboros rules.'],
    canonical_ids_related: [],
    reference_tags: ['shards-of-infinity'],
    confidence: 0.7,
    source_quality: 'SECONDARY_HIGH',
    research_run_id: 'asg-research-1',
    visual_reference_kinds: [],
    theatrics_tiers: [],
    usage_constraints: [],
    user_guidance: [],
    visual_inspected: false,
    ...overrides,
  };
}

function researchResponse(overrides: Partial<ResearchResponse> = {}): ResearchResponse {
  return {
    agent: 'research',
    assignment_id: 'asg-research-1',
    summary: 'Bounded Shards reference notes.',
    evidence: [evidence({ evidence_id: 'ev-1' })],
    observations: [
      {
        statement: 'Fast tactical deck adaptation may be relevant to Draft volatility.',
        evidence_ids: ['ev-1'],
        kind: 'INSPIRATION',
      },
    ],
    recommendations: [
      {
        title: 'Consider a bounded Chaos-card idea at content level only.',
        rationale: 'Candidate inspiration. Do not change Runtime or Draft structure.',
        priority: 'low',
        evidence_ids: ['ev-1'],
      },
    ],
    risks: ['Imitating protected expression'],
    limitations: ['Secondary review, not a rules document'],
    open_questions: [],
    canonical_ids_referenced: [],
    confidence: 0.7,
    ...overrides,
  };
}

const researchAssignment = validateResearchAssignment(
  {
    ...assignment({
      assignment_id: 'asg-research-1',
      role: 'research',
      objective: 'Study Shards of Infinity turn-level mechanics.',
      proposal_limit: 3,
    }),
    source_mode: 'CURATED',
    allowed_reference_tags: ['shards-of-infinity'],
  },
  testConfig().budget,
);

describe('Research routing', () => {
  it('does not recommend Research for a canonical starting-deck question', () => {
    expect(shouldConsultResearch('What is the starting deck?')).toBe(false);
  });

  it('does not recommend Research for a known implementation mismatch', () => {
    expect(shouldConsultResearch('Compare STARTING_DECK to RULE-DECK-001.')).toBe(false);
  });

  it('allows Research for a current external technical fact', () => {
    expect(
      shouldConsultResearch(
        'Verify current boardgame.io capability relevant to simultaneous Draft transactions.',
      ),
    ).toBe(true);
  });

  it('allows Research for reference-game analysis', () => {
    expect(
      shouldConsultResearch(
        'Study Shards of Infinity for turn-level mechanics that might inspire card text.',
      ),
    ).toBe(true);
  });

  it('does not recommend Research for a typography decision', () => {
    expect(shouldConsultResearch('Should HUD body copy use Inter?')).toBe(false);
  });
});

describe('Research authority', () => {
  it('keeps external evidence below canonical and harness-verified evidence', () => {
    expect(evidenceAuthorityRank('CANONICAL')).toBeGreaterThan(
      evidenceAuthorityRank('HARNESS_VERIFIED_EVIDENCE'),
    );
    expect(evidenceAuthorityRank('HARNESS_VERIFIED_EVIDENCE')).toBeGreaterThan(
      evidenceAuthorityRank('USER_CURATED_REFERENCE_GUIDANCE'),
    );
    expect(evidenceAuthorityRank('USER_CURATED_REFERENCE_GUIDANCE')).toBeGreaterThan(
      evidenceAuthorityRank('EXTERNAL_RESEARCH_EVIDENCE'),
    );
    expect(evidenceAuthorityRank('EXTERNAL_RESEARCH_EVIDENCE')).toBeGreaterThan(
      evidenceAuthorityRank('MODEL_CLAIM'),
    );
    expect(externalCannotOverrideCanonical()).toBe(true);
  });

  it('does not let Reddit opinion become canonical', () => {
    const reddit = evidence({
      evidence_id: 'ev-reddit',
      source_type: 'COMMUNITY_DISCUSSION',
      source_quality: 'COMMUNITY_SIGNAL',
      url: 'https://www.reddit.com/r/slaythespire/',
      canonical_ids_related: ['RULE-DECK-001'],
    });
    expect(communitySignalCannotBecomeCanonical(reddit.source_quality)).toBe(true);
    expect(reddit.authority).toBe('EXTERNAL_RESEARCH_EVIDENCE');
  });

  it('lets official library docs inform external facts without project authority', () => {
    const docs = evidence({
      evidence_id: 'ev-docs',
      source_type: 'OFFICIAL_DOCUMENTATION',
      source_quality: 'PRIMARY_HIGH',
      title: 'boardgame.io docs',
      url: 'https://boardgame.io/documentation/',
    });
    expect(officialDocsInformExternalFact(docs)).toBe(true);
    expect(officialDocsAreNotProjectAuthority(docs)).toBe(true);
  });

  it('cannot create a WorkPackage, canonical mutation, or execution', () => {
    const routed = routeResearchResponse(researchResponse());
    expect(researchCreatesWorkPackages(researchResponse())).toEqual([]);
    expect(routed.queues.implementation).toEqual([]);
    expect(routed.queues.approval).toEqual([]);
    expect(routed.queues.contract_request).toEqual([]);
    expect(routed.queues.conflict).toEqual([]);
    expect(routed.queues.candidate).toEqual([]);
    expect(() => assertPlanningOnly()).toThrow(/Execution agents are not activated/);
  });

  it('gives Research retrieval tools but no agent or mutation tools', () => {
    const team = createPlanningTeam(testConfig(), emptyRuntime());
    const names = toolNames(team.specialistAgents.research);
    expect(names).toEqual(expect.arrayContaining(['resourceLibrary', 'retrieveApprovedUrl']));
    expect(names).not.toEqual(expect.arrayContaining(Object.values(SPECIALIST_TOOL_NAMES)));
    expect(names.some((name) => ['shell', 'apply_patch', 'filesystem', 'git_push'].includes(name))).toBe(
      false,
    );
    expect(team.specialistAgents.research.handoffs).toEqual([]);
  });
});

describe('Research budgets', () => {
  it('enforces the Research call limit without spending Reviewer budget', () => {
    const tracker = new BudgetTracker({
      ...testConfig().budget,
      max_research_calls: 1,
      max_total_agent_calls: 8,
    });
    tracker.consumeAgentCall('astra');
    tracker.consumeAgentCall('research');
    expect(tracker.snapshot().research_calls).toBe(1);
    expect(tracker.snapshot().review_calls).toBe(0);
    expect(() => tracker.consumeAgentCall('research')).toThrow(BudgetExhaustedError);
    expect(tracker.exhausted).toBe('MAX_RESEARCH_CALLS');
  });

  it('still enforces the total-agent budget', () => {
    const tracker = new BudgetTracker({
      ...testConfig().budget,
      max_research_calls: 2,
      max_total_agent_calls: 2,
    });
    tracker.consumeAgentCall('astra');
    tracker.consumeAgentCall('research');
    expect(() => tracker.consumeAgentCall('specialist')).toThrow(/MAX_TOTAL_AGENT_CALLS/);
  });

  it('bounds sources, findings, and recommendations', () => {
    const budget = testConfig().budget;
    expect(() =>
      validateResearchResponse(
        researchResponse({
          evidence: Array.from({ length: budget.max_research_sources + 1 }, (_, index) =>
            evidence({ evidence_id: `ev-${index}` }),
          ),
        }),
        researchAssignment,
        budget,
      ),
    ).toThrow(/sources/);
    expect(() =>
      validateResearchResponse(
        researchResponse({
          observations: Array.from({ length: budget.max_research_findings + 1 }, (_, index) => ({
            statement: `Observation ${index}`,
            evidence_ids: ['ev-1'],
            kind: 'INSPIRATION' as const,
          })),
        }),
        researchAssignment,
        budget,
      ),
    ).toThrow(/observations/);
    expect(() =>
      validateResearchResponse(
        researchResponse({
          recommendations: Array.from({ length: 4 }, (_, index) => ({
            title: `Idea ${index}`,
            rationale: 'over limit',
            priority: 'low' as const,
            evidence_ids: ['ev-1'],
          })),
        }),
        researchAssignment,
        budget,
      ),
    ).toThrow(/recommendations/);
  });

  it('does not trigger Reviewer from Research evidence or recommendations alone', () => {
    const result = validateOrchestrationResult({
      ...hudSmokeOrchestrationResult(),
      objective: 'Study Shards of Infinity for card-text inspiration.',
      research_evidence: [evidence({ evidence_id: 'ev-1' })],
      research_observations: researchResponse().observations,
      candidate_proposals: [],
      work_packages: [workPackage({ authority_level: 'ADVISORY' })],
    });
    expect(detectReviewTriggers(result, { objective: result.objective })).toEqual([]);
  });
});

describe('Research packet bounds', () => {
  it('includes only Research evidence the reviewed artifact relied on', () => {
    const ten = Array.from({ length: 10 }, (_, index) =>
      evidence({ evidence_id: `ev-${index + 1}`, title: `Source ${index + 1}` }),
    );
    const result = validateOrchestrationResult({
      ...hudSmokeOrchestrationResult(),
      objective: 'Review a candidate that cites two research records.',
      summary: 'Adopt ev-2 and ev-7 only.',
      decisions: ['Keep ev-2 and ev-7 as inspiration.'],
      research_evidence: ten,
      work_packages: [
        workPackage({
          authority_level: 'IMPLEMENTATION',
          approval_required: true,
          dependencies: ['Relies on ev-2 and ev-7'],
        }),
      ],
    });
    const selected = selectResearchEvidenceForReview(ten, ['ev-2', 'ev-7']);
    expect(selected).toHaveLength(2);
    expect(selected.map((item) => item.evidence_id)).toEqual(['ev-2', 'ev-7']);
    const packet = buildReviewPacket(
      result,
      ['IMPLEMENTATION_CANDIDATE'],
      emptyRuntime().canonical,
      'rev-research',
    );
    expect(packet.research_evidence).toHaveLength(2);
    expect(packet.research_evidence.map((item) => item.evidence_id).sort()).toEqual(['ev-2', 'ev-7']);
  });
});

describe('Resource Library preference', () => {
  it('finds curated Shards of Infinity references', () => {
    const matches = queryResourceLibrary(loadResourceLibrary(), {
      query: 'Shards of Infinity',
      tags: ['shards-of-infinity'],
    });
    expect(matches.some((item) => item.url.includes('shards-of-infinity'))).toBe(true);
    expect(matches.every((item) => item.tags.includes('shards-of-infinity'))).toBe(true);
  });
});

describe('Research specialist availability', () => {
  it('registers Research on Astra without making it the default', () => {
    const team = createPlanningTeam(
      testConfig(),
      emptyRuntime({ objective: 'What is the starting deck?' }),
    );
    expect(toolNames(team.astra)).toContain(SPECIALIST_TOOL_NAMES.research);
    expect(shouldConsultResearch('What is the starting deck?')).toBe(false);
  });

  it('does not change STARTING_DECK', () => {
    expect(startingDeckComposition()).toEqual({ character: 5, crypto: 3, vp: 2, total: 10 });
  });

  it('does not auto-open a deck correction WorkPackage on a Research-only objective', () => {
    const recovered = applyHarnessVerifiedMismatches(
      validateOrchestrationResult({
        ...hudSmokeOrchestrationResult(),
        objective:
          'Study Shards of Infinity for turn-level mechanics that might inspire card text.',
        work_packages: [],
      }),
      collectHarnessVerifiedEvidence(),
      emptyRuntime().canonical,
      'run-research-only',
    );
    expect(recovered.systems_findings.some((item) => item.kind === 'IMPLEMENTATION_MISMATCH')).toBe(
      false,
    );
    expect(recovered.work_packages).toEqual([]);
    expect(
      detectReviewTriggers(recovered, { objective: recovered.objective }),
    ).not.toContain('IMPLEMENTATION_CANDIDATE');
  });
});
