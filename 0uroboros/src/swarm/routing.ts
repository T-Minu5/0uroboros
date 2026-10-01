import type { AdvisoryRole } from './contracts';
import {
  type ConflictKind,
  type ConflictRecord,
  type ContractRequest,
  type ContractRequestDisposition,
  type HumanGateKind,
  type OrchestrationResult,
  type PlanningItem,
  type ProposalEnvelope,
  type RunQueues,
  type WorkPackage,
} from './contracts';

export const SPECIALIST_DISPLAY_NAMES: Record<AdvisoryRole, string> = {
  product: 'Product Lead',
  ux: 'UX Lead',
  engineering: 'Lead Engineering',
  systems: 'Systems / Rules',
  research: 'Competitive Research',
  lookdev: 'LookDev / Motion',
  content: 'Content',
  worldbuilding: 'Worldbuilding',
  reviewer: 'Game Design Reviewer',
};

const SPECIALIST_ROLE_ALIASES: Record<string, AdvisoryRole> = {
  product: 'product',
  'product lead': 'product',
  ux: 'ux',
  'ux lead': 'ux',
  engineering: 'engineering',
  'lead engineering': 'engineering',
  'lead engineer': 'engineering',
  systems: 'systems',
  'systems / rules': 'systems',
  'systems/rules': 'systems',
  research: 'research',
  'competitive research': 'research',
  'competitive reference research': 'research',
  lookdev: 'lookdev',
  'lookdev / motion': 'lookdev',
  'lookdev/motion': 'lookdev',
  content: 'content',
  'content specialist': 'content',
  worldbuilding: 'worldbuilding',
  'world building': 'worldbuilding',
  reviewer: 'reviewer',
  'game design reviewer': 'reviewer',
};

export function resolveSpecialistRole(value: string): AdvisoryRole | null {
  return SPECIALIST_ROLE_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function normalizeSpecialistsConsulted(invokedRoles: string[]): {
  display_names: string[];
  role_ids: AdvisoryRole[];
} {
  const roles: AdvisoryRole[] = [];
  const seen = new Set<AdvisoryRole>();
  for (const raw of invokedRoles) {
    const role = resolveSpecialistRole(raw);
    if (!role || seen.has(role)) continue;
    seen.add(role);
    roles.push(role);
  }
  return {
    display_names: roles.map((role) => SPECIALIST_DISPLAY_NAMES[role]),
    role_ids: roles,
  };
}

const AUTHORITATIVE_CONTRACT_FIELDS: ReadonlyArray<{
  id: string;
  aliases: string[];
  systems?: boolean;
}> = [
  { id: 'match.cycle', aliases: ['cycle', 'current cycle'] },
  { id: 'match.phase', aliases: ['phase', 'subphase'] },
  { id: 'runtime.turn', aliases: ['runtime turn', 'current runtime turn', 'turn'] },
  {
    id: 'runtime.priority',
    aliases: ['priority', 'reveal priority', 'reveal-priority'],
    systems: true,
  },
  { id: 'runtime.actions', aliases: ['actions', 'action', 'spendable actions'] },
  {
    id: 'runtime.action_carryover',
    aliases: ['carryover', 'action carryover', 'reveal-gained actions'],
    systems: true,
  },
  { id: 'player.vp', aliases: ['vp', 'current vp', 'victory point', 'victory points'] },
  {
    id: 'data_centers.primary',
    aliases: ['data center', 'data center power', 'primary current', 'primary max'],
  },
  { id: 'data_centers.backup', aliases: ['backup current', 'backup max'] },
  {
    id: 'nodes.power',
    aliases: [
      'node power',
      'node_power',
      'p1/p2 power',
      'p1 power',
      'p2 power',
      'node p1 power',
      'node p2 power',
      'player power at a node',
      'total power at a node',
    ],
    systems: true,
  },
  { id: 'nodes.priority', aliases: ['node priority'], systems: true },
  { id: 'nodes.status', aliases: ['opened nodes', 'unopened nodes', 'node status'] },
  { id: 'nodes.capacity', aliases: ['capacity', 'remaining slots'] },
  {
    id: 'views.public_private',
    aliases: ['visibility', 'viewer visibility', 'public view', 'owner-private', 'opponent visibility'],
    systems: true,
  },
  {
    id: 'events.sequence',
    aliases: ['sequence', 'snapshot', 'revision', 'reconnect', 'consistency', 'event sequence'],
  },
  { id: 'player.identity', aliases: ['player identity', 'player mapping', 'p1', 'p2'] },
];

const PRESENTATION_RE =
  /\d{1,3}(?:,\d{3})+\s*\/\s*\d|\d+\s*\/\s*\d+|formatted (?:ratio|string|display)|display string|comma[- ]separated|loading (?:state|chrome|spinner)|error (?:chrome|representation)|interpolation|hover|animation progress|shader|typography label/i;

const CLIENT_SIDE_RE =
  /\b(?:approved labels?|label copy|player-facing label|loading|withheld chrome|unavailable representation|error representation|hover|animation|typography|text scaling)\b/i;

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function matchContractFields(text: string): {
  ids: string[];
  systems: boolean;
} {
  const haystack = normalizeText(text);
  const ids: string[] = [];
  let systems = false;
  for (const field of AUTHORITATIVE_CONTRACT_FIELDS) {
    if (field.aliases.some((alias) => haystack.includes(alias))) {
      ids.push(field.id);
      if (field.systems) systems = true;
    }
  }
  return { ids: [...new Set(ids)], systems };
}

export function classifyContractClaim(text: string): {
  disposition: ContractRequestDisposition;
  mapped_fields: string[];
} {
  if (PRESENTATION_RE.test(text)) {
    return { disposition: 'DERIVED_PRESENTATION', mapped_fields: [] };
  }
  const mapped = matchContractFields(text);
  if (CLIENT_SIDE_RE.test(text) && mapped.ids.length === 0) {
    return { disposition: 'CLIENT_SIDE', mapped_fields: [] };
  }
  if (mapped.ids.length > 0) {
    return {
      disposition: mapped.systems ? 'NEEDS_SYSTEMS' : 'ALREADY_IN_CONTRACT',
      mapped_fields: mapped.ids,
    };
  }
  if (CLIENT_SIDE_RE.test(text)) {
    return { disposition: 'CLIENT_SIDE', mapped_fields: [] };
  }
  return { disposition: 'GENUINELY_MISSING', mapped_fields: [] };
}

export function classifyContractRequest(request: ContractRequest): ContractRequest {
  const claims = [request.summary, ...request.missing_state];
  const classified = claims.map(classifyContractClaim);
  const mapped_fields = [...new Set(classified.flatMap((item) => item.mapped_fields))];
  const dispositions = new Set(classified.map((item) => item.disposition));
  let disposition: ContractRequestDisposition = 'GENUINELY_MISSING';
  if (dispositions.has('GENUINELY_MISSING') && mapped_fields.length === 0) {
    disposition = 'GENUINELY_MISSING';
  } else if (dispositions.has('NEEDS_SYSTEMS')) {
    disposition = 'NEEDS_SYSTEMS';
  } else if (dispositions.has('ALREADY_IN_CONTRACT')) {
    disposition = 'ALREADY_IN_CONTRACT';
  } else if (dispositions.has('DERIVED_PRESENTATION')) {
    disposition = 'DERIVED_PRESENTATION';
  } else if (dispositions.has('CLIENT_SIDE')) {
    disposition = 'CLIENT_SIDE';
  }
  return { ...request, disposition, mapped_fields };
}

export function isValidContractRequest(request: ContractRequest): boolean {
  const classified = request.disposition
    ? request
    : classifyContractRequest(request);
  return classified.disposition === 'GENUINELY_MISSING';
}

const LAYOUT_RE =
  /\b(group(?:s|ed|ing)?|placement|place|header|layout|alongside|display|visual|hierarchy|region|band|strip|column)\b/i;
const MEANING_RE =
  /\b(meaning is disputed|contradict|incompatible with|two rules|rule says|canonical contradiction|priority meaning)\b/i;

export function classifyConflict(conflict: ConflictRecord): ConflictKind {
  if (conflict.kind) return conflict.kind;
  const text = [conflict.summary, ...conflict.positions].join(' ');
  if (
    conflict.id.startsWith('conflict-stale') ||
    /stale or unknown canonical|does not match current/i.test(text)
  ) {
    return 'STALE_SOURCE';
  }
  if (
    conflict.id === 'conflict-invented-rules' ||
    /invented unstated rule/i.test(text)
  ) {
    return 'GENUINE_CANONICAL';
  }
  const hasMeaning = MEANING_RE.test(text);
  const hasLayout = LAYOUT_RE.test(text);
  if (hasMeaning && !hasLayout) return 'GENUINE_CANONICAL';
  if (hasLayout && !hasMeaning) return 'CROSS_FUNCTIONAL';
  if (hasMeaning) return 'GENUINE_CANONICAL';
  if (/\b(implementation|architecture|read model|api)\b/i.test(text)) {
    return 'IMPLEMENTATION_MISMATCH';
  }
  if (/\b(missing requirement|not supplied|wait for systems)\b/i.test(text)) {
    return 'MISSING_REQUIREMENT';
  }
  return 'CROSS_FUNCTIONAL';
}

export function conflictBelongsOnQueue(kind: ConflictKind): boolean {
  return kind === 'GENUINE_CANONICAL' || kind === 'STALE_SOURCE';
}

export function classifyHumanGate(text: string): HumanGateKind {
  const value = text.toLowerCase();
  if (
    /workorder authorizes planning only|authorizes planning only|separate explicit authorization before implementation/.test(
      value,
    )
  ) {
    return 'STANDING_REMINDER';
  }
  if (
    /confirmation of missing|missing indicator semantics|lifecycle edge cases/.test(value)
  ) {
    return 'OPEN_QUESTION';
  }
  if (
    /runtime-contract owner|authoritative sources|availability timing|consistency guarantees/.test(
      value,
    )
  ) {
    return 'DEPENDENCY';
  }
  if (
    /product and ux approval|eight-indicator scope|hierarchy|responsive targets|accessible state|read boundary|visual treatment|hud copy/.test(
      value,
    )
  ) {
    return 'HUMAN_DESIGN_DECISION';
  }
  if (
    /canonical (?:patch|mutation)|gameplay\/rule|deploy|destructive|tool-authority|repository changes|execution of any future work package/.test(
      value,
    )
  ) {
    return 'AUTHORITY_APPROVAL';
  }
  if (/\b(missing|confirmation|whether|what is|edge case)\b/.test(value)) {
    return 'OPEN_QUESTION';
  }
  return 'HUMAN_DESIGN_DECISION';
}

export function workPackageIsAuthorityGate(workPackage: WorkPackage): boolean {
  return (
    workPackage.authority_level === 'CANONICAL_MUTATION' ||
    workPackage.authority_level === 'DESTRUCTIVE' ||
    workPackage.authority_level === 'IMPLEMENTATION'
  );
}

export function proposalIsAuthorityGate(proposal: ProposalEnvelope): boolean {
  return (
    proposal.rules_changed ||
    proposal.classification === 'POTENTIAL_RULE_CONFLICT'
  );
}

function planningItem(
  id: string,
  reason: string,
  source: PlanningItem['source'],
  kind: PlanningItem['kind'],
): PlanningItem {
  return { id, reason, source, kind };
}

export function classifyGovernance(
  result: OrchestrationResult,
  options: {
    conflictRoundsUsed: number;
    maxConflictRounds: number;
  },
): { result: OrchestrationResult; queues: RunQueues } {
  const open_questions: PlanningItem[] = [];
  const dependencies: PlanningItem[] = [];
  const human_design_decisions: PlanningItem[] = [];
  const approval: RunQueues['approval'] = [];
  const seen = new Set<string>();
  const harnessGateReason =
    /^(WorkPackage |Proposal |Conflict )\S+ (requires approval|exceeded the conflict SLA)/;

  for (const item of [...result.open_questions, ...result.human_design_decisions]) {
    if (item.kind === 'REVISION_REQUIRED') {
      const key = `${item.kind}:${item.reason}`;
      if (!seen.has(key)) {
        seen.add(key);
        open_questions.push(item);
      }
      continue;
    }
    if (item.source === 'systems') {
      const key = `${item.kind}:${item.reason}`;
      if (!seen.has(key)) {
        seen.add(key);
        if (item.kind === 'OPEN_QUESTION') open_questions.push(item);
        else if (item.kind === 'HUMAN_DESIGN_DECISION') human_design_decisions.push(item);
      }
    }
  }

  const pushUnique = (item: PlanningItem): void => {
    const key = `${item.kind}:${item.reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (item.kind === 'OPEN_QUESTION' || item.kind === 'REVISION_REQUIRED') {
      open_questions.push(item);
    } else if (item.kind === 'DEPENDENCY') dependencies.push(item);
    else if (item.kind === 'HUMAN_DESIGN_DECISION') human_design_decisions.push(item);
  };

  const hasActiveAuthorityWork = result.work_packages.some(workPackageIsAuthorityGate);

  for (const workPackage of result.work_packages) {
    if (workPackageIsAuthorityGate(workPackage)) {
      approval.push({
        id: workPackage.id,
        reason: `WorkPackage ${workPackage.id} requires approval before any execution.`,
        source: 'work_package',
      });
    }
  }

  for (const proposal of result.candidate_proposals) {
    if (proposalIsAuthorityGate(proposal)) {
      approval.push({
        id: proposal.id,
        reason: `Proposal ${proposal.id} requires human approval.`,
        source: 'proposal',
      });
      continue;
    }
    if (proposal.human_approval_required || proposal.status === 'NEEDS_APPROVAL') {
      pushUnique(
        planningItem(
          proposal.id,
          proposal.summary,
          'proposal',
          'HUMAN_DESIGN_DECISION',
        ),
      );
    }
  }

  const classifiedConflicts = result.conflicts.map((conflict) => {
    const kind = classifyConflict(conflict);
    const shouldEscalate =
      conflictBelongsOnQueue(kind) &&
      (conflict.escalated || options.conflictRoundsUsed >= options.maxConflictRounds);
    return { ...conflict, kind, escalated: shouldEscalate };
  });

  const queuedConflicts = classifiedConflicts.filter((conflict) =>
    conflictBelongsOnQueue(conflict.kind ?? 'CROSS_FUNCTIONAL'),
  );

  for (const conflict of queuedConflicts) {
    if (conflict.escalated) {
      approval.push({
        id: conflict.id,
        reason: `Conflict ${conflict.id} exceeded the conflict SLA and needs a human decision.`,
        source: 'conflict',
      });
    }
  }

  for (const [index, item] of result.human_approvals_required.entries()) {
    if (harnessGateReason.test(item)) continue;
    const kind = classifyHumanGate(item);
    const id = `gate-${index + 1}`;
    if (kind === 'STANDING_REMINDER') {
      if (hasActiveAuthorityWork) {
        approval.push({
          id,
          reason: item,
          source: 'human_gate',
        });
      }
      continue;
    }
    if (kind === 'AUTHORITY_APPROVAL') {
      approval.push({
        id,
        reason: item,
        source: 'human_gate',
      });
      continue;
    }
    pushUnique(planningItem(id, item, 'human_gate', kind));
  }

  for (const [index, finding] of result.systems_findings.entries()) {
    if (finding.kind !== 'RULE_AMBIGUITY') continue;
    const kind = /human game-design|design decision|\bmel\b/i.test(
      finding.required_action,
    )
      ? 'HUMAN_DESIGN_DECISION'
      : 'OPEN_QUESTION';
    pushUnique(
      planningItem(`systems-finding-${index + 1}`, finding.summary, 'systems', kind),
    );
  }

  const classifiedContracts = result.contract_requests.map(classifyContractRequest);

  const queues: RunQueues = {
    candidate: result.candidate_proposals.filter(
      (proposal) =>
        !proposalIsAuthorityGate(proposal) && proposal.queue_target === 'CANDIDATE',
    ),
    review: result.review_requests,
    contract_request: classifiedContracts.filter(isValidContractRequest),
    conflict: queuedConflicts,
    implementation: result.work_packages.filter(
      (workPackage) => workPackage.authority_level === 'IMPLEMENTATION',
    ),
    approval,
    open_question: open_questions,
    dependency: dependencies,
    human_design_decision: human_design_decisions,
    execution_result: [],
  };

  return {
    result: {
      ...result,
      open_questions,
      dependencies,
      human_design_decisions,
      contract_requests: classifiedContracts,
      conflicts: classifiedConflicts,
    },
    queues,
  };
}
