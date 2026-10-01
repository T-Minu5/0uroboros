/**
 * Multi-Cycle engine evidence via real boardgame.io Client (Local multiplayer).
 * Run: tsx scripts/multi-cycle-engine-evidence.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { circuitWindowCount, DEFAULT_CONFIG } from '../src/game/config/defaults';
import { getCardDefinition } from '../src/game/content/cards';
import {
  bootstrapMatch,
  closeDraft,
  closeWindow,
  readPhase,
  readState,
  type Seats,
} from '../tests/helpers/bgiClientSeats';

const OUT_PATH = join(
  process.cwd(),
  'tools/agent-harness/delivery/evidence/v3-implementation/multi-cycle-engine.json',
);

export interface PhaseObservation {
  cycle: number;
  ctxPhase: string | null;
  gPhase: string;
  turn: number;
  label: string;
}

export interface MultiCycleReport {
  pass: boolean;
  cyclesReached: number;
  phasesObserved: PhaseObservation[];
  deploymentsAttempted: number;
  deploymentsSucceeded: number;
  notes: string[];
  generatedAt: string;
  transport: 'boardgame.io Local Client';
}

function snapshot(seats: Seats, label: string): PhaseObservation {
  const G = readState(seats);
  return {
    cycle: G.cycle,
    ctxPhase: readPhase(seats),
    gPhase: G.phase,
    turn: G.turn,
    label,
  };
}

function attemptDeploy(seats: Seats): { attempted: boolean; succeeded: boolean } {
  const G = readState(seats);
  const deployable = G.hands['0'].find((id) =>
    getCardDefinition(G.cards[id].cardDefId).deployable,
  );
  if (!deployable) return { attempted: false, succeeded: false };
  seats.clients['0'].moves.deployCard(deployable, 0);
  return {
    attempted: true,
    succeeded: readState(seats).cards[deployable].zone === 'node',
  };
}

function runRuntimeAndDraft(
  seats: Seats,
  windows: number,
  phasesObserved: PhaseObservation[],
  labelPrefix: string,
): { collapsedBeforeDraft: boolean } {
  phasesObserved.push(snapshot(seats, `${labelPrefix}-runtime-start`));
  for (let w = 0; w < windows; w += 1) {
    closeWindow(seats);
    phasesObserved.push(snapshot(seats, `${labelPrefix}-after-window-${w + 1}`));
  }
  phasesObserved.push(snapshot(seats, `${labelPrefix}-draft-enter`));
  const atDraft = readState(seats);
  const collapsedBeforeDraft =
    atDraft.collapseReport !== null &&
    atDraft.nodes.every((node) => node.state === 'collapsed');
  closeDraft(seats);
  phasesObserved.push(snapshot(seats, `${labelPrefix}-after-draft`));
  return { collapsedBeforeDraft };
}

export function runMultiCycleEngineEvidence(): MultiCycleReport {
  const windows = circuitWindowCount(DEFAULT_CONFIG);
  const phasesObserved: PhaseObservation[] = [];
  const notes: string[] = [];
  let deploymentsAttempted = 0;
  let deploymentsSucceeded = 0;
  let pass = false;
  let cyclesReached = 0;

  const seats = bootstrapMatch();
  try {
    phasesObserved.push(snapshot(seats, 'match-start'));

    const recordDeploy = (): void => {
      const result = attemptDeploy(seats);
      if (result.attempted) {
        deploymentsAttempted += 1;
        if (result.succeeded) deploymentsSucceeded += 1;
      }
    };

    // Cycle 1: deploy, runtime windows, collapse, draft
    recordDeploy();
    const cycle1 = runRuntimeAndDraft(seats, windows, phasesObserved, 'cycle-1');
    const sawCollapse = cycle1.collapsedBeforeDraft;

    const afterC1 = readState(seats);
    if (afterC1.cycle !== 2) {
      notes.push(`Expected cycle 2 after Cycle 1 draft; got ${afterC1.cycle}`);
    }

    // Cycle 2
    recordDeploy();
    runRuntimeAndDraft(seats, windows, phasesObserved, 'cycle-2');

    const afterC2 = readState(seats);
    if (afterC2.cycle !== 3) {
      notes.push(`Expected cycle 3 after Cycle 2 draft; got ${afterC2.cycle}`);
    }

    // Cycle 3 start (runtime only)
    recordDeploy();
    phasesObserved.push(snapshot(seats, 'cycle-3-start'));

    const atC3 = readState(seats);
    cyclesReached = atC3.cycle;

    const sawDraft = phasesObserved.some((p) => p.ctxPhase === 'draft' || p.gPhase === 'draft');
    const c3Runtime =
      atC3.cycle === 3 &&
      readPhase(seats) === 'circuit' &&
      atC3.phase === 'circuitDeploy' &&
      atC3.turn === 0;

    pass =
      cyclesReached >= 3 &&
      sawCollapse &&
      sawDraft &&
      c3Runtime &&
      afterC1.cycle === 2 &&
      afterC2.cycle === 3;

    if (!sawCollapse) notes.push('Did not observe wave collapse transition in phase trail');
    if (!sawDraft) notes.push('Did not observe draft phase in phase trail');
    if (!c3Runtime) {
      notes.push(
        `Cycle 3 start mismatch: ctx=${readPhase(seats)} g.phase=${atC3.phase} turn=${atC3.turn}`,
      );
    }
  } catch (err) {
    notes.push(err instanceof Error ? err.message : String(err));
    pass = false;
  } finally {
    seats.stop();
  }

  return {
    pass,
    cyclesReached,
    phasesObserved,
    deploymentsAttempted,
    deploymentsSucceeded,
    notes,
    generatedAt: new Date().toISOString(),
    transport: 'boardgame.io Local Client',
  };
}

function main(): void {
  mkdirSync(join(process.cwd(), 'tools/agent-harness/delivery/evidence/v3-implementation'), {
    recursive: true,
  });
  const report = runMultiCycleEngineEvidence();
  writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ pass: report.pass, cyclesReached: report.cyclesReached, out: OUT_PATH }));
  process.exit(report.pass ? 0 : 1);
}

if (process.argv[1]?.includes('multi-cycle-engine-evidence')) {
  void main();
}
