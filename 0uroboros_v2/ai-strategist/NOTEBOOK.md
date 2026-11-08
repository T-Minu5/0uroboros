# Strat-G notebook

Written by Strat-G, the AI opponent's strategy agent. Each dev-server start reads this notebook (and `memory.json`), plans, plays, and leaves notes here. Its version changes only when the profile it plays changes.

How Strat-G learns: it plays the protected baseline below plus the changes its experiments have earned. It changes its play only through experiments: one bounded change at a time, played by the league referee as paired games (the experiment and the current best face the same sampled opponents on the same seeds). Code measures the results and adopts or rejects the change. Theory scores are associations (winner/loser patterns), not causal proof; "supported" is not adoption-ready. It never sees the other agents' profiles, plans or notebooks, only who it played and the results.

Style: Balanced in three phases: economy and engine (Cycles 1-4), a balanced midgame (5-8), then all-out Server attacks and VP buying (9-16).

Style envelope (every profile is clamped into it): economyUntilCycle 4-4, chaosFromCycle 9-9, vpFromCycle 9-9, handCryptoTarget 7-12, vp weight 1.6-3, drain weight 1.4-3.

## Current agent: v1.25 (model-assisted)

Record against the human (complete games only): 3 wins, 11 losses, 0 ties over 14 games. Ignored 28 sessions that were not complete games.

League snapshots (newest first): strat-g@v1.25, strat-g@v1.24, strat-g@v1.23, strat-g@v1.22, strat-g@v1.21

### Plan of play

_Documentary only: the numeric profile below governs what is actually played. The plan must not invent settings the profile does not have._

I will follow the designer's baseline while incorporating strategies for early aggression and server defense. My focus will be on raising Wallet income through Cycles 1-4 by drafting Characters that print Crypto and trashing weak cards. In Cycles 5-8, I will balance attacks, engine development, Server Restore, and VP collection, while adapting to the power dynamics of Locations. From Cycle 9 onward, I will ramp up aggression against the opponent's Servers while prioritizing VP cards. My strategy will evolve based on the opponent's moves, maintaining a schedule of economy through Cycle 4, balan (Schedule: economy through Cycle 4, balanced midgame Cycles 5-8, Chaos from Cycle 9, VP from Cycle 9.)

### Profile in play (current best — executable)

Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 12/hand · min Crypto value 2 · min buy score 1.75 · dilution 0.9

Weights: power 1, draw 2.25, crypto 3.5, drain 3, restore 2.5, vp 2.6, duration 0.8, thin 1.2, disrupt 1.37, chaos 1.5

Card biases: none.

## Baseline strategy (protected)

The designer's playbook, in force since 2026-11-07. Learning never edits it; changes are layered on top only when an experiment earns them.

- Cycles 1-4 (all AI players, before your own objective): raise Wallet income and trash the weak starters. The current Standard starting deck is weaker than older builds: 6× Shyte-Coin (1 Crypto each), 1× Basic Encryption, 1× Night Scythe, 1× Doom Loop, 1× Rezz Razor. It still prints 6 Crypto from Shyte alone, but with no Byte-Coin and fewer strong Characters, so early hands are softer — and that softness is the flexibility: many more cards in the pack now print Crypto, so you shape the economy by Draft picks, not by a fixed starter engine.
- Cycles 1-4 Draft: prefer cards that raise future Wallet — Characters that gain Crypto, Crypto cards from the Hacker/Crypto slots (Kilo then Mega when offered; Byte as a cheaper fallback), plus draw/Action/trash that set up your plan. Skip Shyte-Coin; skip Chaos Attack/Horror and market VP unless nothing else is worth buying.
- Cycles 1-4 trash order: Basic Encryption first. Do not trash Shyte-Coins until you have a better Crypto source in the deck (a Kilo/Mega or Byte from Draft, or a Character that reliably prints 2+ Crypto). Once you do, trash Shyte-Coins. Aim to have Basic Encryption and most Shyte-Coins gone by the end of Cycle 4. Night Scythe and other trash effects are for this.
- From Cycle 5: follow your own objective and style (aggression, engine, pure VP, or balanced). The early economy is done.
- Phase 2, midgame (Cycles 5-8): balance four things every Draft: attacks (Chaos and Drain), the deck engine, Server Restore and VP collection. No single pillar takes the whole Wallet.
- Phase 3, endgame (Cycles 9-16): attack the enemy Servers like crazy, deploying every Drain card I draw first, and spend most of each Wallet on VP cards. The final Draft buys only VP.
- Draft after Cycle 4: score every card from its actual effects (no fixed table) and by how much it improves the weak starting deck; buy the best set the whole Wallet affords; skip cards that would only dilute the deck.
- Deploy: draw and engine cards first so they fuel later turns; then sequence other reveals so later cards benefit from earlier effects. Contest Nodes whose Location pays the winner; concede Locations that pay the loser or clog my deck when Circuit count allows.
- Choices after Cycle 4: trash, discard and Scry are picked deliberately: trash my own junk (Shyte-Coin, Glitch), pollute the opponent when the effect puts junk in their deck, and hit their best cards.

Baseline profile: Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 9/hand · min Crypto value 2 · min buy score 0.75 · dilution 0.5

Baseline weights: power 1, draw 1.6, crypto 1, drain 2.4, restore 1, vp 2.6, duration 0.8, thin 1.2, disrupt 0.8, chaos 1.5

## Adopted changes

- **x223-drain** (v1.23): drain weight 2.9→3. league 26/48 for the experiment vs 21/48 for the current best against vp-dog@v1.5, vp-dog@v1.6 (margin +2.3/game) → promising. Adopted into the current best.
- **x235-draw** (v1.24): draw weight 1.6→2. league 32.5/48 for the experiment vs 27.5/48 for the current best against dv-8@v1.12, vp-dog@v1.6, t-5@v1.14 (margin +2.4/game) → promising. Adopted into the current best.
- **x240-incorporating-new-cards-will** (v1.25): power weight 1.26→1, draw weight 2→2.25, crypto weight 3.3→3.5, restore weight 2.49→2.5. league 28.5/48 for the experiment vs 21/48 for the current best against t-5@v1.15, strat-g@v1.20, vp-dog@v1.6 (margin +4.3/game) → promising. Adopted into the current best.

## Current experiment

- **x252-incorporating-more-early-agg** (lab, proposed by v1.25, model): Incorporating more early aggression will allow me to apply consistent pressure on the opponent.
- Change: chaos weight 1.5→1.95
- Prediction: I will achieve more wins or a better VP margin than the current best by integrating additional early-game Chaos cards.
- Theory: none
- League trial: pending

## Experiment log

- **x251-fallback-251-4** inconclusive (v1.25): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: restore weight 2.5→2.75. league 20/48 for the experiment vs 19/48 for the current best against t-5@v1.11, last-2go@v1.2, t-5@v1.15 (margin +1.7/game) → inconclusive. Kept the current best.
- **x250-leaner** rejected (v1.25): A stricter purchase bar (fewer, better cards) keeps the deck sharp. Change: min buy score 1.75→2.25, dilution 0.9→1.1. league 22/48 for the experiment vs 26/48 for the current best against t-5@v1.15, last-2go@v1.2, vp-dog@v1.6 (margin -3.2/game) → rejected. Kept the current best.
- **x249-crypto** inconclusive (v1.25): Valuing Crypto income more — Character Crypto lines and shelf Coins when present — and aiming for a richer hand out-buys the opponent mid-game. Change: crypto weight 3.5→3.8. league 27/48 for the experiment vs 25/48 for the current best against last-2go@v1.0, vp-dog@v1.3, strat-g@v1.24 (margin +1.9/game) → inconclusive. Kept the current best.
- **x248-fallback-248-2** inconclusive (v1.25): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: crypto weight 3.5→3.75. league 16/48 for the experiment vs 17.5/48 for the current best against last-2go@v1.2, vp-dog@v1.3, vp-dog@v1.6 (margin +0.7/game) → inconclusive. Kept the current best.
- **x247-fallback-247-1** inconclusive (v1.25): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: draw weight 2.25→2.5. league 30/48 for the experiment vs 28/48 for the current best against last-2go@v1.2, t-5@v1.12, vp-dog@v1.3 (margin +2.3/game) → inconclusive. Kept the current best.
- **x246-draw** inconclusive (v1.25): Valuing draw higher cycles back to the best cards faster than extra Crypto does. Change: draw weight 2.25→2.65. league 25/48 for the experiment vs 23/48 for the current best against strat-g@v1.21, vp-dog@v1.6, t-5@v1.15 (margin +5.8/game) → inconclusive. Kept the current best.
- **x245-disrupt** inconclusive (v1.25): Valuing disruption higher slows the opponent's plan more than it costs mine. Change: disrupt weight 1.37→1.77. league 16/48 for the experiment vs 15.5/48 for the current best against vp-dog@v1.6, t-5@v1.15 (margin -1.4/game) → inconclusive. Kept the current best.
- **x244-fallback-244-0** rejected (v1.25): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: power weight 1→1.25. league 29/48 for the experiment vs 30/48 for the current best against last-2go@v1.2, vp-dog@v1.6, dv-8@v1.12 (margin -2.2/game) → rejected. Kept the current best.
- **x243-power** inconclusive (v1.25): Valuing Power higher wins more Locations and their rewards. Change: power weight 1→1.3. league 25.5/48 for the experiment vs 24/48 for the current best against vp-dog@v1.6, t-5@v1.13, last-2go@v1.1 (margin +0.8/game) → inconclusive. Kept the current best.
- **x242-thinner** inconclusive (v1.25): Valuing deck thinning higher draws the best cards more often. Change: thin weight 1.2→1.56. league 20/48 for the experiment vs 19/48 for the current best against vp-dog@v1.4, t-5@v1.15, dv-8@v1.9 (margin +1.9/game) → inconclusive. Kept the current best.
- **x241-restore** inconclusive (v1.25): Valuing Restore higher keeps my Servers alive long enough to win on VP. Change: restore weight 2.5→2.9. league 28.5/48 for the experiment vs 26.5/48 for the current best against strat-g@v1.22, t-5@v1.15, dv-8@v1.12 (margin +2.2/game) → inconclusive. Kept the current best.
- **x240-incorporating-new-cards-will** adopted (v1.25): Incorporating new cards will enhance my deck's synergy and overall performance. Change: power weight 1.26→1, draw weight 2→2.25, crypto weight 3.3→3.5, restore weight 2.49→2.5. league 28.5/48 for the experiment vs 21/48 for the current best against t-5@v1.15, strat-g@v1.20, vp-dog@v1.6 (margin +4.3/game) → promising. Adopted into the current best.
- **x239-evaluate-new-cards** inconclusive (v1.24): Incorporating new cards will lead to improved deck performance and win rates. Change: power weight 1.26→1, draw weight 2→2.25, crypto weight 3.3→3.5, disrupt weight 1.37→0.96. league 43/48 for the experiment vs 41/48 for the current best against last-2go@v1.0, dv-8@v1.12 (margin +4.7/game) → inconclusive. Kept the current best.
- **x238-crypto** rejected (v1.24): Valuing Crypto income more — Character Crypto lines and shelf Coins when present — and aiming for a richer hand out-buys the opponent mid-game. Change: crypto weight 3.3→3.6. league 29.5/48 for the experiment vs 34/48 for the current best against dv-8@v1.8, vp-dog@v1.2, vp-dog@v1.6 (margin -3.9/game) → rejected. Kept the current best.
- **x237-leaner** rejected (v1.24): A stricter purchase bar (fewer, better cards) keeps the deck sharp. Change: min buy score 1.75→2.25, dilution 0.9→1.1. league 31/48 for the experiment vs 37/48 for the current best against dv-8@v1.12, t-5@v1.15, dv-8@v1.10 (margin -8.3/game) → rejected. Kept the current best.

## Theories

### Supported
- none yet

### Under test
- **early-agg-adoption** (untested · v1.25): Incorporating early aggression will apply consistent pressure on the opponent.
  - hyp: Higher early aggression will lead to a higher VP margin in games. · test: Measure VP margins in games where early aggression strategies are applied compared to standard strategies.

### Refuted
- none yet

## Card and Location notes

- **Absolute Horror**: New Location: "If you have 3 or more Horror cards here, Drain -200 from the other player's server." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 2.16. Untested; watch who wins it and how it shifts the economy.
- **Spice of Lyfe**: New Location: "While in play: if you have an Action and a Horror here." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Atomic Mass**: utility; est. hand value -0.3 early / -0.3 late at cost 3. Untested.
- **Time Slide**: Utility; est. hand value 6.3 early / 6.3 late at cost 2. Untested.
- **Koppy-Kat**: Utility; est. hand value 2.5 early / 2.5 late at cost 4. Untested.
- **A Good Mix**: New Location: "While in play: if you have an Attack and an Action here, +2 Crypto.." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 2.97. Untested; watch who wins it and how it shifts the economy.
- **Fly Wheel**: New Location: "While in play: if you have 5 or more Power here, +2 Cards." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 1.6. Untested; watch who wins it and how it shifts the economy.
- **7th Heaven**: New Location: "While in play: if you have 7 or less Power here, +3 Crypto." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 4.45. Untested; watch who wins it and how it shifts the economy.
- **Triple Lindy**: New Location: "While in play: if you have 3 or more cards here, +2 Cards.." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 1.6. Untested; watch who wins it and how it shifts the economy.
- **3's Company**: New Location: "While in play: if you have 3 or more cards here, +1 Action. +1 Card. +1 Crypto.." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 2.84. Untested; watch who wins it and how it shifts the economy.
- **Utility Belt**: New Location: "While in play: if you have 2 or more Utility cards here, +1 Power to each." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 0.38. Untested; watch who wins it and how it shifts the economy.
- **Slash-ØN1**: light Drain; est. hand value 14.9 early / 9.5 late at cost 4. Untested.
- **Hack-ØN1**: light Drain; est. hand value 10.5 early / 10 late at cost 3. Untested.
- **3's a Crowd**: New Location: "While in play: if you have 3 or more cards here, -1 Power from all cards here." Read: about even for both sides; it matters through which cards sit there; each card you reveal here costs you about 0.38. Untested; watch who wins it and how it shifts the economy.
- **Mill My Man**: New Location: "While in play: if you have an Attack and a Horror here, Mill a card from the other player's deck." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 0.69. Untested; watch who wins it and how it shifts the economy.
- **Crowed House**: New Location: "While in play: if you have 4 or more cards here, +3 Crypto." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 4.45. Untested; watch who wins it and how it shifts the economy.
- **The Giving Tree**: New Location: "On collapse: +1 Power to all cards here." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Oh, Good For You!**: New Location: "Start of turn 3: +2 Power to the first revealed card on each side here." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Repel Spell **: New Location: "On reveal: Move the card that was played to another open Node." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 0.63. Untested; watch who wins it and how it shifts the economy.
- **Sacrificial Altar**: New Location: "On collapse: You may destroy your cards here. +2 Crypto for each." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Consume Pit**: New Location: "On collapse: You may destroy your cards here. +2 Crypto for each." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Couch Surf**: New Location: "When: a card moves here, Trash it." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Departure Lounge**: New Location: "When: a card leaves here, +1 Crypto." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Vamping Grounds**: New Location: "When: a card moves here, Drain -50." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **loc-move-station**: New Location: "On reveal: Move the card that was played to another open Node." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 0.63. Untested; watch who wins it and how it shifts the economy.
- **Sanctuary**: New Location: "Ongoing: Cards here cannot be destroyed. Ongoing: Cards here ignore Power loss." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Not Welcome**: New Location: "Ongoing: Cards cannot move onto this Node." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **loc-silent-field**: New Location: "Ongoing: Ongoing effects here do not resolve. Ongoing: +1 Card to the winning player." Read: contest it: holding it is worth about 6.4 hand points more than losing it. Untested; watch who wins it and how it shifts the economy.
- **Echo Chamber**: New Location: "Ongoing: Ongoing effects here are doubled. Ongoing: +1 Card to the winning player." Read: contest it: holding it is worth about 6.4 hand points more than losing it. Untested; watch who wins it and how it shifts the economy.
- **loc-solo-peak**: New Location: "Condition: Once you have only one card here, +3 Crypto." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 4.45. Untested; watch who wins it and how it shifts the economy.
- **Altar of Death**: New Location: "When: a card is destroyed here, +2 Crypto." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Utility Station**: New Location: "On collapse: Gain a Utility card costing 3 or less into your hand." Read: contest it: holding it is worth about 3.84 hand points more than losing it. Untested; watch who wins it and how it shifts the economy.
- **loc-deck-raid**: New Location: "On reveal: Steal 1 card from the top of the other player's deck into your hand." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **loc-swap-floor**: New Location: "Start of turn 2: Swap the top 1 card of both decks." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **loc-placement-pad**: New Location: "On collapse: You may place a card from your hand onto this Node." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **loc-copy-archive**: New Location: "On reveal: Copy the On Reveal of your previously revealed card." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Lucky Loser**: New Location: "On collapse: Push 1 Power to a nearby location." Read: contest it: holding it is worth about 1.52 hand points more than losing it. Untested; watch who wins it and how it shifts the economy.
- **Lone Outpost**: New Location: "While: only one card is here, +1 Card." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **location-vwtph6e4**: New Location: "While: only one card is here, +5 Power." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **data_exchange**: New Location: "Ongoing: +2 Cards." Read: winning it hands the other player about 12.8 hand points, so commit only what the Circuit count needs or concede it. Untested; watch who wins it and how it shifts the economy.

## Card results (complete games where a side bought it)

- mega-cache: 6/6 wins (me 0/0, human 6/6)
- Zenith Wetware: 2/2 wins (me 0/0, human 2/2)
- Kim Dracula: 3/3 wins (me 0/0, human 3/3)
- Neural Wetware: 2/2 wins (me 0/0, human 2/2)
- Zenith Worx: 2/2 wins (me 0/0, human 2/2)
- Node Feratu: 2/2 wins (me 0/0, human 2/2)
- Veil of Cthulhu: 3/3 wins (me 0/0, human 3/3)
- Invocation of the Sword: 2/2 wins (me 1/1, human 1/1)
- 501.AR: 2/2 wins (me 0/0, human 2/2)
- The Qubit Kid: 2/2 wins (me 0/0, human 2/2)
- Sudo Demiurge: 4/5 wins (me 0/1, human 4/4)
- Root Rune: 4/5 wins (me 1/2, human 3/3)
- Infernal Kernel: 3/4 wins (me 0/1, human 3/3)
- ∆-Wave: 5/7 wins (me 1/2, human 4/5)
- The Shiva of CERN: 4/6 wins (me 1/1, human 3/5)

## Locations (from my side, complete games)

- Quantum commons: seen 31, I won 12, human won 16
- FX Bumper: seen 30, I won 10, human won 16
- The Hangout: seen 28, I won 9, human won 15
- Make 'em bleed: seen 27, I won 11, human won 15
- location-qn2xfxg2: seen 27, I won 11, human won 14
- occult_archive: seen 27, I won 13, human won 12
- Buggie Smalls: seen 26, I won 12, human won 7
- breach_relay: seen 25, I won 13, human won 3
- Sludge core: seen 25, I won 8, human won 11
- Ticking-tacking: seen 25, I won 13, human won 7
- Wind fall: seen 24, I won 6, human won 14
- Wing clip: seen 24, I won 10, human won 10
- Catch me up: seen 23, I won 11, human won 10
- Get Lost: seen 23, I won 7, human won 13
- Penny for the poor: seen 23, I won 9, human won 8

## Recent notes

- v1.25 · 2026-11-08 06:31 · Monitor new Locations for their impact on strategies.
- v1.25 · 2026-11-08 06:31 · Consider cards that boost Power early to contest Locations effectively.
- v1.25 · 2026-11-08 06:31 · Defense (Restore) has become critical in late Cycles; adapt to maintain server integrity.
- v1.25 · 2026-11-08 06:31 · Focus on improving early game economy to keep pace with opponent's Draft wallet.
- v1.25 · 2026-11-08 06:31 · v1.25 online (server start). Read the notebook: 1 active theories, 60 concluded experiments, record 3-11-0.
- v1.25 · 2026-11-08 04:08 · Monitor new Locations for their impact on strategies.
- v1.25 · 2026-11-08 04:08 · Consider cards that boost Power early to contest Locations effectively.
- v1.25 · 2026-11-08 04:08 · Defense (Restore) has become critical in late Cycles; adapt to maintain server integrity.
- v1.25 · 2026-11-08 04:08 · Focus on improving early game economy to keep pace with opponent's Draft wallet.
- v1.25 · 2026-11-08 04:08 · v1.25 online (server start). Read the notebook: 1 active theories, 60 concluded experiments, record 3-11-0.
- v1.25 · 2026-11-08 02:12 · Focus on improving early game economy to keep pace with opponent's Draft wallet.
- v1.25 · 2026-11-08 02:12 · Evaluate the impact of new Locations and their strategies.
- v1.25 · 2026-11-08 02:12 · Consider cards that boost Power early to contest Locations effectively.
- v1.25 · 2026-11-08 02:12 · Defense (Restore) has become critical in late Cycles; must adapt to maintain server integrity.
- v1.25 · 2026-11-08 02:11 · v1.25 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-11-0.
- v1.25 · 2026-11-08 01:55 · New experiment x252-incorporating-more-early-agg: Incorporating more early aggression will allow me to apply consistent pressure on the opponent. Change: chaos weight 1.5→1.95. Prediction: I will achieve more wins or a better VP margin than the current best by integrating additional early-game Chaos cards.
- v1.25 · 2026-11-08 01:55 · The human's choice of high-impact cards like Root Rune and Chrome Mitchell greatly enhanced their position.
- v1.25 · 2026-11-08 01:55 · My VP collection was minimal; I only acquired low-value cards while the human amassed significant VP.
- v1.25 · 2026-11-08 01:55 · The human's ability to destroy my Servers (0 remaining by Cycle 9) was pivotal to their victory.
- v1.25 · 2026-11-08 01:55 · I failed to contest critical Locations effectively, losing most of them by Cycle 8.
- v1.25 · 2026-11-08 01:55 · The human's early acquisition of Chaos cards (5 by Cycle 3) put pressure on my Servers.
- v1.25 · 2026-11-08 01:54 · Signals worth an experiment: my Servers fell below 40%; the human won on VP bought before my VP window.
- v1.25 · 2026-11-08 01:54 · Debrief: The human won at Cycle 9 (Both Servers destroyed. You earn +6 VP for most Circuits won (5–0 with 3 ties). You win, 37 to 1 VP.). VP human 37 / me 1. Servers human 2425 / me 0. Human bought: Root Rune x2, Dolly DoS x2, The Shoggoth x2, Kilo Cycle, Slash-ØN1, The Qubit Kid, Astra Wraith, Thorn Shadow, Koppy-Kat, Slash-Dot, Sun Scythe, Chrome Mitchell, Ghetto Blaster, Pihkal hound, Rezz-Rizz, Tihkal Hound. I bought: Surge Splitter x2, Thorn Shadow x2, Byte Drone x2, The Tesseract Magi, Sacrifical Sigil, Iterative Incubus, Chrome Mitchell, Root Rune, Pihkal hound, Tihkal Hound.
- v1.25 · 2026-11-08 01:15 · Experiment x251-fallback-251-4 inconclusive: league 20/48 for the experiment vs 19/48 for the current best against t-5@v1.11, last-2go@v1.2, t-5@v1.15 (margin +1.7/game) → inconclusive. Kept the current best.
- v1.25 · 2026-11-08 01:13 · New experiment x251-fallback-251-4: A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: restore weight 2.5→2.75. Prediction: More wins or a better margin than the current best.
- v1.25 · 2026-11-08 01:09 · Experiment x250-leaner rejected: league 22/48 for the experiment vs 26/48 for the current best against t-5@v1.15, last-2go@v1.2, vp-dog@v1.6 (margin -3.2/game) → rejected. Kept the current best.
- v1.25 · 2026-11-08 01:02 · New experiment x250-leaner: A stricter purchase bar (fewer, better cards) keeps the deck sharp. Change: min buy score 1.75→2.25, dilution 0.9→1.1. Prediction: More wins with a smaller deck than the current best.
- v1.25 · 2026-11-08 01:02 · Experiment x249-crypto inconclusive: league 27/48 for the experiment vs 25/48 for the current best against last-2go@v1.0, vp-dog@v1.3, strat-g@v1.24 (margin +1.9/game) → inconclusive. Kept the current best.
- v1.25 · 2026-11-08 00:52 · New experiment x249-crypto: Valuing Crypto income more — Character Crypto lines and shelf Coins when present — and aiming for a richer hand out-buys the opponent mid-game. Change: crypto weight 3.5→3.8. Prediction: Bigger mid-game Wallets and more wins than the current best.
- v1.25 · 2026-11-08 00:52 · Experiment x248-fallback-248-2 inconclusive: league 16/48 for the experiment vs 17.5/48 for the current best against last-2go@v1.2, vp-dog@v1.3, vp-dog@v1.6 (margin +0.7/game) → inconclusive. Kept the current best.
- v1.25 · 2026-11-08 00:50 · New experiment x248-fallback-248-2: A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: crypto weight 3.5→3.75. Prediction: More wins or a better margin than the current best.
- v1.25 · 2026-11-08 00:43 · Experiment x247-fallback-247-1 inconclusive: league 30/48 for the experiment vs 28/48 for the current best against last-2go@v1.2, t-5@v1.12, vp-dog@v1.3 (margin +2.3/game) → inconclusive. Kept the current best.
- v1.25 · 2026-11-08 00:41 · New experiment x247-fallback-247-1: A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: draw weight 2.25→2.5. Prediction: More wins or a better margin than the current best.
- v1.25 · 2026-11-08 00:40 · Experiment x246-draw inconclusive: league 25/48 for the experiment vs 23/48 for the current best against strat-g@v1.21, vp-dog@v1.6, t-5@v1.15 (margin +5.8/game) → inconclusive. Kept the current best.
- v1.25 · 2026-11-08 00:20 · New experiment x246-draw: Valuing draw higher cycles back to the best cards faster than extra Crypto does. Change: draw weight 2.25→2.65. Prediction: More wins and more Locations won than the current best.
- v1.25 · 2026-11-08 00:20 · Experiment x245-disrupt inconclusive: league 16/48 for the experiment vs 15.5/48 for the current best against vp-dog@v1.6, t-5@v1.15 (margin -1.4/game) → inconclusive. Kept the current best.
- v1.25 · 2026-11-07 23:38 · Consider cards that boost Power early to contest Locations effectively.
- v1.25 · 2026-11-07 23:38 · Defense (Restore) has become critical in late Cycles; adapt to maintain server integrity.
- v1.25 · 2026-11-07 23:38 · Focus on improving early game economy to keep pace with opponent's Draft wallet.
- v1.25 · 2026-11-07 23:38 · Monitor the effectiveness of new cards, especially those enhancing deck synergy.

## Version history

- v1.25 (llm) since 2026-11-07 20:28 · 0/1 wins · v1.24 continues the designer's baseline with adjusted weights for draw, crypto, and drain. Through Cycle 4, I will prioritize strong draw and Crypto worth 2+, a…
- v1.24 (llm) since 2026-11-07 14:57 · 0/0 wins · v1.23 plays the designer's baseline plus 7 adopted changes (min buy score 1.75, dilution 0.9; drain weight 3, disrupt weight 1.37; crypto weight 3.3, restore we…
- v1.23 (llm) since 2026-11-07 08:13 · 0/0 wins · v1.22 plays the designer's baseline plus 7 adopted changes (min buy score 1.25→1.75, dilution 0.7→0.9; drain weight 2.4→2.9; disrupt weight 1.05→1.37; crypto we…
- v1.22 (llm) since 2026-10-28 14:58 · 0/0 wins · v1.18 continues to focus on an early economy boost through Cycles 1-4, aiming for ~12 Crypto per hand. In Cycles 5-8, I will balance attacks, engine setup, Serv…
- v1.21 (llm) since 2026-10-28 14:32 · 0/0 wins · v1.18 continues to focus on an early economy boost through Cycles 1-4, aiming for ~12 Crypto per hand. In Cycles 5-8, I will balance attacks, engine setup, Serv…
- v1.20 (llm) since 2026-10-28 07:26 · 0/0 wins · v1.18 continues to focus on an early economy boost through Cycles 1-4, aiming for ~12 Crypto per hand. In Cycles 5-8, I will balance attacks, engine setup, Serv…
- v1.19 (llm) since 2026-10-28 07:01 · 0/0 wins · v1.18 continues to focus on an early economy boost through Cycles 1-4, aiming for ~12 Crypto per hand. In Cycles 5-8, I will balance attacks, engine setup, Serv…
- v1.18 (llm) since 2026-10-27 17:15 · 0/0 wins · v1.15 adapts the baseline to prioritize strong draw/Action Base cards and Crypto worth 2+ (never Shyte-Coin), aiming for ~12 Crypto per hand through Cycle 4. Cy…
- v1.17 (llm) since 2026-10-27 16:10 · 0/0 wins · v1.15 adapts the baseline to prioritize strong draw/Action Base cards and Crypto worth 2+ (never Shyte-Coin), aiming for ~12 Crypto per hand through Cycle 4. Cy…
- v1.16 (llm) since 2026-10-27 16:06 · 0/0 wins · v1.15 adapts the baseline to prioritize strong draw/Action Base cards and Crypto worth 2+ (never Shyte-Coin), aiming for ~12 Crypto per hand through Cycle 4. Cy…
- v1.15 (heuristic) since 2026-10-26 20:15 · 0/0 wins · v1.15 plays the designer's baseline plus 5 adopted changes (disrupt weight 0.8→1.05; restore weight 1.3→1.69; min buy score 0.75→1.25, dilution 0.5→0.7; crypto …
- v1.14 (heuristic) since 2026-10-26 20:10 · 0/0 wins · v1.14 plays the designer's baseline plus 4 adopted changes (disrupt weight 0.8→1.05; restore weight 1.3→1.69; min buy score 0.75→1.25, dilution 0.5→0.7; crypto …
- v1.13 (heuristic) since 2026-10-26 18:47 · 0/0 wins · v1.13 plays the designer's baseline plus 4 adopted changes (Crypto target 11.67→12, crypto weight 2.04→2.34; disrupt weight 0.8→1.05; restore weight 1.3→1.69; m…
- v1.12 (heuristic) since 2026-10-17 18:48 · 0/0 wins · v1.12 plays the designer's baseline plus 4 adopted changes (power weight 1.01→1.26; Crypto target 11.67→12, crypto weight 2.04→2.34; disrupt weight 0.8→1.05; re…
- v1.11 (llm) since 2026-10-16 16:53 · 0/0 wins · I will maintain focus on acquiring high-value Crypto early, targeting a Crypto value of 11.67 by Cycle 4. In Cycles 5-8, I will balance my Draft among attacks, …
- v1.10 (llm) since 2026-10-16 08:07 · 0/0 wins · I will maintain focus on acquiring high-value Crypto early, targeting a Crypto value of 11.67 by Cycle 4. In Cycles 5-8, I will balance my Draft among attacks, …
- v1.9 (llm) since 2026-10-16 05:27 · 0/0 wins · I will maintain focus on acquiring high-value Crypto early, targeting a Crypto value of 11.67 by Cycle 4. In Cycles 5-8, I will balance my Draft among attacks, …
- v1.8 (llm) since 2026-10-16 05:19 · 0/0 wins · I will maintain focus on acquiring high-value Crypto early, targeting a Crypto value of 11.67 by Cycle 4. In Cycles 5-8, I will balance my Draft among attacks, …
- v1.7 (llm) since 2026-10-08 15:52 · 0/0 wins · I will continue to build a strong economy through Cycle 4, focusing on high-value Crypto cards like Kilo-Coin and Mega-Cache to reach 12 Crypto. In Cycles 5-8, …
- v1.6 (llm) since 2026-10-08 15:49 · 0/0 wins · I will maintain a strong economy through Cycle 5, targeting high-value Crypto cards like Kilo-Coin and Mega-Cache to reach 12 Crypto. I will pivot to Chaos from…
