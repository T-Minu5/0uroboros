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

In Cycles 1-4, I will maximize Wallet income by drafting Characters that generate Crypto and trash weak cards from my starting deck, specifically Basic Encryption and Shyte-Coins as better options emerge. This foundational economy will support my strategies in future Cycles. From Cycle 5 to 8, I will balance aggressive strategies, engine development, Server Restore, and VP collection while adapting to the dynamics of Locations. Starting at Cycle 9, I will emphasize aggressive attacks on the opponent's Servers and prioritize acquiring high-value VP cards. (Schedule: economy through Cycle 4, bal (Schedule: economy through Cycle 4, balanced midgame Cycles 5-8, Chaos from Cycle 9, VP from Cycle 9.)

### Profile in play (current best — executable)

Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 11.8/hand · min Crypto value 2 · min buy score 1.75 · dilution 0.9

Weights: power 1, draw 2.32, crypto 2.91, drain 3, restore 2.5, vp 2.69, duration 0.8, thin 1.27, disrupt 1.77, chaos 2.16

Card biases: Code Sniper +0.47, Cowl Obscyra +0.47, ∆-Wave +0.47, Koppy-Kat +0.47, Delete.Detritus.exe +0.42

## Baseline strategy (protected)

The designer's playbook, in force since 2026-11-14. Learning never edits it; changes are layered on top only when an experiment earns them.

- Cycles 1-4 (all AI players, before your own objective): raise Wallet income and trash the weak starters. The current Standard starting deck is weaker than older builds: 6× Shyte-Coin (1 Crypto each), 1× Basic Encryption, 1× Night Scythe, 1× Doom Loop, 1× Rezz Razor. It still prints 6 Crypto from Shyte alone, but with no Byte-Coin and fewer strong Characters, so early hands are softer — and that softness is the flexibility: many more cards in the pack now print Crypto, so you shape the economy by Draft picks, not by a fixed starter engine.
- Cycles 1-4 Draft: prefer cards that raise future Wallet — Characters that gain Crypto, Crypto cards from the Hacker/Crypto slots (Kilo then Mega when offered; Byte as a cheaper fallback), plus draw/Action/trash that set up your plan. Skip Shyte-Coin; skip Chaos Attack/Horror and market VP unless nothing else is worth buying.
- Cycles 1-4 trash order: Basic Encryption first. Do not trash Shyte-Coins until you have a better Crypto source in the deck (a Kilo/Mega or Byte from Draft, or a Character that reliably prints 2+ Crypto). Once you do, trash Shyte-Coins. Aim to have Basic Encryption and most Shyte-Coins gone by the end of Cycle 4. Night Scythe and other trash effects are for this.
- From Cycle 5: follow your own objective and style (aggression, engine, pure VP, or balanced). The early economy is done.
- Phase 2, midgame (Cycles 5-8): balance four things every Draft: attacks (Chaos and Drain), the deck engine, Server Restore and VP collection. No single pillar takes the whole Wallet.
- Phase 3, endgame (Cycles 9-16): attack the enemy Servers like crazy, deploying every Drain card I draw first, and spend most of each Wallet on VP cards. The final Draft buys only VP.
- Draft after Cycle 4: score every card from its actual effects (no fixed table) and by how much it improves the weak starting deck; buy the best set the whole Wallet affords; skip cards that would only dilute the deck.
- Deploy: draw and engine cards first so they fuel later turns; then sequence other reveals so later cards benefit from earlier effects. Contest Nodes whose Location pays the winner; concede Locations that pay the loser or clog my deck when Circuit count allows.
- Choices after Cycle 4: trash, discard and Scry are picked deliberately: trash my own junk (Shyte-Coin, Glitch), pollute the opponent when the effect puts junk in their deck, and hit their best cards.
- Human tempo (vs VP-Dog): soft coaching 35% toward your Draft tempo across 8 games — Soft coaching from human Draft tempo vs VP-Dog (8 games, 35% share): economy through Cycle 4, Chaos from 9, VP from 10. Not an experiment.
- Human tempo band: Cycles 1–4: 63 buys (Crypto 10%, Base 41%, Chaos 48%, VP 2%; spend 295)
- Human tempo band: Cycles 5–8: 75 buys (Crypto 5%, Base 28%, Chaos 53%, VP 13%; spend 472)
- Human tempo band: Cycles 9–12: 38 buys (Base 24%, Chaos 58%, VP 18%; spend 225)
- Human tempo band: Cycles 13–16: 13 buys (Crypto 8%, Base 15%, Chaos 31%, VP 46%; spend 93)

Baseline profile: Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 11.8/hand · min Crypto value 2 · min buy score 0.75 · dilution 0.5

Baseline weights: power 1, draw 2.32, crypto 2.91, drain 3, restore 1, vp 2.69, duration 0.8, thin 1.27, disrupt 0.8, chaos 2.16

## Human tempo (vs VP-Dog)

Soft coaching from human Draft tempo vs VP-Dog (8 games, 35% share): economy through Cycle 4, Chaos from 9, VP from 10. Not an experiment.

Soft coaching: applied at 2026-11-14 04:24 (35% share). This is not an experiment and does not adopt into the versioned current best.

- Cycles 1–4: 63 buys (Crypto 10%, Base 41%, Chaos 48%, VP 2%; spend 295)
- Cycles 5–8: 75 buys (Crypto 5%, Base 28%, Chaos 53%, VP 13%; spend 472)
- Cycles 9–12: 38 buys (Base 24%, Chaos 58%, VP 18%; spend 225)
- Cycles 13–16: 13 buys (Crypto 8%, Base 15%, Chaos 31%, VP 46%; spend 93)

Repeated buys: code-sniper×9, cowl-obscyra×9, delta-wave×9, koppy-kat×9, card-jabbhu7e×8, node-feratu×7, card-q6u1qrf2×6, chrome-mitchell×6

- Human tempo (vs VP-Dog): soft coaching 35% toward your Draft tempo across 8 games — Soft coaching from human Draft tempo vs VP-Dog (8 games, 35% share): economy through Cycle 4, Chaos from 9, VP from 10. Not an experiment.
- Human tempo band: Cycles 1–4: 63 buys (Crypto 10%, Base 41%, Chaos 48%, VP 2%; spend 295)
- Human tempo band: Cycles 5–8: 75 buys (Crypto 5%, Base 28%, Chaos 53%, VP 13%; spend 472)
- Human tempo band: Cycles 9–12: 38 buys (Base 24%, Chaos 58%, VP 18%; spend 225)
- Human tempo band: Cycles 13–16: 13 buys (Crypto 8%, Base 15%, Chaos 31%, VP 46%; spend 93)

## Adopted changes

- **x223-drain** (v1.23): drain weight 2.9→3. league 26/48 for the experiment vs 21/48 for the current best against vp-dog@v1.5, vp-dog@v1.6 (margin +2.3/game) → promising. Adopted into the current best.
- **x235-draw** (v1.24): draw weight 1.6→2. league 32.5/48 for the experiment vs 27.5/48 for the current best against dv-8@v1.12, vp-dog@v1.6, t-5@v1.14 (margin +2.4/game) → promising. Adopted into the current best.
- **x240-incorporating-new-cards-will** (v1.25): power weight 1.26→1, draw weight 2→2.25, crypto weight 3.3→3.5, restore weight 2.49→2.5. league 28.5/48 for the experiment vs 21/48 for the current best against t-5@v1.15, strat-g@v1.20, vp-dog@v1.6 (margin +4.3/game) → promising. Adopted into the current best.
- **x252-incorporating-more-early-agg** (v1.26): chaos weight 1.5→1.95. league 30.5/48 for the experiment vs 24.5/48 for the current best against vp-dog@v1.3, last-2go@v1.1, last-2go@v1.2 (margin +3.8/game) → promising. Adopted into the current best.
- **x261-fallback-261-2** (v1.27): crypto weight 3.5→3.75. league 28.5/48 for the experiment vs 23.5/48 for the current best against last-2go@v1.3, vp-dog@v1.7 (margin +8.9/game) → promising. Adopted into the current best.
- **x271-disrupt** (v1.28): disrupt weight 1.37→1.77. league 28/48 for the experiment vs 24/48 for the current best against vp-dog@v1.7, strat-g@v1.24, t-5@v1.16 (margin +3.8/game) → promising. Adopted into the current best.

## Current experiment

- **x275-aggressive-strategies** (lab, proposed by v1.28, model): Incorporating more aggressive cards will improve my chances of winning.
- Change: chaos weight 2.02→2.25
- Prediction: I predict that a focus on aggressive strategies will lead to more wins and higher VP margins compared to the current best.
- Theory: aggressive-strategies (success supports it)
- League trial: pending

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
- **card-synergy** (untested · v1.28): Incorporating new cards will enhance my deck's synergy and overall performance.
- **nothing-ever-happens-here-impact** (untested · v1.28): The Nothing Ever Happens Here location may incentivize aggressive VP collection strategies, impacting game dynamics.

### Refuted
- none yet

## Card and Location notes

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
- **Doom Loop**: utility; est. hand value 2 early / 2 late at cost 4. Untested.
- **My Business Card**: Monitor for its utility in maintaining tempo and gaining card advantage.
- **Agent Bateman**: Inspecting the top card of both decks could provide strategic insights into future plays.
- **Dumpster Dive**: Dumpster Dive - Consider for its ability to recover cards from the shared Trash, potentially enhancing resource efficiency.
- **Expo-Net**: Ongoing power increase; valuable for sustaining board presence.
- **Deepfake**: Potential to disrupt opponent strategies by copying their On Reveal effects.
- **Ms. Mosquito**: Draw acceleration when cards are destroyed; synergizes with aggressive strategies.
- **Holly Hedge**: Can provide consistent Crypto generation against opponents with high draw.
- **Luz-del-501**: Restorative capabilities can mitigate damage while gaining VP.
- **Crypto-Canary**: Low-value Crypto; should be avoided unless synergies are present.
- **Scanner Cloak**: utility; est. hand value 1 early / 1 late at cost 4. Untested.
- **Wax0n-Wax0ff**: utility; est. hand value 1 early / 1 late at cost 8. Untested.
- **Crypto-Archangel**: low-value Crypto (skip); est. hand value 3.6 early / 1.5 late at cost 11. Untested.
- **Banishing-3R14N**: utility; est. hand value 2.3 early / 2.3 late at cost 0. Untested.
- **Crypto-Heist**: low-value Crypto (skip); est. hand value 3.6 early / 1.5 late at cost 5. Untested.
- **Crypto-Drone**: low-value Crypto (skip); est. hand value 3.6 early / 1.5 late at cost 0. Untested.
- **Crypto-Wraith**: low-value Crypto (skip); est. hand value 10 early / 5.7 late at cost 2. Untested.
- **Packet Sniffer**: utility; est. hand value 1 early / 1 late at cost 6. Untested.
- **Crypto-Echo**: low-value Crypto (skip); est. hand value 4.6 early / 2.5 late at cost 4. Untested.
- **Bloody Mary**: utility; est. hand value 1 early / 1 late at cost 7. Untested.
- **Tulpa-Polymer**: utility; est. hand value 2 early / 2 late at cost 5. Untested.
- **Dot-Slash**: utility; est. hand value 1 early / 1 late at cost 6. Untested.
- **1nti**: 8 VP finisher; est. hand value 4.2 early / 4.2 late at cost 0. Untested.
- **R.0.1. Matrix**: 2 VP finisher; est. hand value 2 early / 2 late at cost 7. Untested.
- **Trixy**: Monitor for its ability to gain VP while restoring Power.
- **0N1.exe**: utility; est. hand value 3 early / 3 late at cost 11. Untested.
- **A Mayan Victory**: New Location: "On collapse: Destroy the strongest revealed card on the winning side here, then drain -150 from the losing player's server." Read: contest it: holding it is worth about 2.78 hand points more than losing it. Untested; watch who wins it and how it shifts the economy.

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

- v1.28 · 2026-11-16 00:22 · Monitor the potential of new card 'Banishing Ritual' for deck thinning.
- v1.28 · 2026-11-16 00:22 · Assess the impact of new Locations on game dynamics.
- v1.28 · 2026-11-16 00:22 · Bloodlet Drone offers good synergy with Drain strategies; prioritize in Draft.
- v1.28 · 2026-11-16 00:22 · Monitor the synergy of new cards with existing strategies.
- v1.28 · 2026-11-16 00:22 · The human's Draft wallet consistently outpaces mine; adapt strategies to contest their economy.
- v1.28 · 2026-11-16 00:22 · v1.28 online (server start). Read the notebook: 2 active theories, 60 concluded experiments, record 3-11-0. New cards since last version: Super Positsion, Tulpa-Polymer, Dot-Slash, 1nti, R.0.1. Matrix, Trixy, 0N1.exe. New Locations: A Mayan Victory.
- v1.28 · 2026-11-16 00:22 · Rule change from the designer: destroying an enemy Primary Server now gives +16 VP and a Backup +24 VP (was 12 and 16), 40 VP for both. Server damage now moves the score more: Drain pressure and finishing a damaged Server swing games more, Restore protects more VP, and the trailing-player count weighs damage more. Re-check theories and plans built on the old values.
- v1.28 · 2026-11-15 16:44 · Evaluate the impact of new Locations on game dynamics.
- v1.28 · 2026-11-15 16:44 · Monitor the synergy of new cards with existing strategies.
- v1.28 · 2026-11-15 16:44 · Bloodlet Drone offers good synergy with Drain strategies; prioritize in Draft.
- v1.28 · 2026-11-15 16:44 · High-value Characters like Iterative Incubus are crucial for early pressure; prioritize them in Draft.
- v1.28 · 2026-11-15 16:44 · Adapt strategies to contest the human's Draft wallet, which consistently outpaces mine.
- v1.28 · 2026-11-15 16:44 · v1.28 online (server start). Read the notebook: 2 active theories, 60 concluded experiments, record 3-11-0.
- v1.28 · 2026-11-15 16:41 · Bloodlet Drone offers good synergy with Drain strategies; prioritize in Draft.
- v1.28 · 2026-11-15 16:41 · Adapt strategies to contest the human's Draft wallet, which consistently outpaces mine.
- v1.28 · 2026-11-15 16:41 · High-value Characters like Iterative Incubus are crucial for early pressure; prioritize them in Draft.
- v1.28 · 2026-11-15 16:41 · Evaluate the impact of new Locations on game dynamics.
- v1.28 · 2026-11-15 16:41 · Monitor the synergy of new cards with existing strategies.
- v1.28 · 2026-11-15 16:41 · v1.28 online (server start). Read the notebook: 2 active theories, 60 concluded experiments, record 3-11-0.
- v1.28 · 2026-11-15 16:38 · Bloodlet Drone offers good synergy with Drain strategies; prioritize in Draft.
- v1.28 · 2026-11-15 16:38 · Adapt strategies to contest the human's Draft wallet, which consistently outpaces mine.
- v1.28 · 2026-11-15 16:38 · Prioritize high-value Characters like Iterative Incubus for early pressure.
- v1.28 · 2026-11-15 16:38 · Evaluate the impact of new Locations on game dynamics.
- v1.28 · 2026-11-15 16:38 · Monitor the synergy of new cards with existing strategies.
- v1.28 · 2026-11-15 16:38 · v1.28 online (server start). Read the notebook: 2 active theories, 60 concluded experiments, record 3-11-0. New cards since last version: Bloody Mary.
- v1.28 · 2026-11-15 02:49 · Bloodlet Drone offers good synergy with Drain strategies; prioritize in Draft.
- v1.28 · 2026-11-15 02:49 · Prioritize high-value Characters like Iterative Incubus for early pressure.
- v1.28 · 2026-11-15 02:49 · The human's Draft wallet consistently outpaces mine; adapt strategies to contest their economy.
- v1.28 · 2026-11-15 02:49 · Adapt strategies to contest the human's Draft wallet, which consistently outpaces mine.
- v1.28 · 2026-11-15 02:49 · Monitor the synergy of new cards with existing strategies.
- v1.28 · 2026-11-15 02:49 · v1.28 online (server start). Read the notebook: 2 active theories, 60 concluded experiments, record 3-11-0. New cards since last version: Crypto-Wraith, Packet Sniffer, Crypto-Echo. Removed cards: eval-relocation-relay.
- v1.28 · 2026-11-15 02:24 · Assess the impact of new Locations on game dynamics.
- v1.28 · 2026-11-15 02:24 · Bloodlet Drone offers good synergy with Drain strategies; prioritize in Draft.
- v1.28 · 2026-11-15 02:24 · Monitor the synergy of new cards with existing strategies.
- v1.28 · 2026-11-15 02:24 · The human's Draft wallet consistently outpaces mine; adapt strategies to contest their economy.
- v1.28 · 2026-11-15 02:24 · v1.28 online (server start). Read the notebook: 2 active theories, 60 concluded experiments, record 3-11-0. New cards since last version: Crypto-Heist, Crypto-Drone.
- v1.28 · 2026-11-15 01:35 · Bloodlet Drone offers good synergy with Drain strategies; prioritize in Draft.
- v1.28 · 2026-11-15 01:35 · High-value Characters like Iterative Incubus are crucial for early pressure; prioritize them in Draft.
- v1.28 · 2026-11-15 01:35 · Assess the impact of new Locations on game dynamics.
- v1.28 · 2026-11-15 01:35 · Monitor the synergy of new cards with existing strategies.

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
