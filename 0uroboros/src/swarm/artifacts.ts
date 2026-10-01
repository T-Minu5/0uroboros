import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  OrchestrationResult,
  ReviewPacket,
  ReviewerResponse,
  RunQueues,
  ResearchResponse,
  LookDevResponse,
  ContentResponse,
  WorldbuildingResponse,
  SpecialistResponse,
  SystemsResponse,
  WorkOrder,
  SpecialistFailureRecord,
} from './contracts';
import type { StructuredOutputFailure } from './diagnostics';

export interface RunManifest {
  run_id: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  canonical_version: string;
  configured_models: Record<string, string>;
  actual_models: Record<string, string>;
  fallback_events: string[];
  agents_invoked: string[];
  reviewer_invoked: boolean;
  work_packages_executed: string[];
  status: 'running' | 'completed' | 'stopped' | 'failed';
  stop_reason: string | null;
}

export interface UsageSnapshot {
  run_id: string;
  requests: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  review_calls: number;
  reviewer_invoked: boolean;
  notes: string[];
}

export interface ArtifactStore {
  runId: string;
  dir: string;
  writeJson(name: string, value: unknown): string;
}

export function createRunId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return `run-${stamp}-${randomUUID().slice(0, 8)}`;
}

export function createArtifactStore(
  runId: string,
  cwd: string = process.cwd(),
): ArtifactStore {
  const dir = resolve(cwd, 'tools/agent-harness/runs', runId);
  mkdirSync(dir, { recursive: true });
  return {
    runId,
    dir,
    writeJson(name: string, value: unknown): string {
      const path = join(dir, name);
      writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      return path;
    },
  };
}

export function persistRunArtifacts(
  store: ArtifactStore,
  payload: {
    manifest: RunManifest;
    workOrder: WorkOrder;
    specialistResults: SpecialistResponse[];
    systemsResults?: SystemsResponse[];
    researchResults?: ResearchResponse[];
    lookdevResults?: LookDevResponse[];
    contentResults?: ContentResponse[];
    worldbuildingResults?: WorldbuildingResponse[];
    worldKnowledgePacket?: unknown;
    specialistFailures?: SpecialistFailureRecord[];
    contentFailure?: SpecialistFailureRecord | null;
    worldbuildingFailure?: SpecialistFailureRecord | null;
    orchestrationResult: OrchestrationResult | null;
    queues: RunQueues | null;
    usage: UsageSnapshot;
    errors: unknown[];
    structuredOutputFailure?: StructuredOutputFailure | null;
    reviewPacket?: ReviewPacket | null;
    reviewResult?: ReviewerResponse | null;
  },
): void {
  store.writeJson('manifest.json', payload.manifest);
  store.writeJson('work-order.json', payload.workOrder);
  store.writeJson('specialist-results.json', payload.specialistResults);
  store.writeJson('systems-results.json', payload.systemsResults ?? []);
  store.writeJson('research-results.json', payload.researchResults ?? []);
  store.writeJson('lookdev-results.json', payload.lookdevResults ?? []);
  store.writeJson('content-results.json', payload.contentResults ?? []);
  store.writeJson('worldbuilding-results.json', payload.worldbuildingResults ?? []);
  store.writeJson('world-knowledge-packet.json', payload.worldKnowledgePacket ?? null);
  store.writeJson('specialist-failures.json', payload.specialistFailures ?? []);
  store.writeJson('content-failure.json', payload.contentFailure ?? null);
  store.writeJson('worldbuilding-failure.json', payload.worldbuildingFailure ?? null);
  store.writeJson('orchestration-result.json', payload.orchestrationResult);
  store.writeJson('approval-queue.json', payload.queues?.approval ?? []);
  store.writeJson('queues.json', payload.queues);
  store.writeJson('usage.json', payload.usage);
  store.writeJson('errors.json', payload.errors);
  store.writeJson('structured-output-failure.json', payload.structuredOutputFailure ?? null);
  store.writeJson('review-packet.json', payload.reviewPacket ?? null);
  store.writeJson('review-result.json', payload.reviewResult ?? null);
}
