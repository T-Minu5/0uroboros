# Strat-G notebook

Written by Strat-G, the AI opponent's strategy agent. Each dev-server start reads this notebook (and `memory.json`), plans, plays, and leaves notes here. Its version changes only when the profile it plays changes.

How Strat-G learns: it plays the protected baseline below plus the changes its experiments have earned. It changes its play only through experiments: one bounded change at a time, played by the league referee as paired games (the experiment and the current best face the same sampled opponents on the same seeds). Code measures the results and adopts or rejects the change. Theory scores are associations (winner/loser patterns), not causal proof; "supported" is not adoption-ready. It never sees the other agents' profiles, plans or notebooks, only who it played and the results.

Style: Balanced in three phases: economy and engine (Cycles 1-4), a balanced midgame (5-8), then all-out Server attacks and VP buying (9-16).

Style envelope (every profile is clamped into it): economyUntilCycle 4-4, chaosFromCycle 9-9, vpFromCycle 9-9, handCryptoTarget 7-12, vp weight 1.6-3, drain weight 1.4-3.

## Current agent: v1.30 (model-assisted)

Record against the human (complete games only): 3 wins, 11 losses, 0 ties over 14 games. Ignored 28 sessions that were not complete games.

League snapshots (newest first): strat-g@v1.30, strat-g@v1.29, strat-g@v1.28, strat-g@v1.27, strat-g@v1.26

### Plan of play

_Documentary only: the numeric profile below governs what is actually played. The plan must not invent settings the profile does not have._

In Cycles 1-4, I will maximize Wallet income by drafting Characters that generate Crypto and trash weak cards from my starting deck, focusing on Basic Encryption and Shyte-Coins. By building a strong economy, I will support my strategies in future Cycles. From Cycle 5 to 8, I will balance aggressive strategies, engine development, Server Restore, and VP collection while adapting to the dynamics of Locations. Starting at Cycle 9, I will focus on aggressive attacks on the opponent's Servers and prioritize acquiring high-value VP cards. My numeric profile will guide my decisions through each phas (Schedule: economy through Cycle 4, balanced midgame Cycles 5-8, Chaos from Cycle 9, VP from Cycle 9.)

### Profile in play (current best — executable)

Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 11.7/hand · min Crypto value 2 · min buy score 1.72 · dilution 0.83

Weights: power 1.01, draw 2.48, crypto 2.04, drain 2.75, restore 2.5, vp 2.66, duration 0.8, thin 1.67, disrupt 1.77, chaos 1.45

Card biases: none.

## Baseline strategy (protected)

The designer's playbook, in force since 2026-11-16. Learning never edits it; changes are layered on top only when an experiment earns them.

- Cycles 1-4 (all AI players, before your own objective): raise Wallet income and trash the weak starters. The current Standard starting deck is weaker than older builds: 6× Shyte-Coin (1 Crypto each), 1× Basic Encryption, 1× Night Scythe, 1× Doom Loop, 1× Rezz Razor. It still prints 6 Crypto from Shyte alone, but with no Byte-Coin and fewer strong Characters, so early hands are softer — and that softness is the flexibility: many more cards in the pack now print Crypto, so you shape the economy by Draft picks, not by a fixed starter engine.
- Cycles 1-4 Draft: prefer cards that raise future Wallet — Characters that gain Crypto, Crypto cards from the Hacker/Crypto slots (Kilo then Mega when offered; Byte as a cheaper fallback), plus draw/Action/trash that set up your plan. Skip Shyte-Coin; skip Chaos Attack/Horror and market VP unless nothing else is worth buying.
- Cycles 1-4 trash order: Basic Encryption first. Do not trash Shyte-Coins until you have a better Crypto source in the deck (a Kilo/Mega or Byte from Draft, or a Character that reliably prints 2+ Crypto). Once you do, trash Shyte-Coins. Aim to have Basic Encryption and most Shyte-Coins gone by the end of Cycle 4. Night Scythe and other trash effects are for this.
- From Cycle 5: follow your own objective and style (aggression, engine, pure VP, or balanced). The early economy is done.
- Phase 2, midgame (Cycles 5-8): balance four things every Draft: attacks (Chaos and Drain), the deck engine, Server Restore and VP collection. No single pillar takes the whole Wallet.
- Phase 3, endgame (Cycles 9-16): attack the enemy Servers like crazy, deploying every Drain card I draw first, and spend most of each Wallet on VP cards. The final Draft buys only VP.
- Draft after Cycle 4: score every card from its actual effects (no fixed table) and by how much it improves the weak starting deck; buy the best set the whole Wallet affords; skip cards that would only dilute the deck.
- Deploy: draw and engine cards first so they fuel later turns; then sequence other reveals so later cards benefit from earlier effects. Contest Nodes whose Location pays the winner; concede Locations that pay the loser or clog my deck when Circuit count allows.
- Choices after Cycle 4: trash, discard and Scry are picked deliberately: trash my own junk (Shyte-Coin, Glitch), pollute the opponent when the effect puts junk in their deck, and hit their best cards.
- Tip from VP-Dog (#1): Focus on acquiring high-value Crypto (Kilo-Coin, Mega-Cache) early to build a strong economy. Aim for a hand Crypto target of 15 by Cycle 5.
- Tip from DV-8 (#1): Focus on thinning your deck to access key cards faster. Maintain a draw weight of 2.4 to improve your engine's efficiency.
- Tip from VP-Dog (#2): Prioritize drawing cards and thinning your deck to cycle to high-value cards faster. Increase draw weight to 2.3 for better mid-game efficiency.
- Tip from DV-8 (#2): Prioritize VP cards earlier in the game to secure points before the race heats up. Shift your VP from Cycle 13 to Cycle 11. (limited by my style: no change to my profile)
- Coaching from the designer: play 25% closer to my competitors (average of T-5 v1.3, DV-8 v1.1, VP-Dog v1.1): Crypto target 11→11.67, min buy score 2→1.72, dilution 0.9→0.83, power weight 1→1.01, draw weight 2.6→2.48, actions weight 1.5→1.49, crypto weight 2.1→2.04, drain weight 2.4→2.25, vp weight 2.6→2.66, thin weight 1.68→1.67, chaos weight 1.5→1.45. My three phases stay as they are.

Baseline profile: Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 11.7/hand · min Crypto value 2 · min buy score 1.72 · dilution 0.83

Baseline weights: power 1.01, draw 2.48, crypto 2.04, drain 2.25, restore 1, vp 2.66, duration 0.8, thin 1.67, disrupt 0.8, chaos 1.45

## Human tempo (vs VP-Dog)

Watching complete local games where you play seat 0 against VP-Dog. Draft buys are tallied in Cycles 1–4 / 5–8 / 9–12 / 13–16. After 3 games, Strat-G soft-applies a 35% coaching nudge toward that tempo (not an experiment).

## Adopted changes

- **x235-draw** (v1.24): draw weight 1.6→2. league 32.5/48 for the experiment vs 27.5/48 for the current best against dv-8@v1.12, vp-dog@v1.6, t-5@v1.14 (margin +2.4/game) → promising. Adopted into the current best.
- **x240-incorporating-new-cards-will** (v1.25): power weight 1.26→1, draw weight 2→2.25, crypto weight 3.3→3.5, restore weight 2.49→2.5. league 28.5/48 for the experiment vs 21/48 for the current best against t-5@v1.15, strat-g@v1.20, vp-dog@v1.6 (margin +4.3/game) → promising. Adopted into the current best.
- **x252-incorporating-more-early-agg** (v1.26): chaos weight 1.5→1.95. league 30.5/48 for the experiment vs 24.5/48 for the current best against vp-dog@v1.3, last-2go@v1.1, last-2go@v1.2 (margin +3.8/game) → promising. Adopted into the current best.
- **x261-fallback-261-2** (v1.27): crypto weight 3.5→3.75. league 28.5/48 for the experiment vs 23.5/48 for the current best against last-2go@v1.3, vp-dog@v1.7 (margin +8.9/game) → promising. Adopted into the current best.
- **x271-disrupt** (v1.28): disrupt weight 1.37→1.77. league 28/48 for the experiment vs 24/48 for the current best against vp-dog@v1.7, strat-g@v1.24, t-5@v1.16 (margin +3.8/game) → promising. Adopted into the current best.
- **x276-drain** (v1.30): drain weight 2.25→2.75. league 33/48 for the experiment vs 29/48 for the current best against strat-g@v1.27, last-2go@v1.0 (margin +3/game) → promising. Adopted into the current best.

## Current experiment

- **x285-endgame-awards** (lab, proposed by v1.30, model): Valuing destroy/access/Circuit edges slightly higher raises win rate in close VP finishes.
- Change: thin weight 1.67→1.77, disrupt weight 1.77→2.07
- Prediction: More wins and higher VP margins compared to the current best.
- Theory: endgame-awards (success supports it)
- League trial: pending

## Experiment log

- **x284-crypto** rejected (v1.30): Valuing Crypto income more — Character Crypto lines and shelf Coins when present — and aiming for a richer hand out-buys the opponent mid-game. Change: Crypto target 11.67→12, crypto weight 2.04→2.34. league 25/48 for the experiment vs 36/48 for the current best against vp-dog@v1.6, strat-g@v1.26 (margin -10.9/game) → rejected. Kept the current best.
- **x283-disrupt** inconclusive (v1.30): Valuing disruption higher slows the opponent's plan more than it costs mine. Change: disrupt weight 1.77→2.17. league 40.5/48 for the experiment vs 39.5/48 for the current best against vp-dog@v1.6, strat-g@v1.26, vp-dog@v1.2 (margin +2.6/game) → inconclusive. Kept the current best.
- **x282-power** rejected (v1.30): Valuing Power higher wins more Locations and their rewards. Change: power weight 1.01→1.31. league 27/48 for the experiment vs 28.5/48 for the current best against t-5@v1.8, vp-dog@v1.5 (margin -0.3/game) → rejected. Kept the current best.
- **x281-draw** inconclusive (v1.30): Valuing draw higher cycles back to the best cards faster than extra Crypto does. Change: draw weight 2.48→2.88. league 36.5/48 for the experiment vs 39.5/48 for the current best against vp-dog@v1.6, vp-dog@v1.3, vp-dog@v1.2 (margin +0.8/game) → inconclusive. Kept the current best.
- **x280-restore** inconclusive (v1.30): Valuing Restore higher keeps my Servers alive long enough to win on VP. Change: restore weight 2.5→2.9. league 39/48 for the experiment vs 38/48 for the current best against strat-g@v1.27, vp-dog@v1.4, last-2go@v1.0 (margin +0.1/game) → inconclusive. Kept the current best.
- **x279-thinner** rejected (v1.30): Valuing deck thinning higher draws the best cards more often. Change: thin weight 1.67→2.07. league 37/48 for the experiment vs 39/48 for the current best against vp-dog@v1.6, last-2go@v1.0, vp-dog@v1.5 (margin -1.7/game) → rejected. Kept the current best.
- **x278-fallback-278-0** inconclusive (v1.30): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: power weight 1.01→1.26. league 35/48 for the experiment vs 35.5/48 for the current best against vp-dog@v1.3, vp-dog@v1.6 (margin +0.5/game) → inconclusive. Kept the current best.
- **x277-leaner** rejected (v1.30): A stricter purchase bar (fewer, better cards) keeps the deck sharp. Change: min buy score 1.72→2.22, dilution 0.83→1.03. league 33/48 for the experiment vs 34/48 for the current best against vp-dog@v1.2, strat-g@v1.27, last-2go@v1.0 (margin -2.4/game) → rejected. Kept the current best.
- **x276-drain** adopted (v1.30): Valuing Drain higher ends games by Server destruction before the opponent's engine pays off. Change: drain weight 2.25→2.75. league 33/48 for the experiment vs 29/48 for the current best against strat-g@v1.27, last-2go@v1.0 (margin +3/game) → promising. Adopted into the current best.
- **x275-aggressive-strategies** inconclusive (v1.29): Incorporating more aggressive cards will improve my chances of winning. Change: chaos weight 2.02→2.25. league 30/48 for the experiment vs 31/48 for the current best against vp-dog@v1.4, last-2go@v1.0, t-5@v1.8 (margin +0.3/game) → inconclusive. Kept the current best.
- **x274-fallback-274-0** inconclusive (v1.28): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: power weight 1→1.25. league 24/48 for the experiment vs 25/48 for the current best against vp-dog@v1.8, strat-g@v1.27 (margin +0.8/game) → inconclusive. Kept the current best.
- **x273-crypto** inconclusive (v1.28): Valuing Crypto income more — Character Crypto lines and shelf Coins when present — and aiming for a richer hand out-buys the opponent mid-game. Change: Crypto target 11.78→12, crypto weight 2.88→3.18. league 23/48 for the experiment vs 22/48 for the current best against t-5@v1.13, vp-dog@v1.5, vp-dog@v1.7 (margin -1.2/game) → inconclusive. Kept the current best.
- **x272-aggressive-strategies** inconclusive (v1.28): By increasing the weight of Chaos cards slightly, I will improve my chances of winning by focusing on aggression. Change: chaos weight 2.02→2.1. league 26/48 for the experiment vs 25/48 for the current best against strat-g@v1.26, strat-g@v1.25 (margin +1.2/game) → inconclusive. Kept the current best.
- **x271-disrupt** adopted (v1.28): Valuing disruption higher slows the opponent's plan more than it costs mine. Change: disrupt weight 1.37→1.77. league 28/48 for the experiment vs 24/48 for the current best against vp-dog@v1.7, strat-g@v1.24, t-5@v1.16 (margin +3.8/game) → promising. Adopted into the current best.
- **x270-draw** inconclusive (v1.27): Valuing draw higher cycles back to the best cards faster than extra Crypto does. Change: draw weight 2.36→2.76. league 32/48 for the experiment vs 31/48 for the current best against t-5@v1.16, last-2go@v1.6 (margin +2/game) → inconclusive. Kept the current best.

## Theories

### Supported
- none yet

### Under test
- **nothing-ever-happens-here-impact** (untested · v1.28): The Nothing Ever Happens Here location may incentivize aggressive VP collection strategies, impacting game dynamics.
- **endgame-awards** (untested · v1.29 · scored every game): Configure end-game awards (Destroyed/Trashed/Stolen/Deck Attacks/Circuits/…) decide close games, so play that banks those metrics is worth weight even when Server kill VP looks decided.
  - obs: Winner vs loser share of end-game award VP and which award rows they led. · hyp: Valuing destroy/access/Circuit edges slightly higher raises win rate in close VP finishes. · test: Experiment: mild disrupt/drain/thin bumps; measure award VP share and wins vs current best.
- **ongoing-hosts** (untested · v1.29 · scored every game): Revealed card Ongoing hosts (reflect, mirror, destroy-when, listenAccess) change node priority; silencing or sequencing around them beats ignoring them.
  - obs: Games where Banishing/reflect/Canary/Mosquito were bought and whether the buyer won. · hyp: Card bias toward key Ongoing definitions (or against enemy reflect) improves results. · test: Experiment: +1 cardBias on Banishing / Mosquito / Canary; measure wins and Drain efficiency.

### Refuted
- none yet

## Card and Location notes

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
- **Recover-Continuity**: 3 VP finisher, Server defense; est. hand value 5.8 early / 5.8 late at cost 7. Untested.
- **Pu1sar**: 2 VP finisher; est. hand value 3.8 early / 3.8 late at cost 9. Untested.
- **Bitten Brittin**: utility; est. hand value 0 early / 0 late at cost 5. Untested.
- **Marlie Murder**: utility; est. hand value 5.7 early / 5.7 late at cost 7. Untested.
- **Mel Anoma**: utility; est. hand value -3 early / -3 late at cost 6. Untested.
- **Crypto-Vault**: low-value Crypto (skip), economy; est. hand value 0 early / 0 late at cost 4. Untested.
- **Access Binding**: utility; est. hand value 1 early / 1 late at cost 3. Untested.
- **The Tuathal Kill**: utility; est. hand value 2 early / 2 late at cost 7. Untested.
- **Andras Asura**: utility; est. hand value 2 early / 2 late at cost 5. Untested.
- **Bug Basher**: utility; est. hand value 1 early / 1 late at cost 3. Untested.

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

- v1.30 · 2026-11-18 02:28 · The human consistently outpaces my Draft wallet; I need to adjust my strategy to contest their economy better.
- v1.30 · 2026-11-18 02:28 · Monitor the synergy of new cards with existing strategies.
- v1.30 · 2026-11-18 02:28 · The human's strategies are heavily focused on VP collection; consider countering with more disruption.
- v1.30 · 2026-11-18 02:28 · Evaluate new cards and Locations for their potential impacts on strategies.
- v1.30 · 2026-11-18 02:28 · v1.30 online (server start). Read the notebook: 3 active theories, 60 concluded experiments, record 3-11-0.
- v1.30 · 2026-11-18 02:27 · Evaluate new Locations for their potential to shift game dynamics, particularly those affecting VP and Server management.
- v1.30 · 2026-11-18 02:27 · Assess the effectiveness of Banishing Ritual for deck thinning and resource recovery in future games.
- v1.30 · 2026-11-18 02:27 · The human's strategies are heavily focused on VP collection; consider countering with more disruption.
- v1.30 · 2026-11-18 02:27 · Evaluate the effectiveness of Banishing Ritual for deck thinning and resource recovery.
- v1.30 · 2026-11-18 02:27 · Monitor the synergy of new cards with existing strategies.
- v1.30 · 2026-11-18 02:27 · v1.30 online (server start). Read the notebook: 3 active theories, 60 concluded experiments, record 3-11-0.
- v1.30 · 2026-11-18 02:27 · Evaluate the new Locations for their potential to shift game dynamics, particularly those affecting VP and Server management.
- v1.30 · 2026-11-18 02:27 · Adapt strategies to contest the human's Draft wallet, which consistently outpaces mine.
- v1.30 · 2026-11-18 02:27 · Assess the effectiveness of Banishing Ritual for deck thinning and resource recovery.
- v1.30 · 2026-11-18 02:27 · Monitor the impact of new cards and Locations on game dynamics.
- v1.30 · 2026-11-18 02:27 · v1.30 online (server start). Read the notebook: 3 active theories, 60 concluded experiments, record 3-11-0.
- v1.30 · 2026-11-18 01:23 · Adapt strategies to contest the human's Draft wallet, which consistently outpaces mine.
- v1.30 · 2026-11-18 01:23 · The human's strategies are heavily focused on VP collection; consider countering with more disruption.
- v1.30 · 2026-11-18 01:23 · Evaluate the effectiveness of Banishing Ritual for deck thinning and resource recovery.
- v1.30 · 2026-11-18 01:23 · Monitor the impact of new cards and Locations on game dynamics.
- v1.30 · 2026-11-18 01:23 · v1.30 online (server start). Read the notebook: 4 active theories, 60 concluded experiments, record 3-11-0.
- v1.30 · 2026-11-18 01:21 · Evaluate the impact of new cards and Locations on game dynamics.
- v1.30 · 2026-11-18 01:21 · New cards since last version: Bug Hunter.
- v1.30 · 2026-11-18 01:21 · Adapt strategies to contest the human's Draft wallet, which consistently outpaces mine.
- v1.30 · 2026-11-18 01:21 · Monitor the synergy of new cards with existing strategies.
- v1.30 · 2026-11-18 01:21 · v1.30 online (server start). Read the notebook: 4 active theories, 60 concluded experiments, record 3-11-0. New cards since last version: Bug Hunter.
- v1.30 · 2026-11-18 01:04 · Monitor the synergy of new cards with existing strategies.
- v1.30 · 2026-11-18 01:04 · Continue running experiment x285-endgame-awards.
- v1.30 · 2026-11-18 01:04 · Evaluate the impact of new cards and Locations on game dynamics, particularly Bitten Brittin and Mel Anoma.
- v1.30 · 2026-11-18 01:04 · Adjust strategies to contest the human's Draft wallet, which consistently outpaces mine.
- v1.30 · 2026-11-18 01:04 · v1.30 online (server start). Read the notebook: 4 active theories, 60 concluded experiments, record 3-11-0.
- v1.30 · 2026-11-18 01:04 · Continue running experiment x285-endgame-awards.
- v1.30 · 2026-11-18 01:04 · Adapt strategies to contest the human's Draft wallet, which consistently outpaces mine.
- v1.30 · 2026-11-18 01:04 · The human consistently outpaces my Draft wallet; I need to adjust my strategy to contest their economy better.
- v1.30 · 2026-11-18 01:04 · Evaluate the effectiveness of Banishing Ritual for deck thinning and resource recovery.
- v1.30 · 2026-11-18 01:04 · Monitor the impact of new cards and Locations on game dynamics.
- v1.30 · 2026-11-18 01:04 · v1.30 online (server start). Read the notebook: 4 active theories, 60 concluded experiments, record 3-11-0. New cards since last version: Crypto-Vault, Access Binding, The Tuathal Kill, Andras Asura.
- v1.30 · 2026-11-17 09:07 · Assess the effectiveness of Banishing Ritual for deck thinning and resource recovery in future games.
- v1.30 · 2026-11-17 09:07 · Consider how the human player’s Draft wallet consistently outpaces mine; adjust my strategy accordingly to contest their economy better.
- v1.30 · 2026-11-17 09:07 · Evaluate new Locations for their potential to shift game dynamics, particularly those affecting VP and Server management.

## Version history

- v1.30 (llm) since 2026-11-16 20:26 · 0/0 wins · In Cycles 1-4, I will maximize Wallet income by drafting Characters that generate Crypto and trash weak cards from my starting deck, particularly Basic Encrypti…
- v1.29 (llm) since 2026-11-16 01:51 · 0/0 wins · In Cycles 1-4, I will maximize Wallet income by drafting Characters that generate Crypto and trash weak cards from my starting deck, specifically Basic Encrypti…
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
