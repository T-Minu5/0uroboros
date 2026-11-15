import { defaultMostCircuitsBonusVP, defaultNodeWinVP, defaultServerVP, type Servers } from '@0uroboros/engine/game';

/** Runtime turn countdown choices in seconds; null leaves turns untimed. */
export const TURN_TIMER_CHOICES: readonly number[] = Array.from({ length: 12 }, (_, i) => 35 + i * 5);
/** Draft-phase countdown choices in seconds; null leaves Draft untimed. */
export const DRAFT_TIMER_CHOICES: readonly number[] = Array.from({ length: 12 }, (_, i) => 35 + i * 5);
export const SERVER_VP_MAX = 50;
export const MOST_CIRCUITS_BONUS_VP_MAX = 50;
export const NODE_WIN_VP_MAX = 50;

export type GameSetup = {
  serverVP: Servers;
  turnSeconds: number | null;
  /** Draft-phase deadline in seconds; null = no Draft timer. */
  draftSeconds: number | null;
  noLocations: boolean;
  /** Only Nodes 2–4 are in play; one opens each Runtime turn. Nodes 1 and 5 stay closed. */
  middleNodesOnly: boolean;
  /**
   * When true, Circuit Rewards with awardTrailing stay in the pool.
   * Maps to session `noTrailingRewards: !trailingRewards`.
   */
  trailingRewards: boolean;
  /**
   * End-game bonus VP for the player who won more Circuits across the game (strict Location lead
   * per Cycle). Eco-Strat initial default is 6; 0 disables the bonus.
   */
  mostCircuitsBonusVP: number;
  /**
   * VP awarded on Collapse to whoever controls a Node (strict Power lead). Ties award nothing.
   * Default 1; 0 disables.
   */
  nodeWinVP: number;
};

const SETUP_KEY = 'ouroboros.gameSetup';
const clampInt = (value: unknown, min: number, max: number, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

export function sanitizeGameSetup(raw: unknown): GameSetup {
  const value = (raw && typeof raw === 'object' ? raw : {}) as {
    serverVP?: Partial<Servers>; turnSeconds?: unknown; draftSeconds?: unknown; noLocations?: unknown;
    middleNodesOnly?: unknown; trailingRewards?: unknown; noTrailingRewards?: unknown;
    mostCircuitsBonusVP?: unknown; nodeWinVP?: unknown;
  };
  const trailingRewards = value.trailingRewards === false || value.noTrailingRewards === true
    ? false
    : value.trailingRewards === true || value.noTrailingRewards === false
      ? true
      : true;
  return {
    serverVP: { primary: clampInt(value.serverVP?.primary, 0, SERVER_VP_MAX, defaultServerVP.primary), backup: clampInt(value.serverVP?.backup, 0, SERVER_VP_MAX, defaultServerVP.backup) },
    turnSeconds: typeof value.turnSeconds === 'number' && TURN_TIMER_CHOICES.includes(value.turnSeconds) ? value.turnSeconds : null,
    draftSeconds: typeof value.draftSeconds === 'number' && DRAFT_TIMER_CHOICES.includes(value.draftSeconds) ? value.draftSeconds : null,
    noLocations: value.noLocations === true,
    middleNodesOnly: value.middleNodesOnly === true,
    trailingRewards,
    mostCircuitsBonusVP: clampInt(value.mostCircuitsBonusVP, 0, MOST_CIRCUITS_BONUS_VP_MAX, defaultMostCircuitsBonusVP),
    nodeWinVP: clampInt(value.nodeWinVP, 0, NODE_WIN_VP_MAX, defaultNodeWinVP),
  };
}

export function loadGameSetup(): GameSetup {
  try { return sanitizeGameSetup(JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null')); }
  catch { return sanitizeGameSetup(null); }
}

export function saveGameSetup(setup: GameSetup) {
  localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
}
