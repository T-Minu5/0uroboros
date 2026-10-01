/**
 * Wave Collapse theater.
 *
 * The engine has already resolved. This walks a presentation queue derived from
 * the public report. A later Cycle cannot inherit "finished" from an earlier one.
 */

import { useMemo } from 'react';

import type { CollapseReport, PlayerID } from '../game/types';
import { buildCollapseScript, collapseWinnerTitle } from './presentation/collapseScript';
import {
  collapseReportId,
  isReportComplete,
  presentedCollapseSerial,
  type PresentationEvent,
} from './presentation/queue';
import { resolveTiming, type PresentationSpeed, type PresentationTiming } from './presentation/timing';
import { usePresentationQueue } from './presentation/usePresentationQueue';

export type CollapseBeatKind =
  | 'title'
  | 'node'
  | 'select'
  | 'winner'
  | 'location'
  | 'result'
  | 'reward'
  | 'measure';

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
  event: PresentationEvent | null;
  focusNode: number | null;
  measuring: boolean;
  selectedNode: number | null;
  highlightSelection: boolean;
  presentedSerial: number;
  reportComplete: boolean;
  advanceNow: () => void;
}

export function useCollapseTheater(
  report: CollapseReport | null,
  ready: boolean,
  viewer: PlayerID,
  speed: PresentationSpeed = 'normal',
  reducedMotion = false,
): CollapseTheater {
  const timing = resolveTiming(speed, reducedMotion);
  const reportId = report ? collapseReportId(report.serial) : null;
  const events = useMemo(
    () => (report ? buildCollapseScript(report, viewer, timing) : []),
    [report, viewer, timing],
  );
  const { queue, event, advanceNow } = usePresentationQueue(reportId, events, ready && Boolean(report));

  const beat = event ? eventToBeat(event) : null;
  const reportComplete = isReportComplete(queue, reportId);

  if (!event || !beat) {
    return {
      active: false,
      beat: null,
      event: null,
      focusNode: null,
      measuring: false,
      selectedNode: report?.selectedNode ?? null,
      highlightSelection: false,
      presentedSerial: presentedCollapseSerial(queue),
      reportComplete,
      advanceNow,
    };
  }

  return {
    active: true,
    beat,
    event,
    focusNode: event.nodeIndex ?? null,
    measuring: event.kind === 'collapse_final_probability' || event.kind === 'collapse_selection',
    selectedNode: report?.selectedNode ?? null,
    highlightSelection:
      event.kind === 'collapse_selection' || event.kind === 'circuit_reward',
    presentedSerial: presentedCollapseSerial(queue),
    reportComplete,
    advanceNow,
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

export { collapseWinnerTitle, buildCollapseScript };

export function buildCollapseBeats(
  report: CollapseReport,
  viewer: PlayerID,
  reducedMotion: boolean,
  speed: PresentationSpeed = 'normal',
): CollapseBeat[] {
  const timing = resolveTiming(speed, reducedMotion);
  return buildCollapseScript(report, viewer, timing).map(eventToBeat);
}

function eventToBeat(event: PresentationEvent): CollapseBeat {
  return {
    kind: beatKindOf(event.kind),
    holdMs: event.holdMs,
    title: event.title,
    subtitle: [event.kicker, ...(event.lines ?? [])].filter(Boolean).join(' · '),
    nodeIndex: event.nodeIndex ?? null,
  };
}

function beatKindOf(kind: PresentationEvent['kind']): CollapseBeatKind {
  if (kind === 'phase_announcement') return 'title';
  if (kind === 'location_resolution') return 'location';
  if (kind === 'node_result') return 'result';
  if (kind === 'location_reward') return 'reward';
  if (kind === 'collapse_final_probability') return 'measure';
  if (kind === 'collapse_selection') return 'select';
  if (kind === 'circuit_reward') return 'winner';
  return 'node';
}

export function timingForCollapse(speed: PresentationSpeed, reducedMotion: boolean): PresentationTiming {
  return resolveTiming(speed, reducedMotion);
}
