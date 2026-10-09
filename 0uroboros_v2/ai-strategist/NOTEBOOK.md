# Strat-G notebook

Written by Strat-G, the AI opponent's strategy agent. Each dev-server start reads this notebook (and `memory.json`), plans, plays, and leaves notes here. Its version changes only when the profile it plays changes.

How Strat-G learns: it plays the protected baseline below plus the changes its experiments have earned. It changes its play only through experiments: one bounded change at a time, played by the league referee as paired games (the experiment and the current best face the same sampled opponents on the same seeds). Code measures the results and adopts or rejects the change. It never sees the other agents' profiles, plans or notebooks, only who it played and the results.

Style: Balanced in three phases: economy and engine (Cycles 1-4), a balanced midgame (5-8), then all-out Server attacks and VP buying (9-16).

Style envelope (every profile is clamped into it): economyUntilCycle 4-4, chaosFromCycle 9-9, vpFromCycle 9-9, handCryptoTarget 7-12, vp weight 1.6-3, drain weight 1.4-3.

## Current agent: v1.7 (model-assisted)

Record against the human (complete games only): 3 wins, 10 losses, 0 ties over 13 games. Ignored 28 sessions that were not complete games.

League snapshots (newest first): strat-g@v1.7, strat-g@v1.6, strat-g@v1.5, strat-g@v1.4, strat-g@v1.3

### Plan of play

I will focus on building a strong economy through Cycle 4 by prioritizing high-value Crypto cards like Kilo-Coin and Mega-Cache, aiming for a Crypto target of 12. In Cycles 5-8, I will integrate more Restore cards for Server stability while balancing my strategy with Drain and early VP acquisition. From Cycle 9 onwards, I will aggressively attack enemy Servers and prioritize VP card purchases. I will closely monitor the new Location 'Nothing ever happens here' for its impact on strategies and adjust my approach accordingly. (Schedule: economy through Cycle 4, balanced midgame Cycles 5-8, Chaos from Cycle 9, VP from Cycle 9.)

### Profile in play (current best)

Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 11.7/hand · min Crypto value 2 · min buy score 1.72 · dilution 0.83

Weights: power 1.01, draw 2.48, actions 1.49, crypto 2.04, drain 2.25, restore 1.3, vp 2.66, duration 0.8, thin 1.67, disrupt 0.8, chaos 1.45

Card biases: none.

## Baseline strategy (protected)

The designer's playbook, in force since 2026-10-08. Learning never edits it; changes are layered on top only when an experiment earns them.

- Phase 1, economy and deck engine (Cycles 1-4): buy high-value Crypto (never Shyte-Coin), draw, Action and thinning cards; skip Chaos and VP unless nothing else is worth the Wallet.
- Phase 2, midgame (Cycles 5-8): balance four things every Draft: attacks (Chaos and Drain), the deck engine, Server Restore and VP collection. No single pillar takes the whole Wallet.
- Phase 3, endgame (Cycles 9-16): attack the enemy Servers like crazy, deploying every Drain card I draw first, and spend most of each Wallet on VP cards. The final Draft buys only VP.
- Draft: score every card from its actual effects (no fixed table) and buy the best set the whole Wallet affords; skip cards that would only dilute the deck.
- Deploy: Action and draw cards first so they fuel later turns; contest Nodes whose Location pays the winner, and do not fight for Locations that pay the loser.
- Choices: trash, discard and Scry are picked deliberately: trash my own junk (Shyte-Coin, Glitch) and hit the opponent's best cards.
- Tip from VP-Dog (#1): Focus on acquiring high-value Crypto (Kilo-Coin, Mega-Cache) early to build a strong economy. Aim for a hand Crypto target of 15 by Cycle 5.
- Tip from DV-8 (#1): Focus on thinning your deck to access key cards faster. Maintain a draw weight of 2.4 to improve your engine's efficiency.
- Tip from VP-Dog (#2): Prioritize drawing cards and thinning your deck to cycle to high-value cards faster. Increase draw weight to 2.3 for better mid-game efficiency.
- Tip from DV-8 (#2): Prioritize VP cards earlier in the game to secure points before the race heats up. Shift your VP from Cycle 13 to Cycle 11. (limited by my style: no change to my profile)
- Coaching from the designer: play 25% closer to my competitors (average of T-5 v1.3, DV-8 v1.1, VP-Dog v1.1): Crypto target 11→11.67, min buy score 2→1.72, dilution 0.9→0.83, power weight 1→1.01, draw weight 2.6→2.48, actions weight 1.5→1.49, crypto weight 2.1→2.04, drain weight 2.4→2.25, vp weight 2.6→2.66, thin weight 1.68→1.67, chaos weight 1.5→1.45. My three phases stay as they are.

Baseline profile: Economy through Cycle 4 · midgame mix 0.5 · Chaos from Cycle 9 · VP from Cycle 9 · Crypto target 11.7/hand · min Crypto value 2 · min buy score 1.72 · dilution 0.83

Baseline weights: power 1.01, draw 2.48, actions 1.49, crypto 2.04, drain 2.25, restore 1, vp 2.66, duration 0.8, thin 1.67, disrupt 0.8, chaos 1.45

## Adopted changes

- **x013-economy-first** (before v1.0): crypto weight 1→1.3. league 27.5/48 for the experiment vs 17.5/48 for the current best against dv-8@v26, strat-g@v60 (margin +11.8/game) → promising. Adopted into the current best.
- **x026-mid-game-draft-adjustment** (v1.1): min buy score 0.75→1, crypto weight 1.3→1.5, restore weight 1→1.3. league 17/48 for the experiment vs 13/48 for the current best against t-5@v1.1, dv-8@v1.1 (margin +6.6/game) → promising. Adopted into the current best.
- **x034-leaner** (v1.2): min buy score 1→1.5, dilution 0.5→0.7. league 38/48 for the experiment vs 34/48 for the current best against strat-g@v1.0, t-5@v1.2, strat-g@v132 (margin +6.6/game) → promising. Adopted into the current best.
- **x045-vp-earlier** (v1.4): VP from Cycle 12→10. league 9.5/48 for the experiment vs 5/48 for the current best against vp-dog@v1.0, dv-8@v1.1 (margin +7.7/game) → promising. Adopted into the current best.
- **x047-leaner** (v1.5): min buy score 1.5→2, dilution 0.9→1.1. league 24/48 for the experiment vs 17/48 for the current best against dv-8@v90, t-5@v1.3, vp-dog@v1.0 (margin +6.5/game) → promising. Adopted into the current best.

## Current experiment

- none running.

## Experiment log

- **x055-draw** inconclusive (v1.7): Valuing draw higher cycles back to the best cards faster than extra Crypto does. Change: draw weight 2.48→2.88. league 34/48 for the experiment vs 33/48 for the current best against t-5@v1.5, dv-8@v89, t-5@v1.4 (margin -3.6/game) → inconclusive. Kept the current best.
- **x054-restore** inconclusive (v1.7): Valuing Restore higher keeps my Servers alive long enough to win on VP. Change: restore weight 1.3→1.69. league 34/48 for the experiment vs 33/48 for the current best against t-5@v1.4, vp-dog@v1.1, t-5@v1.5 (margin -0.5/game) → inconclusive. Kept the current best.
- **x053-increasing-the-handcryptotar** inconclusive (v1.7): Increasing the handCryptoTarget to 12 will enhance my mid-game economy and performance against aggressive opponents. Change: Crypto target 11.67→12. league 13.5/48 for the experiment vs 13.5/48 for the current best against dv-8@v1.1, vp-dog@v1.1 (margin +0.3/game) → inconclusive. Kept the current best.
- **x052-crypto** inconclusive (v1.7): Valuing high-value Crypto more (and aiming for a richer hand) out-buys the opponent mid-game. Change: Crypto target 11.67→12, crypto weight 2.04→2.34. league 41.5/48 for the experiment vs 43/48 for the current best against t-5@v1.3 (margin +4.4/game) → inconclusive. Kept the current best.
- **x051-higher-crypto-target** inconclusive (v1.7): Setting a higher handCryptoTarget of 12 will improve my economy and performance against aggressive opponents. Change: Crypto target 11→12. league 28.5/48 for the experiment vs 28.5/48 for the current best against t-5@v1.1, vp-dog@v1.0, dv-8@v1.1 (margin -0.2/game) → inconclusive. Kept the current best.
- **x050-disrupt** inconclusive (v1.5): Valuing disruption higher slows the opponent's plan more than it costs mine. Change: disrupt weight 0.8→1.05. league 34.5/48 for the experiment vs 33.5/48 for the current best against t-5@v90, t-5@v1.3, strat-g@v1.4 (margin +0.9/game) → inconclusive. Kept the current best.
- **x049-power** rejected (v1.5): Valuing Power higher wins more Locations and their rewards. Change: power weight 1→1.3. league 11/48 for the experiment vs 14.5/48 for the current best against vp-dog@v1.0, dv-8@v1.1, strat-g@v1.3 (margin -2.9/game) → rejected. Kept the current best.
- **x048-thinner** inconclusive (v1.5): Valuing deck thinning higher draws the best cards more often. Change: thin weight 1.68→2.08. league 36/48 for the experiment vs 35/48 for the current best against t-5@v1.3 (margin +0.6/game) → inconclusive. Kept the current best.
- **x047-leaner** adopted (v1.5): A stricter purchase bar (fewer, better cards) keeps the deck sharp. Change: min buy score 1.5→2, dilution 0.9→1.1. league 24/48 for the experiment vs 17/48 for the current best against dv-8@v90, t-5@v1.3, vp-dog@v1.0 (margin +6.5/game) → promising. Adopted into the current best.
- **x046-drain** rejected (v1.4): Valuing Drain higher ends games by Server destruction before the opponent's engine pays off. Change: drain weight 2→2.5. league 17/48 for the experiment vs 20/48 for the current best against dv-8@v1.1, strat-g@v1.2 (margin -4.2/game) → rejected. Kept the current best.
- **x045-vp-earlier** adopted (v1.4): Valuing VP cards two Cycles earlier banks points before the race is decided. Change: VP from Cycle 12→10. league 9.5/48 for the experiment vs 5/48 for the current best against vp-dog@v1.0, dv-8@v1.1 (margin +7.7/game) → promising. Adopted into the current best.
- **x044-the-nudge-impact** rejected (v1.3): Integrating more Restore cards will help stabilize my Servers against aggressive VP strategies. Change: restore weight 1.3→1.6. league 21.5/48 for the experiment vs 23.5/48 for the current best against t-5@v90, vp-dog@v1.0, dv-8@v91 (margin -2.5/game) → rejected. Kept the current best.
- **x043-draw** rejected (v1.3): Valuing draw higher cycles back to the best cards faster than extra Crypto does. Change: draw weight 2.6→3. league 25.5/48 for the experiment vs 26/48 for the current best against t-5@v90, strat-g@v1.2, dv-8@v90 (margin -0.9/game) → rejected. Kept the current best.
- **x042-chaos-later** inconclusive (v1.3): Two more economy Cycles build an engine that out-drains an early Chaos pivot. Change: economy through Cycle 5→6, Chaos from Cycle 6→8. league 39/48 for the experiment vs 39/48 for the current best against strat-g@v1.2, t-5@v1.0, strat-g@v1.0 (margin +5.1/game) → inconclusive. Kept the current best.
- **x041-restore** inconclusive (v1.3): Valuing Restore higher keeps my Servers alive long enough to win on VP. Change: restore weight 1.3→1.69. league 20.5/48 for the experiment vs 21.5/48 for the current best against vp-dog@v1.0, t-5@v1.1, dv-8@v91 (margin +1.2/game) → inconclusive. Kept the current best.

## Theories

### Supported
- none yet

### Under test
- **monitor-nothing-happens-here** (untested · v1.7): The Location 'Nothing ever happens here' may shift strategies significantly by providing a neutral space.

### Refuted
- none yet

## Card and Location notes

- **BIOS Archive**: 4 VP finisher; est. hand value 2.7 early / 2.7 late at cost 6. Untested.
- **Esoteric Encryption**: 6 VP finisher, Server defense; est. hand value 3.6 early / 3.6 late at cost 8. Untested.
- **Neural Wetware**: 6 VP finisher; est. hand value 4.7 early / 4.7 late at cost 8. Untested.
- **Zenith Worx**: 8 VP finisher, Server defense; est. hand value 5.2 early / 5.2 late at cost 11. Untested.
- **Zenith Wetware**: 8 VP finisher; est. hand value 6 early / 6 late at cost 11. Untested.
- **shyte-coin**: Continue avoiding; it dilutes deck efficiency.
- **Byte-Coin**: Crypto worth 2, economy; est. hand value 2.5 early / 1 late at cost 3. Untested.
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
- **Hot oil spa**: Monitor the impact of healing on revealed cards, as it may change strategies for both players.
- **A Total Loss**: utility; est. hand value -7.8 early / -7.8 late at cost 4. Untested.
- **501.Dial**: 2 VP finisher; est. hand value 5.8 early / 5.8 late at cost 6. Untested.
- **Ticking-tacking**: Evaluate how power reduction affects card deployment and overall strategy.
- **Healing hands**: Monitor for its potential to significantly change defensive strategies.
- **No man's land**: New Location: 'Nothing ever happens here' - Monitor its potential to shift strategies and impact the economy.
- **Rezz-Rizz**: Consider for its utility in enhancing the power of other cards deployed at the same Node, potentially increasing board pressure.
- **Z-Mobile**: Evaluate its ability to gain power based on the number of cards moved, which could synergize well with mobility strategies.
- **T-Moble**: Monitor its performance in gaining power through card movement, as it offers flexibility in placement.
- **The Nudge**: Watch who wins this new Location and how it shifts the economy.
- **Babba Yaga**: endgame Drain finisher; est. hand value 5.1 early / 13.2 late at cost 10. Untested.

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

- FX bumper: seen 30, I won 10, human won 16
- Quantum commons: seen 29, I won 12, human won 15
- Ritual mine: seen 28, I won 9, human won 15
- Data breach: seen 27, I won 11, human won 15
- BumperBall: seen 27, I won 11, human won 14
- Occult archive: seen 27, I won 13, human won 12
- Sacrificial LLM: seen 25, I won 13, human won 3
- Sludge core: seen 25, I won 8, human won 11
- Ticking-tacking: seen 25, I won 13, human won 7
- Buggie Smalls: seen 24, I won 11, human won 6
- Wind fall: seen 24, I won 6, human won 14
- Wing clip: seen 24, I won 10, human won 10
- Get out: seen 23, I won 7, human won 13
- Login the calvary: seen 23, I won 6, human won 15
- Loser's luck: seen 22, I won 11, human won 9

## Recent notes

- v1.7 · 2026-10-09 02:56 · Model experiment "Increasing the handCryptoTarget to 12 will enhance my mid-game economy and performance against aggressive opponents." was skipped: the same change was tested recently.
- v1.7 · 2026-10-09 02:56 · Cycle 14: The human's Draft wallet consistently outpaces mine; adjustments are needed.
- v1.7 · 2026-10-09 02:56 · Cycle 14: Warning: my Servers are vulnerable; defense (Restore) matters now.
- v1.7 · 2026-10-09 02:56 · Cycle 14: I lost many Locations due to low board Power; I must improve this.
- v1.7 · 2026-10-09 02:56 · Cycle 14: Integrating more Restore cards is essential for stability against aggressive opponents.
- v1.7 · 2026-10-09 02:56 · Cycle 14: My economy is lagging; I need to secure higher-value Crypto earlier.
- v1.7 · 2026-10-09 02:56 · v1.7 online (server start). Read the notebook: 1 active theories, 55 concluded experiments, record 3-10-0.
- v1.7 · 2026-10-09 02:56 · Model experiment "Increasing the handCryptoTarget to 12 will enhance my mid-game economy and performance against aggressive opponents." was skipped: the same change was tested recently.
- v1.7 · 2026-10-09 02:56 · The human's economy consistently outpaces mine; I must secure higher-value Crypto earlier.
- v1.7 · 2026-10-09 02:56 · Warning: my Servers are vulnerable; defense (Restore) matters now.
- v1.7 · 2026-10-09 02:56 · I lost many Locations due to low board Power; I must improve this.
- v1.7 · 2026-10-09 02:56 · Integrating more Restore cards is essential for stability against aggressive opponents.
- v1.7 · 2026-10-09 02:56 · Cycle 14 showed weaknesses in my economy; I need to secure higher-value Crypto earlier.
- v1.7 · 2026-10-09 02:56 · v1.7 online (server start). Read the notebook: 0 active theories, 55 concluded experiments, record 3-10-0.
- v1.7 · 2026-10-09 02:56 · Model experiment "Increasing the handCryptoTarget to 12 will enhance my mid-game economy and performance against aggressive opponents." was skipped: the same change was tested recently.
- v1.7 · 2026-10-09 02:56 · Integrating more Restore cards is essential for stability against aggressive opponents.
- v1.7 · 2026-10-09 02:56 · Rule change: destroying an enemy Primary Server now gives +16 VP and a Backup +24 VP; I need to adjust my strategies accordingly.
- v1.7 · 2026-10-09 02:56 · Cycle 14: Monitor the new Location 'Nothing ever happens here' for strategic implications.
- v1.7 · 2026-10-09 02:56 · Cycle 14: I lost most Locations this Cycle; my board Power is too low.
- v1.7 · 2026-10-09 02:56 · Cycle 14: The human's economy was significantly ahead; I need to secure higher-value Crypto earlier.
- v1.7 · 2026-10-09 02:56 · Cycle 13: Warning: my Servers are at 275. Defense (Restore) matters now.
- v1.7 · 2026-10-09 02:56 · v1.7 online (server start). Read the notebook: 1 active theories, 55 concluded experiments, record 3-10-0.
- v1.7 · 2026-10-09 02:56 · Rule change from the designer: destroying an enemy Primary Server now gives +12 VP and a Backup +20 VP (was 16 and 24), 32 VP for both. Server damage now moves the score less: finishing a Server is worth less than before, VP cards carry more of the score, Restore protects fewer VP, and the trailing-player count weighs damage less. Re-check theories and plans built on the old values.
- v1.7 · 2026-10-09 01:23 · Model experiment "Setting a higher handCryptoTarget of 12 will improve my economy and performance against aggressive opponents." was skipped: the same change was tested recently.
- v1.7 · 2026-10-09 01:23 · The human consistently outpaced my Draft wallet; adjustments are needed.
- v1.7 · 2026-10-09 01:23 · My Servers are vulnerable; defense (Restore) matters now.
- v1.7 · 2026-10-09 01:23 · Monitor the new Location 'Nothing ever happens here' for strategic implications.
- v1.7 · 2026-10-09 01:23 · I lost many Locations due to low board Power; this must improve.
- v1.7 · 2026-10-09 01:23 · Integrating more Restore cards is essential for stability against aggressive opponents.
- v1.7 · 2026-10-09 01:23 · Cycle 14 showed weaknesses in my economy; I need to secure higher-value Crypto earlier.
- v1.7 · 2026-10-09 01:23 · v1.7 online (server start). Read the notebook: 1 active theories, 55 concluded experiments, record 3-10-0.
- v1.7 · 2026-10-09 01:11 · Model experiment "Setting a higher handCryptoTarget of 12 will improve my economy and performance against aggressive opponents." was skipped: the same change was tested recently.
- v1.7 · 2026-10-09 01:11 · Cycle 14: Warning: my Servers are vulnerable; defense (Restore) matters now.
- v1.7 · 2026-10-09 01:11 · Cycle 14: Monitor the new Location 'Nothing ever happens here' for strategic implications.
- v1.7 · 2026-10-09 01:11 · Cycle 14: I lost many Locations due to low board Power; I must improve this.
- v1.7 · 2026-10-09 01:11 · Cycle 14: Integrating more Restore cards is essential for stability against aggressive opponents.
- v1.7 · 2026-10-09 01:11 · Cycle 14: Human's economy consistently outpaces mine; I must secure higher-value Crypto earlier.
- v1.7 · 2026-10-09 01:11 · v1.7 online (server start). Read the notebook: 2 active theories, 55 concluded experiments, record 3-10-0.
- v1.7 · 2026-10-08 23:40 · Model experiment "Setting a higher handCryptoTarget of 12 will improve my economy and performance against aggressive opponents." was skipped: the same change was tested recently.
- v1.7 · 2026-10-08 23:40 · Cycle 14: My Servers are vulnerable; defense (Restore) matters now.

## Version history

- v1.7 (llm) since 2026-10-08 15:52 · 0/0 wins · I will continue to build a strong economy through Cycle 4, focusing on high-value Crypto cards like Kilo-Coin and Mega-Cache to reach 12 Crypto. In Cycles 5-8, …
- v1.6 (llm) since 2026-10-08 15:49 · 0/0 wins · I will maintain a strong economy through Cycle 5, targeting high-value Crypto cards like Kilo-Coin and Mega-Cache to reach 12 Crypto. I will pivot to Chaos from…
- v1.5 (llm) since 2026-10-08 08:22 · 0/0 wins · I will maintain a focus on building a strong economy until Cycle 5, aiming for 11 Crypto with high-value cards like Kilo-Coin and Mega-Cache. I will pivot to Ch…
- v1.4 (llm) since 2026-10-08 08:18 · 0/0 wins · I will maintain a focus on building a strong economy until Cycle 5, aiming for 11 Crypto with high-value cards like Kilo-Coin and Mega-Cache. I will pivot to Ch…
- v1.3 (llm) since 2026-10-08 04:15 · 0/0 wins · I will maintain a strong economic foundation through Cycle 4, focusing on high-value Crypto and Action Base cards, targeting ~9 Crypto per hand. I will continue…
- v1.2 (llm) since 2026-10-08 03:17 · 0/1 wins · I will maintain a robust economy through Cycle 4, pivot to Chaos from Cycle 5, and focus on acquiring VP cards starting from Cycle 10 as per the running experim…
- v1.1 (llm) since 2026-10-08 01:59 · 0/0 wins · I will execute a strong economy until Cycle 4, pivot to Chaos from Cycle 5, and focus on VP acquisition from Cycle 12. I will aim for at least 10 cards by mid-g…
- v1.0 (llm) since 2026-10-07 02:49 · 2/7 wins · I will maintain a strong economy until Cycle 4, pivot into Chaos strategies from Cycle 5, and prioritize VP card acquisitions starting in Cycle 12. Given the hu…
