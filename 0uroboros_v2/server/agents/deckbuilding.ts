/**
 * How deck-building works in 0uroboros, as every agent is told it. Plain text only: Eco-Strat imports this too and must
 * hold no reference to Strat-G or the runtime. It explains mechanics, not goals; each agent's style and plan stay its own.
 */
export const DECKBUILDING_BASICS = `DECK-BUILDING BASICS (true for every deck, whatever its style):
- A deck is three piles: draw pile, hand and Discard. Each Cycle draws a hand of 5 from the draw pile. Played cards go to the Discard when the Cycle ends, Crypto goes there after paying in the Draft, and every card bought goes straight to the Discard.
- When the draw pile runs out, the Discard is shuffled into a new draw pile. A card bought now is first seen only after the current draw pile runs out, and from then on about once every (deck size / 5) Cycles. Draw effects pull extra cards and speed the cycle up.
- Both players start with the same small starting deck of weak cards. Those cards are there to fund the first Drafts: spend them on cards that are better than they are.
- Every card added dilutes the deck: it lowers the chance of drawing any one card, the best ones included. A purchase must raise the average hand; buying nothing beats buying filler.
- Trashing (thinning) is the reverse. Removing a weak card (Shyte-Coin, Glitch, then starting cards once better cards have replaced them) makes every later hand stronger and brings the best cards back sooner. Trash the weakest cards first, keep enough Crypto to keep buying what the plan needs, and keep the VP cards the plan scores with.
- Deck size is a trade-off: a lean deck sees its best cards often, a large one is steadier but slower. Thinning pays back over many reshuffles, so it is worth most early and little in the last Cycles.`;

/**
 * Shared opening for every AI player. Their win goals and later-Cycle objectives stay their own; Cycles 1-4 follow this
 * money-and-thinning line first. Playbook lines for the notebook; the playing code follows the same rule.
 */
export const EARLY_ECONOMY_THROUGH = 4;
export const EARLY_ECONOMY_PLAYBOOK = [
  `Cycles 1-${EARLY_ECONOMY_THROUGH} (all AI players, before your own objective): acquire Crypto and trash the weak starters. The Standard starting deck prints exactly 6 Crypto (2 Byte-Coin at 2 each + 2 Shyte-Coin at 1 each), which is exactly the cost of one Kilo-Coin (cost 6, prints 3). One Kilo-Coin replaces three Shyte-Coins of Crypto.`,
  `Cycles 1-${EARLY_ECONOMY_THROUGH} Draft: buy a Kilo-Coin as soon as the Wallet can pay 6. If Cycle 1's Wallet is under 6, buy a Byte-Coin instead. Then buy as many Mega-Cache as the Wallet allows. Skip Shyte-Coin; skip Chaos and market VP unless nothing else is worth buying.`,
  `Cycles 1-${EARLY_ECONOMY_THROUGH} trash order: Basic Encryption first (both copies). Do not trash any Crypto until you own a Kilo-Coin (or Mega-Cache). Once you have a Kilo-Coin, trash the Shyte-Coins. Aim to have both Basic Encryption and both Shyte-Coins gone by the end of Cycle ${EARLY_ECONOMY_THROUGH}. Night Scythe and other trash effects are for this.`,
  `From Cycle ${EARLY_ECONOMY_THROUGH + 1}: follow your own objective and style (aggression, engine, pure VP, or balanced). The early economy is done.`,
] as const;

/** What the playing heuristic does with these ideas; for the agents that tune its profile. */
export const DECKBUILDING_PROFILE_NOTE = `Deck-building technique (what you buy, what you trash, how lean you run) is strategy, and yours to change through experiments after Cycle ${EARLY_ECONOMY_THROUGH}. Your goal is not: how you win and by which Cycle stay as your style states. How the playing code applies these basics through your profile: Cycles 1-${EARLY_ECONOMY_THROUGH} force the shared early economy (Kilo then Mega-Cache; trash Basic Encryption first, then Shyte only after a Kilo); after that a purchase must beat dilution x the deck's average card, and trash picks follow your bar. weights.thin values trash and Scry effects when Drafting, weights.draw values card draw, and cardBias can favour specific thinning or draw cards.`;
