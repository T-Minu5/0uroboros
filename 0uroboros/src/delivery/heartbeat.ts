/**
 * Deterministic heartbeat. Not a model task.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { DemoDeliveryState } from './state';

export interface DeliveryHeartbeat {
  process_started_at: string;
  last_iteration_started: string | null;
  last_iteration_completed: string | null;
  current_iteration: number;
  active_objective: string | null;
  active_specialist: string;
  current_spend_usd: number;
  score: number;
  stop_reason: string;
  pid: number;
  status: 'working' | 'stalled' | 'exited';
}

const startedAt = new Date().toISOString();

export function heartbeatPath(root: string): string {
  return join(root, 'tools/agent-harness/delivery/heartbeat.json');
}

export function writeHeartbeat(
  root: string,
  state: DemoDeliveryState,
  patch: Partial<DeliveryHeartbeat> = {},
): DeliveryHeartbeat {
  const beat: DeliveryHeartbeat = {
    process_started_at: startedAt,
    last_iteration_started: patch.last_iteration_started ?? null,
    last_iteration_completed: patch.last_iteration_completed ?? null,
    current_iteration: state.iteration,
    active_objective: state.next_objective,
    active_specialist: patch.active_specialist ?? 'deterministic',
    current_spend_usd: state.budget.known_spend_usd,
    score: state.confidence.overall,
    stop_reason: state.stop_reason,
    pid: process.pid,
    status: patch.status ?? (state.stop_reason === 'NONE' ? 'working' : 'exited'),
    ...patch,
  };
  const path = heartbeatPath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(beat, null, 2)}\n`);
  return beat;
}
