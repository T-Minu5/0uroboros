/**
 * Client playback of the authoritative reveal queue.
 *
 * The engine resolves the whole sequence in one move so tests stay deterministic.
 * The client then walks that queue one card at a time so Power and flips update
 * in play order, as the rules require.
 */

import { useEffect, useState } from 'react';

export const REVEAL_STEP_MS = 520;

export function useRevealPlayback(queue: string[], serial: number): number {
  const [played, setPlayed] = useState(queue.length);

  useEffect(() => {
    if (queue.length === 0) {
      setPlayed(0);
      return;
    }

    setPlayed(0);
    let step = 0;
    const id = window.setInterval(() => {
      step += 1;
      setPlayed(step);
      if (step >= queue.length) window.clearInterval(id);
    }, REVEAL_STEP_MS);

    return () => window.clearInterval(id);
  }, [serial, queue.length]);

  return played;
}

export function isVisuallyRevealed(
  instanceId: string,
  revealed: boolean,
  queue: string[],
  played: number,
): boolean {
  const index = queue.indexOf(instanceId);
  if (index === -1) return revealed;
  return index < played;
}
