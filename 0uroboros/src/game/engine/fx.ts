/**
 * Presentation beats recorded while effects resolve.
 *
 * Pushing an event never changes the applied op. It only gives the client a
 * queue it can walk so card text, number changes, and hits stay in lockstep.
 */

import type {
  EffectTiming,
  FxChapter,
  FxEvent,
  NodeIndex,
  OuroborosState,
} from '../types';

export interface FxContext {
  chapter?: FxChapter;
  effectText?: string;
  sourceCard?: { instanceId: string } | null;
  nodeIndex?: NodeIndex | null;
}

export function chapterFor(timing: EffectTiming): FxChapter {
  switch (timing) {
    case 'onReveal':
      return 'reveal';
    case 'onCollapse':
      return 'collapse';
    case 'onPlay':
      return 'play';
    case 'onAcquire':
    case 'onDraftStart':
      return 'draft';
    default:
      return 'cycle';
  }
}

export function pushFx(
  state: OuroborosState,
  event: Omit<FxEvent, 'id' | 'chapter'> & { chapter?: FxChapter },
  ctx?: FxContext,
): void {
  state.fxSeq += 1;
  state.fxQueue.push({
    ...event,
    id: state.fxSeq,
    chapter: event.chapter ?? ctx?.chapter ?? 'play',
    text: event.text ?? ctx?.effectText,
    sourceInstanceId: event.sourceInstanceId ?? ctx?.sourceCard?.instanceId,
    nodeIndex: event.nodeIndex ?? ctx?.nodeIndex ?? null,
  });
}
