import { describe, expect, it } from 'vitest';

import { buildCollapseScript } from '../src/client/presentation/collapseScript';
import {
  advance,
  collapseReportId,
  currentEvent,
  draftEligible,
  emptyQueue,
  isReportComplete,
  presentedCollapseSerial,
  startReport,
  tick,
} from '../src/client/presentation/queue';
import { PRESENTATION_TIMING } from '../src/client/presentation/timing';
import {
  collapseIsBlocking,
  collapseTheaterReady,
  displayedPhaseKind,
} from '../src/client/presentationPhase';
import type { CollapseReport } from '../src/game/types';

function report(serial: number, cycle: number): CollapseReport {
  return {
    serial,
    cycle,
    nodes: [
      {
        index: 0,
        winner: '0',
        power0: 4,
        power1: 0,
        locationName: 'Occult archive',
        locationText: 'On collapse, the winner gains 2 Victory Points.',
        rewardText: 'On collapse, the winner gains 2 Victory Points.',
      },
    ],
    selectedNode: 0,
    eligible: ['0'],
    endedEarly: false,
  };
}

function walk(queue: ReturnType<typeof emptyQueue>) {
  let next = queue;
  let guard = 0;
  while (currentEvent(next) && guard < 80) {
    next = advance(tick(next, currentEvent(next)!.holdMs));
    guard += 1;
  }
  return next;
}

describe('presentation queue across Cycles', () => {
  it('does not mark a new Collapse complete just because the previous one finished', () => {
    const timing = PRESENTATION_TIMING.normal;
    let queue = emptyQueue();
    queue = startReport(queue, collapseReportId(1), buildCollapseScript(report(1, 1), '0', timing));
    queue = walk(queue);
    expect(isReportComplete(queue, collapseReportId(1))).toBe(true);
    expect(presentedCollapseSerial(queue)).toBe(1);

    queue = startReport(queue, collapseReportId(2), buildCollapseScript(report(2, 2), '0', timing));
    expect(isReportComplete(queue, collapseReportId(2))).toBe(false);
    expect(presentedCollapseSerial(queue)).toBe(1);
    expect(draftEligible(queue, collapseReportId(2))).toBe(false);
    expect(currentEvent(queue)?.kind).toBe('phase_announcement');
  });

  it('keeps Draft blocked for Cycles 1 through 4 until each report is walked', () => {
    const timing = PRESENTATION_TIMING.fast;
    let queue = emptyQueue();
    const visible: string[] = [];

    for (const serial of [1, 2, 3, 4]) {
      const id = collapseReportId(serial);
      queue = startReport(queue, id, buildCollapseScript(report(serial, serial), '0', timing));
      const blocking = collapseIsBlocking({
        ctxPhase: 'draft',
        gPhase: 'draft',
        revealDone: true,
        collapseSerial: serial,
        collapsePresentedSerial: presentedCollapseSerial(queue),
        hasCollapseReport: true,
        presentedReportComplete: isReportComplete(queue, id),
      });
      expect(blocking).toBe(true);
      expect(displayedPhaseKind({
        ctxPhase: 'draft',
        gPhase: 'draft',
        revealDone: true,
        collapseSerial: serial,
        collapsePresentedSerial: presentedCollapseSerial(queue),
        hasCollapseReport: true,
        presentedReportComplete: false,
      })).toBe('collapse');
      visible.push('collapse');
      queue = walk(queue);
      expect(isReportComplete(queue, id)).toBe(true);
      expect(displayedPhaseKind({
        ctxPhase: 'draft',
        gPhase: 'draft',
        revealDone: true,
        collapseSerial: serial,
        collapsePresentedSerial: presentedCollapseSerial(queue),
        hasCollapseReport: true,
        presentedReportComplete: true,
      })).toBe('draft');
      visible.push('draft');
    }

    expect(visible.join('>')).toBe('collapse>draft>collapse>draft>collapse>draft>collapse>draft');
    expect(visible.join('>')).not.toMatch(/draft>draft/u);
    expect(visible[0]).toBe('collapse');
  });

  it('refuses to advance before the minimum hold', () => {
    const timing = PRESENTATION_TIMING.normal;
    let queue = startReport(
      emptyQueue(),
      collapseReportId(1),
      buildCollapseScript(report(1, 1), '0', timing),
    );
    const first = currentEvent(queue);
    expect(first).not.toBeNull();
    queue = tick(queue, (first?.holdMs ?? 1) - 1);
    const blocked = advance(queue);
    expect(currentEvent(blocked)?.id).toBe(first?.id);
    queue = advance(tick(queue, 1));
    expect(currentEvent(queue)?.id).not.toBe(first?.id);
  });

  it('does not replay a completed report id', () => {
    const timing = PRESENTATION_TIMING.fast;
    const id = collapseReportId(3);
    const events = buildCollapseScript(report(3, 3), '0', timing);
    let queue = walk(startReport(emptyQueue(), id, events));
    queue = startReport(queue, id, events);
    expect(queue.status).toBe('complete');
    expect(currentEvent(queue)).toBeNull();
  });

  it('starts collapse theater in draft even if leftover reveals remain', () => {
    expect(collapseTheaterReady('draft', 'draft', false)).toBe(true);
    expect(collapseTheaterReady('circuit', 'circuitDeploy', false)).toBe(false);
  });

  it('completes an empty presentation report immediately', () => {
    const queue = startReport(emptyQueue(), collapseReportId(9), []);
    expect(queue.status).toBe('complete');
    expect(isReportComplete(queue, collapseReportId(9))).toBe(true);
  });
});
