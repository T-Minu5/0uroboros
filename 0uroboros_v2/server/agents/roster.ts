import { DEFAULT_STRATEGY, sanitizeProfile, type StrategyProfile, type StrategyWeights } from '@0uroboros/engine/ai/strategy';

/**
 * The league's players. Each has its own baseline, playbook and style envelope: every
 * profile it plays (baseline, adopted changes, experiments) is clamped into the envelope, so
 * learning sharpens a style instead of letting them drift into the same strategy.
 * Agents never read each other's identities, memories or plans; only the league referee sees
 * their frozen profiles, to run games.
 */

type Range = readonly [number, number];
export type StyleEnvelope = {
  economyUntilCycle?: Range; chaosFromCycle?: Range; vpFromCycle?: Range; handCryptoTarget?: Range;
  minBuyScore?: Range; dilution?: Range;
  weights?: Partial<Record<keyof StrategyWeights, Range>>;
};
export type LeagueAgentId = 'strat-g' | 't-5' | 'dv-8' | 'vp-dog';
export type StrategistIdentity = {
  id: LeagueAgentId;
  name: string;
  /** The deck archetype the designer balances against; Eco-Strat reports results by it. */
  archetype: string;
  /** One line for the UI. */
  style: string;
  /** How the agent thinks of itself; goes into its own model prompt only. */
  persona: string;
  baseline: StrategyProfile;
  /** Omitted for Strat-G, whose playbook lives with the strategist. */
  playbook?: string[];
  envelope: StyleEnvelope;
  foundingNotes?: string[];
};

const SCALARS = ['economyUntilCycle', 'chaosFromCycle', 'vpFromCycle', 'handCryptoTarget', 'minBuyScore', 'dilution'] as const;
const clamp = (value: number, [min, max]: Range) => Math.min(max, Math.max(min, value));

/** Clamps a profile into a style envelope (and the runtime bounds). */
export function clampToEnvelope(profile: StrategyProfile, envelope: StyleEnvelope): StrategyProfile {
  const shaped: StrategyProfile = { ...profile, weights: { ...profile.weights }, cardBias: { ...profile.cardBias } };
  for (const field of SCALARS) { const range = envelope[field]; if (range) shaped[field] = clamp(shaped[field], range); }
  for (const [key, range] of Object.entries(envelope.weights ?? {}) as [keyof StrategyWeights, Range][]) shaped.weights[key] = clamp(shaped.weights[key], range);
  if (envelope.chaosFromCycle) shaped.chaosFromCycle = clamp(Math.max(shaped.chaosFromCycle, shaped.economyUntilCycle + 1), envelope.chaosFromCycle);
  return sanitizeProfile(shaped, profile);
}

export function describeEnvelope(envelope: StyleEnvelope): string {
  const parts: string[] = [];
  for (const field of SCALARS) { const range = envelope[field]; if (range) parts.push(`${field} ${range[0]}-${range[1]}`); }
  for (const [key, range] of Object.entries(envelope.weights ?? {}) as [string, Range][]) parts.push(`${key} weight ${range[0]}-${range[1]}`);
  return parts.join(', ');
}

/** Strat-G's three phases, set by the designer: economy and engine, a balanced midgame, then attack and VP. */
export const STRAT_G_PHASES = { economyUntilCycle: 4, midgameMix: 0.5, endgameFromCycle: 9 } as const;

export const STRAT_G: StrategistIdentity = {
  id: 'strat-g', name: 'Strat-G', archetype: 'Balanced',
  style: 'Balanced in three phases: economy and engine (Cycles 1-4), a balanced midgame (5-8), then all-out Server attacks and VP buying (9-16).',
  persona: `You play the designer's balanced line in three phases, and you plan every game around them. Phase 1 (Cycles 1-${STRAT_G_PHASES.economyUntilCycle}): economy and deck engine (high-value Crypto, draw, Actions, thinning). Phase 2 (Cycles ${STRAT_G_PHASES.economyUntilCycle + 1}-${STRAT_G_PHASES.endgameFromCycle - 1}): a balance of attacks, deck engine, Server Restore and VP collection. Phase 3 (Cycles ${STRAT_G_PHASES.endgameFromCycle}-16): attack the enemy Servers like crazy and spend mostly on VP. The phase Cycles are fixed by the designer, so experiment on weights, the buy bar, dilution and card biases, not on timing. Adapt to the opponent without abandoning that shape.`,
  baseline: {
    ...DEFAULT_STRATEGY, cardBias: {},
    plan: 'Three phases: economy and deck engine through Cycle 4 (high-value Crypto, draw, Actions, thinning); a balanced midgame in Cycles 5-8 (attacks, engine, Server Restore and VP each get a share); from Cycle 9 attack the Servers hard and buy mostly VP.',
    economyUntilCycle: STRAT_G_PHASES.economyUntilCycle, chaosFromCycle: STRAT_G_PHASES.endgameFromCycle, vpFromCycle: STRAT_G_PHASES.endgameFromCycle, midgameMix: STRAT_G_PHASES.midgameMix,
    weights: { ...DEFAULT_STRATEGY.weights, drain: 2.4, vp: 2.6 },
  },
  envelope: {
    economyUntilCycle: [STRAT_G_PHASES.economyUntilCycle, STRAT_G_PHASES.economyUntilCycle],
    chaosFromCycle: [STRAT_G_PHASES.endgameFromCycle, STRAT_G_PHASES.endgameFromCycle],
    vpFromCycle: [STRAT_G_PHASES.endgameFromCycle, STRAT_G_PHASES.endgameFromCycle],
    handCryptoTarget: [7, 12], weights: { vp: [1.6, 3], drain: [1.4, 3] },
  },
};

export const T_5: StrategistIdentity = {
  id: 't-5', name: 'T-5', archetype: 'Pure aggression',
  style: 'Pure aggression: almost no economy, Chaos and Drain from Cycle 3, both enemy Servers destroyed by Cycles 10-13.',
  persona: 'You are T-5, a countdown and the pure aggression deck. Your goal is Server destruction: destroy both enemy Servers and end the game by Cycles 10-13, before the opponent\'s engine or VP buying pays off. The damage that takes is the full integrity of both Servers as the rules state it, plus whatever the opponent Restores; the designer may rebalance that integrity, so the number can change but the goal does not. Minimal economy, Chaos and Drain from the first Cycles, Power and disruption to take Nodes, little defense and little VP. Destroying both Servers ends the game, but the most VP still wins, so your destruction VP plus a few VP cards bought to close out a won race must be enough at that moment. When you lose, it is because the kill came too late or the Drain ran dry, not because you rushed.',
  baseline: {
    ...DEFAULT_STRATEGY, cardBias: {},
    plan: 'Pure aggression: one or two Cycles of cheap Power and Action cards, then Chaos and Drain from Cycle 3, keeping enough Drain on pace over Cycles 3-12 to destroy both Servers, whatever their integrity, by Cycles 10-13. VP cards only to close out a won race.',
    economyUntilCycle: 2, chaosFromCycle: 3, vpFromCycle: 11, handCryptoTarget: 7, minBuyScore: 0.5, dilution: 0.3,
    weights: { power: 1.4, draw: 1.2, actions: 1.2, crypto: 0.8, drain: 3.4, restore: 0.5, vp: 1.4, duration: 0.6, thin: 0.8, disrupt: 1.4, chaos: 2.8 },
  },
  playbook: [
    'Draft: cheap Power, Action and Drain cards first; a big Crypto card only when nothing aggressive is affordable. Never Shyte-Coin.',
    'Deploy: commit Power early to win Nodes and their rewards; Drain cards go out as soon as they are drawn.',
    'Choices: hit the opponent\'s best economy and draw cards; trash my own dead Crypto.',
    'Arc: Chaos from Cycle 3, the Primary down in the midgame, the Backup by Cycles 10-13; VP cards only to close out a won race.',
  ],
  envelope: { economyUntilCycle: [1, 4], chaosFromCycle: [3, 6], vpFromCycle: [9, 15], handCryptoTarget: [6, 10], weights: { drain: [2.4, 5], chaos: [2, 5], restore: [0, 1], vp: [0.5, 2], crypto: [0.6, 1.6], thin: [0.5, 1.8] } },
  foundingNotes: ['Founding style: pure aggression. Minimal economy, Chaos and Drain from Cycle 3, both enemy Servers destroyed by Cycles 10-13. The goal is destruction; the damage it takes is both Servers\' integrity in the current rules, which may change. Learning may sharpen the attack; it may not turn it into an engine or a VP deck.'],
};

export const DV_8: StrategistIdentity = {
  id: 'dv-8', name: 'DV-8', archetype: 'Engine',
  style: 'Engine and control: a long thin, draw-heavy economy, solid Restore, then late heavy VP.',
  persona: 'You are DV-8, the deviant: you refuse the race. You build a long, thin, draw-heavy engine, keep your Servers healthy with Restore, and win late on heavy VP after the opponent burns out. When you lose, it is because the engine came online too late or the deck was not thin enough, not because you should have rushed.',
  baseline: {
    ...DEFAULT_STRATEGY, cardBias: {},
    plan: 'Engine: trash weak cards and buy draw, Action and big Crypto through Cycle 7, defend the Servers with Restore, add Chaos only late, then buy heavy VP from Cycle 13.',
    economyUntilCycle: 7, chaosFromCycle: 10, vpFromCycle: 13, handCryptoTarget: 12, minBuyScore: 1.2, dilution: 0.9,
    weights: { power: 0.9, draw: 2.2, actions: 1.6, crypto: 1.3, drain: 1, restore: 1.8, vp: 2.8, duration: 1, thin: 2.4, disrupt: 0.6, chaos: 0.8 },
  },
  playbook: [
    'Draft: thinning, draw and Action cards and big Crypto (Kilo, Mega-Cache) through the long economy; skip anything that dilutes the deck. Never Shyte-Coin.',
    'Deploy: draw and Action cards first so the engine chains; Restore whenever the Servers take real damage.',
    'Choices: trash my own junk aggressively (Shyte-Coin, Glitch, weak Crypto) to keep the deck thin.',
    'Arc: survive the early pressure, let the engine take over, Chaos only as a late finisher, then heavy VP buying from Cycle 13.',
  ],
  envelope: { economyUntilCycle: [5, 10], chaosFromCycle: [8, 15], vpFromCycle: [11, 16], handCryptoTarget: [9, 16], weights: { thin: [1.8, 5], draw: [1.8, 5], chaos: [0, 1.2], drain: [0, 1.5] } },
  foundingNotes: ['Founding style: engine and control. A long, thin, draw-heavy economy, Restore for defense, late heavy VP. Learning may sharpen the engine; it may not turn it into a rush.'],
};

export const VP_DOG: StrategistIdentity = {
  id: 'vp-dog', name: 'VP-Dog', archetype: 'Pure economy',
  style: 'Pure economy: big Crypto and draw first, VP every Draft from the midgame, 25+ VP bought by Cycles 11-14.',
  persona: 'You are VP-Dog, the pure economy deck: you hound the VP piles. Your aim is to buy about 25 or more VP from the market by Cycles 11-14 and win on points. Build an economy of high-value Crypto, draw and Actions early, start buying VP cards in the midgame and keep buying them every Draft, keep your Servers alive with Restore long enough for the points to count, and almost never spend on Chaos or Drain. The most VP wins, whether the game reaches the Cycle 16 Draft or ends early because a player loses both Servers, so be ahead on VP whenever the opponent could finish your Servers. When you lose, it is because the VP came too slowly or your Servers fell before the points added up, not because you should have attacked.',
  baseline: {
    ...DEFAULT_STRATEGY, cardBias: {},
    plan: 'Pure economy: big Crypto (Kilo-Coin, Mega-Cache), draw and Action cards through Cycle 5, then the most VP the Wallet affords every Draft from Cycle 6, aiming for 25+ VP bought by Cycles 11-14. Restore when the Servers take real damage; Chaos and Drain almost never.',
    economyUntilCycle: 5, chaosFromCycle: 13, vpFromCycle: 6, handCryptoTarget: 13, minBuyScore: 0.6, dilution: 0.4,
    weights: { power: 0.8, draw: 1.8, actions: 1.3, crypto: 1.8, drain: 0.5, restore: 1.6, vp: 3.8, duration: 0.8, thin: 1.4, disrupt: 0.4, chaos: 0.3 },
  },
  playbook: [
    'Draft: through the economy buy the biggest Crypto (Kilo-Coin, Mega-Cache) plus draw and Action cards; from Cycle 6 spend most of every Wallet on VP piles, most VP per Crypto first. Never Shyte-Coin; skip Chaos.',
    'Deploy: draw and Action cards first, VP cards whenever they are drawn (they cost no Actions); Restore as soon as the Servers take real damage.',
    'Choices: trash my own junk (Shyte-Coin, Glitch) so the big Crypto comes up more often; protect my Servers before hurting the opponent.',
    'Arc: economy until Cycle 5, then VP every Draft, 25+ VP bought by Cycles 11-14, staying ahead on VP whenever my Servers are in danger.',
  ],
  envelope: { economyUntilCycle: [3, 7], chaosFromCycle: [11, 15], vpFromCycle: [5, 9], handCryptoTarget: [10, 16], weights: { vp: [3, 5], crypto: [1.4, 5], drain: [0, 1], chaos: [0, 0.8] } },
  foundingNotes: ['Founding style: pure economy. Big Crypto and draw early, VP from the midgame, Restore for defense, almost no Chaos or Drain; the target is 25+ VP bought from the market by Cycles 11-14. Learning may sharpen the economy; it may not turn it into a rush.'],
};

export const LEAGUE_ROSTER: readonly StrategistIdentity[] = [STRAT_G, T_5, DV_8, VP_DOG];
