import { defaultMostCircuitsBonusVP, defaultNodeWinVP, defaultServerVP, type Servers } from '@0uroboros/engine/game';
import {
  DEFAULT_END_GAME_AWARDS,
  END_GAME_AWARD_LABELS,
  type EndGameAwardId,
  type EndGameAwards,
} from '@0uroboros/engine/runtime';
import clientRules from '../content/client-rules.json';

/** Runtime turn countdown choices in seconds; null leaves turns untimed. */
export const TURN_TIMER_CHOICES: readonly number[] = Array.from({ length: 12 }, (_, i) => 35 + i * 5);
/** Draft-phase countdown choices in seconds; null leaves Draft untimed. */
export const DRAFT_TIMER_CHOICES: readonly number[] = [60, 90, 120, 180, 240, 300, 600];
/** Fresh installs and missing localStorage use a 300s Draft timer; Off still saves as null. */
export const DEFAULT_DRAFT_SECONDS = 300;
export const SERVER_VP_MAX = 50;
export const MOST_CIRCUITS_BONUS_VP_MAX = 50;
export const NODE_WIN_VP_MAX = 50;
export const END_GAME_AWARD_VP_MAX = 50;

export type GameSetup = {
  serverVP: Servers;
  turnSeconds: number | null;
  /** Draft-phase deadline in seconds; null = no Draft timer. */
  draftSeconds: number | null;
  noLocations: boolean;
  /** Only Nodes 2–4 are in play; one opens each Runtime turn. Nodes 1 and 5 stay closed. */
  middleNodesOnly: boolean;
  /**
   * When true, the per-Cycle Circuit Reward lottery runs (Draft privilege).
   * Maps to session `noCircuitRewards: !circuitRewards`. Default off.
   */
  circuitRewards: boolean;
  /**
   * When true, Circuit Rewards with awardTrailing stay in the pool.
   * Maps to session `noTrailingRewards: !trailingRewards`. Default off.
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
  /** Configurable end-game achievement awards; ties award nothing. */
  endGameAwards: EndGameAwards;
};

export { DEFAULT_END_GAME_AWARDS, END_GAME_AWARD_LABELS, type EndGameAwardId, type EndGameAwards };

const SETUP_KEY = 'ouroboros.gameSetup';
const clampInt = (value: unknown, min: number, max: number, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

function sanitizeEndGameAwards(raw: unknown): EndGameAwards {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<EndGameAwardId, Partial<{ enabled: unknown; vp: unknown }>>>;
  const awards = { ...DEFAULT_END_GAME_AWARDS };
  for (const id of Object.keys(awards) as EndGameAwardId[]) {
    const next = value[id];
    if (!next || typeof next !== 'object') continue;
    awards[id] = {
      enabled: next.enabled === false ? false : next.enabled === true ? true : awards[id].enabled,
      vp: clampInt(next.vp, 0, END_GAME_AWARD_VP_MAX, awards[id].vp),
    };
  }
  return awards;
}

export function sanitizeGameSetup(raw: unknown): GameSetup {
  const value = (raw && typeof raw === 'object' ? raw : {}) as {
    serverVP?: Partial<Servers>; turnSeconds?: unknown; draftSeconds?: unknown; noLocations?: unknown;
    middleNodesOnly?: unknown; circuitRewards?: unknown; noCircuitRewards?: unknown;
    trailingRewards?: unknown; noTrailingRewards?: unknown;
    mostCircuitsBonusVP?: unknown; nodeWinVP?: unknown; endGameAwards?: unknown;
  };
  // Explicit true/false wins; missing keys default off (snowball tests start without Circuit privileges).
  const circuitRewards = value.circuitRewards === true || value.noCircuitRewards === false
    ? true
    : value.circuitRewards === false || value.noCircuitRewards === true
      ? false
      : false;
  const trailingRewards = value.trailingRewards === true || value.noTrailingRewards === false
    ? true
    : value.trailingRewards === false || value.noTrailingRewards === true
      ? false
      : false;
  return {
    serverVP: { primary: clampInt(value.serverVP?.primary, 0, SERVER_VP_MAX, defaultServerVP.primary), backup: clampInt(value.serverVP?.backup, 0, SERVER_VP_MAX, defaultServerVP.backup) },
    turnSeconds: typeof value.turnSeconds === 'number' && TURN_TIMER_CHOICES.includes(value.turnSeconds) ? value.turnSeconds : null,
    draftSeconds: typeof value.draftSeconds === 'number' && DRAFT_TIMER_CHOICES.includes(value.draftSeconds)
      ? value.draftSeconds
      : Object.prototype.hasOwnProperty.call(value, 'draftSeconds') && value.draftSeconds === null
        ? null
        : DEFAULT_DRAFT_SECONDS,
    noLocations: value.noLocations === true,
    middleNodesOnly: value.middleNodesOnly === true,
    circuitRewards,
    trailingRewards,
    mostCircuitsBonusVP: clampInt(value.mostCircuitsBonusVP, 0, MOST_CIRCUITS_BONUS_VP_MAX, defaultMostCircuitsBonusVP),
    nodeWinVP: clampInt(value.nodeWinVP, 0, NODE_WIN_VP_MAX, defaultNodeWinVP),
    endGameAwards: sanitizeEndGameAwards(value.endGameAwards),
  };
}

/** Landing-screen Circuit mode: which Nodes open and whether Location text is in play. */
export type CircuitMode = 'open' | 'closed' | 'short';
export const CIRCUIT_MODES: readonly { id: CircuitMode; label: string; hint: string }[] = [
  { id: 'open', label: 'Open', hint: 'Location text on' },
  { id: 'closed', label: 'Closed', hint: 'Location text off' },
  { id: 'short', label: 'Short', hint: '3 Locations, text on' },
];
export function circuitModeOf(setup: Pick<GameSetup, 'noLocations' | 'middleNodesOnly'>): CircuitMode {
  return setup.middleNodesOnly ? 'short' : setup.noLocations ? 'closed' : 'open';
}
export function circuitModeFlags(mode: CircuitMode): Pick<GameSetup, 'noLocations' | 'middleNodesOnly'> {
  return mode === 'short' ? { noLocations: false, middleNodesOnly: true }
    : mode === 'closed' ? { noLocations: true, middleNodesOnly: false }
      : { noLocations: false, middleNodesOnly: false };
}
export const circuitModeLabel = (mode: CircuitMode) => CIRCUIT_MODES.find(item => item.id === mode)!.label;

/**
 * Rules pushed from a league epoch with "Apply Epoch VP" (`content/client-rules.json`). They replace the
 * VP and Circuit settings of every client game; the player only picks timers and Circuit mode.
 */
export type ClientRulesFile = {
  appliedAt: string | null;
  epochId: number | null;
  rules: {
    serverVP: Servers; nodeWinVP: number; mostCircuitsBonusVP: number; endGameAwards: EndGameAwards;
    noCircuitRewards: boolean; noTrailingRewards: boolean;
  } | null;
};

export function withClientRules(setup: GameSetup, file: ClientRulesFile | null | undefined): GameSetup {
  const rules = file?.rules;
  if (!rules) return setup;
  return sanitizeGameSetup({
    ...setup,
    serverVP: rules.serverVP, nodeWinVP: rules.nodeWinVP, mostCircuitsBonusVP: rules.mostCircuitsBonusVP,
    endGameAwards: rules.endGameAwards, circuitRewards: !rules.noCircuitRewards,
    trailingRewards: !rules.noCircuitRewards && !rules.noTrailingRewards,
  });
}

export function loadGameSetup(): GameSetup {
  let stored: unknown = null;
  try { stored = JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null'); } catch { stored = null; }
  const value = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  // Only the player's choices persist; VP and Circuit rules always come from the applied epoch (or defaults).
  const own = sanitizeGameSetup({ turnSeconds: value.turnSeconds, draftSeconds: value.draftSeconds, noLocations: value.noLocations, middleNodesOnly: value.middleNodesOnly });
  return withClientRules(own, clientRules as ClientRulesFile);
}

export function saveGameSetup(setup: GameSetup) {
  const { turnSeconds, draftSeconds, noLocations, middleNodesOnly } = setup;
  localStorage.setItem(SETUP_KEY, JSON.stringify({ turnSeconds, draftSeconds, noLocations, middleNodesOnly }));
}
