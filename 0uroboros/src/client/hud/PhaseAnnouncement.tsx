/**
 * Phase announcement.
 *
 * One component handles every major state transition, using rules vocabulary so
 * repetition teaches the terms. Phase 1 ships plain text with the correct
 * trigger contract; a richer motion treatment can replace the visual without
 * changing when it fires.
 */

import { useEffect, useRef, useState } from 'react';
import { phaseLabel } from '../selectors';

/** States worth interrupting the player for. */
const ANNOUNCED = new Set([
  'reveal',
  'waveCollapse',
  'draft',
  'startCycleEffects',
  'cleanup',
  'endgame',
]);

const HOLD_MS = 1100;

export function PhaseAnnouncement({ phase, cycle }: { phase: string; cycle: number }) {
  const [message, setMessage] = useState<string | null>(null);
  const previous = useRef<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const key = `${phase}:${cycle}`;
    if (previous.current === key) return;
    previous.current = key;

    if (!ANNOUNCED.has(phase)) {
      setMessage(null);
      return;
    }

    setMessage(phaseLabel(phase));
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), HOLD_MS);

    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [phase, cycle]);

  if (!message) return null;

  return (
    <div className="announce" role="status" aria-live="polite">
      <span className="announce__text">{message}</span>
    </div>
  );
}
