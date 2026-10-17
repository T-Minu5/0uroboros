# Strat-G notebook

Written by Strat-G, the AI opponent's strategy agent. Each dev-server start reads this notebook (and `memory.json`), plans, plays, and leaves notes here. Its version changes only when the profile it plays changes.

How Strat-G learns: it plays the protected baseline below plus the changes its experiments have earned. It changes its play only through experiments: one bounded change at a time, played by the league referee as paired games (the experiment and the current best face the same sampled opponents on the same seeds). Code measures the results and adopts or rejects the change. It never sees the other agents' profiles, plans or notebooks, only who it played and the results.

Style: Balanced in three phases: economy and engine (Cycles 1-4), a balanced midgame (5-8), then all-out Server attacks and VP buying (9-16).

Style envelope (every profile is clamped into it): economyUntilCycle 4-4, chaosFromCycle 9-9, vpFromCycle 9-9, handCryptoTarget 7-12, vp weight 1.6-3, drain weight 1.4-3.

## Current agent: v1.11 (model-assisted)

Record against the human (complete games only): 3 wins, 10 losses, 0 ties over 13 games. Ignored 28 sessions that were not complete games.

League snapshots (newest first): strat-g@v1.11, strat-g@v1.10, strat-g@v1.9, strat-g@v1.8, strat-g@v1.7

### Plan of play

I will continue to prioritize acquiring high-value Crypto early, aiming for a Crypto value of 11.67 by Cycle 4. In Cycles 5-8, I will balance my Draft among attacks, deck engine, Server Restore, and VP collection, while adapting to the new Locations like 'The Might Meek' and 'The Nudge'. From Cycle 9 onwards, I will aggressively target enemy Servers and invest heavily in VP cards, leveraging the dynamics introduced by these new Locations. I will focus on maintaining board Power to contest crucial Nodes effectively. (Schedule: economy through Cycle 4, balanced midgame Cycles 5-8, Chaos from Cycle 9, VP from Cycle 9.)

### Profile in play (current best)

Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 12/hand · min Crypto value 2 · min buy score 1.72 · dilution 0.83

Weights: power 1.26, draw 2.48, actions 1.49, crypto 2.34, drain 2.25, restore 1.69, vp 2.66, duration 0.8, thin 1.67, disrupt 1.05, chaos 1.45

Card biases: none.

## Baseline strategy (protected)

The designer's playbook, in force since 2026-10-16. Learning never edits it; changes are layered on top only when an experiment earns them.

- Cycles 1-4 (all AI players, before your own objective): acquire Crypto and trash the weak starters. The Standard starting deck prints exactly 6 Crypto (2 Byte-Coin at 2 each + 2 Shyte-Coin at 1 each), which is exactly the cost of one Kilo-Coin (cost 6, prints 3). One Kilo-Coin replaces three Shyte-Coins of Crypto.
- Cycles 1-4 Draft: buy a Kilo-Coin as soon as the Wallet can pay 6. If Cycle 1's Wallet is under 6, buy a Byte-Coin instead. Then buy as many Mega-Cache as the Wallet allows. Skip Shyte-Coin; skip Chaos and market VP unless nothing else is worth buying.
- Cycles 1-4 trash order: Basic Encryption first (both copies). Do not trash any Crypto until you own a Kilo-Coin (or Mega-Cache). Once you have a Kilo-Coin, trash the Shyte-Coins. Aim to have both Basic Encryption and both Shyte-Coins gone by the end of Cycle 4. Night Scythe and other trash effects are for this.
- From Cycle 5: follow your own objective and style (aggression, engine, pure VP, or balanced). The early economy is done.
- Phase 2, midgame (Cycles 5-8): balance four things every Draft: attacks (Chaos and Drain), the deck engine, Server Restore and VP collection. No single pillar takes the whole Wallet.
- Phase 3, endgame (Cycles 9-16): attack the enemy Servers like crazy, deploying every Drain card I draw first, and spend most of each Wallet on VP cards. The final Draft buys only VP.
- Draft after Cycle 4: score every card from its actual effects (no fixed table) and buy the best set the whole Wallet affords; skip cards that would only dilute the deck.
- Deploy: Action and draw cards first so they fuel later turns; contest Nodes whose Location pays the winner, and do not fight for Locations that pay the loser.
- Choices after Cycle 4: trash, discard and Scry are picked deliberately: trash my own junk (Shyte-Coin, Glitch) and hit the opponent's best cards.
- Tip from VP-Dog (#1): Focus on acquiring high-value Crypto (Kilo-Coin, Mega-Cache) early to build a strong economy. Aim for a hand Crypto target of 15 by Cycle 5.
- Tip from DV-8 (#1): Focus on thinning your deck to access key cards faster. Maintain a draw weight of 2.4 to improve your engine's efficiency.
- Tip from VP-Dog (#2): Prioritize drawing cards and thinning your deck to cycle to high-value cards faster. Increase draw weight to 2.3 for better mid-game efficiency.
- Tip from DV-8 (#2): Prioritize VP cards earlier in the game to secure points before the race heats up. Shift your VP from Cycle 13 to Cycle 11. (limited by my style: no change to my profile)
- Coaching from the designer: play 25% closer to my competitors (average of T-5 v1.3, DV-8 v1.1, VP-Dog v1.1): Crypto target 11→11.67, min buy score 2→1.72, dilution 0.9→0.83, power weight 1→1.01, draw weight 2.6→2.48, actions weight 1.5→1.49, crypto weight 2.1→2.04, drain weight 2.4→2.25, vp weight 2.6→2.66, thin weight 1.68→1.67, chaos weight 1.5→1.45. My three phases stay as they are.

Baseline profile: Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 11.7/hand · min Crypto value 2 · min buy score 1.72 · dilution 0.83

Baseline weights: power 1.01, draw 2.48, actions 1.49, crypto 2.04, drain 2.25, restore 1, vp 2.66, duration 0.8, thin 1.67, disrupt 0.8, chaos 1.45

## Adopted changes

- **x062-fallback-62-0** (v1.8): power weight 1.01→1.26. league 25/48 for the experiment vs 19/48 for the current best against t-5@v1.4, strat-g@v1.6, vp-dog@v1.0 (margin +5.7/game) → promising. Adopted into the current best.
- **x065-crypto** (v1.9): Crypto target 11.67→12, crypto weight 2.04→2.34. league 26/48 for the experiment vs 22/48 for the current best against vp-dog@v1.1, dv-8@v1.1 (margin +3.7/game) → promising. Adopted into the current best.
- **x077-disrupt** (v1.10): disrupt weight 0.8→1.05. league 26/48 for the experiment vs 21/48 for the current best against strat-g@v1.7, t-5@v1.8, vp-dog@v1.5 (margin +1.1/game) → promising. Adopted into the current best.
- **x093-restore** (v1.11): restore weight 1.3→1.69. league 29/48 for the experiment vs 22.5/48 for the current best against dv-8@v1.2, strat-g@v1.8 (margin +3.3/game) → promising. Adopted into the current best.

## Current experiment

- **x120-draw** (lab, proposed by v1.11, heuristic): Valuing draw higher cycles back to the best cards faster than extra Crypto does.
- Change: draw weight 2.48→2.88
- Prediction: More wins and more Locations won than the current best.
- Theory: none
- League trial: pending

## Experiment log

- **x119-fallback-119-1** inconclusive (v1.11): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: draw weight 2.48→2.73. league 23/48 for the experiment vs 23/48 for the current best against t-5@v1.8, vp-dog@v1.6, dv-8@v1.1 (margin -0.3/game) → inconclusive. Kept the current best.
- **x118-fallback-118-0** rejected (v1.11): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: power weight 1.26→1.51. league 23.5/48 for the experiment vs 24/48 for the current best against dv-8@v1.2, dv-8@v1.3, strat-g@v1.9 (margin -3.7/game) → rejected. Kept the current best.
- **x117-restore** inconclusive (v1.11): Valuing Restore higher keeps my Servers alive long enough to win on VP. Change: restore weight 1.69→2.09. league 29.5/48 for the experiment vs 27/48 for the current best against dv-8@v1.3, strat-g@v1.8, t-5@v1.6 (margin +0.6/game) → inconclusive. Kept the current best.
- **x116-fallback-116-4** inconclusive (v1.11): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: drain weight 2.25→2.5. league 30.5/48 for the experiment vs 30/48 for the current best against t-5@v1.8, t-5@v1.5, strat-g@v1.7 (margin +1.9/game) → inconclusive. Kept the current best.
- **x115-crypto** inconclusive (v1.11): Valuing high-value Crypto more (and aiming for a richer hand) out-buys the opponent mid-game. Change: crypto weight 2.34→2.64. league 29/48 for the experiment vs 28/48 for the current best against dv-8@v1.3, t-5@v1.4, vp-dog@v1.6 (margin +2.2/game) → inconclusive. Kept the current best.
- **x114-disrupt** rejected (v1.11): Valuing disruption higher slows the opponent's plan more than it costs mine. Change: disrupt weight 1.05→1.37. league 35/48 for the experiment vs 36/48 for the current best against t-5@v1.7, dv-8@v1.3, t-5@v1.6 (margin -0.9/game) → rejected. Kept the current best.
- **x113-fallback-113-3** inconclusive (v1.11): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: crypto weight 2.34→2.59. league 34/48 for the experiment vs 33/48 for the current best against dv-8@v1.0, t-5@v1.8, dv-8@v1.2 (margin +3.7/game) → inconclusive. Kept the current best.
- **x112-power** rejected (v1.11): Valuing Power higher wins more Locations and their rewards. Change: power weight 1.26→1.56. league 12/48 for the experiment vs 18.5/48 for the current best against vp-dog@v1.5, vp-dog@v1.2, t-5@v1.8 (margin -3.7/game) → rejected. Kept the current best.
- **x111-thinner** rejected (v1.11): Valuing deck thinning higher draws the best cards more often. Change: thin weight 1.67→2.07. league 25/48 for the experiment vs 27/48 for the current best against vp-dog@v1.6, t-5@v1.5, dv-8@v1.3 (margin -2.6/game) → rejected. Kept the current best.
- **x110-leaner** inconclusive (v1.11): A stricter purchase bar (fewer, better cards) keeps the deck sharp. Change: min buy score 1.72→2.22, dilution 0.83→1.03. league 31.5/48 for the experiment vs 32/48 for the current best against dv-8@v1.3, t-5@v1.8, t-5@v1.6 (margin +2.2/game) → inconclusive. Kept the current best.
- **x109-drain** inconclusive (v1.11): Valuing Drain higher ends games by Server destruction before the opponent's engine pays off. Change: drain weight 2.25→2.75. league 11/48 for the experiment vs 8/48 for the current best against vp-dog@v1.2, vp-dog@v1.6 (margin +4.5/game) → inconclusive. Kept the current best.
- **x108-fallback-108-2** rejected (v1.11): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: actions weight 1.49→1.74. league 16.5/48 for the experiment vs 19.5/48 for the current best against vp-dog@v1.2, dv-8@v1.3, vp-dog@v1.6 (margin -3.8/game) → rejected. Kept the current best.
- **x107-draw** rejected (v1.11): Valuing draw higher cycles back to the best cards faster than extra Crypto does. Change: draw weight 2.48→2.88. league 31/48 for the experiment vs 31.5/48 for the current best against t-5@v1.8, dv-8@v1.1 (margin -3.4/game) → rejected. Kept the current best.
- **x106-fallback-106-1** rejected (v1.11): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: draw weight 2.48→2.73. league 28/48 for the experiment vs 29.5/48 for the current best against dv-8@v1.2, dv-8@v1.1, t-5@v1.5 (margin -1.8/game) → rejected. Kept the current best.
- **x105-fallback-105-0** inconclusive (v1.11): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: power weight 1.26→1.51. league 30/48 for the experiment vs 28/48 for the current best against dv-8@v1.3, vp-dog@v1.5, t-5@v1.7 (margin +2.1/game) → inconclusive. Kept the current best.

## Theories

### Supported
- none yet

### Under test
- **new-locations-impact** (untested · v1.11): The new Locations 'The Might Meek' and 'The Nudge' will significantly impact deck strategies, favoring low-cost and aggressive VP collection.

### Refuted
- none yet

## Card and Location notes

- **Kilo-Coin**: Crypto worth 3, economy; est. hand value 3.8 early / 1.5 late at cost 6. Untested.
- **Mega-Cache**: Crypto worth 5; est. hand value 6.3 early / 2.5 late at cost 9. Untested.
- **Relocation Relay**: utility; est. hand value 2.5 early / 2.5 late at cost 3. Untested.
- **Hostile Reroute**: utility; est. hand value 2.5 early / 2.5 late at cost 4. Untested.
- **Signal Amplifier**: utility; est. hand value 3.2 early / 3.2 late at cost 3. Untested.
- **Power Siphon**: utility; est. hand value 3.2 early / 3.2 late at cost 4. Untested.
- **Sleek Z**: utility; est. hand value 2.5 early / 2.5 late at cost 3. Untested.
- **Salem Surge **: utility; est. hand value 4.5 early / 4.5 late at cost 3. Untested.
- **Foder Fox**: utility; est. hand value 2.8 early / 2.8 late at cost 4. Untested.
- **Trash Collector**: utility; est. hand value 2 early / 2 late at cost 5. Untested.
- **Kim Dracula**: utility; est. hand value 2 early / 2 late at cost 5. Untested.
- **Hack Attack**: utility; est. hand value 1.2 early / 1.2 late at cost 4. Untested.
- **Jinx-001**: deck-cycling draw engine, economy; est. hand value 9.3 early / 7 late at cost 0. Untested.
- **Bumpster**: utility; est. hand value 3.8 early / 3.8 late at cost 2. Untested.
- **BumpEffecter**: utility; est. hand value 3.8 early / 3.8 late at cost 2. Untested.
- **Heist**: utility; est. hand value 0.8 early / 0.8 late at cost 2. Untested.
- **Timed Bomb**: utility; est. hand value 5.2 early / 5.2 late at cost 1. Untested.
- **Selective Thief**: utility; est. hand value 0.8 early / 0.8 late at cost 1. Untested.
- **Tin Coin**: high Power; est. hand value 6.3 early / 5.5 late at cost 3. Untested.
- **Apollo Ascii**: Monitor its potential to reset power dynamics significantly.
- **Dama de Fuego**: 3 VP finisher; est. hand value 3.8 early / 3.8 late at cost 6. Untested.
- **501.AR**: 1 VP finisher; est. hand value 3.6 early / 3.6 late at cost 4. Untested.
- **Hot Oil Spa**: Monitor the impact of healing on revealed cards, as it may change strategies for both players.
- **A Total Loss**: utility; est. hand value -7.8 early / -7.8 late at cost 4. Untested.
- **501.Dial**: 2 VP finisher; est. hand value 5.8 early / 5.8 late at cost 6. Untested.
- **Ticking-tacking**: Evaluate how power reduction affects card deployment and overall strategy.
- **Healing Hands**: Monitor for its potential to significantly change defensive strategies.
- **No Man's Land**: New Location: 'Nothing ever happens here' - Monitor its potential to shift strategies and impact the economy.
- **Rezz-Rizz**: Consider for its utility in enhancing the power of other cards deployed at the same Node, potentially increasing board pressure.
- **Z-Mobile**: Evaluate its ability to gain power based on the number of cards moved, which could synergize well with mobility strategies.
- **T-Moble**: Monitor its performance in gaining power through card movement, as it offers flexibility in placement.
- **The Nudge**: New Location: 'The Nudge' - On collapse: +1 VP to the player with the least VP. This could incentivize aggressive VP collection strategies, particularly in the late game.
- **Babba Yaga**: endgame Drain finisher; est. hand value 5.1 early / 13.2 late at cost 10. Untested.
- **The Might Meek**: New Location: 'The Might Meek' - Ongoing: +1 Power to the weakest revealed card on each side. This may favor decks with low-cost cards or those that can reset Power dynamics.
- **Cull the Meek**: New Location: "On collapse: Destroy the weakest revealed card on each side." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Loose Change**: New Location: "Ongoing: +1 Crypto to the losing player." Read: winning it hands the other player about 7.34 hand points, so commit only what the Circuit count needs or concede it. Untested; watch who wins it and how it shifts the economy.
- **Renew**: New Location: "Start of turn 3: Reset the Power of all cards here." Read: contest it: holding it is worth about 1.62 hand points more than losing it. Untested; watch who wins it and how it shifts the economy.
- **Pay to Play?**: New Location: "On collapse: Winner may pay 2 Crypto, and get +4 Power to a random card in their deck." Read: winning it hands the other player about 3.68 hand points, so commit only what the Circuit count needs or concede it. Untested; watch who wins it and how it shifts the economy.
- **Peep my shit**: New Location: "Start of turn 3: Winner inspects 3 cards from their deck, then keep, discard or trash each." Read: contest it: holding it is worth about 2.7 hand points more than losing it. Untested; watch who wins it and how it shifts the economy.
- **Wreck my shit **: New Location: "On collapse: Remove “Movable” Mod from a card anywhere in the winning player's deck." Read: winning it hands the other player about 1 hand points, so commit only what the Circuit count needs or concede it. Untested; watch who wins it and how it shifts the economy.

## Card results (complete games where a side bought it)

- Mega-Cache: 6/6 wins (me 0/0, human 6/6)
- Root Rune: 3/3 wins (me 1/1, human 2/2)
- Zenith Wetware: 2/2 wins (me 0/0, human 2/2)
- Kim Dracula: 3/3 wins (me 0/0, human 3/3)
- Neural Wetware: 2/2 wins (me 0/0, human 2/2)
- Zenith Worx: 2/2 wins (me 0/0, human 2/2)
- Node Feratu: 2/2 wins (me 0/0, human 2/2)
- Veil of Cthulhu: 3/3 wins (me 0/0, human 3/3)
- Invocation of the Sword: 2/2 wins (me 1/1, human 1/1)
- 501.AR: 2/2 wins (me 0/0, human 2/2)
- Sudo Demiurge: 4/5 wins (me 0/1, human 4/4)
- Infernal Kernel: 3/4 wins (me 0/1, human 3/3)
- ∆-Wave: 5/7 wins (me 1/2, human 4/5)
- Iterative Incubus: 6/9 wins (me 1/3, human 5/6)
- The Shiva of CERN: 4/6 wins (me 1/1, human 3/5)

## Locations (from my side, complete games)

- FX Bumper: seen 30, I won 10, human won 16
- Quantum commons: seen 29, I won 12, human won 15
- Ritual mine: seen 28, I won 9, human won 15
- Data Breach: seen 27, I won 11, human won 15
- BumperBall: seen 27, I won 11, human won 14
- Occult Archive: seen 27, I won 13, human won 12
- Sacrificial LLM: seen 25, I won 13, human won 3
- Sludge core: seen 25, I won 8, human won 11
- Ticking-tacking: seen 25, I won 13, human won 7
- Buggie Smalls: seen 24, I won 11, human won 6
- Wind fall: seen 24, I won 6, human won 14
- Wing clip: seen 24, I won 10, human won 10
- Get Out: seen 23, I won 7, human won 13
- Login the Calvary: seen 23, I won 6, human won 15
- Loser's Luck: seen 22, I won 11, human won 9

## Recent notes

- v1.11 · 2026-10-17 17:24 · My board Power has been consistently low; I need to focus on maintaining it while contesting Locations.
- v1.11 · 2026-10-17 17:24 · I need to watch how the new Locations interact with my cards and adjust my strategy accordingly.
- v1.11 · 2026-10-17 17:24 · Both new Locations may favor aggressive strategies; I need to adapt quickly.
- v1.11 · 2026-10-17 17:24 · The human's economy is consistently outpacing mine; I must prioritize acquiring high-value Crypto earlier.
- v1.11 · 2026-10-17 17:24 · v1.11 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.11 · 2026-10-17 17:24 · My board Power has been consistently low; I need to focus on maintaining it while contesting Locations.
- v1.11 · 2026-10-17 17:24 · The human's economy remains a significant threat; I must prioritize high-value Crypto earlier.
- v1.11 · 2026-10-17 17:24 · Both new Locations may favor aggressive strategies; I need to adapt quickly.
- v1.11 · 2026-10-17 17:24 · v1.11 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.11 · 2026-10-17 03:07 · Adjust my strategy based on the new Locations to improve my chances of winning key Nodes.
- v1.11 · 2026-10-17 03:07 · 'The Might Meek' may favor low-cost cards; I should consider including more low-cost options in my deck to maximize its benefits.
- v1.11 · 2026-10-17 03:07 · Evaluate the impact of 'The Nudge' on aggressive VP strategies, especially in late-game scenarios.
- v1.11 · 2026-10-17 03:07 · Monitor the human's economy closely; they have consistently outpaced mine in recent games.
- v1.11 · 2026-10-17 03:07 · v1.11 online (server start). Read the notebook: 1 active theories, 60 concluded experiments, record 3-10-0.
- v1.11 · 2026-10-17 03:05 · Continue to prioritize high-value Crypto early to avoid falling behind in economy.
- v1.11 · 2026-10-17 03:05 · Focus on thinning my deck to improve access to high-value cards as the game progresses.
- v1.11 · 2026-10-17 03:05 · Evaluate the impact of new Locations on my strategy, especially 'The Might Meek' favoring low-cost cards.
- v1.11 · 2026-10-17 03:05 · v1.11 online (server start). Read the notebook: 1 active theories, 60 concluded experiments, record 3-10-0.
- v1.11 · 2026-10-17 03:05 · Keep an eye on the human's economy; they consistently outpace mine in recent games.
- v1.11 · 2026-10-17 03:05 · Evaluate 'The Nudge' for its impact on aggressive VP strategies, particularly in the late game.
- v1.11 · 2026-10-17 03:05 · Monitor how 'The Might Meek' may favor low-cost cards, potentially enhancing my board Power.
- v1.11 · 2026-10-17 03:05 · v1.11 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.11 · 2026-10-17 03:05 · I need to watch how the new Locations interact with my cards and adjust my strategy accordingly.
- v1.11 · 2026-10-17 03:05 · Both new Locations have potential to shift strategies; 'The Might Meek' may favor aggressive decks while 'The Nudge' could pressure my VP strategy.
- v1.11 · 2026-10-17 03:05 · The human's economy is consistently outpacing mine; I need to prioritize acquiring high-value Crypto earlier to avoid falling behind.
- v1.11 · 2026-10-17 03:05 · v1.11 online (server start). Read the notebook: 1 active theories, 60 concluded experiments, record 3-10-0.
- v1.11 · 2026-10-16 20:19 · New experiment x120-draw: Valuing draw higher cycles back to the best cards faster than extra Crypto does. Change: draw weight 2.48→2.88. Prediction: More wins and more Locations won than the current best.
- v1.11 · 2026-10-16 20:19 · Experiment x119-fallback-119-1 inconclusive: league 23/48 for the experiment vs 23/48 for the current best against t-5@v1.8, vp-dog@v1.6, dv-8@v1.1 (margin -0.3/game) → inconclusive. Kept the current best.
- v1.11 · 2026-10-16 20:18 · New experiment x119-fallback-119-1: A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: draw weight 2.48→2.73. Prediction: More wins or a better margin than the current best.
- v1.11 · 2026-10-16 20:15 · Experiment x118-fallback-118-0 rejected: league 23.5/48 for the experiment vs 24/48 for the current best against dv-8@v1.2, dv-8@v1.3, strat-g@v1.9 (margin -3.7/game) → rejected. Kept the current best.
- v1.11 · 2026-10-16 20:15 · New experiment x118-fallback-118-0: A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: power weight 1.26→1.51. Prediction: More wins or a better margin than the current best.
- v1.11 · 2026-10-16 20:11 · Experiment x117-restore inconclusive: league 29.5/48 for the experiment vs 27/48 for the current best against dv-8@v1.3, strat-g@v1.8, t-5@v1.6 (margin +0.6/game) → inconclusive. Kept the current best.
- v1.11 · 2026-10-16 20:07 · New experiment x117-restore: Valuing Restore higher keeps my Servers alive long enough to win on VP. Change: restore weight 1.69→2.09. Prediction: Fewer losses by Server destruction than the current best.
- v1.11 · 2026-10-16 20:07 · Experiment x116-fallback-116-4 inconclusive: league 30.5/48 for the experiment vs 30/48 for the current best against t-5@v1.8, t-5@v1.5, strat-g@v1.7 (margin +1.9/game) → inconclusive. Kept the current best.
- v1.11 · 2026-10-16 20:06 · New experiment x116-fallback-116-4: A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: drain weight 2.25→2.5. Prediction: More wins or a better margin than the current best.
- v1.11 · 2026-10-16 20:03 · Experiment x115-crypto inconclusive: league 29/48 for the experiment vs 28/48 for the current best against dv-8@v1.3, t-5@v1.4, vp-dog@v1.6 (margin +2.2/game) → inconclusive. Kept the current best.
- v1.11 · 2026-10-16 20:01 · New experiment x115-crypto: Valuing high-value Crypto more (and aiming for a richer hand) out-buys the opponent mid-game. Change: crypto weight 2.34→2.64. Prediction: Bigger mid-game Wallets and more wins than the current best.
- v1.11 · 2026-10-16 20:01 · Experiment x114-disrupt rejected: league 35/48 for the experiment vs 36/48 for the current best against t-5@v1.7, dv-8@v1.3, t-5@v1.6 (margin -0.9/game) → rejected. Kept the current best.
- v1.11 · 2026-10-16 19:56 · New experiment x114-disrupt: Valuing disruption higher slows the opponent's plan more than it costs mine. Change: disrupt weight 1.05→1.37. Prediction: More wins and a better margin than the current best.
- v1.11 · 2026-10-16 19:56 · Experiment x113-fallback-113-3 inconclusive: league 34/48 for the experiment vs 33/48 for the current best against dv-8@v1.0, t-5@v1.8, dv-8@v1.2 (margin +3.7/game) → inconclusive. Kept the current best.

## Version history

- v1.11 (llm) since 2026-10-16 16:53 · 0/0 wins · I will maintain focus on acquiring high-value Crypto early, targeting a Crypto value of 11.67 by Cycle 4. In Cycles 5-8, I will balance my Draft among attacks, …
- v1.10 (llm) since 2026-10-16 08:07 · 0/0 wins · I will maintain focus on acquiring high-value Crypto early, targeting a Crypto value of 11.67 by Cycle 4. In Cycles 5-8, I will balance my Draft among attacks, …
- v1.9 (llm) since 2026-10-16 05:27 · 0/0 wins · I will maintain focus on acquiring high-value Crypto early, targeting a Crypto value of 11.67 by Cycle 4. In Cycles 5-8, I will balance my Draft among attacks, …
- v1.8 (llm) since 2026-10-16 05:19 · 0/0 wins · I will maintain focus on acquiring high-value Crypto early, targeting a Crypto value of 11.67 by Cycle 4. In Cycles 5-8, I will balance my Draft among attacks, …
- v1.7 (llm) since 2026-10-08 15:52 · 0/0 wins · I will continue to build a strong economy through Cycle 4, focusing on high-value Crypto cards like Kilo-Coin and Mega-Cache to reach 12 Crypto. In Cycles 5-8, …
- v1.6 (llm) since 2026-10-08 15:49 · 0/0 wins · I will maintain a strong economy through Cycle 5, targeting high-value Crypto cards like Kilo-Coin and Mega-Cache to reach 12 Crypto. I will pivot to Chaos from…
- v1.5 (llm) since 2026-10-08 08:22 · 0/0 wins · I will maintain a focus on building a strong economy until Cycle 5, aiming for 11 Crypto with high-value cards like Kilo-Coin and Mega-Cache. I will pivot to Ch…
- v1.4 (llm) since 2026-10-08 08:18 · 0/0 wins · I will maintain a focus on building a strong economy until Cycle 5, aiming for 11 Crypto with high-value cards like Kilo-Coin and Mega-Cache. I will pivot to Ch…
- v1.3 (llm) since 2026-10-08 04:15 · 0/0 wins · I will maintain a strong economic foundation through Cycle 4, focusing on high-value Crypto and Action Base cards, targeting ~9 Crypto per hand. I will continue…
- v1.2 (llm) since 2026-10-08 03:17 · 0/1 wins · I will maintain a robust economy through Cycle 4, pivot to Chaos from Cycle 5, and focus on acquiring VP cards starting from Cycle 10 as per the running experim…
- v1.1 (llm) since 2026-10-08 01:59 · 0/0 wins · I will execute a strong economy until Cycle 4, pivot to Chaos from Cycle 5, and focus on VP acquisition from Cycle 12. I will aim for at least 10 cards by mid-g…
- v1.0 (llm) since 2026-10-07 02:49 · 2/7 wins · I will maintain a strong economy until Cycle 4, pivot into Chaos strategies from Cycle 5, and prioritize VP card acquisitions starting in Cycle 12. Given the hu…
