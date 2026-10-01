#!/usr/bin/env tsx
/**
 * Demo delivery CLI.
 *
 *   npm run delivery -- assess
 *   npm run delivery -- step
 *   npm run delivery -- batch --iterations 4
 *   npm run delivery -- verify-live
 *   npm run delivery -- autonomous
 *
 * autonomous requires LIVE_OPENAI worker. No noop fallback.
 */

import { resolve } from 'node:path';

import { loadLocalEnv } from '../../scripts/openai-connection-config';
import { acquireDeliveryLock, releaseDeliveryLock } from './lock';
import { createAutonomousWorker } from './implementer';
import {
  assertLiveOpenAIConfigured,
  createLiveOpenAIWorker,
  OpenAIWorkerNotConfiguredError,
  verifyLiveSwarm,
  WORKER_MODE_LIVE,
} from './liveOpenAIWorker';
import { writeHeartbeat } from './heartbeat';
import {
  AutonomousExitWithoutStopReason,
  DemoDeliveryRunner,
  seedDeliveryState,
} from './runner';
import { STOP_NONE, VALID_AUTONOMOUS_STOPS } from './policy';
import { saveDeliveryState } from './state';

loadLocalEnv(resolve(process.cwd()));

process.on('unhandledRejection', (reason) => {
  console.error(
    'Unhandled rejection',
    reason instanceof Error ? reason.stack ?? reason.message : reason,
  );
});
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception', error.stack ?? error.message);
});

const root = resolve(process.cwd());
const args = process.argv.slice(2).filter((item) => item !== '--');
const cmd = args[0] ?? 'assess';
const iterations = Number(argValue(args, '--iterations') ?? argValue(args, '--max-steps') ?? '8');
const testsPassed = args.includes('--tests-passed') ? true : null;

void main();

async function main(): Promise<void> {
  if (cmd === 'assess' || cmd === 'score') {
    const runner = new DemoDeliveryRunner({ root, testsPassed });
    const seeded = seedDeliveryState(root);
    const assessed = runner.assess(seeded);
    saveDeliveryState(root, assessed);
    print(assessed);
    return;
  }

  if (cmd === 'invalidate-checkpoint') {
    const runner = new DemoDeliveryRunner({ root, testsPassed });
    const next = runner.invalidateFalseCheckpoint(
      'CHECKPOINT_INVALIDATED_NO_FRESH_AGENT_EVIDENCE',
    );
    print(next);
    console.log('invalidated=CHECKPOINT_INVALIDATED_NO_FRESH_AGENT_EVIDENCE');
    return;
  }

  if (cmd === 'step') {
    const runner = new DemoDeliveryRunner({
      root,
      testsPassed,
      worker: createAutonomousWorker(root),
    });
    seedDeliveryState(root);
    const result = await runner.step(runner.load());
    print(result.state);
    console.log(
      `stopped=${result.stopped} reason=${result.reason} iterations=${result.state.iteration}`,
    );
    return;
  }

  if (cmd === 'batch' || cmd === 'loop') {
    const runner = new DemoDeliveryRunner({
      root,
      testsPassed,
      worker: createAutonomousWorker(root),
    });
    seedDeliveryState(root);
    const result = await runner.batch(Number.isFinite(iterations) ? iterations : 8);
    print(result.state);
    console.log(
      `mode=batch stopped=${result.stopped} reason=${result.reason} iterations=${result.state.iteration}`,
    );
    return;
  }

  if (cmd === 'verify-live') {
    try {
      const verified = await verifyLiveSwarm(root);
      console.log(JSON.stringify(verified, null, 2));
      if (!verified.nested_specialists_proven || Number(verified.requests ?? 0) <= 0) {
        process.exitCode = 2;
        console.error('LIVE_SWARM verification failed: no proven nested agent usage.');
        return;
      }
      process.exitCode = 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 2;
    }
    return;
  }

  if (cmd === 'autonomous') {
    await runAutonomous();
    return;
  }

  console.error(
    'usage: delivery assess | invalidate-checkpoint | step | batch --iterations N | verify-live | autonomous',
  );
  process.exitCode = 1;
}

async function runAutonomous(): Promise<void> {
  let lockHeld = false;
  try {
    try {
      assertLiveOpenAIConfigured();
    } catch (error) {
      if (error instanceof OpenAIWorkerNotConfiguredError) {
        console.error(error.message);
        process.exitCode = 2;
        return;
      }
      throw error;
    }

    acquireDeliveryLock(root, 'autonomous');
    lockHeld = true;

    const worker = createLiveOpenAIWorker(root);
    const runner = new DemoDeliveryRunner({
      root,
      testsPassed,
      worker,
      requireLiveWorker: true,
    });
    seedDeliveryState(root);

    // Never start autonomous on an invalidated-false checkpoint still marked pause.
    const loaded = runner.load();
    if (
      loaded.stop_reason === 'HUMAN_DIRECTION_CHECKPOINT' &&
      (loaded.fresh_cycle?.cycle_spend_usd ?? 0) <= 0
    ) {
      runner.invalidateFalseCheckpoint('CHECKPOINT_INVALIDATED_NO_FRESH_AGENT_EVIDENCE');
    }

    // Keep prior LIVE_SWARM_VERIFIED proof intact; launching is heartbeat/lock owned.
    writeHeartbeat(root, runner.load(), {
      status: 'working',
      active_specialist: WORKER_MODE_LIVE,
      last_iteration_started: new Date().toISOString(),
    });

    let cancelled = false;
    const onSignal = () => {
      cancelled = true;
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    try {
      const result = await runner.autonomous({ cancelled: () => cancelled });
      print(result.state);
      if (result.reason === STOP_NONE || !VALID_AUTONOMOUS_STOPS.includes(result.reason)) {
        throw new AutonomousExitWithoutStopReason(result.state);
      }
      console.log(
        `mode=autonomous worker=${WORKER_MODE_LIVE} stopped=${result.stopped} reason=${result.reason} iterations=${result.state.iteration} score=${result.state.confidence.overall} cycle_spend=${result.state.fresh_cycle.cycle_spend_usd}`,
      );
      process.exitCode = 0;
    } catch (error) {
      const state = runner.load();
      writeHeartbeat(root, state, { status: 'exited' });
      if (error instanceof AutonomousExitWithoutStopReason) {
        console.error(error.message);
        console.error('AUTONOMOUS_EXIT_WITHOUT_STOP_REASON');
        process.exitCode = 2;
        return;
      }
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 2;
    } finally {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    }
  } finally {
    if (lockHeld) releaseDeliveryLock(root);
  }
}

function argValue(list: string[], name: string): string | undefined {
  const index = list.indexOf(name);
  return index >= 0 ? list[index + 1] : undefined;
}

function print(state: ReturnType<DemoDeliveryRunner['load']>): void {
  console.log(
    JSON.stringify(
      {
        mission: state.mission_id,
        iteration: state.iteration,
        next: state.next_objective,
        score: state.confidence.overall,
        visual_direction: state.confidence.dimensions.visual_direction,
        visual_quality: state.visual_quality,
        gates: state.confidence.gates,
        stop: state.stop_reason,
        worker_mode: state.worker_mode,
        fresh_cycle: state.fresh_cycle,
        completed: state.completed_work_packages,
        replans: state.replans,
        stall_count: state.stall_count,
        budget: state.budget,
        checkpoint_notes: state.checkpoint_notes,
      },
      null,
      2,
    ),
  );
}
