import { describe, expect, it } from 'vitest';

import {
  collapseIsBlocking,
  displayedPhaseKind,
  displayedPhaseTitle,
  type PresentationPhaseInput,
} from '../src/client/presentationPhase';

const cycle1Draft: PresentationPhaseInput = {
  ctxPhase: 'draft',
  gPhase: 'draft',
  revealDone: false,
  collapseSerial: 1,
  collapsePresentedSerial: 0,
  hasCollapseReport: true,
};

describe('Cycle 1 presentation barrier', () => {
  it('keeps Wave Collapse up while Draft is already authoritative and reveals are still playing', () => {
    expect(collapseIsBlocking(cycle1Draft)).toBe(true);
    expect(displayedPhaseKind(cycle1Draft)).toBe('collapse');
    expect(displayedPhaseTitle('collapse', 2)).toBe('Wave Collapse');
  });

  it('does not present Draft until Collapse theater has finished that serial', () => {
    expect(displayedPhaseKind(cycle1Draft)).not.toBe('draft');
    expect(
      displayedPhaseKind({
        ...cycle1Draft,
        revealDone: true,
        collapsePresentedSerial: 1,
      }),
    ).toBe('draft');
  });

  it('never yields Draft then Collapse from the same inputs as serial advances', () => {
    const sequence = [
      displayedPhaseKind({
        ctxPhase: 'circuit',
        gPhase: 'circuitDeploy',
        revealDone: true,
        collapseSerial: 0,
        collapsePresentedSerial: 0,
        hasCollapseReport: false,
      }),
      displayedPhaseKind(cycle1Draft),
      displayedPhaseKind({
        ...cycle1Draft,
        revealDone: true,
        collapsePresentedSerial: 0,
      }),
      displayedPhaseKind({
        ...cycle1Draft,
        revealDone: true,
        collapsePresentedSerial: 1,
      }),
    ];
    expect(sequence).toEqual(['runtime', 'collapse', 'collapse', 'draft']);
    expect(sequence.join('>')).not.toMatch(/draft>collapse/i);
  });

  it('uses the same barrier on later Cycles', () => {
    const cycle2 = {
      ctxPhase: 'draft',
      gPhase: 'draft',
      revealDone: true,
      collapseSerial: 2,
      collapsePresentedSerial: 1,
      hasCollapseReport: true,
    };
    expect(displayedPhaseKind(cycle2)).toBe('collapse');
    expect(displayedPhaseKind({ ...cycle2, collapsePresentedSerial: 2 })).toBe('draft');
  });
});
