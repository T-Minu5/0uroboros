import { useEffect, useMemo, useReducer, useRef } from 'react';

import {
  advance,
  currentEvent,
  emptyQueue,
  startReport,
  type PresentationEvent,
  type PresentationQueue,
} from './queue';

type Action =
  | { type: 'sync'; reportId: string; events: PresentationEvent[] }
  | { type: 'advance' };

function reducer(state: PresentationQueue, action: Action): PresentationQueue {
  if (action.type === 'sync') return startReport(state, action.reportId, action.events);
  return advance({ ...state, elapsedMs: Number.MAX_SAFE_INTEGER });
}

export function usePresentationQueue(
  reportId: string | null,
  events: PresentationEvent[],
  ready: boolean,
): {
  queue: PresentationQueue;
  event: PresentationEvent | null;
  advanceNow: () => void;
} {
  const [queue, dispatch] = useReducer(reducer, undefined, emptyQueue);
  const eventsKey = events.map((event) => event.id).join('|');

  useEffect(() => {
    if (!ready || !reportId) return;
    dispatch({ type: 'sync', reportId, events });
  }, [ready, reportId, eventsKey, events]);

  const event = currentEvent(queue);
  const holdMs = event?.holdMs ?? 0;

  useEffect(() => {
    if (!event) return;
    const id = window.setTimeout(() => dispatch({ type: 'advance' }), holdMs);
    return () => window.clearTimeout(id);
  }, [queue.reportId, queue.index, holdMs, event]);

  const advanceNow = useRef(() => dispatch({ type: 'advance' })).current;

  return useMemo(() => ({ queue, event, advanceNow }), [queue, event, advanceNow]);
}
