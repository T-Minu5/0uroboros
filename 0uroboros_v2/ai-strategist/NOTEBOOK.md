# Strat-G notebook

Written by Strat-G, the AI opponent's strategy agent. Each dev-server start reads this notebook (and `memory.json`), plans, plays, and leaves notes here. Its version changes only when the profile it plays changes.

How Strat-G learns: it plays the protected baseline below plus the changes its experiments have earned. It changes its play only through experiments: one bounded change at a time, played by the league referee as paired games (the experiment and the current best face the same sampled opponents on the same seeds). Code measures the results and adopts or rejects the change. Theory scores are associations (winner/loser patterns), not causal proof; "supported" is not adoption-ready. It never sees the other agents' profiles, plans or notebooks, only who it played and the results.

Style: Balanced in three phases: economy and engine (Cycles 1-4), a balanced midgame (5-8), then all-out Server attacks and VP buying (9-16).

Style envelope (every profile is clamped into it): economyUntilCycle 4-4, chaosFromCycle 9-9, vpFromCycle 9-9, handCryptoTarget 7-12, vp weight 1.6-3, drain weight 1.4-3.

## Current agent: v1.28 (model-assisted)

Record against the human (complete games only): 3 wins, 11 losses, 0 ties over 14 games. Ignored 28 sessions that were not complete games.

League snapshots (newest first): strat-g@v1.28, strat-g@v1.27, strat-g@v1.26, strat-g@v1.25, strat-g@v1.24

### Plan of play

_Documentary only: the numeric profile below governs what is actually played. The plan must not invent settings the profile does not have._

I will adhere to the designer's baseline strategy, focusing on maximizing Wallet income in Cycles 1-4 by drafting Characters that generate Crypto and trashing weak cards. From Cycle 5 to 8, I will balance aggression with engine development and VP collection while adapting to the dynamics of Locations. Starting at Cycle 9, I will prioritize aggressive attacks on the opponent's Servers and focus on acquiring VP cards. My strategy will adjust based on the opponent's playstyle and the current game state, following the established schedule of economy through Cycle 4, balanced midgame from Cycles 5- (Schedule: economy through Cycle 4, balanced midgame Cycles 5-8, Chaos from Cycle 9, VP from Cycle 9.)

### Profile in play (current best — executable)

Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 11.8/hand · min Crypto value 2 · min buy score 1.75 · dilution 0.9

Weights: power 1, draw 2.33, crypto 2.88, drain 3, restore 2.5, vp 2.57, duration 0.8, thin 1.27, disrupt 1.77, chaos 2.02

Card biases: Code Sniper +0.7, Koppy-Kat +0.7, Cowl Obscyra +0.63, ∆-Wave +0.63, Delete.Detritus.exe +0.42

## Baseline strategy (protected)

The designer's playbook, in force since 2026-11-09. Learning never edits it; changes are layered on top only when an experiment earns them.

- Cycles 1-4 (all AI players, before your own objective): raise Wallet income and trash the weak starters. The current Standard starting deck is weaker than older builds: 6× Shyte-Coin (1 Crypto each), 1× Basic Encryption, 1× Night Scythe, 1× Doom Loop, 1× Rezz Razor. It still prints 6 Crypto from Shyte alone, but with no Byte-Coin and fewer strong Characters, so early hands are softer — and that softness is the flexibility: many more cards in the pack now print Crypto, so you shape the economy by Draft picks, not by a fixed starter engine.
- Cycles 1-4 Draft: prefer cards that raise future Wallet — Characters that gain Crypto, Crypto cards from the Hacker/Crypto slots (Kilo then Mega when offered; Byte as a cheaper fallback), plus draw/Action/trash that set up your plan. Skip Shyte-Coin; skip Chaos Attack/Horror and market VP unless nothing else is worth buying.
- Cycles 1-4 trash order: Basic Encryption first. Do not trash Shyte-Coins until you have a better Crypto source in the deck (a Kilo/Mega or Byte from Draft, or a Character that reliably prints 2+ Crypto). Once you do, trash Shyte-Coins. Aim to have Basic Encryption and most Shyte-Coins gone by the end of Cycle 4. Night Scythe and other trash effects are for this.
- From Cycle 5: follow your own objective and style (aggression, engine, pure VP, or balanced). The early economy is done.
- Phase 2, midgame (Cycles 5-8): balance four things every Draft: attacks (Chaos and Drain), the deck engine, Server Restore and VP collection. No single pillar takes the whole Wallet.
- Phase 3, endgame (Cycles 9-16): attack the enemy Servers like crazy, deploying every Drain card I draw first, and spend most of each Wallet on VP cards. The final Draft buys only VP.
- Draft after Cycle 4: score every card from its actual effects (no fixed table) and by how much it improves the weak starting deck; buy the best set the whole Wallet affords; skip cards that would only dilute the deck.
- Deploy: draw and engine cards first so they fuel later turns; then sequence other reveals so later cards benefit from earlier effects. Contest Nodes whose Location pays the winner; concede Locations that pay the loser or clog my deck when Circuit count allows.
- Choices after Cycle 4: trash, discard and Scry are picked deliberately: trash my own junk (Shyte-Coin, Glitch), pollute the opponent when the effect puts junk in their deck, and hit their best cards.
- Human tempo (vs VP-Dog): soft coaching 35% toward your Draft tempo across 4 games — Soft coaching from human Draft tempo vs VP-Dog (4 games, 35% share): economy through Cycle 4, Chaos from 8, VP from 9. Not an experiment.
- Human tempo band: Cycles 1–4: 36 buys (Crypto 6%, Base 47%, Chaos 47%; spend 168)
- Human tempo band: Cycles 5–8: 46 buys (Crypto 2%, Base 30%, Chaos 54%, VP 13%; spend 295)
- Human tempo band: Cycles 9–12: 12 buys (Base 17%, Chaos 50%, VP 33%; spend 76)
- Human tempo band: Cycles 13–16: no buys yet

Baseline profile: Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 11.8/hand · min Crypto value 2 · min buy score 0.75 · dilution 0.5

Baseline weights: power 1, draw 2.33, crypto 2.88, drain 3, restore 1, vp 2.57, duration 0.8, thin 1.27, disrupt 0.8, chaos 2.02

## Human tempo (vs VP-Dog)

Soft coaching from human Draft tempo vs VP-Dog (4 games, 35% share): economy through Cycle 4, Chaos from 8, VP from 9. Not an experiment.

Soft coaching: applied at 2026-11-09 07:10 (35% share). This is not an experiment and does not adopt into the versioned current best.

- Cycles 1–4: 36 buys (Crypto 6%, Base 47%, Chaos 47%; spend 168)
- Cycles 5–8: 46 buys (Crypto 2%, Base 30%, Chaos 54%, VP 13%; spend 295)
- Cycles 9–12: 12 buys (Base 17%, Chaos 50%, VP 33%; spend 76)
- Cycles 13–16: no buys yet

Repeated buys: code-sniper×8, koppy-kat×7, cowl-obscyra×6, delta-wave×6, card-jabbhu7e×4, card-q6u1qrf2×4, dash-dot×4, jinx-001×4

- Human tempo (vs VP-Dog): soft coaching 35% toward your Draft tempo across 4 games — Soft coaching from human Draft tempo vs VP-Dog (4 games, 35% share): economy through Cycle 4, Chaos from 8, VP from 9. Not an experiment.
- Human tempo band: Cycles 1–4: 36 buys (Crypto 6%, Base 47%, Chaos 47%; spend 168)
- Human tempo band: Cycles 5–8: 46 buys (Crypto 2%, Base 30%, Chaos 54%, VP 13%; spend 295)
- Human tempo band: Cycles 9–12: 12 buys (Base 17%, Chaos 50%, VP 33%; spend 76)
- Human tempo band: Cycles 13–16: no buys yet

## Adopted changes

- **x223-drain** (v1.23): drain weight 2.9→3. league 26/48 for the experiment vs 21/48 for the current best against vp-dog@v1.5, vp-dog@v1.6 (margin +2.3/game) → promising. Adopted into the current best.
- **x235-draw** (v1.24): draw weight 1.6→2. league 32.5/48 for the experiment vs 27.5/48 for the current best against dv-8@v1.12, vp-dog@v1.6, t-5@v1.14 (margin +2.4/game) → promising. Adopted into the current best.
- **x240-incorporating-new-cards-will** (v1.25): power weight 1.26→1, draw weight 2→2.25, crypto weight 3.3→3.5, restore weight 2.49→2.5. league 28.5/48 for the experiment vs 21/48 for the current best against t-5@v1.15, strat-g@v1.20, vp-dog@v1.6 (margin +4.3/game) → promising. Adopted into the current best.
- **x252-incorporating-more-early-agg** (v1.26): chaos weight 1.5→1.95. league 30.5/48 for the experiment vs 24.5/48 for the current best against vp-dog@v1.3, last-2go@v1.1, last-2go@v1.2 (margin +3.8/game) → promising. Adopted into the current best.
- **x261-fallback-261-2** (v1.27): crypto weight 3.5→3.75. league 28.5/48 for the experiment vs 23.5/48 for the current best against last-2go@v1.3, vp-dog@v1.7 (margin +8.9/game) → promising. Adopted into the current best.
- **x271-disrupt** (v1.28): disrupt weight 1.37→1.77. league 28/48 for the experiment vs 24/48 for the current best against vp-dog@v1.7, strat-g@v1.24, t-5@v1.16 (margin +3.8/game) → promising. Adopted into the current best.

## Current experiment

- none running.

## Experiment log

- **x274-fallback-274-0** inconclusive (v1.28): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: power weight 1→1.25. league 24/48 for the experiment vs 25/48 for the current best against vp-dog@v1.8, strat-g@v1.27 (margin +0.8/game) → inconclusive. Kept the current best.
- **x273-crypto** inconclusive (v1.28): Valuing Crypto income more — Character Crypto lines and shelf Coins when present — and aiming for a richer hand out-buys the opponent mid-game. Change: Crypto target 11.78→12, crypto weight 2.88→3.18. league 23/48 for the experiment vs 22/48 for the current best against t-5@v1.13, vp-dog@v1.5, vp-dog@v1.7 (margin -1.2/game) → inconclusive. Kept the current best.
- **x272-aggressive-strategies** inconclusive (v1.28): By increasing the weight of Chaos cards slightly, I will improve my chances of winning by focusing on aggression. Change: chaos weight 2.02→2.1. league 26/48 for the experiment vs 25/48 for the current best against strat-g@v1.26, strat-g@v1.25 (margin +1.2/game) → inconclusive. Kept the current best.
- **x271-disrupt** adopted (v1.28): Valuing disruption higher slows the opponent's plan more than it costs mine. Change: disrupt weight 1.37→1.77. league 28/48 for the experiment vs 24/48 for the current best against vp-dog@v1.7, strat-g@v1.24, t-5@v1.16 (margin +3.8/game) → promising. Adopted into the current best.
- **x270-draw** inconclusive (v1.27): Valuing draw higher cycles back to the best cards faster than extra Crypto does. Change: draw weight 2.36→2.76. league 32/48 for the experiment vs 31/48 for the current best against t-5@v1.16, last-2go@v1.6 (margin +2/game) → inconclusive. Kept the current best.
- **x269-power** inconclusive (v1.27): Valuing Power higher wins more Locations and their rewards. Change: power weight 1→1.3. league 29/48 for the experiment vs 28/48 for the current best against t-5@v1.16, last-2go@v1.5 (margin -1/game) → inconclusive. Kept the current best.
- **x268-thinner** inconclusive (v1.27): Valuing deck thinning higher draws the best cards more often. Change: thin weight 1.27→1.65. league 32/48 for the experiment vs 30/48 for the current best against last-2go@v1.6, last-2go@v1.3, t-5@v1.15 (margin +2/game) → inconclusive. Kept the current best.
- **x267-restore** inconclusive (v1.27): Valuing Restore higher keeps my Servers alive long enough to win on VP. Change: restore weight 2.5→2.9. league 29/48 for the experiment vs 30/48 for the current best against last-2go@v1.3, strat-g@v1.26, vp-dog@v1.5 (margin +0.9/game) → inconclusive. Kept the current best.
- **x266-certain-locations-will-creat** rejected (v1.27): Certain Locations will create opportunities for aggressive VP collection or server defense. Change: draw weight 2.25→2.5, crypto weight 3.75→3.5, restore weight 2.5→2, vp weight 2.6→3, disrupt weight 1.37→1, chaos weight 1.95→2. league 18/48 for the experiment vs 20/48 for the current best against vp-dog@v1.3, t-5@v1.15 (margin -3.3/game) → rejected. Kept the current best.
- **x265-early-agg-adoption** rejected (v1.27): Increasing the focus on early aggression will yield more wins and greater VP margins. Change: chaos weight 1.95→2.5. league 23.5/48 for the experiment vs 24.5/48 for the current best against strat-g@v1.24, last-2go@v1.5, vp-dog@v1.4 (margin -1.3/game) → rejected. Kept the current best.
- **x264-fallback-264-2** rejected (v1.27): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: crypto weight 3.75→4. league 21.5/48 for the experiment vs 24/48 for the current best against t-5@v1.16, last-2go@v1.5 (margin -4.6/game) → rejected. Kept the current best.
- **x263-leaner** inconclusive (v1.27): A stricter purchase bar (fewer, better cards) keeps the deck sharp. Change: min buy score 1.75→2.25, dilution 0.9→1.1. league 23/48 for the experiment vs 23/48 for the current best against vp-dog@v1.7, last-2go@v1.1 (margin -3.5/game) → inconclusive. Kept the current best.
- **x262-crypto** rejected (v1.27): Valuing Crypto income more — Character Crypto lines and shelf Coins when present — and aiming for a richer hand out-buys the opponent mid-game. Change: crypto weight 3.75→4.05. league 21/48 for the experiment vs 22/48 for the current best against vp-dog@v1.7, last-2go@v1.5 (margin -1.8/game) → rejected. Kept the current best.
- **x261-fallback-261-2** adopted (v1.27): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: crypto weight 3.5→3.75. league 28.5/48 for the experiment vs 23.5/48 for the current best against last-2go@v1.3, vp-dog@v1.7 (margin +8.9/game) → promising. Adopted into the current best.
- **x260-fallback-260-1** inconclusive (v1.26): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: draw weight 2.25→2.5. league 26/48 for the experiment vs 25/48 for the current best against last-2go@v1.2, vp-dog@v1.7, t-5@v1.16 (margin +2.4/game) → inconclusive. Kept the current best.

## Theories

### Supported
- none yet

### Under test
- **aggressive-strategies** (untested · v1.28): Incorporating more aggressive strategies will increase my chances of winning against various opponents.
  - obs: I have struggled against opponents who efficiently build their economy. · hyp: Aggression can disrupt their plans and lead to quicker Server destruction. · test: Test the impact of additional aggressive cards in the current strategy.

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

- v1.28 · 2026-11-09 07:10 · The designer updated my baseline and playbook. New baseline plan: Shared early economy through Cycle 4 (Characters that print Crypto, plus Kilo/Mega/Byte from Hacker/Crypto Draft slots; trash Basic Encryption, then Shyte after a better Crypto source); balanced midgame in Cycles 5-8 (attacks, engine, Server Restore and VP each get a share); from Cycle 9 attack the Servers hard and buy mostly VP. Most VP wins; Server destruction awards VP and can end early. Location majority drives Circuit eligibility; trailing Circuit catch-up rewards are always on. Crypto deploys free; there is no Draft Crypto shelf. It now includes 5 designer hand-offs (mentor tips or coaching). Adopted changes stay layered on top, clamped to my style.
- v1.28 · 2026-11-09 00:22 · Experiment x274-fallback-274-0 inconclusive: league 24/48 for the experiment vs 25/48 for the current best against vp-dog@v1.8, strat-g@v1.27 (margin +0.8/game) → inconclusive. Kept the current best.
- v1.28 · 2026-11-09 00:20 · New experiment x274-fallback-274-0: A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: power weight 1→1.25. Prediction: More wins or a better margin than the current best.
- v1.28 · 2026-11-09 00:12 · Experiment x273-crypto inconclusive: league 23/48 for the experiment vs 22/48 for the current best against t-5@v1.13, vp-dog@v1.5, vp-dog@v1.7 (margin -1.2/game) → inconclusive. Kept the current best.
- v1.28 · 2026-11-08 23:52 · New experiment x273-crypto: Valuing Crypto income more — Character Crypto lines and shelf Coins when present — and aiming for a richer hand out-buys the opponent mid-game. Change: Crypto target 11.78→12, crypto weight 2.88→3.18. Prediction: Bigger mid-game Wallets and more wins than the current best.
- v1.28 · 2026-11-08 23:52 · Experiment x272-aggressive-strategies inconclusive: league 26/48 for the experiment vs 25/48 for the current best against strat-g@v1.26, strat-g@v1.25 (margin +1.2/game) → inconclusive. Kept the current best.
- v1.28 · 2026-11-08 23:43 · Adapt to the human's Draft wallet for mid-game strategies.
- v1.28 · 2026-11-08 23:43 · Assess the impact of high-value Characters on early pressure.
- v1.28 · 2026-11-08 23:43 · Monitor the synergy of new Cards with existing strategies.
- v1.28 · 2026-11-08 23:43 · Evaluate the effectiveness of new Locations in future games.
- v1.28 · 2026-11-08 23:43 · v1.28 online (server start). Read the notebook: 1 active theories, 60 concluded experiments, record 3-11-0. Removed cards: shyte-coin.
- v1.28 · 2026-11-08 23:30 · New experiment x272-aggressive-strategies: By increasing the weight of Chaos cards slightly, I will improve my chances of winning by focusing on aggression. Change: chaos weight 2.02→2.1. Prediction: I predict that a slight increase in Chaos weight will lead to more wins and higher VP margins compared to the current best.
- v1.28 · 2026-11-08 23:30 · Adapt to the human's Draft wallet for mid-game strategies.
- v1.28 · 2026-11-08 23:30 · Assess the impact of high-value Characters on early pressure.
- v1.28 · 2026-11-08 23:30 · Monitor the synergy of new Cards with existing strategies.
- v1.28 · 2026-11-08 23:30 · Evaluate the effectiveness of new Locations in future games.
- v1.28 · 2026-11-08 23:29 · v1.28 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-11-0.
- v1.28 · 2026-11-08 22:57 · Experiment x271-disrupt adopted: league 28/48 for the experiment vs 24/48 for the current best against vp-dog@v1.7, strat-g@v1.24, t-5@v1.16 (margin +3.8/game) → promising. Adopted into the current best.
- v1.28 · 2026-11-08 22:57 · Now v1.28: adopted x271-disrupt (disrupt weight 1.37→1.77).
- v1.27 · 2026-11-08 22:49 · New experiment x271-disrupt: Valuing disruption higher slows the opponent's plan more than it costs mine. Change: disrupt weight 1.37→1.77. Prediction: More wins and a better margin than the current best.
- v1.27 · 2026-11-08 22:49 · Experiment x270-draw inconclusive: league 32/48 for the experiment vs 31/48 for the current best against t-5@v1.16, last-2go@v1.6 (margin +2/game) → inconclusive. Kept the current best.
- v1.27 · 2026-11-08 22:42 · New experiment x270-draw: Valuing draw higher cycles back to the best cards faster than extra Crypto does. Change: draw weight 2.36→2.76. Prediction: More wins and more Locations won than the current best.
- v1.27 · 2026-11-08 22:42 · Experiment x269-power inconclusive: league 29/48 for the experiment vs 28/48 for the current best against t-5@v1.16, last-2go@v1.5 (margin -1/game) → inconclusive. Kept the current best.
- v1.27 · 2026-11-08 22:37 · New experiment x269-power: Valuing Power higher wins more Locations and their rewards. Change: power weight 1→1.3. Prediction: More Locations won and more wins than the current best.
- v1.27 · 2026-11-08 22:37 · Experiment x268-thinner inconclusive: league 32/48 for the experiment vs 30/48 for the current best against last-2go@v1.6, last-2go@v1.3, t-5@v1.15 (margin +2/game) → inconclusive. Kept the current best.
- v1.27 · 2026-11-08 22:27 · New experiment x268-thinner: Valuing deck thinning higher draws the best cards more often. Change: thin weight 1.27→1.65. Prediction: More wins and bigger mid-game Wallets than the current best.
- v1.27 · 2026-11-08 22:27 · Experiment x267-restore inconclusive: league 29/48 for the experiment vs 30/48 for the current best against last-2go@v1.3, strat-g@v1.26, vp-dog@v1.5 (margin +0.9/game) → inconclusive. Kept the current best.
- v1.27 · 2026-11-08 22:06 · New experiment x267-restore: Valuing Restore higher keeps my Servers alive long enough to win on VP. Change: restore weight 2.5→2.9. Prediction: Fewer losses by Server destruction than the current best.
- v1.27 · 2026-11-08 22:06 · Experiment x266-certain-locations-will-creat rejected: league 18/48 for the experiment vs 20/48 for the current best against vp-dog@v1.3, t-5@v1.15 (margin -3.3/game) → rejected. Kept the current best.
- v1.27 · 2026-11-08 21:37 · The designer updated my baseline and playbook. New baseline plan: Shared early economy through Cycle 4 (Characters that print Crypto, plus Kilo/Mega/Byte from Hacker/Crypto Draft slots; trash Basic Encryption, then Shyte after a better Crypto source); balanced midgame in Cycles 5-8 (attacks, engine, Server Restore and VP each get a share); from Cycle 9 attack the Servers hard and buy mostly VP. Most VP wins; Server destruction awards VP and can end early. Location majority drives Circuit eligibility; trailing Circuit catch-up rewards are always on. Crypto deploys free; there is no Draft Crypto shelf. It now includes 5 designer hand-offs (mentor tips or coaching), which replace my adopted Crypto target, draw weight, crypto weight, drain weight, chaos weight. Adopted changes stay layered on top, clamped to my style.
- v1.27 · 2026-11-08 20:49 · Designer Q&A: Mel said — What have you seen or learned from the games where you watched me play?
- v1.27 · 2026-11-08 20:48 · Designer Q&A: learned — Characters like Dolly DoS and Kopy Kat can be pivotal in midgame strategies.
- v1.27 · 2026-11-08 20:48 · Designer Q&A: learned — Thinning the deck is crucial for accessing key cards faster.
- v1.27 · 2026-11-08 20:48 · Designer Q&A: learned — New locations reward card variety and help struggling players.
- v1.27 · 2026-11-08 20:48 · Designer Q&A: Mel said — 1. New locations will be to reward players for playing varieties of cards, and also to help out players that are often loosing locations.
2. I'm not sure that cycles 5-8 are off the mark just yet. You should be watching me play and learning from how I ramp up my deck, and how I transition my buys. Early on, I am going for crypto, and for cards. I will buy attacks if they are giving money too. I also buy cards to think my deck, destroy the shyte for crypto cards are real important in the first 4-
- v1.27 · 2026-11-08 20:31 · Adapt to the human's Draft wallet for mid-game strategies.
- v1.27 · 2026-11-08 20:31 · Monitor the effectiveness of aggressive strategies against different opponents.
- v1.27 · 2026-11-08 20:31 · Consider drafting high-value Characters to maintain early pressure.
- v1.27 · 2026-11-08 20:31 · Evaluate the impact of new Locations on overall strategy.
- v1.27 · 2026-11-08 20:31 · v1.27 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-11-0.

## Version history

- v1.28 (llm) since 2026-11-08 22:57 · 0/0 wins · I will adhere to the designer's baseline strategy, focusing on maximizing Wallet income in Cycles 1-4 by drafting Characters that generate Crypto and trashing w…
- v1.27 (llm) since 2026-11-08 15:43 · 0/0 wins · I will follow the designer's baseline while incorporating strategies for early aggression and server defense. My focus will be on raising Wallet income through …
- v1.26 (llm) since 2026-11-08 08:57 · 0/0 wins · I will follow the designer's baseline while incorporating strategies for early aggression and server defense. My focus will be on raising Wallet income through …
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
