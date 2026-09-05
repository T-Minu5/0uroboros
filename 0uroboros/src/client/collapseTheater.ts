/**
 * Wave Collapse theater.
 *
 * The engine has already resolved every Node and selected the Circuit Reward.
 * This walk is presentation only: title, each Node collapsing with its Location
 * award, the probability measurement, then the winner, before Draft appears.
 */

import { useEffect, useRef, useState } from 'react';

import type { CollapseNodeReport, CollapseReport, PlayerID } from '../game/types';

export type CollapseBeatKind = 'title' | 'node' | 'select' | 'winner';

export interface CollapseBeat {
  kind: CollapseBeatKind;
  holdMs: number;
  title: string;
  subtitle: string;
  nodeIndex: number | null;
}

export interface CollapseTheater {
  active: boolean;
  beat: CollapseBeat | null;
  focusNode: number | null;
  measuring: boolean;
  selectedNode: number | null;
  /** True once probability has landed, so the pick is not spoiled earlier. */
  highlightSelection: boolean;
}

const TITLE_MS = 1000;
const NODE_MS = 1100;
const SELECT_MS = 1500;
const WINNER_MS = 1500;
const REDUCED_MS = 220;

export function buildCollapseBeats(
  report: CollapseReport,
  viewer: PlayerID,
  reducedMotion: boolean,
): CollapseBeat[] {
  const hold = (full: number) => (reducedMotion ? REDUCED_MS : full);
  const beats: CollapseBeat[] = [
    {
      kind: 'title',
      holdMs: hold(TITLE_MS),
      title: 'Wave Collapse',
      subtitle: `Cycle ${report.cycle}`,
      nodeIndex: null,
    },
  ];

  for (const node of report.nodes) {
    beats.push({
      kind: 'node',
      holdMs: hold(NODE_MS),
      title: `Node ${node.index + 1} collapses`,
      subtitle: nodeAwardLine(node, viewer),
      nodeIndex: node.index,
    });
  }

  if (!report.endedEarly) {
    beats.push({
      kind: 'select',
      holdMs: hold(SELECT_MS),
      title:
        report.selectedNode === null
          ? 'No Node selected'
          : `Probability collapses into Node ${report.selectedNode + 1}`,
      subtitle:
        report.selectedNode === null
          ? 'No Circuit Reward this Cycle'
          : report.nodes.find((node) => node.index === report.selectedNode)?.locationName ??
            'Circuit Reward',
      nodeIndex: report.selectedNode,
    });
    beats.push({
      kind: 'winner',
      holdMs: hold(WINNER_MS),
      title: collapseWinnerTitle(report.eligible, viewer),
      subtitle:
        report.selectedNode === null
          ? 'Draft follows'
          : `Circuit Reward · Node ${report.selectedNode + 1}`,
      nodeIndex: report.selectedNode,
    });
  }

  return beats;
}

export function useCollapseTheater(
  report: CollapseReport | null,
  ready: boolean,
  viewer: PlayerID,
): CollapseTheater {
  const seen = useRef(0);
  const [index, setIndex] = useState(-1);
  const [beats, setBeats] = useState<CollapseBeat[]>([]);

  useEffect(() => {
    if (!report || !ready) return;
    if (report.serial <= seen.current) return;
    seen.current = report.serial;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = buildCollapseBeats(report, viewer, reduced);
    setBeats(next);
    setIndex(0);
  }, [report, ready, viewer]);

  const beat = index >= 0 && index < beats.length ? beats[index] : null;

  useEffect(() => {
    if (!beat) return;
    const id = window.setTimeout(() => setIndex((current) => current + 1), beat.holdMs);
    return () => window.clearTimeout(id);
  }, [beat]);

  if (!beat) {
    return {
      active: false,
      beat: null,
      focusNode: null,
      measuring: false,
      selectedNode: report?.selectedNode ?? null,
      highlightSelection: false,
    };
  }

  return {
    active: true,
    beat,
    focusNode: beat.nodeIndex,
    measuring: beat.kind === 'select',
    selectedNode: report?.selectedNode ?? null,
    highlightSelection: beat.kind === 'select' || beat.kind === 'winner',
  };
}

/** Overlay Collapse Power and selection so headers stay truthful after cleanup. */
export function applyCollapseSnapshot<
  T extends {
    index: number;
    selfPower: number;
    rivalPower: number;
    leader: 'self' | 'rival' | null;
    isCollapseSelection: boolean;
  },
>(
  nodes: T[],
  report: CollapseReport,
  viewer: PlayerID,
  highlightSelection: boolean,
): T[] {
  return nodes.map((node) => {
    const snap = report.nodes.find((entry) => entry.index === node.index);
    const selfPower = snap ? (viewer === '0' ? snap.power0 : snap.power1) : node.selfPower;
    const rivalPower = snap ? (viewer === '0' ? snap.power1 : snap.power0) : node.rivalPower;
    return {
      ...node,
      selfPower,
      rivalPower,
      leader: selfPower === rivalPower ? null : selfPower > rivalPower ? 'self' : 'rival',
      isCollapseSelection: highlightSelection && report.selectedNode === node.index,
    };
  });
}

function nodeAwardLine(node: CollapseNodeReport, viewer: PlayerID): string {
  const winner =
    node.winner === null
      ? 'Tied'
      : node.winner === viewer
        ? 'You win the Node'
        : 'Opponent wins the Node';
  const award = node.rewardText
    ? node.rewardText
    : node.locationText
      ? node.locationText
      : 'No Location reward';
  return `${winner}. ${node.locationName}. ${award}`;
}

export function collapseWinnerTitle(eligible: PlayerID[], viewer: PlayerID): string {
  if (eligible.length === 2) return 'Both players share the Wave Collapse';
  if (eligible[0] === viewer) return 'You win the Wave Collapse';
  if (eligible[0]) return `Player ${eligible[0]} wins the Wave Collapse`;
  return 'Wave Collapse ends';
}
