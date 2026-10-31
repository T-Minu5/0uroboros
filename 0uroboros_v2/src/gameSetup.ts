import { defaultServerVP, type Servers } from '@0uroboros/engine/game';

/** Runtime turn countdown choices in seconds; null leaves turns untimed. */
export const TURN_TIMER_CHOICES: readonly number[] = Array.from({ length: 12 }, (_, i) => 35 + i * 5);
export const SERVER_VP_MAX = 50;

export type GameSetup = {
  serverVP: Servers;
  turnSeconds: number | null;
  noLocations: boolean;
  /** When true, Circuit Rewards with awardTrailing are never drawn. Defaults on. */
  noTrailingRewards: boolean;
  /** Persistent Crypto card shelf in Draft. Defaults off. */
  draftCrypto: boolean;
};

const SETUP_KEY = 'ouroboros.gameSetup';
const clampInt = (value: unknown, min: number, max: number, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

export function sanitizeGameSetup(raw: unknown): GameSetup {
  const value = (raw && typeof raw === 'object' ? raw : {}) as {
    serverVP?: Partial<Servers>; turnSeconds?: unknown; noLocations?: unknown; noTrailingRewards?: unknown; draftCrypto?: unknown;
  };
  return {
    serverVP: { primary: clampInt(value.serverVP?.primary, 0, SERVER_VP_MAX, defaultServerVP.primary), backup: clampInt(value.serverVP?.backup, 0, SERVER_VP_MAX, defaultServerVP.backup) },
    turnSeconds: typeof value.turnSeconds === 'number' && TURN_TIMER_CHOICES.includes(value.turnSeconds) ? value.turnSeconds : null,
    noLocations: value.noLocations === true,
    noTrailingRewards: value.noTrailingRewards !== false,
    draftCrypto: value.draftCrypto === true,
  };
}

export function loadGameSetup(): GameSetup {
  try { return sanitizeGameSetup(JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null')); }
  catch { return sanitizeGameSetup(null); }
}

export function saveGameSetup(setup: GameSetup) {
  localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
}
