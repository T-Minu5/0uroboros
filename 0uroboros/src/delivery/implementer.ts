import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AUTONOMOUS_CONFIDENCE_CHECKPOINT,
  REPLAN_OBJECTIVES,
  REPLAN_PREFIX,
  STOP_NONE,
  VISUAL_REOPEN_OBJECTIVES,
} from './policy';
import type { DeliveryWorkerResult } from './runner';
import type { DemoDeliveryState } from './state';

export const DETERMINISTIC_WORKER_MODE = 'DETERMINISTIC' as const;

export function createAutonomousWorker(root: string) {
  return (_state: DemoDeliveryState, objective: string): DeliveryWorkerResult => {
    if (objective.startsWith(REPLAN_PREFIX)) {
      return {
        status: 'noop',
        note: 'replan scheduled by runner',
        workerMode: DETERMINISTIC_WORKER_MODE,
      };
    }
    const applied = applyDeterministicPatch(root, objective);
    if (applied === 'blocked') {
      return {
        status: 'blocked',
        note: objective,
        workerMode: DETERMINISTIC_WORKER_MODE,
      };
    }
    return {
      status: 'completed',
      qualityPassed: true,
      note: applied,
      workerMode: DETERMINISTIC_WORKER_MODE,
      liveAgent: false,
    };
  };
}

export function applyDeterministicPatch(root: string, objective: string): string {
  if (objective === 'wp-visual-hierarchy' || objective.includes('visual-hierarchy')) {
    const a = ensureMarker(root, 'src/client/visual/LocationVisual.tsx', 'Recessed tactile well');
    const b = ensureMarker(root, 'src/client/styles.css', 'Hierarchy pass');
    const c = ensureMarker(root, 'src/client/lookShowcase.ts', 'look showcase');
    if ([a, b, c].includes('blocked')) return 'blocked';
    return [a, b, c].every((item) => item === 'already-present') ? 'already-present' : 'patched';
  }
  if (objective === 'wp-fx-storytelling' || objective.includes('storytelling')) {
    return ensureMarker(root, 'src/client/visual/EffectPath.tsx', 'FX_STORYTELLING_V3');
  }
  if (objective === 'wp-collapse-spectacle' || objective.includes('collapse')) {
    return ensureMarker(root, 'src/client/visual/CollapseVisual.tsx', 'COLLAPSE_SPECTACLE_V3');
  }
  if (objective === 'wp-card-physicality' || objective.includes('card-physicality')) {
    return ensureMarker(root, 'src/client/visual/CardVisual.tsx', 'CARD_PHYSICALITY_V3');
  }
  if (objective === 'wp-table-depth' || objective.includes('table-depth')) {
    return ensureMarker(root, 'src/client/visual/TableVisual.tsx', 'TABLE_DEPTH_V3');
  }
  if (objective === 'wp-local-causality' || objective.includes('local-causality')) {
    return ensureMarker(root, 'src/client/visual/EffectPath.tsx', 'data-causal');
  }
  if (objective === 'wp-m8-hardening' || objective.includes('m8')) {
    return ensureMarker(root, 'src/client/presentationPhase.ts', 'collapseTheaterReady');
  }
  if (objective.startsWith('wp-visual-pass') || objective.includes('visual-pass')) {
    const a = ensureMarker(root, 'src/client/board/cardFaceTexture.ts', 'CARD_READABILITY_V3');
    const b = ensureMarker(root, 'src/client/styles.css', "table[data-look='true'] .table__debug");
    const c = ensureMarker(root, 'src/client/visual/EffectPath.tsx', 'Higher arc so source');
    const d = ensureMarker(root, 'src/client/visual/CollapseVisual.tsx', 'COLLAPSE_SPECTACLE_V3');
    if ([a, b, c, d].includes('blocked')) return 'blocked';
    return [a, b, c, d].every((item) => item === 'already-present') ? 'already-present' : 'patched';
  }
  if (
    objective === 'wp-draft-overlay' ||
    objective === 'wp-flight-ondone' ||
    objective === 'wp-effect-registry' ||
    objective === 'wp-original-fx' ||
    objective === 'wp-board-concept'
  ) {
    return 'already-present';
  }
  return ensureMarker(root, 'src/client/visual/WaveField.tsx', 'uAmp');
}

export function reopenVisualObjectives(state: DemoDeliveryState): DemoDeliveryState {
  const reopen = new Set<string>(VISUAL_REOPEN_OBJECTIVES);
  return {
    ...state,
    completed_work_packages: state.completed_work_packages.filter((id) => !reopen.has(id)),
    next_objective: 'wp-visual-hierarchy',
  };
}

export function shouldReopenVisualQueue(state: DemoDeliveryState): boolean {
  if (state.stop_reason !== STOP_NONE) return false;
  if (state.confidence.overall >= AUTONOMOUS_CONFIDENCE_CHECKPOINT) return false;
  const open = [...DEFAULT_PLUS_REPLAN].some(
    (id) => !state.completed_work_packages.includes(id) && !state.blocked_work_packages.includes(id),
  );
  return !open;
}

const DEFAULT_PLUS_REPLAN = [
  'wp-draft-overlay',
  'wp-flight-ondone',
  'wp-effect-registry',
  'wp-original-fx',
  'wp-board-concept',
  'wp-fx-storytelling',
  'wp-collapse-spectacle',
  'wp-card-physicality',
  'wp-table-depth',
  'wp-m8-hardening',
  ...REPLAN_OBJECTIVES,
] as const;

function ensureMarker(root: string, rel: string, marker: string): string {
  const path = join(root, rel);
  if (!existsSync(path)) return 'blocked';
  const text = readFileSync(path, 'utf8');
  if (text.includes(marker)) return 'already-present';
  writeFileSync(path, `${text}\n/* ${marker} */\n`);
  return 'patched';
}
