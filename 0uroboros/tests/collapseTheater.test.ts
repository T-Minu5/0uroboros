/**
 * Wave Collapse presentation beats. The engine has already resolved; this only
 * walks the public report for both seats.
 */

import { describe, expect, it } from 'vitest';
import {
  applyCollapseSnapshot,
  buildCollapseBeats,
  collapseWinnerTitle,
} from '../src/client/collapseTheater';
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
  it('walks title, each Node, the probability pick, then the winner', () => {
    const beats = buildCollapseBeats(report, '0', false);
    expect(beats.map((beat) => beat.kind)).toEqual(['title', 'node', 'node', 'select', 'winner']);
    expect(beats[0]).toMatchObject({ title: 'Wave Collapse', subtitle: 'Cycle 2' });
    expect(beats[1].title).toBe('Node 1 collapses');
    expect(beats[1].subtitle).toContain('You win the Node');
    expect(beats[1].subtitle).toContain('Occult archive');
    expect(beats[1].subtitle).toContain('On collapse, the winner gains 2 Victory Points.');
    expect(beats[2].subtitle).toContain('Tied');
    expect(beats[2].subtitle).toContain('No Location reward');
    expect(beats[3].title).toBe('Probability collapses into Node 1');
    expect(beats[3].subtitle).toBe('Occult archive');
    expect(beats[4].title).toBe('You win the Wave Collapse');
  });

  it('names the opponent as the Wave Collapse winner from the other seat', () => {
    const beats = buildCollapseBeats(report, '1', false);
    expect(beats[1].subtitle).toContain('Opponent wins the Node');
    expect(beats[4].title).toBe('Player 0 wins the Wave Collapse');
  });

  it('skips the pick and winner when Collapse ended early', () => {
    const beats = buildCollapseBeats({ ...report, endedEarly: true, selectedNode: null, eligible: [] }, '0', false);
    expect(beats.map((beat) => beat.kind)).toEqual(['title', 'node', 'node']);
  });

  it('shortens holds when motion is reduced', () => {
    const beats = buildCollapseBeats(report, '0', true);
    expect(beats.every((beat) => beat.holdMs === 220)).toBe(true);
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
