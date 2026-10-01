/**
 * V3 delivery constants. Planning-harness caps in src/swarm remain per SDK run.
 */

export const V3_VERSION = '3.0.0';
export const CANONICAL_VERSION = '2.0.0';
export const API_CEILING_USD = 200;
export const AUTONOMOUS_CONFIDENCE_CHECKPOINT = 0.8;
export const MAX_WORKPACKAGE_REPAIR_ATTEMPTS = 3;
export const SDK_DEFAULT_MAX_TURNS = 10;

export const STOP_NONE = 'NONE';
export const STOP_HUMAN_CHECKPOINT = 'HUMAN_DIRECTION_CHECKPOINT';
export const STOP_BUDGET = 'BUDGET_LIMIT';
export const STOP_RULE_DECISION = 'HUMAN_RULE_DECISION_REQUIRED';
export const STOP_AUTHORITY = 'AUTHORITY_BLOCK';
export const STOP_TECHNICAL = 'UNRECOVERABLE_TECHNICAL_BLOCKER';
export const STOP_USER_CANCELLED = 'USER_CANCELLED';
export const STOP_HOST_LIMITATION = 'LONG_RUNNING_HOST_LIMITATION';

export type StopReason =
  | typeof STOP_NONE
  | typeof STOP_HUMAN_CHECKPOINT
  | typeof STOP_BUDGET
  | typeof STOP_RULE_DECISION
  | typeof STOP_AUTHORITY
  | typeof STOP_TECHNICAL
  | typeof STOP_USER_CANCELLED
  | typeof STOP_HOST_LIMITATION;

export const VALID_AUTONOMOUS_STOPS: readonly StopReason[] = [
  STOP_HUMAN_CHECKPOINT,
  STOP_BUDGET,
  STOP_RULE_DECISION,
  STOP_AUTHORITY,
  STOP_TECHNICAL,
  STOP_USER_CANCELLED,
];

export const STALL_REASSESS_AFTER = 2;
export const STALL_UNRECOVERABLE_AFTER = 20;
export const REPLAN_PREFIX = 'replan:';
export const MIN_FRESH_SUBSTANTIVE_ITERATIONS = 3;
export const MIN_FRESH_ASTRA_INVOCATIONS = 1;
export const MIN_FRESH_SPECIALIST_INVOCATIONS = 1;

export const SCORE_WEIGHTS = {
  implementation_completeness: 0.14,
  runtime_correctness: 0.12,
  e2e_playability: 0.12,
  ux_comprehension: 0.1,
  visual_direction: 0.1,
  reference_bar: 0.1,
  effects_system: 0.1,
  integration_stability: 0.08,
  defect_severity: 0.08,
} as const;

export const DEFAULT_OBJECTIVES = [
  'wp-draft-overlay',
  'wp-flight-ondone',
  'wp-effect-registry',
  'wp-original-fx',
  'wp-board-concept',
  'wp-visual-hierarchy',
  'wp-fx-storytelling',
  'wp-collapse-spectacle',
  'wp-card-physicality',
  'wp-table-depth',
  'wp-m8-hardening',
] as const;

export const REPLAN_OBJECTIVES = [
  'wp-visual-hierarchy',
  'wp-fx-storytelling',
  'wp-collapse-spectacle',
  'wp-card-physicality',
  'wp-table-depth',
  'wp-local-causality',
  'wp-visual-pass',
  'wp-m8-hardening',
] as const;

/** Packages reopened when a visual replan fires so Astra cannot only burn critique loops. */
export const VISUAL_REOPEN_OBJECTIVES = [
  'wp-visual-hierarchy',
  'wp-fx-storytelling',
  'wp-collapse-spectacle',
  'wp-card-physicality',
  'wp-table-depth',
  'wp-local-causality',
  'wp-visual-pass',
] as const;
