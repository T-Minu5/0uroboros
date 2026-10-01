/**
 * Deterministic presentation queue.
 *
 * The engine may already be in Draft. This queue is the only thing that may
 * acknowledge a Collapse (or other) report as presented. Completing a previous
 * report never completes the next one.
 */

export type PresentationKind =
  | 'phase_announcement'
  | 'node_focus'
  | 'location_resolution'
  | 'card_reveal'
  | 'card_effect'
  | 'node_result'
  | 'location_reward'
  | 'collapse_final_probability'
  | 'collapse_selection'
  | 'circuit_reward'
  | 'draft_enter';

export interface PresentationEvent {
  id: string;
  reportId: string;
  kind: PresentationKind;
  holdMs: number;
  title: string;
  kicker?: string;
  lines?: string[];
  nodeIndex?: number | null;
  sourceInstanceId?: string | null;
}

export type QueueStatus = 'idle' | 'playing' | 'complete';

export interface PresentationQueue {
  reportId: string | null;
  events: PresentationEvent[];
  index: number;
  status: QueueStatus;
  completedReportIds: string[];
  elapsedMs: number;
}

export function emptyQueue(): PresentationQueue {
  return {
    reportId: null,
    events: [],
    index: -1,
    status: 'idle',
    completedReportIds: [],
    elapsedMs: 0,
  };
}

export function collapseReportId(serial: number): string {
  return `collapse:${serial}`;
}

export function serialFromReportId(reportId: string): number | null {
  const match = /^collapse:(\d+)$/u.exec(reportId);
  return match ? Number(match[1]) : null;
}

export function startReport(
  queue: PresentationQueue,
  reportId: string,
  events: PresentationEvent[],
): PresentationQueue {
  if (queue.completedReportIds.includes(reportId)) {
    return {
      ...queue,
      reportId,
      events,
      index: events.length,
      status: 'complete',
      elapsedMs: 0,
    };
  }
  if (queue.reportId === reportId && queue.status === 'playing') {
    return queue;
  }
  if (events.length === 0) {
    return completeReport(
      {
        ...queue,
        reportId,
        events,
        index: 0,
        status: 'playing',
        elapsedMs: 0,
      },
      reportId,
    );
  }
  return {
    ...queue,
    reportId,
    events,
    index: 0,
    status: 'playing',
    elapsedMs: 0,
  };
}

export function currentEvent(queue: PresentationQueue): PresentationEvent | null {
  if (queue.status !== 'playing') return null;
  return queue.events[queue.index] ?? null;
}

export function canAdvance(queue: PresentationQueue): boolean {
  const event = currentEvent(queue);
  if (!event) return false;
  return queue.elapsedMs >= event.holdMs;
}

export function tick(queue: PresentationQueue, deltaMs: number): PresentationQueue {
  if (queue.status !== 'playing' || !currentEvent(queue)) return queue;
  return { ...queue, elapsedMs: queue.elapsedMs + Math.max(0, deltaMs) };
}

export function advance(queue: PresentationQueue): PresentationQueue {
  if (queue.status !== 'playing' || !queue.reportId) return queue;
  if (!canAdvance(queue)) return queue;
  const nextIndex = queue.index + 1;
  if (nextIndex >= queue.events.length) {
    return completeReport(queue, queue.reportId);
  }
  return {
    ...queue,
    index: nextIndex,
    elapsedMs: 0,
  };
}

export function isReportComplete(queue: PresentationQueue, reportId: string | null): boolean {
  if (!reportId) return true;
  return queue.completedReportIds.includes(reportId);
}

export function draftEligible(queue: PresentationQueue, collapseId: string | null): boolean {
  return isReportComplete(queue, collapseId);
}

export function presentedCollapseSerial(queue: PresentationQueue): number {
  let max = 0;
  for (const id of queue.completedReportIds) {
    const serial = serialFromReportId(id);
    if (serial !== null && serial > max) max = serial;
  }
  return max;
}

function completeReport(queue: PresentationQueue, reportId: string): PresentationQueue {
  const completedReportIds = queue.completedReportIds.includes(reportId)
    ? queue.completedReportIds
    : [...queue.completedReportIds, reportId];
  return {
    ...queue,
    reportId,
    index: queue.events.length,
    status: 'complete',
    completedReportIds,
    elapsedMs: 0,
  };
}
