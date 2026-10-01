/**
 * Persisted DemoDeliveryState. Astra memory is not this store.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  API_CEILING_USD,
  CANONICAL_VERSION,
  STOP_NONE,
  V3_VERSION,
  type StopReason,
} from './policy';

export interface WorkPackageRecord {
  id: string;
  status: 'open' | 'in_progress' | 'completed' | 'blocked' | 'repair';
  repair_attempts: number;
  note?: string;
}

export interface BudgetLedger {
  ceiling_usd: number;
  known_spend_usd: number;
  estimated_spend_usd: number | null;
  unknown_prior: boolean;
  notes: string;
}

export interface ReviewCheckpointScore {
  overall: number;
  dimensions: Record<string, number>;
  gates: Record<string, boolean>;
  evidence: string[];
  blocked_by_gate: boolean;
}

export interface QualityCritique {
  fresh: boolean;
  source: string;
  at: string | null;
  visual_direction: number | null;
  ux_comprehension: number | null;
  reference_bar: number | null;
  spectacle_quality: number | null;
  thematic_cohesion: number | null;
  card_physicality_quality: number | null;
  deficiencies: string[];
  specialists: string[];
  passed_competitive_bar: boolean;
}

export interface FreshCycleEvidence {
  astra_invocations: number;
  specialist_invocations: number;
  live_requests: number;
  substantive_iterations: number;
  quality_critique_at: string | null;
  cycle_spend_usd: number;
  last_invalidation: string | null;
}

export interface DemoDeliveryState {
  mission_id: string;
  v3_version: string;
  canonical_version: string;
  milestone: string;
  implementation_guide_completion: number;
  current_work_packages: WorkPackageRecord[];
  completed_work_packages: string[];
  blocked_work_packages: string[];
  known_defects: string[];
  quality_gate: { last: string; passed: boolean };
  visual_quality: { last: string; passed: boolean };
  effect_reference_coverage: { registry_count: number; inspected: boolean };
  effect_implementation_coverage: { original_svg: boolean; original_r3f_or_shader: boolean };
  budget: BudgetLedger;
  model_usage: Array<{ model: string; calls: number; notes?: string }>;
  active_human_decisions: string[];
  last_successful_integration: string | null;
  next_objective: string | null;
  iteration: number;
  confidence: ReviewCheckpointScore;
  confidence_evidence: string[];
  stop_reason: StopReason;
  paused_for_human: boolean;
  last_agent_final_output: string | null;
  compacted: Record<string, string>;
  replans: number;
  stall_count: number;
  last_score: number;
  last_objective_signature: string | null;
  failed_work_packages: number;
  repairs: number;
  worker_mode: 'LIVE_OPENAI' | 'DETERMINISTIC' | 'NOOP' | null;
  quality_critique: QualityCritique;
  fresh_cycle: FreshCycleEvidence;
  checkpoint_notes: string[];
}

export function defaultDeliveryState(missionId = 'v3-delivery'): DemoDeliveryState {
  return {
    mission_id: missionId,
    v3_version: V3_VERSION,
    canonical_version: CANONICAL_VERSION,
    milestone: 'M7_VISUAL_BAR',
    implementation_guide_completion: 0.55,
    current_work_packages: [],
    completed_work_packages: [],
    blocked_work_packages: [],
    known_defects: [
      'Draft overlay can stay hidden after Collapse if leftover revealQueue blocks theater',
    ],
    quality_gate: { last: 'none', passed: false },
    visual_quality: { last: 'below_competitive_bar', passed: false },
    effect_reference_coverage: { registry_count: 0, inspected: false },
    effect_implementation_coverage: { original_svg: false, original_r3f_or_shader: false },
    budget: {
      ceiling_usd: API_CEILING_USD,
      known_spend_usd: 0,
      estimated_spend_usd: null,
      unknown_prior: true,
      notes:
        'Known spend reconstructed from DEMO_DELIVERY_PLAN notes is $0 OpenAI this LookDev window. Unknown prior swarm runs are not treated as zero.',
    },
    model_usage: [],
    active_human_decisions: [],
    last_successful_integration: null,
    next_objective: 'wp-draft-overlay',
    iteration: 0,
    confidence: emptyScore(),
    confidence_evidence: [],
    stop_reason: STOP_NONE,
    paused_for_human: false,
    last_agent_final_output: null,
    compacted: {},
    replans: 0,
    stall_count: 0,
    last_score: 0,
    last_objective_signature: null,
    failed_work_packages: 0,
    repairs: 0,
    worker_mode: null,
    quality_critique: emptyQualityCritique(),
    fresh_cycle: emptyFreshCycle(),
    checkpoint_notes: [],
  };
}

export function emptyQualityCritique(): QualityCritique {
  return {
    fresh: false,
    source: 'none',
    at: null,
    visual_direction: null,
    ux_comprehension: null,
    reference_bar: null,
    spectacle_quality: null,
    thematic_cohesion: null,
    card_physicality_quality: null,
    deficiencies: [],
    specialists: [],
    passed_competitive_bar: false,
  };
}

export function emptyFreshCycle(): FreshCycleEvidence {
  return {
    astra_invocations: 0,
    specialist_invocations: 0,
    live_requests: 0,
    substantive_iterations: 0,
    quality_critique_at: null,
    cycle_spend_usd: 0,
    last_invalidation: null,
  };
}

export function emptyScore(): ReviewCheckpointScore {
  return {
    overall: 0,
    dimensions: {},
    gates: {},
    evidence: [],
    blocked_by_gate: true,
  };
}

export function deliveryStatePath(root: string): string {
  return join(root, 'tools/agent-harness/delivery/state.json');
}

export function loadDeliveryState(root: string): DemoDeliveryState {
  const path = deliveryStatePath(root);
  if (!existsSync(path)) return defaultDeliveryState();
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as DemoDeliveryState;
  return { ...defaultDeliveryState(parsed.mission_id), ...parsed };
}

export function saveDeliveryState(root: string, state: DemoDeliveryState): void {
  const path = deliveryStatePath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}
