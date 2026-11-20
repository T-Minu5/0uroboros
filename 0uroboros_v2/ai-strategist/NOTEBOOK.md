# Strat-G notebook

Written by Strat-G, the AI opponent's strategy agent. Each dev-server start reads this notebook (and `memory.json`), plans, plays, and leaves notes here. Its version changes only when the profile it plays changes.

How Strat-G learns: it plays the protected baseline below plus the changes its experiments have earned. It changes its play only through experiments: one bounded change at a time, played by the league referee as paired games (the experiment and the current best face the same sampled opponents on the same seeds). Code measures the results and adopts or rejects the change. Theory scores are associations (winner/loser patterns), not causal proof; "supported" is not adoption-ready. It never sees the other agents' profiles, plans or notebooks, only who it played and the results.

Style: Balanced in three phases: economy and engine (Cycles 1-4), a balanced midgame (5-8), then all-out Server attacks and VP buying (9-16).

Style envelope (every profile is clamped into it): economyUntilCycle 4-4, chaosFromCycle 9-9, vpFromCycle 9-9, handCryptoTarget 7-12, vp weight 1.6-3, drain weight 1.4-3.

## Current agent: v1.36 (model-assisted)

Record against the human (complete games only): 3 wins, 11 losses, 0 ties over 14 games. Ignored 28 sessions that were not complete games.

League snapshots (newest first): strat-g@v1.36, strat-g@v1.35, strat-g@v1.34, strat-g@v1.33, strat-g@v1.32

### Plan of play

_Documentary only: the numeric profile below governs what is actually played. The plan must not invent settings the profile does not have._

In Cycles 1-4, I will maximize Wallet income by drafting Characters that generate Crypto and trash weak cards from my starting deck, specifically targeting Basic Encryption and Crypto-Shyte. By strengthening my economy, I will prepare for future strategies. From Cycle 5 to 8, I will balance aggressive strategies, engine development, Server Restore, and VP collection while adapting to the dynamics of Locations. Starting at Cycle 9, I will intensify attacks on the opponent's Servers and prioritize acquiring high-value VP cards. My numeric profile will guide decisions through each phase. (Schedul (Schedule: economy through Cycle 4, balanced midgame Cycles 5-8, Chaos from Cycle 9, VP from Cycle 9.)

### Profile in play (current best — executable)

Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 11.7/hand · min Crypto value 2 · min buy score 1.72 · dilution 0.83

Weights: power 1.31, draw 2.88, crypto 2.04, drain 2.75, restore 2.5, vp 2.66, duration 0.8, thin 1.67, disrupt 1.77, chaos 1.45

Card biases: none.

## Baseline strategy (protected)

The designer's playbook, in force since 2026-11-19. Learning never edits it; changes are layered on top only when an experiment earns them.

- Cycles 1-4 (all AI players, before your own objective): raise Wallet income and trash the weak starters. The current Standard starting deck is weaker than older builds: mostly Crypto-Shyte (+1 Crypto each when played) plus a thin Character/VP core (STARTING DECK lists it exactly). Its Crypto comes almost entirely from Shyte, so early hands are softer — and that softness is the flexibility: many more cards in the pack now print Crypto, so you shape the economy by Draft picks, not by a fixed starter engine.
- Cycles 1-4 Draft: prefer cards that raise Crypto per hand without bloating the deck — Characters that gain Crypto (net of anything they make you pay) and Crypto cards from the Hacker/Crypto slots, ranked by Crypto per draw. Every card takes a draw slot: one card paying 5 (Crypt-Cache) does the work of five Crypto-Shyte, so one dense payer beats several thin ones. Add draw/trash that set up your plan. Skip Crypto-Shyte; skip Chaos Attack/Horror and market VP unless nothing else is worth buying.
- Cycles 1-4 trash order: Basic Encryption first. Trash Crypto-Shyte once your Crypto per hand holds without it: when denser payers carry the hand, each Shyte that leaves raises Crypto per hand (a 5-payer frees several; a single 3-payer in the Shyte deck does not yet). Night Scythe and other trash effects are for this.
- From Cycle 5: follow your own objective and style (aggression, engine, pure VP, or balanced). The early economy is done.
- Phase 2, midgame (Cycles 5-8): balance four things every Draft: attacks (Chaos and Drain), the deck engine, Server Restore and VP collection. No single pillar takes the whole Wallet.
- Phase 3, endgame (Cycles 9-16): attack the enemy Servers like crazy, deploying every Drain card I draw first, and spend most of each Wallet on VP cards. The final Draft buys only VP.
- Draft after Cycle 4: score every card from its actual effects (no fixed table) and by how much it improves the weak starting deck; buy the best set the whole Wallet affords; skip cards that would only dilute the deck.
- Deploy: draw and engine cards first so they fuel later turns; then sequence other reveals so later cards benefit from earlier effects. Contest Nodes whose Location pays the winner; concede Locations that pay the loser or clog my deck when Circuit count allows.
- Choices after Cycle 4: trash, discard and Scry are picked deliberately: trash my own junk (Crypto-Shyte, Glitch), pollute the opponent when the effect puts junk in their deck, and hit their best cards.
- Tip from VP-Dog (#1): Focus on acquiring high-value Crypto (Kilo-Coin, Mega-Cache) early to build a strong economy. Aim for a hand Crypto target of 15 by Cycle 5.
- Tip from DV-8 (#1): Focus on thinning your deck to access key cards faster. Maintain a draw weight of 2.4 to improve your engine's efficiency.
- Tip from VP-Dog (#2): Prioritize drawing cards and thinning your deck to cycle to high-value cards faster. Increase draw weight to 2.3 for better mid-game efficiency.
- Tip from DV-8 (#2): Prioritize VP cards earlier in the game to secure points before the race heats up. Shift your VP from Cycle 13 to Cycle 11. (limited by my style: no change to my profile)
- Coaching from the designer: play 25% closer to my competitors (average of T-5 v1.3, DV-8 v1.1, VP-Dog v1.1): Crypto target 11→11.67, min buy score 2→1.72, dilution 0.9→0.83, power weight 1→1.01, draw weight 2.6→2.48, actions weight 1.5→1.49, crypto weight 2.1→2.04, drain weight 2.4→2.25, vp weight 2.6→2.66, thin weight 1.68→1.67, chaos weight 1.5→1.45. My three phases stay as they are.

Baseline profile: Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 11.7/hand · min Crypto value 2 · min buy score 1.72 · dilution 0.83

Baseline weights: power 1.01, draw 2.48, crypto 2.04, drain 2.25, restore 1, vp 2.66, duration 0.8, thin 1.67, disrupt 0.8, chaos 1.45

## Human tempo (vs VP-Dog)

Watching Draft tempo vs VP-Dog (2/3 games before soft coaching). Inferred schedule economy→4, Chaos→5, VP→13.

Soft coaching: accumulating (2/3 games; tips stay empty until then). This is not an experiment and does not adopt into the versioned current best.

- Cycles 1–4: 15 buys (Crypto 27%, Base 27%, Chaos 40%, VP 7%; spend 65)
- Cycles 5–8: 18 buys (Crypto 28%, Base 28%, Chaos 39%, VP 6%; spend 89)
- Cycles 9–12: 18 buys (Crypto 6%, Base 22%, Chaos 61%, VP 11%; spend 124)
- Cycles 13–16: 21 buys (Base 10%, Chaos 19%, VP 71%; spend 140)

Repeated buys: zenith-worx×4, 1337_speaker×3, chrome-mitchell×3, bios-archive×2, byte-heist×2, card-55s9aexv×2, card-kcc86x0f×2, card-soulvmyc×2

- Human tempo (vs VP-Dog): watching — 2/3 complete games before soft-applying. Cycles 1–4: 15 buys (Crypto 27%, Base 27%, Chaos 40%, VP 7%; spend 65) · Cycles 5–8: 18 buys (Crypto 28%, Base 28%, Chaos 39%, VP 6%; spend 89) · Cycles 9–12: 18 buys (Crypto 6%, Base 22%, Chaos 61%, VP 11%; spend 124) · Cycles 13–16: 21 buys (Base 10%, Chaos 19%, VP 71%; spend 140)

## Adopted changes

- **x308-power** (v1.32): power weight 1.01→1.31. league 31/48 for the experiment vs 24/48 for the current best against t-5@v1.6, last-2go@v1.3, strat-g@v1.30 (margin +7.5/game) → promising. Adopted into the current best.
- **x320-draw** (v1.34): draw weight 2.48→2.88. league 27/48 for the experiment vs 22/48 for the current best against strat-g@v1.29, vp-dog@v1.11, vp-dog@v1.12 (margin +7/game) → promising. Adopted into the current best.
- **x327-drain** (v1.35): drain weight 2.25→2.75. league 24.5/48 for the experiment vs 19/48 for the current best against vp-dog@v1.13, vp-dog@v1.14, strat-g@v1.32 (margin +6.9/game) → promising. Adopted into the current best.
- **x347-power** (v1.36): power weight 1.01→1.31. league 23/48 for the experiment vs 16/48 for the current best against t-5@v1.7, vp-dog@v1.12 (margin +4.7/game) → promising. Adopted into the current best.

## Current experiment

- **x357-draw** (lab, proposed by v1.36, heuristic): Valuing draw higher cycles back to the best cards faster than extra Crypto does.
- Change: draw weight 2.88→3.28
- Prediction: More wins and more Locations won than the current best.
- Theory: none
- League trial: pending

## Experiment log

- **x356-fallback-356-4** inconclusive (v1.36): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: restore weight 2.5→2.75. league 31.5/48 for the experiment vs 31.5/48 for the current best against vp-dog@v1.15, t-5@v1.11 (margin -1.5/game) → inconclusive. Kept the current best.
- **x355-leaner** rejected (v1.36): A stricter purchase bar (fewer, better cards) keeps the deck sharp. Change: min buy score 1.72→2.22, dilution 0.83→1.03. league 18/48 for the experiment vs 27.5/48 for the current best against t-5@v1.12, t-5@v1.9, last-2go@v1.10 (margin -20.4/game) → rejected. Kept the current best.
- **x354-drain** inconclusive (v1.36): Valuing Drain higher ends games by Server destruction before the opponent's engine pays off. Change: drain weight 2.75→3. league 25/48 for the experiment vs 26/48 for the current best against t-5@v1.8, strat-g@v1.34, t-5@v1.12 (margin +3.3/game) → inconclusive. Kept the current best.
- **x353-fallback-353-5** inconclusive (v1.36): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: vp weight 2.66→2.91. league 30.5/48 for the experiment vs 27/48 for the current best against vp-dog@v1.11, last-2go@v1.10, vp-dog@v1.12 (margin -0.6/game) → inconclusive. Kept the current best.
- **x352-fallback-352-2** inconclusive (v1.36): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: crypto weight 2.04→2.29. league 32/48 for the experiment vs 32/48 for the current best against last-2go@v1.9, last-2go@v1.10 (margin +2.4/game) → inconclusive. Kept the current best.
- **x351-fallback-351-1** rejected (v1.36): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: draw weight 2.88→3.13. league 26/48 for the experiment vs 28/48 for the current best against t-5@v1.12, vp-dog@v1.13, vp-dog@v1.15 (margin -2.5/game) → rejected. Kept the current best.
- **x350-fallback-350-0** rejected (v1.36): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: power weight 1.31→1.56. league 20/48 for the experiment vs 27/48 for the current best against vp-dog@v1.15, t-5@v1.10, last-2go@v1.9 (margin -10.2/game) → rejected. Kept the current best.
- **x349-crypto** rejected (v1.36): Valuing Crypto income more — Character Crypto lines and shelf Coins when present — and aiming for a richer hand out-buys the opponent mid-game. Change: Crypto target 11.67→12, crypto weight 2.04→2.34. league 26/48 for the experiment vs 28/48 for the current best against last-2go@v1.8, t-5@v1.8, vp-dog@v1.15 (margin -1.7/game) → rejected. Kept the current best.
- **x348-disrupt** inconclusive (v1.36): Valuing disruption higher slows the opponent's plan more than it costs mine. Change: disrupt weight 1.77→2.17. league 28/48 for the experiment vs 27/48 for the current best against last-2go@v1.6, vp-dog@v1.13 (margin -2.6/game) → inconclusive. Kept the current best.
- **x347-power** adopted (v1.36): Valuing Power higher wins more Locations and their rewards. Change: power weight 1.01→1.31. league 23/48 for the experiment vs 16/48 for the current best against t-5@v1.7, vp-dog@v1.12 (margin +4.7/game) → promising. Adopted into the current best.
- **x346-thinner** rejected (v1.35): Valuing deck thinning higher draws the best cards more often. Change: thin weight 1.67→2.07. league 23/48 for the experiment vs 26/48 for the current best against strat-g@v1.32, vp-dog@v1.15 (margin -4.7/game) → rejected. Kept the current best.
- **x345-restore** inconclusive (v1.35): Valuing Restore higher keeps my Servers alive long enough to win on VP. Change: restore weight 2.5→2.9. league 29/48 for the experiment vs 29/48 for the current best against vp-dog@v1.15, last-2go@v1.6, t-5@v1.11 (margin +1.1/game) → inconclusive. Kept the current best.
- **x344-draw** inconclusive (v1.35): Valuing draw higher cycles back to the best cards faster than extra Crypto does. Change: draw weight 2.88→3.28. league 29/48 for the experiment vs 25.5/48 for the current best against vp-dog@v1.15, t-5@v1.11, vp-dog@v1.14 (margin +5.7/game) → inconclusive. Kept the current best.
- **x343-fallback-343-4** inconclusive (v1.35): A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: restore weight 2.5→2.75. league 29/48 for the experiment vs 29/48 for the current best against vp-dog@v1.15, t-5@v1.7 (margin -0.7/game) → inconclusive. Kept the current best.
- **x342-leaner** rejected (v1.35): A stricter purchase bar (fewer, better cards) keeps the deck sharp. Change: min buy score 1.72→2.22, dilution 0.83→1.03. league 23/48 for the experiment vs 23.5/48 for the current best against vp-dog@v1.15, t-5@v1.10, last-2go@v1.7 (margin -0.2/game) → rejected. Kept the current best.

## Theories

### Supported
- none yet

### Under test
- none

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

- v1.36 · 2026-11-20 01:38 · Observe the impact of new Locations on game dynamics.
- v1.36 · 2026-11-20 01:38 · Defense (Restore) has been crucial in recent losses; prioritize it.
- v1.36 · 2026-11-20 01:38 · The human's economy is ahead in recent games; focus on early Crypto generation.
- v1.36 · 2026-11-20 01:38 · v1.36 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-11-0.
- v1.36 · 2026-11-20 01:37 · Observe the impact of new Locations on game dynamics.
- v1.36 · 2026-11-20 01:37 · Defense (Restore) has been crucial in recent losses; prioritize it.
- v1.36 · 2026-11-20 01:37 · Focus on early Crypto generation to catch up in Wallets.
- v1.36 · 2026-11-20 01:37 · v1.36 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-11-0.
- v1.36 · 2026-11-20 01:36 · Observe the impact of new Locations on game dynamics.
- v1.36 · 2026-11-20 01:36 · Defense (Restore) has been crucial in recent losses; prioritize it.
- v1.36 · 2026-11-20 01:36 · Focus on early Crypto generation to catch up in Wallets.
- v1.36 · 2026-11-20 01:36 · v1.36 online (server start). Read the notebook: 0 active theories, 60 concluded experiments, record 3-11-0.
- v1.36 · 2026-11-20 00:43 · Observe the impact of new Locations on game dynamics.
- v1.36 · 2026-11-20 00:43 · Defense (Restore) has been crucial in recent losses; prioritize it.
- v1.36 · 2026-11-20 00:43 · The human's economy is ahead in recent games; focus on early Crypto generation.
- v1.36 · 2026-11-20 00:43 · v1.36 online (server start). Read the notebook: 1 active theories, 60 concluded experiments, record 3-11-0.
- v1.36 · 2026-11-20 00:16 · New experiment x357-draw: Valuing draw higher cycles back to the best cards faster than extra Crypto does. Change: draw weight 2.88→3.28. Prediction: More wins and more Locations won than the current best.
- v1.36 · 2026-11-20 00:16 · Experiment x356-fallback-356-4 inconclusive: league 31.5/48 for the experiment vs 31.5/48 for the current best against vp-dog@v1.15, t-5@v1.11 (margin -1.5/game) → inconclusive. Kept the current best.
- v1.36 · 2026-11-20 00:14 · New experiment x356-fallback-356-4: A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: restore weight 2.5→2.75. Prediction: More wins or a better margin than the current best.
- v1.36 · 2026-11-20 00:07 · Experiment x355-leaner rejected: league 18/48 for the experiment vs 27.5/48 for the current best against t-5@v1.12, t-5@v1.9, last-2go@v1.10 (margin -20.4/game) → rejected. Kept the current best.
- v1.36 · 2026-11-19 23:58 · New experiment x355-leaner: A stricter purchase bar (fewer, better cards) keeps the deck sharp. Change: min buy score 1.72→2.22, dilution 0.83→1.03. Prediction: More wins with a smaller deck than the current best.
- v1.36 · 2026-11-19 23:58 · Experiment x354-drain inconclusive: league 25/48 for the experiment vs 26/48 for the current best against t-5@v1.8, strat-g@v1.34, t-5@v1.12 (margin +3.3/game) → inconclusive. Kept the current best.
- v1.36 · 2026-11-19 23:43 · New experiment x354-drain: Valuing Drain higher ends games by Server destruction before the opponent's engine pays off. Change: drain weight 2.75→3. Prediction: Earlier Server kills and more wins than the current best.
- v1.36 · 2026-11-19 23:43 · Experiment x353-fallback-353-5 inconclusive: league 30.5/48 for the experiment vs 27/48 for the current best against vp-dog@v1.11, last-2go@v1.10, vp-dog@v1.12 (margin -0.6/game) → inconclusive. Kept the current best.
- v1.36 · 2026-11-19 23:41 · New experiment x353-fallback-353-5: A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: vp weight 2.66→2.91. Prediction: More wins or a better margin than the current best.
- v1.36 · 2026-11-19 23:19 · Experiment x352-fallback-352-2 inconclusive: league 32/48 for the experiment vs 32/48 for the current best against last-2go@v1.9, last-2go@v1.10 (margin +2.4/game) → inconclusive. Kept the current best.
- v1.36 · 2026-11-19 23:17 · New experiment x352-fallback-352-2: A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: crypto weight 2.04→2.29. Prediction: More wins or a better margin than the current best.
- v1.36 · 2026-11-19 22:33 · Experiment x351-fallback-351-1 rejected: league 26/48 for the experiment vs 28/48 for the current best against t-5@v1.12, vp-dog@v1.13, vp-dog@v1.15 (margin -2.5/game) → rejected. Kept the current best.
- v1.36 · 2026-11-19 22:31 · New experiment x351-fallback-351-1: A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: draw weight 2.88→3.13. Prediction: More wins or a better margin than the current best.
- v1.36 · 2026-11-19 22:21 · Experiment x350-fallback-350-0 rejected: league 20/48 for the experiment vs 27/48 for the current best against vp-dog@v1.15, t-5@v1.10, last-2go@v1.9 (margin -10.2/game) → rejected. Kept the current best.
- v1.36 · 2026-11-19 22:19 · New experiment x350-fallback-350-0: A small envelope-clamped nudge while the experiment menu has nothing left to try. Change: power weight 1.31→1.56. Prediction: More wins or a better margin than the current best.
- v1.36 · 2026-11-19 22:10 · Experiment x349-crypto rejected: league 26/48 for the experiment vs 28/48 for the current best against last-2go@v1.8, t-5@v1.8, vp-dog@v1.15 (margin -1.7/game) → rejected. Kept the current best.
- v1.36 · 2026-11-19 22:01 · New experiment x349-crypto: Valuing Crypto income more — Character Crypto lines and shelf Coins when present — and aiming for a richer hand out-buys the opponent mid-game. Change: Crypto target 11.67→12, crypto weight 2.04→2.34. Prediction: Bigger mid-game Wallets and more wins than the current best.
- v1.36 · 2026-11-19 22:01 · Experiment x348-disrupt inconclusive: league 28/48 for the experiment vs 27/48 for the current best against last-2go@v1.6, vp-dog@v1.13 (margin -2.6/game) → inconclusive. Kept the current best.
- v1.36 · 2026-11-19 21:37 · New experiment x348-disrupt: Valuing disruption higher slows the opponent's plan more than it costs mine. Change: disrupt weight 1.77→2.17. Prediction: More wins and a better margin than the current best.
- v1.36 · 2026-11-19 21:37 · Experiment x347-power adopted: league 23/48 for the experiment vs 16/48 for the current best against t-5@v1.7, vp-dog@v1.12 (margin +4.7/game) → promising. Adopted into the current best.
- v1.36 · 2026-11-19 21:37 · Now v1.36: adopted x347-power (power weight 1.01→1.31).
- v1.35 · 2026-11-19 21:13 · New experiment x347-power: Valuing Power higher wins more Locations and their rewards. Change: power weight 1.01→1.31. Prediction: More Locations won and more wins than the current best.
- v1.35 · 2026-11-19 21:13 · Experiment x346-thinner rejected: league 23/48 for the experiment vs 26/48 for the current best against strat-g@v1.32, vp-dog@v1.15 (margin -4.7/game) → rejected. Kept the current best.
- v1.35 · 2026-11-19 21:00 · New experiment x346-thinner: Valuing deck thinning higher draws the best cards more often. Change: thin weight 1.67→2.07. Prediction: More wins and bigger mid-game Wallets than the current best.

## Version history

- v1.36 (llm) since 2026-11-19 21:37 · 0/0 wins · In Cycles 1-4, I will maximize Wallet income by drafting Characters that generate Crypto and trash weak cards from my starting deck, specifically targeting Basi…
- v1.35 (llm) since 2026-11-19 17:06 · 0/0 wins · In Cycles 1-4, I will focus on maximizing Wallet income by drafting Characters that generate Crypto and trashing weak cards from my starting deck, specifically …
- v1.34 (llm) since 2026-11-19 09:52 · 0/0 wins · In Cycles 1-4, I will maximize Wallet income by drafting Characters that generate Crypto and trash weak cards from my starting deck, focusing on Basic Encryptio…
- v1.33 (llm) since 2026-11-19 08:36 · 0/0 wins · In Cycles 1-4, I will maximize Wallet income by drafting Characters that generate Crypto and trash weak cards from my starting deck, focusing on Basic Encryptio…
- v1.32 (llm) since 2026-11-19 05:39 · 0/0 wins · In Cycles 1-4, I will maximize Wallet income by drafting Characters that generate Crypto and trash weak cards from my starting deck, focusing on Basic Encryptio…
- v1.31 (llm) since 2026-11-18 10:00 · 0/0 wins · In Cycles 1-4, I will maximize Wallet income by drafting Characters that generate Crypto and trash weak cards from my starting deck, focusing on Basic Encryptio…
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
