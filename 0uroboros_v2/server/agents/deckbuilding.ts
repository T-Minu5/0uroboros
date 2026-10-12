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

/** What the playing heuristic does with these ideas; for the agents that tune its profile. */
export const DECKBUILDING_PROFILE_NOTE = `Deck-building technique (what you buy, what you trash, how lean you run) is strategy, and yours to change through experiments. Your goal is not: how you win and by which Cycle stay as your style states. How the playing code applies these basics through your profile: a purchase must beat dilution x the deck's average card, and when one of your effects trashes your own cards it removes every card below that same bar (Shyte-Coin and Glitch always), as long as the deck keeps at least 8 cards and the Crypto per hand stays at your handCryptoTarget. weights.thin values trash and Scry effects when Drafting, weights.draw values card draw, and cardBias can favour specific thinning or draw cards.`;
