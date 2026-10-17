import { DEFAULT_STRATEGY, sanitizeProfile, type StrategyProfile } from './strategy';

/**
 * The opponents a player can face, as published content. Each is a name, a one-line style and the `StrategyProfile`
 * the runtime brain plays. They travel inside the content pack, so a re-tuned opponent reaches connected clients
 * through the pack rollout without a client release; only changes to the brain's code need one.
 */
export type AuthoredOpponent = { id: string; name: string; style: string; profile: StrategyProfile };

/** Strat-G's three phases, set by the designer: economy and engine, a balanced midgame, then attack and VP. */
export const STRAT_G_PHASES = { economyUntilCycle: 4, midgameMix: 0.5, endgameFromCycle: 9 } as const;

/** The league's founding baselines; the agents' learning starts from these and the shipped pack starts with them. */
export const DEFAULT_OPPONENTS: readonly AuthoredOpponent[] = [
  {
    id: 'strat-g', name: 'Strat-G', style: 'Balanced',
    profile: {
      ...DEFAULT_STRATEGY, cardBias: {},
      plan: 'Shared early economy through Cycle 4 (Kilo-Coin then Mega-Cache; trash Basic Encryption, then Shyte after a Kilo); balanced midgame in Cycles 5-8 (attacks, engine, Server Restore and VP each get a share); from Cycle 9 attack the Servers hard and buy mostly VP.',
      economyUntilCycle: STRAT_G_PHASES.economyUntilCycle, chaosFromCycle: STRAT_G_PHASES.endgameFromCycle, vpFromCycle: STRAT_G_PHASES.endgameFromCycle, midgameMix: STRAT_G_PHASES.midgameMix,
      weights: { ...DEFAULT_STRATEGY.weights, drain: 2.4, vp: 2.6 },
    },
  },
  {
    id: 't-5', name: 'T-5', style: 'Pure aggression',
    profile: {
      ...DEFAULT_STRATEGY, cardBias: {},
      plan: 'Shared early economy through Cycle 4 (Kilo then Mega-Cache; trash Basic Encryption and Shyte), then pure aggression: Chaos and Drain to destroy both Servers, whatever their integrity, by Cycles 10-13. VP cards only to close out a won race.',
      economyUntilCycle: 4, chaosFromCycle: 5, vpFromCycle: 11, handCryptoTarget: 7, minBuyScore: 0.5, dilution: 0.3,
      weights: { power: 1.4, draw: 1.2, actions: 1.2, crypto: 0.8, drain: 3.4, restore: 0.5, vp: 1.4, duration: 0.6, thin: 0.8, disrupt: 1.4, chaos: 2.8 },
    },
  },
  {
    id: 'dv-8', name: 'DV-8', style: 'Engine',
    profile: {
      ...DEFAULT_STRATEGY, cardBias: {},
      plan: 'Shared early economy through Cycle 4 (Kilo then Mega-Cache; trash Basic Encryption and Shyte), then engine: keep thinning, buy draw, Action and big Crypto through Cycle 7, defend with Restore, Chaos only late, heavy VP from Cycle 13.',
      economyUntilCycle: 7, chaosFromCycle: 10, vpFromCycle: 13, handCryptoTarget: 12, minBuyScore: 1.2, dilution: 0.9,
      weights: { power: 0.9, draw: 2.2, actions: 1.6, crypto: 1.3, drain: 1, restore: 1.8, vp: 2.8, duration: 1, thin: 2.4, disrupt: 0.6, chaos: 0.8 },
    },
  },
  {
    id: 'vp-dog', name: 'VP-Dog', style: 'Pure economy',
    profile: {
      ...DEFAULT_STRATEGY, cardBias: {},
      plan: 'Shared early economy through Cycle 4 (Kilo then Mega-Cache; trash Basic Encryption and Shyte), then pure economy: finish Crypto/draw/Actions in Cycle 5, then the most VP the Wallet affords every Draft from Cycle 6, aiming for 25+ VP bought by Cycles 11-14. Restore when the Servers take real damage; Chaos and Drain almost never.',
      economyUntilCycle: 5, chaosFromCycle: 13, vpFromCycle: 6, handCryptoTarget: 13, minBuyScore: 0.6, dilution: 0.4,
      weights: { power: 0.8, draw: 1.8, actions: 1.3, crypto: 1.8, drain: 0.5, restore: 1.6, vp: 3.8, duration: 0.8, thin: 1.4, disrupt: 0.4, chaos: 0.3 },
    },
  },
];

/** The pack's opponents in fresh copies; a document without any gets the founding baselines. */
export function defaultOpponents(): AuthoredOpponent[] {
  return DEFAULT_OPPONENTS.map(opponent => ({ ...opponent, profile: sanitizeProfile(opponent.profile) }));
}

/** The founding baseline of one opponent, sanitized; `DEFAULT_STRATEGY` for an unknown id. */
export function opponentBaseline(id: string): StrategyProfile {
  const found = DEFAULT_OPPONENTS.find(opponent => opponent.id === id);
  return sanitizeProfile(found ? found.profile : DEFAULT_STRATEGY);
}

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value as object).sort().map(key => [key, sortKeys((value as Record<string, unknown>)[key])]));
  return value;
};
/** True when `profile` is already legal: sanitizing it changes nothing, so every client plays exactly what was published. */
export function isCanonicalProfile(profile: unknown): boolean {
  if (!profile || typeof profile !== 'object') return false;
  return JSON.stringify(sortKeys(sanitizeProfile(profile))) === JSON.stringify(sortKeys(profile));
}

/** Finds an opponent by id; the first one when the id is missing or unknown, null when the pack has none. */
export function pickOpponent(opponents: readonly AuthoredOpponent[] | undefined, id: string | null | undefined): AuthoredOpponent | null {
  if (!opponents?.length) return null;
  return opponents.find(opponent => opponent.id === id) ?? opponents[0];
}
