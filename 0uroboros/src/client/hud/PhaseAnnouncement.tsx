/**
 * Mini title card for each new phase or Circuit beat.
 *
 * Every major transition gets a short, named interruption so players learn the
 * vocabulary by seeing it: Node opening, Reveal, Wave Collapse, Draft, Start of
 * Cycle, Endgame. Wave Collapse uses its own theater for the long sequence.
 */

import { useEffect, useRef, useState } from 'react';

export interface PhaseTitle {
  key: string;
  title: string;
  subtitle?: string;
}

const HOLD_MS = 900;

export function PhaseAnnouncement({ announcement }: { announcement: PhaseTitle | null }) {
  const [current, setCurrent] = useState<PhaseTitle | null>(null);
  const previous = useRef<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!announcement) return;
    if (previous.current === announcement.key) return;
    previous.current = announcement.key;

    setCurrent(announcement);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCurrent(null), HOLD_MS);

    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [announcement]);

  if (!current) return null;

  return (
    <div className="announce" role="status" aria-live="polite">
      {current.subtitle ? <span className="announce__kicker">{current.subtitle}</span> : null}
      <span className="announce__text">{current.title}</span>
    </div>
  );
}

export function circuitAnnouncement(
  phase: string,
  cycle: number,
  turn: number,
  revealSerial: number,
): PhaseTitle | null {
  if (phase === 'startCycleEffects' || phase === 'locationSetup' || phase === 'drawHand') {
    return { key: `cycle:${cycle}`, title: 'Start of Cycle', subtitle: `Cycle ${cycle}` };
  }
  if (phase === 'circuitDeploy' || phase === 'shortCircuitDeploy') {
    return {
      key: `node:${cycle}:${turn}`,
      title: `Node ${turn + 1} opens`,
      subtitle: `Cycle ${cycle} · Circuit`,
    };
  }
  if (phase === 'reveal') {
    return { key: `reveal:${cycle}:${revealSerial}`, title: 'Reveal', subtitle: `Cycle ${cycle}` };
  }
  if (phase === 'draft') {
    return { key: `draft:${cycle}`, title: 'Draft', subtitle: `Cycle ${cycle}` };
  }
  if (phase === 'endgame') {
    return { key: `end:${cycle}`, title: 'Endgame', subtitle: `Cycle ${cycle}` };
  }
  return null;
}
