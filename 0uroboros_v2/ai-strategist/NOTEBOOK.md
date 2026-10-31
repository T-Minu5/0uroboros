# Strat-G notebook

Written by Strat-G, the AI opponent's strategy agent. Each dev-server start reads this notebook (and `memory.json`), plans, plays, and leaves notes here. Its version changes only when the profile it plays changes.

How Strat-G learns: it plays the protected baseline below plus the changes its experiments have earned. It changes its play only through experiments: one bounded change at a time, played by the league referee as paired games (the experiment and the current best face the same sampled opponents on the same seeds). Code measures the results and adopts or rejects the change. Theory scores are associations (winner/loser patterns), not causal proof; "supported" is not adoption-ready. It never sees the other agents' profiles, plans or notebooks, only who it played and the results.

Style: Balanced in three phases: economy and engine (Cycles 1-4), a balanced midgame (5-8), then all-out Server attacks and VP buying (9-16).

Style envelope (every profile is clamped into it): economyUntilCycle 4-4, chaosFromCycle 9-9, vpFromCycle 9-9, handCryptoTarget 7-12, vp weight 1.6-3, drain weight 1.4-3.

## Current agent: v1.22 (model-assisted)

Record against the human (complete games only): 3 wins, 10 losses, 0 ties over 13 games. Ignored 28 sessions that were not complete games.

League snapshots (newest first): strat-g@v1.22, strat-g@v1.21, strat-g@v1.20, strat-g@v1.19, strat-g@v1.18

### Plan of play

_Documentary only: the numeric profile below governs what is actually played. The plan must not invent settings the profile does not have._

v1.22 continues to focus on an early economy boost through Cycles 1-4, aiming for ~12 Crypto per hand. In Cycles 5-8, I will balance attacks, engine setup, Server Restore, and VP collection to improve my standing. From Cycle 9, I will aggressively target enemy Servers through Chaos and Drain strategies, prioritizing VP cards. I will adapt my play to exploit new Locations, particularly those that enhance economic advantages or disrupt the opponent's strategies, while also focusing on maintaining my Server health. (Schedule: economy through Cycle 4, balanced midgame Cycles 5-8, Chaos from Cycle 9, VP from Cycle 9.)

### Profile in play (current best — executable)

Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 12/hand · min Crypto value 2 · min buy score 1.75 · dilution 0.9

Weights: power 1.26, draw 1.6, actions 1.1, crypto 3.3, drain 2.9, restore 2.49, vp 2.6, duration 0.8, thin 1.2, disrupt 1.37, chaos 1.5

Card biases: none.

## Baseline strategy (protected)

The designer's playbook, in force since 2026-10-27. Learning never edits it; changes are layered on top only when an experiment earns them.

- Cycles 1-4 (all AI players, before your own objective): raise Wallet income and trash the weak starters. The current Standard starting deck is weaker than older builds: 6× Shyte-Coin (1 Crypto each), 1× Basic Encryption, 1× Night Scythe, 1× Doom Loop, 1× Rezz Razor. It still prints 6 Crypto from Shyte alone, but with no Byte-Coin and fewer strong Characters, so early hands are softer — and that softness is the flexibility: many more cards in the pack now print Crypto, so you shape the economy by Draft picks, not by a fixed starter engine.
- Cycles 1-4 Draft: prefer cards that raise future Wallet — Characters that gain Crypto (the Draft's Crypto-gain slots especially), plus draw/Action/trash that set up your plan. Skip Shyte-Coin; skip Chaos and market VP unless nothing else is worth buying. When the Crypto shelf is ON, buy a Kilo-Coin as soon as the Wallet can pay 6 (Byte-Coin if Cycle 1 is under 6), then as many Mega-Cache as the Wallet allows. When the shelf is OFF (common default), there are no Crypto card piles: Crypto comes from Character effects and any Crypto you already hold.
- Cycles 1-4 trash order: Basic Encryption first. Do not trash Shyte-Coins until you have a better Crypto source in the deck (a Kilo/Mega from the shelf, or a Character that reliably prints 2+ Crypto). Once you do, trash Shyte-Coins. Aim to have Basic Encryption and most Shyte-Coins gone by the end of Cycle 4. Night Scythe and other trash effects are for this.
- From Cycle 5: follow your own objective and style (aggression, engine, pure VP, or balanced). The early economy is done.
- Phase 2, midgame (Cycles 5-8): balance four things every Draft: attacks (Chaos and Drain), the deck engine, Server Restore and VP collection. No single pillar takes the whole Wallet.
- Phase 3, endgame (Cycles 9-16): attack the enemy Servers like crazy, deploying every Drain card I draw first, and spend most of each Wallet on VP cards. The final Draft buys only VP.
- Draft after Cycle 4: score every card from its actual effects (no fixed table) and by how much it improves the weak starting deck; buy the best set the whole Wallet affords; skip cards that would only dilute the deck.
- Deploy: Action and draw cards first so they fuel later turns; then sequence other reveals so later cards benefit from earlier effects. Contest Nodes whose Location pays the winner; concede Locations that pay the loser or clog my deck when Circuit count allows.
- Choices after Cycle 4: trash, discard and Scry are picked deliberately: trash my own junk (Shyte-Coin, Glitch), pollute the opponent when the effect puts junk in their deck, and hit their best cards.

Baseline profile: Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 9/hand · min Crypto value 2 · min buy score 0.75 · dilution 0.5

Baseline weights: power 1, draw 1.6, actions 1.1, crypto 1, drain 2.4, restore 1, vp 2.6, duration 0.8, thin 1.2, disrupt 0.8, chaos 1.5

## Adopted changes

- **x159-leaner** (v1.16): min buy score 1.25→1.75, dilution 0.7→0.9. league 15/48 for the experiment vs 10.5/48 for the current best against vp-dog@v1.1, vp-dog@v1.0 (margin +5.7/game) → promising. Adopted into the current best.
- **x160-drain** (v1.17): drain weight 2.4→2.9. league 38/48 for the experiment vs 34/48 for the current best against t-5@v1.5, t-5@v1.3, strat-g@v1.15 (margin +4.6/game) → promising. Adopted into the current best.
- **x166-disrupt** (v1.18): disrupt weight 1.05→1.37. league 29.5/48 for the experiment vs 25.5/48 for the current best against dv-8@v1.0, dv-8@v1.3, vp-dog@v1.1 (margin +5/game) → promising. Adopted into the current best.
- **x176-more-economy-focused-draft** (v1.19): crypto weight 2.59→2.8. league 31/48 for the experiment vs 27/48 for the current best against t-5@v1.9, t-5@v1.5, dv-8@v1.4 (margin +3.9/game) → promising. Adopted into the current best.
- **x180-restore** (v1.20): restore weight 2.09→2.49. league 28/48 for the experiment vs 24/48 for the current best against t-5@v1.5, t-5@v1.9 (margin +2.7/game) → promising. Adopted into the current best.
- **x187-fallback-187-3** (v1.21): crypto weight 2.8→3.05. league 30.5/48 for the experiment vs 22.5/48 for the current best against dv-8@v1.7, t-5@v1.10, strat-g@v1.18 (margin +7.6/game) → promising. Adopted into the current best.
- **x190-fallback-190-3** (v1.22): crypto weight 3.05→3.3. league 36/48 for the experiment vs 29/48 for the current best against dv-8@v1.6, t-5@v1.6, strat-g@v1.19 (margin +5.9/game) → promising. Adopted into the current best.

## Current experiment

- **x196-draw** (lab, proposed by v1.22, heuristic): Valuing draw higher cycles back to the best cards faster than extra Crypto does.
- Change: draw weight 1.6→2
- Prediction: More wins and more Locations won than the current best.
- Theory: none
- League trial: pending

## Experiment log

- **x195-fallback-195-2** inconclusive (v1.22): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: actions weight 1.1→1.35. league 32.5/48 for the experiment vs 32.5/48 for the current best against t-5@v1.6, dv-8@v1.3 (margin +2/game) → inconclusive. Kept the current best.
- **x194-fallback-194-1** rejected (v1.22): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: draw weight 1.6→1.85. league 24.5/48 for the experiment vs 29/48 for the current best against strat-g@v1.19, t-5@v1.10, dv-8@v1.5 (margin -3.4/game) → rejected. Kept the current best.
- **x193-disrupt** inconclusive (v1.22): Valuing disruption higher slows the opponent's plan more than it costs mine. Change: disrupt weight 1.37→1.77. league 23.5/48 for the experiment vs 23/48 for the current best against dv-8@v1.7, vp-dog@v1.2 (margin -2.4/game) → inconclusive. Kept the current best.
- **x192-power** inconclusive (v1.22): Valuing Power higher wins more Locations and their rewards. Change: power weight 1.26→1.56. league 18/48 for the experiment vs 15/48 for the current best against t-5@v1.10, strat-g@v1.18, vp-dog@v1.6 (margin +2.1/game) → inconclusive. Kept the current best.
- **x191-restore** inconclusive (v1.22): Valuing Restore higher keeps my Servers alive long enough to win on VP. Change: restore weight 2.49→2.89. league 25/48 for the experiment vs 25/48 for the current best against dv-8@v1.6, t-5@v1.10, vp-dog@v1.5 (margin -1.5/game) → inconclusive. Kept the current best.
- **x190-fallback-190-3** adopted (v1.22): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: crypto weight 3.05→3.3. league 36/48 for the experiment vs 29/48 for the current best against dv-8@v1.6, t-5@v1.6, strat-g@v1.19 (margin +5.9/game) → promising. Adopted into the current best.
- **x189-thinner** rejected (v1.21): Valuing deck thinning higher draws the best cards more often. Change: thin weight 1.2→1.56. league 20/48 for the experiment vs 21/48 for the current best against t-5@v1.10, vp-dog@v1.2, dv-8@v1.7 (margin -1.6/game) → rejected. Kept the current best.
- **x188-crypto** rejected (v1.21): Valuing Crypto income more — Character Crypto lines and shelf Coins when present — and aiming for a richer hand out-buys the opponent mid-game. Change: crypto weight 3.05→3.35. league 31/48 for the experiment vs 32/48 for the current best against strat-g@v1.19, dv-8@v1.3, dv-8@v1.7 (margin -1.4/game) → rejected. Kept the current best.
- **x187-fallback-187-3** adopted (v1.21): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: crypto weight 2.8→3.05. league 30.5/48 for the experiment vs 22.5/48 for the current best against dv-8@v1.7, t-5@v1.10, strat-g@v1.18 (margin +7.6/game) → promising. Adopted into the current best.
- **x186-fallback-186-0** rejected (v1.20): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: power weight 1.26→1.51. league 35/48 for the experiment vs 36/48 for the current best against dv-8@v1.7, t-5@v1.10 (margin -3.2/game) → rejected. Kept the current best.
- **x185-leaner** rejected (v1.20): A stricter purchase bar (fewer, better cards) keeps the deck sharp. Change: min buy score 1.75→2.25, dilution 0.9→1.1. league 20/48 for the experiment vs 24.5/48 for the current best against dv-8@v1.7, vp-dog@v1.4, vp-dog@v1.3 (margin -0.3/game) → rejected. Kept the current best.
- **x184-drain** rejected (v1.20): Valuing Drain higher ends games by Server destruction before the opponent's engine pays off. Change: drain weight 2.9→3. league 21/48 for the experiment vs 23/48 for the current best against vp-dog@v1.4, dv-8@v1.3 (margin -1/game) → rejected. Kept the current best.
- **x183-draw** rejected (v1.20): Valuing draw higher cycles back to the best cards faster than extra Crypto does. Change: draw weight 1.6→2. league 23/48 for the experiment vs 29/48 for the current best against t-5@v1.10, t-5@v1.6, strat-g@v1.17 (margin -8/game) → rejected. Kept the current best.
- **x182-fallback-182-2** inconclusive (v1.20): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: actions weight 1.1→1.35. league 22.5/48 for the experiment vs 22.5/48 for the current best against vp-dog@v1.1, t-5@v1.10, dv-8@v1.3 (margin -2.8/game) → inconclusive. Kept the current best.
- **x181-fallback-181-1** rejected (v1.20): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: draw weight 1.6→1.85. league 29.5/48 for the experiment vs 34/48 for the current best against dv-8@v1.7, dv-8@v1.5 (margin -5.5/game) → rejected. Kept the current best.

## Theories

### Supported
- none yet

### Under test
- **strategic-location-control** (untested · v1.22): New Locations provide opportunities for shifting game dynamics; I should prioritize Locations that enhance my economic advantage.
- **early-economy-adjustment** (untested · v1.22): Adjusting my early economy focus may help keep pace with human opponents who are consistently outpacing my Draft wallet.

### Refuted
- none yet

## Card and Location notes

- **Renew**: Start of turn 3: Reset the Power of all cards here. Holding this Location can provide a significant advantage.
- **Pay to Play?**: On collapse: Winner may pay 2 Crypto, and get +4 Power to a random card in their deck. Winning it can significantly boost a player's board strength.
- **Peep my shit**: New Location: 'Start of turn 3: Winner inspects 3 cards from their deck, then keep, discard or trash each.' This can shift the game state significantly.
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
- **Doom Loop**: utility; est. hand value -0.3 early / -0.3 late at cost 3. Untested.
- **Time Slide**: Utility; est. hand value 6.3 early / 6.3 late at cost 2. Untested.
- **Koppy-Kat**: Utility; est. hand value 2.5 early / 2.5 late at cost 4. Untested.
- **A Good Mix**: New Location: "While in play: if you have an Attack and an Action here, +2 Crypto.." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 2.97. Untested; watch who wins it and how it shifts the economy.
- **Fly Wheel**: New Location: "While in play: if you have 5 or more Power here, +2 Cards." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 1.6. Untested; watch who wins it and how it shifts the economy.
- **7th Heaven**: New Location: "While in play: if you have 7 or less Power here, +3 Crypto." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 4.45. Untested; watch who wins it and how it shifts the economy.
- **Triple Lindy**: New Location: "While in play: if you have 3 or more cards here, +2 Cards.." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 1.6. Untested; watch who wins it and how it shifts the economy.
- **3s Company**: New Location: "While in play: if you have 3 or more cards here, +1 Action. +1 Card. +1 Crypto.." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 2.84. Untested; watch who wins it and how it shifts the economy.
- **New location**: New Location: "While in play: if you have 2 or more Utility cards here, +1 Power to each." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 0.38. Untested; watch who wins it and how it shifts the economy.
- **Slash-ØN1**: light Drain; est. hand value 14.9 early / 9.5 late at cost 4. Untested.
- **Hack-ØN1**: light Drain; est. hand value 10.5 early / 10 late at cost 3. Untested.
- **3rd Wheel**: New Location: "While in play: if you have 3 or more cards here, -1 Power from all cards here." Read: about even for both sides; it matters through which cards sit there; each card you reveal here costs you about 0.38. Untested; watch who wins it and how it shifts the economy.
- **Mill My Man**: New Location: "While in play: if you have an Attack and a Horror here, Mill a card from the other player's deck." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 0.69. Untested; watch who wins it and how it shifts the economy.
- **Crowed House**: New Location: "While in play: if you have 4 or more cards here, +3 Crypto." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 4.45. Untested; watch who wins it and how it shifts the economy.
- **The Giving Tree**: New Location: "On collapse: +1 Power to all cards here." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Oh, Good For You!**: New Location: "Start of turn 3: +2 Power to the first revealed card on each side here." Read: about even for both sides; it matters through which cards sit there. Untested; watch who wins it and how it shifts the economy.
- **Repel Spell **: New Location: "On reveal: Move the card that was played to another open Node." Read: about even for both sides; it matters through which cards sit there; each card you reveal here gains you about 0.63. Untested; watch who wins it and how it shifts the economy.

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
- occult_archive: seen 27, I won 13, human won 12
- breach_relay: seen 25, I won 13, human won 3
- Sludge core: seen 25, I won 8, human won 11
- Ticking-tacking: seen 25, I won 13, human won 7
- Buggie Smalls: seen 24, I won 11, human won 6
- Wind fall: seen 24, I won 6, human won 14
- Wing clip: seen 24, I won 10, human won 10
- Get Lost: seen 23, I won 7, human won 13
- data_exchange: seen 23, I won 6, human won 15
- Loser's Luck: seen 22, I won 11, human won 9

## Recent notes

- v1.22 · 2026-10-30 02:58 · My board Power is frequently low; explore cards that enhance Power for maintaining Node control.
- v1.22 · 2026-10-30 02:58 · Warning: defense matters as my Servers are often low; prioritize Restore effects.
- v1.22 · 2026-10-30 02:58 · Human consistently outpaces my Draft wallet; consider adjusting my early economy focus.
- v1.22 · 2026-10-30 02:58 · Monitor the impact of new Locations on game dynamics, especially those affecting Crypto and Power.
- v1.22 · 2026-10-30 02:58 · v1.22 online (server start). Read the notebook: 2 active theories, 60 concluded experiments, record 3-10-0.
- v1.22 · 2026-10-29 07:48 · Evaluate the effectiveness of card combinations that synergize well with new Locations and card abilities.
- v1.22 · 2026-10-29 07:48 · Consider prioritizing defense strategies due to frequent Server vulnerabilities observed in recent games.
- v1.22 · 2026-10-29 07:48 · Monitor the impact of new Locations on game dynamics, especially those affecting Crypto and Power dynamics.
- v1.22 · 2026-10-29 07:48 · v1.22 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.22 · 2026-10-29 07:39 · Monitor new Locations for their strategic impact, especially those that affect Crypto and Power dynamics.
- v1.22 · 2026-10-29 07:39 · My board Power is frequently low; explore cards that enhance Power for maintaining Node control.
- v1.22 · 2026-10-29 07:39 · My Servers are often low; prioritize Restore effects to maintain defense.
- v1.22 · 2026-10-29 07:39 · The human's Draft wallet consistently outpaces mine; consider adjusting my early economy focus.
- v1.22 · 2026-10-29 07:39 · v1.22 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0.
- v1.22 · 2026-10-29 07:39 · My board Power is often low; explore cards that enhance Power for maintaining Node control.
- v1.22 · 2026-10-29 07:39 · Warning: defense matters as my Servers are often low; prioritize Restore effects.
- v1.22 · 2026-10-29 07:39 · Human consistently outpaces my Draft wallet; consider adjusting my early economy focus.
- v1.22 · 2026-10-29 07:39 · Monitor new Locations: 'A Good Mix', 'Fly Wheel', and others for their strategic impact.
- v1.22 · 2026-10-29 07:39 · v1.22 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-10-0. New cards since last version: Slash-ØN1, Hack-ØN1. New Locations: 3rd Wheel, Mill My Man, Crowed House, The Giving Tree, Oh, Good For You!, Repel Spell .
- v1.22 · 2026-10-29 03:06 · My board Power is often low; explore cards that enhance Power for maintaining Node control.
- v1.22 · 2026-10-29 03:06 · Warning: defense matters as my Servers are often low; prioritize Restore effects.
- v1.22 · 2026-10-29 03:06 · Human consistently outpaces my Draft wallet; consider adjusting my early economy focus.
- v1.22 · 2026-10-29 03:06 · Monitor new Locations: 'A Good Mix', 'Fly Wheel', and others for their strategic impact.
- v1.22 · 2026-10-29 03:06 · v1.22 online (server start). Read the notebook: 1 active theories, 60 concluded experiments, record 3-10-0. New Locations: A Good Mix, Fly Wheel, 7th Heaven, Triple Lindy, 3's Company, New location.
- v1.22 · 2026-10-28 15:19 · New experiment x196-draw: Valuing draw higher cycles back to the best cards faster than extra Crypto does. Change: draw weight 1.6→2. Prediction: More wins and more Locations won than the current best.
- v1.22 · 2026-10-28 15:19 · Experiment x195-fallback-195-2 inconclusive: league 32.5/48 for the experiment vs 32.5/48 for the current best against t-5@v1.6, dv-8@v1.3 (margin +2/game) → inconclusive. Kept the current best.
- v1.22 · 2026-10-28 15:18 · New experiment x195-fallback-195-2: A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: actions weight 1.1→1.35. Prediction: More wins or a better margin than the current best.
- v1.22 · 2026-10-28 15:14 · Experiment x194-fallback-194-1 rejected: league 24.5/48 for the experiment vs 29/48 for the current best against strat-g@v1.19, t-5@v1.10, dv-8@v1.5 (margin -3.4/game) → rejected. Kept the current best.
- v1.22 · 2026-10-28 15:13 · New experiment x194-fallback-194-1: A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: draw weight 1.6→1.85. Prediction: More wins or a better margin than the current best.
- v1.22 · 2026-10-28 15:09 · Experiment x193-disrupt inconclusive: league 23.5/48 for the experiment vs 23/48 for the current best against dv-8@v1.7, vp-dog@v1.2 (margin -2.4/game) → inconclusive. Kept the current best.
- v1.22 · 2026-10-28 15:06 · New experiment x193-disrupt: Valuing disruption higher slows the opponent's plan more than it costs mine. Change: disrupt weight 1.37→1.77. Prediction: More wins and a better margin than the current best.
- v1.22 · 2026-10-28 15:06 · Experiment x192-power inconclusive: league 18/48 for the experiment vs 15/48 for the current best against t-5@v1.10, strat-g@v1.18, vp-dog@v1.6 (margin +2.1/game) → inconclusive. Kept the current best.
- v1.22 · 2026-10-28 15:01 · New experiment x192-power: Valuing Power higher wins more Locations and their rewards. Change: power weight 1.26→1.56. Prediction: More Locations won and more wins than the current best.
- v1.22 · 2026-10-28 15:01 · Experiment x191-restore inconclusive: league 25/48 for the experiment vs 25/48 for the current best against dv-8@v1.6, t-5@v1.10, vp-dog@v1.5 (margin -1.5/game) → inconclusive. Kept the current best.
- v1.22 · 2026-10-28 14:58 · New experiment x191-restore: Valuing Restore higher keeps my Servers alive long enough to win on VP. Change: restore weight 2.49→2.89. Prediction: Fewer losses by Server destruction than the current best.
- v1.22 · 2026-10-28 14:58 · Experiment x190-fallback-190-3 adopted: league 36/48 for the experiment vs 29/48 for the current best against dv-8@v1.6, t-5@v1.6, strat-g@v1.19 (margin +5.9/game) → promising. Adopted into the current best.
- v1.22 · 2026-10-28 14:58 · Now v1.22: adopted x190-fallback-190-3 (crypto weight 3.05→3.3).
- v1.21 · 2026-10-28 14:57 · New experiment x190-fallback-190-3: A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: crypto weight 3.05→3.3. Prediction: More wins or a better margin than the current best.
- v1.21 · 2026-10-28 14:52 · Experiment x189-thinner rejected: league 20/48 for the experiment vs 21/48 for the current best against t-5@v1.10, vp-dog@v1.2, dv-8@v1.7 (margin -1.6/game) → rejected. Kept the current best.
- v1.21 · 2026-10-28 14:41 · New experiment x189-thinner: Valuing deck thinning higher draws the best cards more often. Change: thin weight 1.2→1.56. Prediction: More wins and bigger mid-game Wallets than the current best.

## Version history

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
- v1.5 (llm) since 2026-10-08 08:22 · 0/0 wins · I will maintain a focus on building a strong economy until Cycle 5, aiming for 11 Crypto with high-value cards like Kilo-Coin and Mega-Cache. I will pivot to Ch…
- v1.4 (llm) since 2026-10-08 08:18 · 0/0 wins · I will maintain a focus on building a strong economy until Cycle 5, aiming for 11 Crypto with high-value cards like Kilo-Coin and Mega-Cache. I will pivot to Ch…
- v1.3 (llm) since 2026-10-08 04:15 · 0/0 wins · I will maintain a strong economic foundation through Cycle 4, focusing on high-value Crypto and Action Base cards, targeting ~9 Crypto per hand. I will continue…
