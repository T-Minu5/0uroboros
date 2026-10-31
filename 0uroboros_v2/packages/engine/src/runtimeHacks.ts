import type { PlayerId } from './game';
import type { EffectStep } from './effects/types';

/** When a seat's reveals are counted toward unlocking a hack. */
export type RuntimeHackWindow = 'game' | 'cycle' | 'turn' | 'location' | 'locationCycle';
export const RUNTIME_HACK_WINDOWS: readonly RuntimeHackWindow[] = ['game', 'cycle', 'turn', 'location', 'locationCycle'];

export type RuntimeHackDefinition = {
  id: string;
  name: string;
  window: RuntimeHackWindow;
  /** Required card definitionIds; order does not matter. */
  cards: readonly string[];
  /** Player-facing unlock formula shown in the award modal. */
  formula: string;
  effects: readonly EffectStep[];
};

export type AuthoredRuntimeHack = RuntimeHackDefinition & { enabled: boolean };

/** One revealed card counted for Runtime Hack combos. */
export type RevealRecord = {
  definitionId: string;
  node: number;
  cycle: number;
  turn: number;
  owner: PlayerId;
};

export function suggestRuntimeHackFormula(window: RuntimeHackWindow, cardNames: readonly string[]): string {
  const list = cardNames.length ? cardNames.join(', ') : 'the required cards';
  switch (window) {
    case 'game': return `Reveal ${list} at least once during the game.`;
    case 'cycle': return `Reveal ${list} in the same Cycle.`;
    case 'turn': return `Reveal ${list} in the same Runtime turn.`;
    case 'location': return `Reveal ${list} at the same Node at any point in the game.`;
    case 'locationCycle': return `Reveal ${list} at the same Node during the same Cycle.`;
  }
}

/** Whether `owner`'s reveal history satisfies `hack` given the reveal that just completed (`at`). */
export function matchesRuntimeHack(hack: RuntimeHackDefinition, reveals: readonly RevealRecord[], owner: PlayerId, at: RevealRecord): boolean {
  const required = hack.cards;
  if (required.length < 2) return false;
  const mine = reveals.filter(entry => entry.owner === owner);
  const pool = (() => {
    switch (hack.window) {
      case 'game': return mine;
      case 'cycle': return mine.filter(entry => entry.cycle === at.cycle);
      case 'turn': return mine.filter(entry => entry.cycle === at.cycle && entry.turn === at.turn);
      case 'location': return mine.filter(entry => entry.node === at.node);
      case 'locationCycle': return mine.filter(entry => entry.node === at.node && entry.cycle === at.cycle);
    }
  })();
  return required.every(id => pool.some(entry => entry.definitionId === id));
}

/** Hacks newly unlocked by this reveal that have not already been awarded to the seat. */
export function unlockedRuntimeHacks(
  hacks: readonly RuntimeHackDefinition[],
  reveals: readonly RevealRecord[],
  awarded: ReadonlySet<string>,
  at: RevealRecord,
): RuntimeHackDefinition[] {
  return hacks.filter(hack => {
    if (awarded.has(`${hack.id}:${at.owner}`)) return false;
    return matchesRuntimeHack(hack, reveals, at.owner, at);
  });
}
