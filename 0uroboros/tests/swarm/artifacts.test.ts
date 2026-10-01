import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createArtifactStore, createRunId, persistRunArtifacts } from '../../src/swarm/artifacts';
import { runPlanningHarness } from '../../src/swarm/harness';
import { tempCwd, testConfig } from './fixtures';

describe('swarm run artifacts', () => {
  it('creates a run ID and artifact folder with validated JSON', () => {
    const runId = createRunId(new Date('2026-09-06T16:00:00.000Z'));
    expect(runId.startsWith('run-')).toBe(true);
    const cwd = tempCwd();
    const store = createArtifactStore(runId, cwd);
    persistRunArtifacts(store, {
      manifest: {
        run_id: runId,
        started_at: '2026-09-06T16:00:00.000Z',
        completed_at: '2026-09-06T16:00:01.000Z',
        duration_ms: 1000,
        canonical_version: '2.0.0',
        configured_models: { astra: 'gpt-6-astra' },
        actual_models: { astra: 'gpt-6-astra' },
        fallback_events: [],
        agents_invoked: ['Astra'],
        reviewer_invoked: false,
        work_packages_executed: [],
        status: 'completed',
        stop_reason: null,
      },
      workOrder: {
        id: 'wo-1',
        objective: 'Plan HUD',
        context: 'test',
        constraints: [],
        acceptance_criteria: [],
        requested_expertise: ['ux'],
        out_of_scope: [],
        canonical_version: '2.0.0',
      },
      specialistResults: [],
      orchestrationResult: null,
      queues: null,
      usage: {
        run_id: runId,
        requests: 1,
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
        review_calls: 0,
        reviewer_invoked: false,
        notes: ['aggregated'],
      },
      errors: [{ message: 'example' }],
    });

    const names = [
      'manifest.json',
      'work-order.json',
      'specialist-results.json',
      'orchestration-result.json',
      'approval-queue.json',
      'usage.json',
      'errors.json',
      'structured-output-failure.json',
      'research-results.json',
      'lookdev-results.json',
      'content-results.json',
      'worldbuilding-results.json',
      'world-knowledge-packet.json',
      'specialist-failures.json',
      'content-failure.json',
      'worldbuilding-failure.json',
      'review-packet.json',
      'review-result.json',
    ];
    for (const name of names) {
      const path = join(store.dir, name);
      expect(existsSync(path)).toBe(true);
      expect(() => JSON.parse(readFileSync(path, 'utf8'))).not.toThrow();
    }
    expect(JSON.parse(readFileSync(join(store.dir, 'errors.json'), 'utf8'))[0].message).toBe(
      'example',
    );
  });

  it('persists errors and never executes packages on an offline harness run', async () => {
    const cwd = tempCwd();
    const output = await runPlanningHarness({
      objective: 'Plan HUD',
      cwd,
      config: testConfig({ OPENAI_API_KEY: '' }),
      skipModel: true,
      executeWorkPackages: true,
    });
    expect(output.exitCode).toBe(1);
    expect(output.manifest.work_packages_executed).toEqual([]);
    expect(output.errors[0]).toMatchObject({ code: 'EXECUTION_DISABLED' });
    expect(existsSync(join(output.artifactDir, 'errors.json'))).toBe(true);
  });
});
