/**
 * Card travel that stays in HUD space.
 *
 * Hearthstone weight principle: anticipation → contact → follow-through.
 * Marvel Snap is not copied here; deploy is still one card to one Node.
 */

import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { CardDefinition, CardInstance } from '../../game/types';
import { IMPACT_EASE, WEIGHT_EASE } from '../presentation/principles';
import { CardFace } from './CardFace';

const CARD_W = 118;
const CARD_H = 166;

export interface FlightRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardFlight {
  instanceId: string;
  definition: CardDefinition;
  card: CardInstance;
  fromRect: FlightRect;
  pointer?: { x: number; y: number };
  toNode: number | null;
  toSlot: number;
  phase: 'follow' | 'commit' | 'return';
}

export function CardFlightOverlay({
  flight,
  durationMs,
  onDone,
}: {
  flight: CardFlight;
  durationMs: number;
  onDone: (instanceId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const start = pointerRect(flight) ?? flight.fromRect;
    const startScale = start.w / CARD_W;
    el.style.width = `${CARD_W}px`;
    el.style.height = `${CARD_H}px`;

    if (flight.phase === 'follow') {
      el.style.transform = pose(start.x, start.y, startScale * 1.06, -4);
      return;
    }

    const end =
      flight.phase === 'return'
        ? flight.fromRect
        : rectForNodeSlot(flight.toNode, flight.toSlot) ?? start;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lift = Math.min(200, 96 + Math.abs(dy) * 0.22);
    const endScale = Math.max(0.42, end.w / CARD_W);
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduce ? 1 : Math.max(durationMs, 900);

    el.style.transform = pose(start.x, start.y, startScale * 1.06, -4);

    // Hearthstone weight: anticipation → travel → contact → follow-through.
    const animation = el.animate(
      [
        {
          transform: pose(start.x, start.y, startScale, 0),
          offset: 0,
          easing: WEIGHT_EASE,
        },
        {
          // Windup: deeper pull-back so contact feels earned.
          transform: pose(
            start.x - dx * 0.07,
            start.y + 28,
            startScale * 0.9,
            dx >= 0 ? 12 : -12,
          ),
          offset: 0.18,
          easing: WEIGHT_EASE,
        },
        {
          transform: pose(
            start.x + dx * 0.42,
            start.y + dy * 0.2 - lift * 1.08,
            startScale * 1.16,
            dx >= 0 ? -14 : 14,
          ),
          offset: 0.52,
          easing: WEIGHT_EASE,
        },
        {
          // Contact: overshoot into the lane with a hard hit.
          transform: pose(end.x, end.y + 10, endScale * 1.12, 0),
          offset: 0.8,
          easing: IMPACT_EASE,
        },
        {
          // Follow-through: settle into resting pose.
          transform: pose(end.x, end.y, endScale, 0),
          offset: 1,
        },
      ],
      {
        duration,
        easing: WEIGHT_EASE,
        fill: 'forwards',
      },
    );
    const finish = () => onDoneRef.current(flight.instanceId);
    animation.addEventListener('finish', finish);
    return () => {
      animation.removeEventListener('finish', finish);
      animation.cancel();
      finish();
    };
  }, [durationMs, flight]);

  return createPortal(
    <div ref={ref} className="flight" data-weight="hearthstone-principle" aria-hidden="true">
      <CardFace definition={flight.definition} card={flight.card} selected playable showCost />
    </div>,
    document.body,
  );
}

export function rectFromCard(instanceId: string): FlightRect | null {
  const node = document.querySelector(`[data-instance-id="${instanceId}"]`);
  if (!(node instanceof HTMLElement)) return null;
  return boxToRect(node.getBoundingClientRect());
}

export function rectForNodeSlot(nodeIndex: number | null, slot: number): FlightRect | null {
  if (nodeIndex === null) return null;
  const head =
    document.querySelector(`.node-head[data-node="${nodeIndex}"]`) ??
    document.querySelector(`.node-heads > .node-head:nth-child(${nodeIndex + 1})`);
  const half = head?.querySelector('.node-head__half[data-side="self"]');
  if (!(half instanceof HTMLElement)) return null;
  const box = half.getBoundingClientRect();
  const w = 72;
  const h = 100;
  return {
    x: box.left + box.width / 2 - w / 2 + slot * 12,
    y: box.bottom - h - 6,
    w,
    h,
  };
}

export function defaultHandRect(clientX: number, clientY: number): FlightRect {
  return { x: clientX - CARD_W / 2, y: clientY - CARD_H - 16, w: CARD_W, h: CARD_H };
}

function pointerRect(flight: CardFlight): FlightRect | null {
  if (!flight.pointer) return null;
  return {
    x: flight.pointer.x - flight.fromRect.w / 2,
    y: flight.pointer.y - flight.fromRect.h - 16,
    w: flight.fromRect.w,
    h: flight.fromRect.h,
  };
}

function pose(x: number, y: number, scale: number, rotate: number): string {
  return `translate(${x}px, ${y}px) scale(${scale}) rotate(${rotate}deg)`;
}

function boxToRect(box: DOMRect): FlightRect {
  return { x: box.left, y: box.top, w: box.width, h: box.height };
}
