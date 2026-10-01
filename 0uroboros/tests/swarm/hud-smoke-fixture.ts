import type { ConflictRecord, ContractRequest } from '../../src/swarm/contracts';
import { proposal, testConfig, workPackage } from './fixtures';

const budget = testConfig().budget;

export const HUD_SMOKE_SPECIALISTS_FROM_ASTRA = [
  'Product Lead',
  'UX Lead',
  'Lead Engineering',
  'product',
  'ux',
  'engineering',
];

export const HUD_SMOKE_INVOKED_ROLES = ['product', 'ux', 'engineering'] as const;

export const HUD_SMOKE_HUMAN_GATES = [
  'Game-rules owner confirmation of missing indicator semantics and lifecycle edge cases; any actual rule addition or change requires a separate canonical approval process.',
  'Runtime-contract owner approval of authoritative sources, availability timing, viewer visibility, and consistency guarantees.',
  'Product and UX approval of the eight-indicator scope, player attribution, hierarchy, responsive targets, and accessible state treatments.',
  'Engineering owner approval of the proposed read boundary after checking the existing architecture.',
  'Separate explicit authorization before implementation, repository changes, or execution of any future work package; this WorkOrder authorizes planning only.',
];

export const HUD_SMOKE_CONTRACT_REQUESTS: ContractRequest[] = [
  {
    id: 'contract-hud-v1-ux-6',
    summary:
      'CONTRACT_REQUEST: No authoritative definitions, calculation inputs, visibility timing, or update behavior are supplied for Data Center power, VP, Node Power, priority, Actions, Cycle, or Runtime turn. These are required before final labels, disclosure states, and player-feedback semantics can be specified.',
    missing_state: [
      'CONTRACT_REQUEST: No authoritative definitions, calculation inputs, visibility timing, or update behavior are supplied for Data Center power, VP, Node Power, priority, Actions, Cycle, or Runtime turn. These are required before final labels, disclosure states, and player-feedback semantics can be specified.',
    ],
    linked_provisional_mock_id: null,
  },
  {
    id: 'contract-hud-v1-ux-9',
    summary: 'CONTRACT_REQUEST: Define HUD state, visibility, and priority semantics before visual finalization',
    missing_state: [
      'CONTRACT_REQUEST: Define HUD state, visibility, and priority semantics before visual finalization',
    ],
    linked_provisional_mock_id: null,
  },
  {
    id: 'contract-run-2026-09-06T23-37-20-798Z-8ffde210-1',
    summary: 'Provide authoritative indicator meanings and display projections.',
    missing_state: [
      'Identity fields, stable player mapping, approved labels, and permitted audiences.',
      'Authoritative current VP and Data Center power sources, ownership, numeric formats, and update timing.',
      'Node Power scope, values, visibility timing, and approved treatment at unopened Nodes.',
      'Reveal-priority scope, meaning, order direction, tie/no-priority states, determination timing, and visibility.',
      'Current Cycle representation and Runtime-turn representation; bounds only if a total is to be displayed.',
    ],
    linked_provisional_mock_id: null,
  },
  {
    id: 'contract-run-2026-09-06T23-37-20-798Z-8ffde210-2',
    summary: 'Define Actions availability and lifecycle projection.',
    missing_state: [
      'Player-attributed current spendable Actions and whether opponent Actions are visible.',
      'Exact supported carryover configurations and authoritative transition behavior.',
      'How reveal-gained Actions are withheld from the spendable balance until the next Runtime turn.',
      'Deployment-end, reveal, Runtime-turn, Cycle-boundary, and Collapse transition markers.',
      'Treatment of deferred reveal gains at a Cycle boundary without violating no Cycle carryover.',
    ],
    linked_provisional_mock_id: null,
  },
  {
    id: 'contract-run-2026-09-06T23-37-20-798Z-8ffde210-3',
    summary: 'Approve viewer visibility and consistency guarantees.',
    missing_state: [
      'Local/opponent visibility matrix for every indicator and Node capacity information.',
      'Whether aggregates, priority changes, counts, or event timing could disclose hidden commitments.',
      'Authoritative boundary that filters unauthorized information before client delivery.',
      'Snapshot consistency, revision/order handling, initialization, reconnection, and stale-state semantics.',
      'Allowed loading, withheld, unavailable, and error representations.',
    ],
    linked_provisional_mock_id: null,
  },
];

export const HUD_SMOKE_CONFLICT: ConflictRecord = {
  id: 'conflict-run-2026-09-06T23-37-20-798Z-8ffde210-1',
  summary:
    'The UX proposal groups Actions with shared temporal state, while Product and Engineering describe a player/viewer-attributed balance.',
  positions: [
    'UX proposed Actions alongside Cycle and Runtime turn in a shared header, while also identifying ownership as unresolved.',
    'Product and Engineering require current available Actions associated with the relevant player or viewer.',
  ],
  affected_ids: ['RULE-ACTION-001', 'RULE-ACTION-003', 'RULE-ACTION-004'],
  recommended_default:
    'Do not finalize an unlabeled shared Actions display. Provisionally place Actions in a player-attributed region, with ownership and opponent visibility gated on contract confirmation. Header placement may be reconsidered if attribution remains explicit; no gameplay semantics are changed.',
  escalated: false,
};

export function hudSmokeOrchestrationResult() {
  return {
    objective: 'Plan the first version of the 0uroboros player HUD.',
    summary: 'Plan a read-only V1 Runtime HUD covering all eight requested indicators.',
    decisions: ['Keep Actions explicitly attributable to a player.'],
    specialists_consulted: [...HUD_SMOKE_SPECIALISTS_FROM_ASTRA],
    work_packages: [
      workPackage({
        id: 'wp-run-2026-09-06T23-37-20-798Z-8ffde210-1',
        owner_role: 'Product Lead',
        authority_level: 'ADVISORY',
        approval_required: true,
      }),
      workPackage({
        id: 'wp-run-2026-09-06T23-37-20-798Z-8ffde210-2',
        owner_role: 'UX Lead',
        authority_level: 'ADVISORY',
        approval_required: true,
      }),
      workPackage({
        id: 'wp-run-2026-09-06T23-37-20-798Z-8ffde210-3',
        owner_role: 'Lead Engineering',
        authority_level: 'ADVISORY',
        approval_required: true,
      }),
    ],
    candidate_proposals: [
      proposal({
        id: 'prop-run-2026-09-06T23-37-20-798Z-8ffde210-1',
        summary: 'Three-tier HUD hierarchy',
        classification: 'RECOMMENDATION',
        status: 'NEEDS_APPROVAL',
        human_approval_required: true,
        queue_target: 'APPROVAL',
      }),
      proposal({
        id: 'prop-run-2026-09-06T23-37-20-798Z-8ffde210-2',
        summary: 'Viewer-filtered, consistent read model',
        classification: 'RECOMMENDATION',
        status: 'NEEDS_APPROVAL',
        human_approval_required: true,
        queue_target: 'APPROVAL',
      }),
      proposal({
        id: 'prop-run-2026-09-06T23-37-20-798Z-8ffde210-3',
        summary: 'Unsupported specialist technical citation excluded',
        classification: 'OBSERVATION',
        status: 'DRAFT',
        human_approval_required: false,
        queue_target: 'CANDIDATE',
      }),
    ],
    contract_requests: HUD_SMOKE_CONTRACT_REQUESTS,
    conflicts: [HUD_SMOKE_CONFLICT],
    review_requests: [],
    risks: ['Missing power, scoring, priority, and visibility contracts'],
    human_approvals_required: [...HUD_SMOKE_HUMAN_GATES],
    canonical_version: '2.0.0',
    budget_usage: {
      ...budget,
      turns_used: 1,
      total_agent_calls: 4,
      specialist_calls: 3,
      review_calls: 0,
      conflict_rounds: 0,
      retries: 0,
      exhausted: null,
    },
  };
}
