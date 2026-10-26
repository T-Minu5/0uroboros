import { sanitizeProfile, type StrategyProfile, type StrategyWeights } from '@0uroboros/engine/ai/strategy';
import { STRAT_G_PHASES, opponentBaseline } from '@0uroboros/engine/ai/opponents';
export { STRAT_G_PHASES };

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

export const STRAT_G: StrategistIdentity = {
  id: 'strat-g', name: 'Strat-G', archetype: 'Balanced',
  style: 'Balanced in three phases: economy and engine (Cycles 1-4), a balanced midgame (5-8), then all-out Server attacks and VP buying (9-16).',
  persona: `You play the designer's balanced line in three phases, and you plan every game around them. Cycles 1-4 follow the shared early economy (Characters that print Crypto, or Kilo/Mega when the Crypto shelf is on; trash Basic Encryption then Shyte after a better Crypto source) before your own line — the current starting deck is weaker than older builds, which gives more Draft flexibility. Phase 2 (Cycles ${STRAT_G_PHASES.economyUntilCycle + 1}-${STRAT_G_PHASES.endgameFromCycle - 1}): a balance of attacks, deck engine, Server Restore and VP collection. Phase 3 (Cycles ${STRAT_G_PHASES.endgameFromCycle}-16): attack the enemy Servers like crazy and spend mostly on VP. The phase Cycles are fixed by the designer, so experiment on weights, the buy bar, dilution and card biases, not on timing. Adapt to the opponent without abandoning that shape.`,
  baseline: opponentBaseline('strat-g'),
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
  persona: 'You are T-5, a countdown and the pure aggression deck. Your goal is Server destruction: destroy both enemy Servers and end the game by Cycles 10-13, before the opponent\'s engine or VP buying pays off. The damage that takes is the full integrity of both Servers as the rules state it, plus whatever the opponent Restores; the designer may rebalance that integrity, so the number can change but the goal does not. Cycles 1-4 follow the shared early economy first; from Cycle 5 play minimal further economy, Chaos and Drain, Power and disruption to take Nodes, little defense and little VP. Destroying both Servers ends the game, but the most VP still wins, so your destruction VP plus a few VP cards bought to close out a won race must be enough at that moment. When you lose, it is because the kill came too late or the Drain ran dry, not because you rushed.',
  baseline: opponentBaseline('t-5'),
  playbook: [
    'Draft from Cycle 5: cheap Power, Action and Drain cards first; further Crypto income only when nothing aggressive is affordable. Never Shyte-Coin.',
    'Deploy: commit Power early to win Nodes and their rewards; Drain cards go out as soon as they are drawn.',
    'Choices from Cycle 5: hit the opponent\'s best economy and draw cards; trash my own dead Crypto.',
    'Arc: after the shared early economy, Chaos and Drain hard; Primary down in the midgame, Backup by Cycles 10-13; VP cards only to close out a won race.',
  ],
  envelope: { economyUntilCycle: [4, 4], chaosFromCycle: [5, 7], vpFromCycle: [9, 15], handCryptoTarget: [6, 10], weights: { drain: [2.4, 5], chaos: [2, 5], restore: [0, 1], vp: [0.5, 2], crypto: [0.6, 1.6], thin: [0.5, 5] } },
  foundingNotes: ['Founding style: pure aggression. Minimal economy, Chaos and Drain from Cycle 3, both enemy Servers destroyed by Cycles 10-13. The goal is destruction; the damage it takes is both Servers\' integrity in the current rules, which may change. Learning may sharpen the attack; it may not turn it into an engine or a VP deck.'],
};

export const DV_8: StrategistIdentity = {
  id: 'dv-8', name: 'DV-8', archetype: 'Engine',
  style: 'Engine and control: a long thin, draw-heavy economy, solid Restore, then late heavy VP.',
  persona: 'You are DV-8, the deviant: you refuse the race. Cycles 1-4 follow the shared early economy first. Then you build a long, thin, draw-heavy engine, keep your Servers healthy with Restore, and win late on heavy VP after the opponent burns out. When you lose, it is because the engine came online too late or the deck was not thin enough, not because you should have rushed.',
  baseline: opponentBaseline('dv-8'),
  playbook: [
    'Draft from Cycle 5: keep thinning, draw and Action cards and high Crypto income (Character Crypto lines, or Kilo/Mega when the shelf is on) through the long economy; skip anything that dilutes the deck. Never Shyte-Coin.',
    'Deploy: draw and Action cards first so the engine chains; Restore whenever the Servers take real damage.',
    'Choices from Cycle 5: trash my own junk aggressively (remaining Shyte, Glitch, weak Crypto) to keep the deck thin.',
    'Arc: after the shared early economy, survive pressure, let the engine take over, Chaos only as a late finisher, then heavy VP buying from Cycle 13.',
  ],
  envelope: { economyUntilCycle: [5, 10], chaosFromCycle: [8, 15], vpFromCycle: [11, 16], handCryptoTarget: [9, 16], weights: { thin: [1.8, 5], draw: [1.8, 5], chaos: [0, 1.2], drain: [0, 1.5] } },
  foundingNotes: ['Founding style: engine and control. A long, thin, draw-heavy economy, Restore for defense, late heavy VP. Learning may sharpen the engine; it may not turn it into a rush.'],
};

export const VP_DOG: StrategistIdentity = {
  id: 'vp-dog', name: 'VP-Dog', archetype: 'Pure economy',
  style: 'Pure economy: big Crypto and draw first, VP every Draft from the midgame, 25+ VP bought by Cycles 11-14.',
  persona: 'You are VP-Dog, the pure economy deck: you hound the VP piles. Your aim is to buy about 25 or more VP from the market by Cycles 11-14 and win on points. Cycles 1-4 follow the shared early economy first; then keep buying draw and Actions, start buying VP cards in the midgame and keep buying them every Draft, keep your Servers alive with Restore long enough for the points to count, and almost never spend on Chaos or Drain. The most VP wins, whether the game reaches the Cycle 16 Draft or ends early because a player loses both Servers, so be ahead on VP whenever the opponent could finish your Servers. When you lose, it is because the VP came too slowly or your Servers fell before the points added up, not because you should have attacked.',
  baseline: opponentBaseline('vp-dog'),
  playbook: [
    'Draft from Cycle 5: finish Crypto income upgrades (Character Crypto lines, or Kilo/Mega when the shelf is on) plus draw and Action cards; from Cycle 6 spend most of every Wallet on VP piles, most VP per Crypto first. Never Shyte-Coin; skip Chaos.',
    'Deploy: draw and Action cards first, VP cards whenever they are drawn (they cost no Actions); Restore as soon as the Servers take real damage.',
    'Choices from Cycle 5: trash any remaining junk (Shyte-Coin, Glitch) so the strong Crypto income comes up more often; protect my Servers before hurting the opponent.',
    'Arc: shared early economy through Cycle 4, then VP every Draft from the midgame, 25+ VP bought by Cycles 11-14, staying ahead on VP whenever my Servers are in danger.',
  ],
  envelope: { economyUntilCycle: [3, 7], chaosFromCycle: [11, 15], vpFromCycle: [5, 9], handCryptoTarget: [10, 16], weights: { vp: [3, 5], crypto: [1.4, 5], drain: [0, 1], chaos: [0, 0.8] } },
  foundingNotes: ['Founding style: pure economy. Big Crypto and draw early, VP from the midgame, Restore for defense, almost no Chaos or Drain; the target is 25+ VP bought from the market by Cycles 11-14. Learning may sharpen the economy; it may not turn it into a rush.'],
};

export const LEAGUE_ROSTER: readonly StrategistIdentity[] = [STRAT_G, T_5, DV_8, VP_DOG];
