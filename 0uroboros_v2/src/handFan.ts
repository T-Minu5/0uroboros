import { useEffect, useState, type RefObject } from 'react';

/** Clear space kept between the hand and the effect bank / wallet on either side. */
export const HAND_MARGIN = 40;
/** Overlap each card gives up on either side when the hand has room to spare. */
export const HAND_BASE_OVERLAP = 14;

/** Outermost card's tilt, matching the fan's per-card `--angle`. */
export const handEdgeAngle = (count: number) => ((count - 1) / 2) * Math.min(4, 20 / Math.max(1, count));
/** Tilt pivot below the card top, as a fraction of its height; must match `.hand-card { transform-origin: 50% 120% }`. */
const HAND_PIVOT = 1.2;

/** How far the outermost card's top corner swings past its untilted edge. */
export function handSpill(count: number, width: number, height: number) {
  const tilt = (handEdgeAngle(count) * Math.PI) / 180;
  return (width / 2) * (Math.cos(tilt) - 1) + HAND_PIVOT * height * Math.sin(tilt);
}

/**
 * Per-side overlap (px) that fits `count` cards of `width`×`height` into `room`. Cards keep their natural spacing
 * until the fan reaches the room, then close up just enough to fill it, so a bigger hand never spans less.
 */
export function handOverlap(count: number, room: number, width: number, height: number) {
  if (count < 2 || room <= 0) return HAND_BASE_OVERLAP;
  const step = Math.min(width - 2 * HAND_BASE_OVERLAP, (room - width - 2 * handSpill(count, width, height)) / (count - 1));
  return Math.max(HAND_BASE_OVERLAP, (width - Math.max(0, step)) / 2);
}

export type HandSpan = { left: number; right: number; room: number; cardWidth: number; cardHeight: number };

const sameSpan = (a: HandSpan | null, b: HandSpan | null) =>
  !!a && !!b && (Object.keys(a) as (keyof HandSpan)[]).every(key => Math.abs(a[key] - b[key]) < .5);

/**
 * Measures the gap between the local effect bank and the wallet, inset by `HAND_MARGIN`, as left/right offsets
 * within the hand zone's positioned parent. Both are projected HUD anchors that settle after resizes, so it polls.
 */
export function useHandSpan(zone: RefObject<HTMLElement | null>): HandSpan | null {
  const [span, setSpan] = useState<HandSpan | null>(null);
  useEffect(() => {
    const measure = () => {
      const host = zone.current?.offsetParent, bank = document.querySelector('.bank-dock.near'), wallet = document.querySelector('.crypto-cache');
      if (!host || !bank || !wallet) { setSpan(null); return; }
      const h = host.getBoundingClientRect(), b = bank.getBoundingClientRect(), w = wallet.getBoundingClientRect();
      if (!b.width || !w.width) return;
      const left = b.right - h.left + HAND_MARGIN, right = h.right - w.left + HAND_MARGIN;
      const card = zone.current?.querySelector<HTMLElement>('.hand-card');
      const next = { left, right, room: Math.max(0, h.width - left - right), cardWidth: card?.offsetWidth || 120, cardHeight: card?.offsetHeight || 168 };
      setSpan(prev => (sameSpan(prev, next) ? prev : next));
    };
    measure();
    const timer = window.setInterval(measure, 300);
    window.addEventListener('resize', measure);
    return () => { window.clearInterval(timer); window.removeEventListener('resize', measure); };
  }, [zone]);
  return span;
}
