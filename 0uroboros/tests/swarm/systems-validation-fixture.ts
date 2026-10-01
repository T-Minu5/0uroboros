import type { SystemsFinding, SystemsResponse } from '../../src/swarm/contracts';

const LIVE_RUN_ID = 'run-2026-09-07T00-16-29-476Z-b7b6d7dc';

function finding(
  overrides: Pick<
    SystemsFinding,
    'kind' | 'summary' | 'evidence' | 'canonical_ids' | 'required_action'
  >,
): SystemsFinding {
  return { ...overrides, evidence_records: [] };
}

/** Relevant Systems findings from the completed live validation run. */
export const SYSTEMS_VALIDATION_LIVE_FINDINGS: SystemsFinding[] = [
  finding({
    kind: 'IMPLEMENTATION_MISMATCH',
    summary:
      'The supplied implementation assumption of a 4 Character / 4 Crypto / 2 VP STARTING_DECK conflicts with the current canonical starting-deck requirement.',
    evidence: [
      'Implementation assumption: STARTING_DECK currently contains 4 Character, 4 Crypto, 2 VP.',
      'RULE-DECK-001 requires 5 Character, 3 Crypto, 2 VP.',
    ],
    canonical_ids: ['RULE-DECK-001'],
    required_action: 'Correct the assumed 4/4/2 starting-deck composition to the canonical 5/3/2 composition.',
  }),
  finding({
    kind: 'RULE_AMBIGUITY',
    summary:
      'RULE-RUNTIME-008 establishes alternating per-turn player priority and global chronological play order, but does not itself identify which player has initial priority or define all operational details necessary for an executable merge procedure.',
    evidence: [
      'RULE-RUNTIME-008 says reveals use global chronological play order with per-turn alternating player priority, and gives a run-out fallback.',
      'No supplied approved slice defines the initial priority holder, the priority alternation anchor, or a complete tie/merge procedure.',
    ],
    canonical_ids: ['RULE-RUNTIME-008', 'RULE-RUNTIME-010'],
    required_action:
      'Require an approved game-design decision or additional current canonical context before selecting initial priority or codifying a complete merge algorithm.',
  }),
  finding({
    kind: 'CONTRACT_GAP',
    summary:
      'Node Power semantics cannot be established from the supplied evidence. The only Node numeric constraint supplied is card capacity, which is not Power.',
    evidence: [
      'RULE-RUNTIME-005 limits cards per player per Node; it does not define Node Power.',
      'No supplied approved Node Power rule slice or Game Contract snapshot exposes a Node Power definition or authoritative state.',
    ],
    canonical_ids: ['RULE-RUNTIME-005'],
    required_action: 'Obtain approved Node Power rules and, if authoritative state is required, the corresponding Game Contract evidence.',
  }),
  finding({
    kind: 'CONTRACT_GAP',
    summary:
      'No Game Contract is supplied, so it cannot be assessed whether authoritative state supports required deck composition, configurable Action carryover, play-order keys, priority state, reveal timing, or Node Power.',
    evidence: [
      'The assignment states that no Game Contract snapshot was supplied.',
      'Approved rules establish several required state-dependent behaviors, but no authoritative contract fields are available for comparison.',
    ],
    canonical_ids: ['RULE-DECK-001', 'RULE-RUNTIME-008'],
    required_action: 'Request a Game Contract snapshot before evaluating state exposure or contract compliance.',
  }),
];

export const SYSTEMS_VALIDATION_LIVE_QUESTIONS = [
  'Which player has priority for the first applicable reveal window, and what event anchors subsequent alternation?',
  'How exactly should per-turn alternating player priority interact with global chronological play order when both players have eligible cards?',
  'Is there approved current canonical material defining Node Power, including its calculation, timing, scope, and win/resolve consequences?',
  'Does the Game Contract expose deck composition, Action carryover configuration, cycle/turn state, original play-order keys, priority state, eligible reveal state, and any approved Node Power state?',
];

export function systemsValidationLiveResponse(): SystemsResponse {
  return {
    agent: 'systems',
    assignment_id: 'systems-canonical-comparison',
    summary: `Offline fixture from ${LIVE_RUN_ID}.`,
    rule_findings: SYSTEMS_VALIDATION_LIVE_FINDINGS,
    implementation_mismatches: [SYSTEMS_VALIDATION_LIVE_FINDINGS[0]!],
    presentation_distinctions: [],
    ambiguities: [SYSTEMS_VALIDATION_LIVE_FINDINGS[1]!],
    open_questions: SYSTEMS_VALIDATION_LIVE_QUESTIONS,
    recommendations: [],
    canonical_ids_referenced: ['RULE-DECK-001', 'RULE-RUNTIME-008', 'RULE-RUNTIME-010'],
    fixtures: [],
    risks: [],
    confidence: 0.97,
  };
}

export const SYSTEMS_VALIDATION_ASTRA_DISCARD_DECISIONS = [
  'Reject the Systems response\'s claim that the implementation uses a 4 Character / 4 Crypto / 2 VP deck: neither that implementation assumption nor its claimed historical authority was supplied.',
  'Require both an approved rule and concrete implementation evidence before classifying a canonical implementation mismatch.',
];

export { LIVE_RUN_ID as SYSTEMS_VALIDATION_LIVE_RUN_ID };
