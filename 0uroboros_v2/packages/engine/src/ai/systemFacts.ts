/**
 * The implemented game as plain data, compiled from the stored content and the rules constants
 * the runtime actually uses. Evaluators read this instead of importing the engine.
 */
import type { ContentDocument } from "../authoring/contentModel";
import { CURRENCY_PILES, DRAFT_COPIES_PER_PLAYER, DRAFT_EARLY_COST_MAX, DRAFT_EARLY_CYCLES, DRAFT_OFFER_COUNT, DRAFT_PHASE_SUMMARY, DRAFT_SLOT_SUMMARY, DRAFT_SOLAR_MONK_COUNT } from "../evaluationMarket";
import { defaultServerVP, initialWeights, serverMaximums, type Card } from "../game";
import { compileForSelfPlay } from "./selfPlay";
import { locationRead } from "./strategy";

export type SystemFacts = {
  rules: Record<string, string | number>;
  market: Record<string, string | number>;
  startingDeck: { name: string; count: number }[];
  cards: { id: string; name: string; pool: string; type: string; cardClass?: string; cost: number; power: number; vp?: number; cryptoValue?: number; duration?: number; text: string }[];
  locations: { id: string; name: string; rule: string; read: string }[];
  circuitRewards: { id: string; name: string; text: string; awardTrailing?: boolean }[];
};

export function systemFacts(document: ContentDocument): SystemFacts {
  const content = compileForSelfPlay(document);
  const pool = (card: Card) => content.chaosCards.some(item => item.id === card.id) ? "Chaos" : content.vpCards.some(item => item.id === card.id) ? "VP" : content.cryptoCards.some(item => item.id === card.id) ? "Crypto" : "Base";
  const deck = new Map<string, number>();
  for (const card of content.startingDeck) deck.set(card.name, (deck.get(card.name) ?? 0) + 1);
  return {
    rules: {
      cycles: 16, runtimeTurnsPerCycle: 3, handSize: 5, nodes: 5, maxCardsPerSidePerNode: 4,
      actions: "2 Actions on turn 1; later turns carry unspent Actions over, +1 per turn, plus Action effects. Each Character costs 1 Action; VP cards cost none; Crypto cannot be deployed.",
      midCycleDraw: "Setup option (default on): each player draws 1 card at the start of Runtime turns 2 and 3.",
      draftCrypto: "Setup option (default off): when on, a persistent Crypto shelf (Shyte-Coin, Byte-Coin, Kilo-Coin, Mega-Cache) sits beside the rotating Draft offer. When off, Crypto cards are not for sale — Wallet income comes from Character effects and any Crypto already held.",
      startingDeck: "Both seats use the active starting deck from content. Current Standard is weaker than older builds (mostly Shyte-Coin plus a thin Character/VP core), so early hands are softer and the Draft shapes the economy more.",
      primaryServer: serverMaximums.primary, backupServer: serverMaximums.backup,
      destructionVP: `Destroying a Primary Server gives +${defaultServerVP.primary} VP, a Backup +${defaultServerVP.backup} VP; losing both Servers ends the game (most VP wins).`,
      nodeWeights: initialWeights.join(", "),
      locations: "Each Cycle deals one Location onto each of the 5 Nodes. Whoever has more Power at a Node when it collapses at the end of the Cycle wins that Location and its collapse effects fire once with the winner as the actor. 'Ongoing' effects fire at the start of turns 2 and 3 for whoever leads the Node then; 'when a card is played here' effects fire for that card's owner. Text says who benefits: you (the winner), your opponent (the loser), both players, the player with the least VP. A Location that rewards the loser, or hands out Glitch/Shyte-Coin junk, is worth conceding; one that draws, Drains or pays VP is worth contesting. Locations won also count toward the Circuit Reward. 'read' is the default AI's valuation at Cycle 8.",
      circuit: "Whoever won more Locations in the Cycle is eligible for one random Circuit Reward; a tie makes both eligible. A reward with awardTrailing goes instead to the trailing player: lower VP once each enemy Server still standing adds the share of its destruction VP matching the share of its health already lost (both eligible when level).",
      draft: "Spendable Crypto comes from Character effects (many Base and Chaos cards now print Crypto; the rotating offer includes dedicated Crypto-gain Character slots) and any held Crypto cards that resolve at Draft. Crypto resets each Cycle. Bought cards go to the Discard. Draft lasts up to 90 seconds. Each Draft is a fresh 10-card rotating offer. Optional setup (draftCrypto, default off): a persistent Crypto shelf (Shyte-Coin, Byte-Coin, Kilo-Coin, Mega-Cache) sits beside the offer.",
      victory: "Most VP after the Cycle 16 Draft, or when a player loses both Servers.",
      setup: "Configurable per game: midCycleDraw, draftCrypto, noLocations, noTrailingRewards, Server destruction VP, and turn timers. Read those flags before assuming Crypto piles or mid-cycle draws are in play.",
    },
    market: {
      gameCharacterPiles: 0, gameVpPiles: 0,
      currency: "optional Crypto shelf when draftCrypto is on: " + (CURRENCY_PILES.length ? CURRENCY_PILES.map(pile => `${pile.cardId} x${pile.supply}`).join(", ") : "none") + "; otherwise Crypto comes from Character effects",
      rotatingOffersPerDraft: DRAFT_OFFER_COUNT, rotatingSolarMonksPerDraft: `${DRAFT_SOLAR_MONK_COUNT} Solar-monk slot when any is enabled (VP Character: 1 Action to play)`, rotatingCopiesPerPlayer: DRAFT_COPIES_PER_PLAYER,
      rotatingOfferSlots: DRAFT_SLOT_SUMMARY,
      rotatingOfferRules: DRAFT_PHASE_SUMMARY,
      earlyCycleCostCap: `Cycles 1–${DRAFT_EARLY_CYCLES}: offered cards cost 1–${DRAFT_EARLY_COST_MAX} Crypto`,
    },
    startingDeck: [...deck].map(([name, count]) => ({ name, count })),
    // Generated cards are omitted unless a player starts with them (Shyte-Coin is generated content).
    cards: content.cards.filter(card => !card.generated || content.startingDeck.some(start => (start.definitionId ?? start.id) === (card.definitionId ?? card.id))).map(card => ({
      id: card.definitionId ?? card.id, name: card.name, pool: pool(card), type: card.type, ...(card.cardClass ? { cardClass: card.cardClass } : {}),
      cost: card.cost, power: card.power ?? 0, ...(card.vp ? { vp: card.vp } : {}), ...(card.cryptoValue !== undefined ? { cryptoValue: card.cryptoValue } : {}),
      ...(card.duration ? { duration: card.duration } : {}), text: card.effect,
    })),
    locations: content.locations.map(location => ({ id: location.id, name: location.name, rule: location.rule, read: locationRead(location) })),
    circuitRewards: content.circuitRewards.map(reward => ({ id: reward.id, name: reward.name, text: reward.text ?? reward.name, ...(reward.awardTrailing ? { awardTrailing: true } : {}) })),
  };
}
