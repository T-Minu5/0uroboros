/**
 * Wave Collapse presentation events. The engine has already resolved; this only
 * walks the public report for both seats.
 */

import { describe, expect, it } from 'vitest';
import {
  applyCollapseSnapshot,
  buildCollapseBeats,
  collapseWinnerTitle,
} from '../src/client/collapseTheater';
import { REDUCED_MOTION_MS } from '../src/client/presentation/timing';
import type { CollapseReport } from '../src/game/types';

const report: CollapseReport = {
  serial: 1,
  cycle: 2,
  nodes: [
    {
      index: 0,
      winner: '0',
      power0: 9,
      power1: 3,
      locationName: 'Occult archive',
      locationText: 'On collapse, the winner gains 2 Victory Points.',
      rewardText: 'On collapse, the winner gains 2 Victory Points.',
    },
    {
      index: 1,
      winner: null,
      power0: 0,
      power1: 0,
      locationName: 'Unassigned',
      locationText: '',
      rewardText: '',
    },
  ],
  selectedNode: 0,
  eligible: ['0'],
  endedEarly: false,
};

describe('buildCollapseBeats', () => {
  it('walks Location, result, reward, then the probability pick', () => {
    const beats = buildCollapseBeats(report, '0', false);
    expect(beats.map((beat) => beat.kind)).toEqual([
      'title',
      'location',
      'result',
      'reward',
      'location',
      'result',
      'measure',
      'select',
      'winner',
    ]);
    expect(beats[0]).toMatchObject({ title: 'Wave Collapse' });
    expect(beats[1].title).toBe('Occult archive');
    expect(beats[1].subtitle).toContain('On collapse, the winner gains 2 Victory Points.');
    expect(beats[2].title).toBe('You win the Node');
    expect(beats[5].title).toBe('Tied');
    expect(beats[7].title).toBe('Node 1 is selected');
    expect(beats[8].title).toBe('You win the Wave Collapse');
  });

  it('names the opponent as the Wave Collapse winner from the other seat', () => {
    const beats = buildCollapseBeats(report, '1', false);
    expect(beats[2].title).toBe('Opponent wins the Node');
    expect(beats[8].title).toBe('Player 0 wins the Wave Collapse');
  });

  it('skips the pick and winner when Collapse ended early', () => {
    const beats = buildCollapseBeats({ ...report, endedEarly: true, selectedNode: null, eligible: [] }, '0', false);
    expect(beats.map((beat) => beat.kind)).toEqual([
      'title',
      'location',
      'result',
      'reward',
      'location',
      'result',
    ]);
  });

  it('shortens holds when motion is reduced', () => {
    const full = buildCollapseBeats(report, '0', false);
    const beats = buildCollapseBeats(report, '0', true);
    // Caps apply per timing field; Node gap may add one capped beat onto result/reward.
    expect(beats.every((beat) => beat.holdMs <= REDUCED_MOTION_MS * 2)).toBe(true);
    expect(beats.every((beat, i) => beat.holdMs <= full[i]!.holdMs)).toBe(true);
  });
});

describe('collapseWinnerTitle', () => {
  it('announces a shared Wave Collapse on a tied selection', () => {
    expect(collapseWinnerTitle(['0', '1'], '0')).toBe('Both players share the Wave Collapse');
  });
});

describe('applyCollapseSnapshot', () => {
  it('restores viewer-relative Power and withholds the pick until asked', () => {
    const nodes = [
      {
        index: 0,
        selfPower: 0,
        rivalPower: 0,
        leader: null as 'self' | 'rival' | null,
        isCollapseSelection: true,
      },
    ];

    const hidden = applyCollapseSnapshot(nodes, report, '0', false);
    expect(hidden[0]).toMatchObject({
      selfPower: 9,
      rivalPower: 3,
      leader: 'self',
      isCollapseSelection: false,
    });

    const shown = applyCollapseSnapshot(nodes, report, '1', true);
    expect(shown[0]).toMatchObject({
      selfPower: 3,
      rivalPower: 9,
      leader: 'rival',
      isCollapseSelection: true,
    });
  });
});
