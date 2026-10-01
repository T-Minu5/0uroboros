import { resolve } from 'node:path';

import { loadLocalEnv } from '../scripts/openai-connection-config';
import { createLiveOpenAIWorker } from '../src/delivery/liveOpenAIWorker';
import { loadDeliveryState } from '../src/delivery/state';

async function main(): Promise<void> {
  const root = resolve(process.cwd());
  loadLocalEnv(root);
  const state = loadDeliveryState(root);
  const objective = state.next_objective ?? 'wp-local-causality';
  console.log(JSON.stringify({ phase: 'start', iteration: state.iteration, objective }));
  const worker = createLiveOpenAIWorker(root);
  const result = await worker(state, objective);
  console.log(
    JSON.stringify(
      {
        phase: 'done',
        status: result.status,
        spend: result.spendUsd,
        requests: result.requests,
        mode: result.workerMode,
        specialists: result.specialistsInvoked,
        critiquePass: result.critiquePass,
        vd: result.qualityCritique?.visual_direction,
        ux: result.qualityCritique?.ux_comprehension,
        bar: result.qualityCritique?.passed_competitive_bar,
        defs: result.qualityCritique?.deficiencies?.slice(0, 4),
        note: result.note,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('LIVE_TURN_FAILED', error);
  process.exitCode = 2;
});
