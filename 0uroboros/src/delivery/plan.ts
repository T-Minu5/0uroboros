/**
 * Authoritative living demo delivery plan.
 * Supersedes the giant starter WorkPackage as the unit of delivery.
 */

import { DEMO_EFFECT_COVERAGE_MATRIX } from './effectCoverage';
import { RUNTIME_V1_RULE_INVARIANTS } from './invariants';
import { STARTER_RECONCILIATION_DISPUTES } from './reviewerDisputes';

export interface DemoDeliveryPlan {
  id: 'DEMO_DELIVERY_PLAN';
  updated_at: string;
  current_implementation_state: string;
  target_demo_state: string;
  active_milestone: string;
  completed_capabilities: string[];
  unresolved_implementation_dependencies: string[];
  known_defects: string[];
  current_work_packages: string[];
  deferred_work: string[];
  effect_coverage_missing: string[];
  estimated_remaining_api_cost: string;
  highest_value_next_action: string;
  superseded_assumptions: string[];
  invariant_count: number;
  reviewer_disputes_closed: number;
}

export function currentDemoDeliveryPlan(): DemoDeliveryPlan {
  const missing = DEMO_EFFECT_COVERAGE_MATRIX.filter((row) => row.engine === 'MISSING').map(
    (row) => row.mechanic,
  );
  return {
    id: 'DEMO_DELIVERY_PLAN',
    updated_at: '2026-09-08T00:45:00.000Z',
    current_implementation_state:
      'M7 visual bar raised: arena table, play-lane wells (not literal columns), art-first cards, high-confidence icons, filament effects, Collapse rings. DEMO_READY is not declared.',
    target_demo_state:
      'A recognizable early 0uroboros table that can be played for several Cycles. DEMO_READY waits for Mel.',
    active_milestone: 'M7_VISUAL_BAR',
    completed_capabilities: [
      'Match setup and mirrored Cycle 1 decks',
      'Runtime Node opening 1-3 / 4 / 5',
      'Deploy, reveal, Collapse, Draft, next Cycle',
      'Generic Drain, probability, Node capacity',
      'Action grants and deploy spend',
      'Approved starter identities 5/3/2',
      'Unnamed Restore Primary-then-Backup',
      'Player-visible Action totals',
      'Browser vertical slice through Cycle 2',
      'Presentation barrier so Cycle 1 cannot show Draft before Collapse',
      'Click/tap inspect; drag never opens inspect',
      'First-party card art as the card object',
      'High-confidence first-party icons in HUD',
      'Play lanes as wells on a sculpted stadium table',
      'V3 long-running delivery runner and 80% checkpoint rubric',
      'Effect-animation registry (reference only) and original SVG/shader families',
    ],
    unresolved_implementation_dependencies: [
      'Broader Effect Coverage content beyond starters',
      'Collapse spectacle still below competitive Snap bar',
    ],
    known_defects: [
      'Unused Actions remain visible during Draft of the same Cycle. They cannot be spent there and clear at the next Cycle.',
      'Lane projection can still drift at extreme split-view aspect ratios.',
      'Automated browser drag does not always arm the hand-rail gesture, so mid-drag ghost still needs a human pointer pass.',
      'Vault Encryption has no matching art file.',
    ],
    current_work_packages: [
      'm7-visual-bar',
      'v3-delivery-runner',
    ],
    deferred_work: [
      'SocketIO remote transport',
      'Broad market content generation',
      'Full effect catalog beyond the first visual language',
      'EffectComposer / singularity distortion as a later theatrical tier',
    ],
    effect_coverage_missing: missing,
    estimated_remaining_api_cost:
      'Ceiling remains $200 and is not reset. This mission spent $0 of OpenAI API: youtube-watch was proxy-blocked; specialist calls were not launched after local LookDev from first-party art.',
    highest_value_next_action:
      'Play Cycle 1 through Collapse into the Draft overlay, then judge original sigil/interference/wavefield against the comps.',
    superseded_assumptions: [
      'One cards.ts-only starter WorkPackage is sufficient.',
      'Action economy can wait until after starter identities.',
      'Reviewer 9-vs-10 roster conflict is a Mel decision.',
      'Memory claim that starting deck is 4/4/2 is current authority.',
      'UX-BOARD-001 five columns means literal 3D column architecture.',
      'FIRST_GAME_LOOK_IMPLEMENTED is an acceptable visual threshold.',
    ],
    invariant_count: RUNTIME_V1_RULE_INVARIANTS.length,
    reviewer_disputes_closed: STARTER_RECONCILIATION_DISPUTES.filter(
      (item) => item.status !== 'open',
    ).length,
  };
}
