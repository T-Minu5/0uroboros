# Strat-G notebook

Written by Strat-G, the AI opponent's strategy agent. Each dev-server start reads this notebook (and `memory.json`), plans, plays, and leaves notes here. Its version changes only when the profile it plays changes.

How Strat-G learns: it plays the protected baseline below plus the changes its experiments have earned. It changes its play only through experiments: one bounded change at a time, played by the league referee as paired games (the experiment and the current best face the same sampled opponents on the same seeds). Code measures the results and adopts or rejects the change. It never sees the other agents' profiles, plans or notebooks, only who it played and the results.

Style: Balanced in three phases: economy and engine (Cycles 1-4), a balanced midgame (5-8), then all-out Server attacks and VP buying (9-16).

Style envelope (every profile is clamped into it): economyUntilCycle 4-4, chaosFromCycle 9-9, vpFromCycle 9-9, handCryptoTarget 7-12, vp weight 1.6-3, drain weight 1.4-3.

## Current agent: v1.12 (heuristic)

Record against the human (complete games only): 3 wins, 10 losses, 0 ties over 13 games. Ignored 28 sessions that were not complete games.

League snapshots (newest first): strat-g@v1.12, strat-g@v1.11, strat-g@v1.10, strat-g@v1.9, strat-g@v1.8

### Plan of play

v1.12 plays the designer's baseline plus 4 adopted changes (power weight 1.01→1.26; Crypto target 11.67→12, crypto weight 2.04→2.34; disrupt weight 0.8→1.05; restore weight 1.3→1.69). Through Cycle 4: strong draw/Action Base cards and Crypto worth 2+ (never Shyte-Coin), aiming for ~12 Crypto per hand. Cycles 5-8: a balanced midgame of attacks, engine, Server Restore and VP. From Cycle 9: Chaos and Drain for the endgame push; VP cards from Cycle 9, and the last Draft buys only VP. Testing x120-draw: Valuing draw higher cycles back to the best cards faster than extra Crypto does. (Schedule: economy through Cycle 4, balanced midgame Cycles 5-8, Chaos from Cycle 9, VP from Cycle 9.)

### Profile in play (current best)

Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 12/hand · min Crypto value 2 · min buy score 0.75 · dilution 0.5

Weights: power 1.26, draw 1.6, actions 1.1, crypto 2.34, drain 2.4, restore 1.69, vp 2.6, duration 0.8, thin 1.2, disrupt 1.05, chaos 1.5

Card biases: none.

## Baseline strategy (protected)

The designer's playbook, in force since 2026-10-17. Learning never edits it; changes are layered on top only when an experiment earns them.

- Cycles 1-4 (all AI players, before your own objective): acquire Crypto and trash the weak starters. The Standard starting deck prints exactly 6 Crypto (2 Byte-Coin at 2 each + 2 Shyte-Coin at 1 each), which is exactly the cost of one Kilo-Coin (cost 6, prints 3). One Kilo-Coin replaces three Shyte-Coins of Crypto.
- Cycles 1-4 Draft: buy a Kilo-Coin as soon as the Wallet can pay 6. If Cycle 1's Wallet is under 6, buy a Byte-Coin instead. Then buy as many Mega-Cache as the Wallet allows. Skip Shyte-Coin; skip Chaos and market VP unless nothing else is worth buying.
- Cycles 1-4 trash order: Basic Encryption first (both copies). Do not trash any Crypto until you own a Kilo-Coin (or Mega-Cache). Once you have a Kilo-Coin, trash the Shyte-Coins. Aim to have both Basic Encryption and both Shyte-Coins gone by the end of Cycle 4. Night Scythe and other trash effects are for this.
- From Cycle 5: follow your own objective and style (aggression, engine, pure VP, or balanced). The early economy is done.
- Phase 2, midgame (Cycles 5-8): balance four things every Draft: attacks (Chaos and Drain), the deck engine, Server Restore and VP collection. No single pillar takes the whole Wallet.
- Phase 3, endgame (Cycles 9-16): attack the enemy Servers like crazy, deploying every Drain card I draw first, and spend most of each Wallet on VP cards. The final Draft buys only VP.
- Draft after Cycle 4: score every card from its actual effects (no fixed table) and buy the best set the whole Wallet affords; skip cards that would only dilute the deck.
- Deploy: Action and draw cards first so they fuel later turns; contest Nodes whose Location pays the winner, and do not fight for Locations that pay the loser.
- Choices after Cycle 4: trash, discard and Scry are picked deliberately: trash my own junk (Shyte-Coin, Glitch) and hit the opponent's best cards.

Baseline profile: Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 9/hand · min Crypto value 2 · min buy score 0.75 · dilution 0.5

Baseline weights: power 1, draw 1.6, actions 1.1, crypto 1, drain 2.4, restore 1, vp 2.6, duration 0.8, thin 1.2, disrupt 0.8, chaos 1.5

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
- none

### Refuted
- none yet

## Card and Location notes

- **Dama de Fuego**: 3 VP finisher; est. hand value 3.8 early / 3.8 late at cost 6. Untested.
- **501.AR**: 1 VP finisher; est. hand value 3.6 early / 3.6 late at cost 4. Untested.
- **Hot Oil Spa**: Monitor the impact of healing on revealed cards, as it may change strategies for both players.
- **Not a Total Loss**: utility; est. hand value -7.8 early / -7.8 late at cost 4. Untested.
- **i0N**: 2 VP finisher; est. hand value 5.8 early / 5.8 late at cost 6. Untested.
- **Ticking-tacking**: Evaluate how power reduction affects card deployment and overall strategy.
- **Healing Hands**: Monitor for its potential to significantly change defensive strategies.
- **No Man's Land**: New Location: 'Nothing ever happens here' - Monitor its potential to shift strategies and impact the economy.
- **Rezz-Rizz**: Consider for its utility in enhancing the power of other cards deployed at the same Node, potentially increasing board pressure.
- **z-mobile**: Evaluate its ability to gain power based on the number of cards moved, which could synergize well with mobility strategies.
- **t-moble**: Monitor its performance in gaining power through card movement, as it offers flexibility in placement.
- **location-4044n9xw**: New Location: 'The Nudge' - On collapse: +1 VP to the player with the least VP. This could incentivize aggressive VP collection strategies, particularly in the late game.
- **The Shoggoth**: endgame Drain finisher; est. hand value 5.1 early / 13.2 late at cost 10. Untested.
- **The Might Meek**: New Location: 'The Might Meek' - Ongoing: +1 Power to the weakest revealed card on each side. This may favor decks with low-cost cards or those that can reset Power dynamics.
- **Cull the Meek**: New Location: "On collapse: Destroy the weakest revealed card on each side." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Loose Change**: New Location: "Ongoing: +1 Crypto to the losing player." Read: winning it hands the other player about 7.34 hand points, so commit only what the Circuit count needs or concede it. Untested; watch who wins it and how it shifts the economy.
- **Renew**: New Location: "Start of turn 3: Reset the Power of all cards here." Read: contest it: holding it is worth about 1.62 hand points more than losing it. Untested; watch who wins it and how it shifts the economy.
- **Pay to Play?**: New Location: "On collapse: Winner may pay 2 Crypto, and get +4 Power to a random card in their deck." Read: winning it hands the other player about 3.68 hand points, so commit only what the Circuit count needs or concede it. Untested; watch who wins it and how it shifts the economy.
- **Peep my shit**: New Location: "Start of turn 3: Winner inspects 3 cards from their deck, then keep, discard or trash each." Read: contest it: holding it is worth about 2.7 hand points more than losing it. Untested; watch who wins it and how it shifts the economy.
- **Wreck my shit **: New Location: "On collapse: Remove “Movable” Mod from a card anywhere in the winning player's deck." Read: winning it hands the other player about 1 hand points, so commit only what the Circuit count needs or concede it. Untested; watch who wins it and how it shifts the economy.
- **Glitch-Witch**: utility; est. hand value -0.7 early / -0.7 late at cost 5. Untested.
- **Crypto Alchemist**: utility; est. hand value 0 early / 0 late at cost 7. Untested.
- **Jackpot**: New Location: "On collapse: +3 Crypto to the winning player." Read: contest it: holding it is worth about 12.64 hand points more than losing it. Untested; watch who wins it and how it shifts the economy.
- **Get Some**: New Location: "On collapse: +2 Crypto to each player." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Amatera-5u**: 3 VP finisher, deck-cycling draw engine; est. hand value 7.3 early / 7.3 late at cost 6. Untested.
- **Danda**: 1 VP finisher, economy; est. hand value 10 early / 6.5 late at cost 4. Untested.
- **H3l3-iOS**: 4 VP finisher, Server defense; est. hand value 8.1 early / 6.3 late at cost 7. Untested.
- **Kinich**: 2 VP finisher; est. hand value 4.9 early / 4.9 late at cost 8. Untested.
- **Sun Scythe**: 1 VP finisher; est. hand value 0 early / 0 late at cost 3. Untested.
- **Astra Wraith**: 1 VP finisher; est. hand value 2 early / 2 late at cost 5. Untested.
- **Mary Mallon**: utility; est. hand value 1.3 early / 1.3 late at cost 8. Untested.
- **Merchant of Chaos**: utility; est. hand value 5.7 early / 5.7 late at cost 11. Untested.
- **The Heisenberg Hag**: Action engine; est. hand value 6.6 early / 6.6 late at cost 4. Untested.
- **Entropic Infantry**: utility; est. hand value 2.5 early / 2.5 late at cost 8. Untested.
- **Pihkal hound**: light Drain; est. hand value 4.5 early / 7.2 late at cost 5. Untested.
- **Delete.Detritus.exe**: utility; est. hand value 5.5 early / 2 late at cost 4. Untested.
- **Not a total loss**: New Location: "if you have 0 or less Power here, +2 Crypto.." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 2.11. Untested; watch who wins it and how it shifts the economy.
- **Absolute Horror**: New Location: "If you have 3 or more Horror cards here, Drain -200 from the other player's server." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 2.16. Untested; watch who wins it and how it shifts the economy.
- **Spice of Lyfe**: New Location: "While in play: if you have an Action and a Horror here." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Kanada**: utility; est. hand value -0.3 early / -0.3 late at cost 3. Untested.

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
- location-qn2xfxg2: seen 27, I won 11, human won 14
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

- v1.12 · 2026-10-26 02:35 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 02:35 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 02:35 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 02:35 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 02:34 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 02:33 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 02:33 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 02:33 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 02:33 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 02:33 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 02:33 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 02:33 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 02:32 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 02:32 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0. New cards since last version: Kanada.
- v1.12 · 2026-10-26 02:18 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 02:18 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0. New Locations: Not a total loss, Absolute Horror, Spice of Lyfe.
- v1.12 · 2026-10-26 02:02 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 02:02 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 01:42 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 01:42 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 01:42 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 01:38 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 01:38 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 01:38 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 01:38 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 01:38 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 01:38 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 01:38 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-26 00:06 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0. New cards since last version: Shyte-Coin.
- v1.12 · 2026-10-25 20:38 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-25 20:38 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-25 18:38 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-25 18:38 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-25 18:24 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-25 18:24 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-25 18:24 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0. New cards since last version: Dolly DoS, Ghetto Blaster, Not a Total Loss, Rezz-Rizz, Pihkal hound, Delete.Detritus.exe.
- v1.12 · 2026-10-20 05:40 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-20 05:40 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-20 05:40 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.12 · 2026-10-20 05:40 · v1.12 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.

## Version history

- v1.12 (heuristic) since 2026-10-17 18:48 · 0/0 wins · v1.12 plays the designer's baseline plus 4 adopted changes (power weight 1.01→1.26; Crypto target 11.67→12, crypto weight 2.04→2.34; disrupt weight 0.8→1.05; re…
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
