import type { MatchReport } from '@0uroboros/engine/runtime';

/**
 * Evidence flows one way: games (and Strat-G's own record of them) go out to evaluators as
 * deep-frozen copies. `publish` returns nothing, so no evaluator output can travel back to the
 * publisher through this channel.
 */
/** `human-vs-strat-g` is kept for games recorded before the human could pick any agent as the opponent. */
export type EvidenceSource = 'human-vs-agent' | 'human-vs-strat-g' | 'self-play' | 'league';
export const isHumanSource = (source: EvidenceSource) => source === 'human-vs-agent' || source === 'human-vs-strat-g';
export type StratGEvidence = {
  version: number; mode: string; plan: string; notes: string[];
  theories: { id: string; text: string; status: string; confidence: number; support: number; against: number }[];
};
export type GameEvidence = {
  id: string; source: EvidenceSource; recordedAt: string;
  /** Present for self-play games. */
  seed?: number; cohortId?: string; strategyHash?: string; durationMs?: number;
  valid: boolean; invalidReason?: string;
  report: MatchReport;
  /** The opponent agent's plan, notes and theories for a human game, when it was running (named for Strat-G, the default opponent). */
  stratG: StratGEvidence | null;
  /** Human games: the agent the human played. */
  agent?: string;
  /** League games: the agent id in each seat; human games: `human` and the agent. */
  seats?: [string, string];
};

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export function sealEvidence(evidence: GameEvidence): Readonly<GameEvidence> {
  return deepFreeze(structuredClone(evidence));
}

type Listener = (evidence: Readonly<GameEvidence>) => unknown;

export function createEvidenceBus(log: (message: string) => void = () => undefined) {
  const listeners = new Set<Listener>();
  return {
    subscribe(listener: Listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Delivers asynchronously; listener failures are logged and never reach the publisher. */
    publish(evidence: GameEvidence): void {
      const sealed = sealEvidence(evidence);
      for (const listener of listeners) {
        setImmediate(() => {
          Promise.resolve().then(() => listener(sealed)).catch(error => log(`evidence listener failed: ${error instanceof Error ? error.message : String(error)}`));
        });
      }
    },
  };
}
