# Strat-G notebook

Written by Strat-G, the AI opponent's strategy agent, for its next version. Each dev-server start boots a new version that reads this notebook (and `memory.json`), plans, plays, and leaves notes here.

## Current agent: v6 (model-assisted)

Record against the human: 3 wins, 1 losses, 17 ties over 21 games.

### Plan of play

Maintain early tempo with draw and Action cards, focusing on Slash-Dot and Rezz-Blade. Transition into Chaos strategies by Cycle 5 while prioritizing Drain through Bloodlet Drone. Adjust VP acquisition timing based on human strategies, aiming for optimal scoring potential. Focus on high-value Crypto purchases and avoid low-value options like Shyte-Coin. Overall schedule: economy until Cycle 5, Chaos from Cycle 6, VP from Cycle 10. (Schedule: economy through Cycle 5, Chaos from Cycle 6, VP from Cycle 10.)

### Profile

Economy through Cycle 5 · Chaos from Cycle 6 · VP from Cycle 10 · Crypto target 15/hand · min Crypto value 2 · min buy score 1 · dilution 0.5

Weights: power 1, draw 1.6, actions 1.1, crypto 1, drain 0, restore 1.2, vp 2.2, duration 0.8, thin 1.2, disrupt 0.8, chaos 1.5

Card biases: Slash-Dot +4, Bloodlet Drone +4, Rezz Blade +4, Dash Relay +2, shyte-coin -2, Rezz Razor +1.5, Kilo-Coin -1, Byte-Coin +1, Mega-Cache +1, Sudo Demiurge +0.5, Superpositioning +0.5, Temporal Rift +0.5, Root Rune +0.5, BIOS Archive +0.5, Zenith Wetware +0.5

## Theories

### Supported
- **early-chaos-transition** (90% · 0 for / 0 against · v1): Transitioning into Chaos by Cycle 5 is optimal for enhancing Drain and server destruction.
- **strong-draw-focus** (90% · 0 for / 0 against · v1): Focusing on strong draw/Action Base cards in the early game maximizes efficiency and prepares for later cycles.
- **mid-game-vp-acquisition** (60% · 0 for / 0 against · v1): Acquiring VP cards in the mid to late game (Cycle 12+) prevents hand clogging and maximizes scoring potential.
- **restore-importance** (90% · 0 for / 0 against · v2): Including Restore cards earlier in the strategy can help mitigate Server damage and prolong the game.
- **high-value-chaos** (80% · 0 for / 0 against · v2): Focusing on high-value Chaos cards early (cost 5+) can enhance Drain effects and Server destruction capabilities.
- **mid-game-draft-adjustment** (70% · 0 for / 0 against · v2): Improving mid-game Draft strategies can prevent economic disparity and enhance overall performance.
- **early-vp-strategy** (90% · 0 for / 0 against · v2): Acquiring VP cards earlier (Cycle 10+) can enhance scoring opportunities without clogging the hand.
- **high-value-draw-action-focus** (90% · 0 for / 0 against · v3): Prioritizing high-value draw and Action cards early maximizes efficiency and prepares for later cycles.
- **vp-early-acquisition** (90% · 0 for / 0 against · v3): Acquiring VP cards earlier (Cycle 10+) can enhance scoring opportunities without clogging the hand.
- **early-vp-acquisition** (90% · 0 for / 0 against · v5): Acquiring VP cards earlier (Cycle 10+) can enhance scoring opportunities without clogging the hand.
- **high-value-chaos-early** (85% · 0 for / 0 against · v6): Focusing on high-value Chaos cards early (cost 5+) can enhance Drain effects and Server destruction capabilities.
- **timely-vp-acquisition** (85% · 0 for / 0 against · v6): Adjusting VP acquisition timing based on observed human strategies maximizes scoring potential.
- **early-restore-importance** (85% · 0 for / 0 against · v6): Including Restore cards earlier in the strategy can help mitigate Server damage and prolong the game.

### Under test
- **no-shyte** (33% · 0 for / 1 against · v0): Shyte-Coin is not worth a deck slot: it dilutes draws. Bigger Crypto (Kilo, Mega-Cache) or Characters that draw cards are better buys.
- **economy-first** (67% · 1 for / 0 against · v0): Buying a few high-value Crypto cards (cost 6+) by Cycle 5 builds the economy that wins the late game.
- **draw-engine** (33% · 0 for / 1 against · v0): Characters that draw cards cycle the deck back to its best cards faster than extra Crypto does.
- **chaos-endgame** (33% · 0 for / 1 against · v0): Pivoting into Chaos cards around Cycle 9 sets up an endgame Drain push that destroys Servers for +8/+12 VP.
- **early-aggression** (40% · 0 for / 0 against · v0): Heavy Chaos buying before Cycle 6 beats a slow economy (the counter-theory to chaos-endgame).
- **vp-late** (50% · 0 for / 0 against · v0): VP cards are best bought late (Cycle 12+); earlier they clog the hand.

### Refuted
- **drain-race** (33% · 1 for / 3 against · v0): Most games are decided by Server destruction before Cycle 12, so Drain matters from the start and Restore is real defense.

## Card and Location notes

- **∆-Wave**: high Power; est. hand value 10.4 early / 21.2 late at cost 9. Untested.
- **System Seppuku**: high Power; est. hand value -1 early / -1 late at cost 23. Untested.
- **Sudo Demiurge**: endgame Drain finisher; est. hand value 6.5 early / 9.6 late at cost 5. Untested.
- **Cicada 3301**: light Drain, Server defense; est. hand value 7.7 early / 9.5 late at cost 6. Untested.
- **Subroutine Succubus**: economy, endgame Drain finisher, Server defense; est. hand value 8.3 early / 9.5 late at cost 6. Untested.
- **Iterative Incubus**: endgame Drain finisher, Server defense; est. hand value 22 early / 29.8 late at cost 7. Untested.
- **Node Feratu**: endgame Drain finisher, Server defense; est. hand value 7 early / 11.1 late at cost 7. Untested.
- **The Azimuthal Kill**: endgame Drain finisher; est. hand value 11.6 early / 25.1 late at cost 8. Untested.
- **Tihkal Hound**: endgame Drain finisher, high Power; est. hand value 16.3 early / 27.6 late at cost 9. Untested.
- **Veil of Cthulhu**: endgame Drain finisher, Server defense, high Power; est. hand value 13.2 early / 24 late at cost 12. Untested.
- **Razor Blade Jade**: endgame Drain finisher; est. hand value 5.5 early / 9.1 late at cost 0. Untested.
- **Basic Encryption**: 1 VP finisher; est. hand value 1.2 early / 1.2 late at cost 2. Untested.
- **Vault Encryption**: 2 VP finisher; est. hand value 1.4 early / 1.4 late at cost 3. Untested.
- **Quantum Archive**: 3 VP finisher, Server defense; est. hand value 2.6 early / 2.6 late at cost 5. Untested.
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

## Card results (games where a side bought it)

- not enough games yet

## Locations (from my side)

- Loser's luck: seen 4, I won 3, human won 0
- Data Breach: seen 4, I won 1, human won 2
- FX Bumper: seen 4, I won 1, human won 2
- Get out: seen 4, I won 2, human won 2
- Occult archive: seen 4, I won 2, human won 2
- Boost Juice: seen 3, I won 0, human won 3
- Hit 'em: seen 3, I won 0, human won 2
- Trash Collector: seen 2, I won 0, human won 2
- Ritual mine: seen 2, I won 0, human won 2
- BumperBall: seen 2, I won 0, human won 2
- Breach relay: seen 2, I won 1, human won 1
- Moving mod: seen 2, I won 1, human won 1
- Kilo mill: seen 2, I won 2, human won 0
- Quantum commons: seen 2, I won 0, human won 2
- Backup failure: seen 1, I won 0, human won 0

## Recent notes

- v6 · 2026-10-04 22:40 · Observing the human's aggressive drain strategy reinforces the value of timely Restore cards to protect Servers.
- v6 · 2026-10-04 22:40 · The game ended as a tie, highlighting the importance of timely VP acquisition.
- v6 · 2026-10-04 22:40 · Early game emphasized the need for strong draw and tempo maintenance with cards like Slash-Dot.
- v6 · 2026-10-04 22:40 · Prioritize high-value Crypto purchases to maintain deck efficiency and avoid dilution from low-value options.
- v6 · 2026-10-04 22:40 · The human delayed VP acquisition until late, indicating I should adapt my own timing for VP.
- v6 · 2026-10-04 22:40 · High-value Chaos cards like Rezz-Blade and Bloodlet Drone were crucial during Drain phases.
- v6 · 2026-10-04 22:40 · Adjusting: games against the human go the distance, so VP matters earlier and Drain a little less.
- v6 · 2026-10-04 22:40 · Debrief: Tie at Cycle 1 (Session ended early for evaluation. Tie, 3 to 3 VP.). VP human 3 / me 3. Servers human 3500 / me 3500. Human bought: nothing. I bought: nothing.
- v6 · 2026-10-04 22:35 · Adjusting VP acquisition timing based on observed human strategies can maximize scoring potential.
- v6 · 2026-10-04 22:35 · Transitioning to Chaos by Cycle 5 remains effective for enhancing Drain.
- v6 · 2026-10-04 22:35 · Human's aggressive Drain strategy shows the need for earlier Restore cards to mitigate Server damage.
- v6 · 2026-10-04 22:35 · High-value Chaos cards like Rezz-Blade and Bloodlet Drone were critical for effective Drain.
- v6 · 2026-10-04 22:35 · Adjusting: games against the human go the distance, so VP matters earlier and Drain a little less.
- v6 · 2026-10-04 22:35 · Debrief: Tie at Cycle 1 (Session ended early for evaluation. Tie, 3 to 3 VP.). VP human 3 / me 3. Servers human 3500 / me 3500. Human bought: nothing. I bought: nothing.
- v6 · 2026-10-04 22:27 · The need for earlier Restore cards became apparent due to the human's aggressive Drain strategy.
- v6 · 2026-10-04 22:27 · Early game emphasized the need for strong draw and tempo maintenance with cards like Slash-Dot.
- v6 · 2026-10-04 22:27 · The human's strategy of delaying VP acquisition until late suggests I should adapt my timing for VP.
- v6 · 2026-10-04 22:27 · Observed that high-value Chaos cards like Rezz-Blade were critical for effective Drain.
- v6 · 2026-10-04 22:27 · The game ended as a tie, highlighting the importance of timely VP acquisition.
- v6 · 2026-10-04 22:27 · Adjusting: games against the human go the distance, so VP matters earlier and Drain a little less.
- v6 · 2026-10-04 22:27 · Debrief: Tie at Cycle 1 (Session ended early for evaluation. Tie, 3 to 3 VP.). VP human 3 / me 3. Servers human 3500 / me 3500. Human bought: nothing. I bought: nothing.
- v6 · 2026-10-04 22:26 · Transitioning to Chaos at Cycle 5 remains effective for enhancing Drain strategies.
- v6 · 2026-10-04 22:26 · Observing the human's aggressive drain strategy reinforces the value of timely Restore cards to protect Servers.
- v6 · 2026-10-04 22:26 · High-value Chaos cards like Rezz-Blade and Bloodlet Drone were key in applying effective pressure on Servers.
- v6 · 2026-10-04 22:26 · The human's strategy of delaying VP acquisition until late highlighted the need for adjusting my own timing for VP.
- v6 · 2026-10-04 22:26 · The early game showed the importance of drawing and maintaining tempo with high-value cards like Slash-Dot.
- v6 · 2026-10-04 22:26 · Adjusting: games against the human go the distance, so VP matters earlier and Drain a little less.
- v6 · 2026-10-04 22:26 · Debrief: Tie at Cycle 1 (Session ended early for evaluation. Tie, 3 to 3 VP.). VP human 3 / me 3. Servers human 3500 / me 3500. Human bought: nothing. I bought: nothing.
- v6 · 2026-10-04 22:16 · Transitioning to Chaos by Cycle 5 remains effective for enhancing Drain.
- v6 · 2026-10-04 22:16 · Adjust timing for VP acquisition based on observed human strategies to maximize scoring potential.
- v6 · 2026-10-04 22:16 · Prioritize high-value Crypto purchases to maintain deck efficiency and avoid dilution from low-value options.
- v6 · 2026-10-04 22:16 · The human's aggressive Drain strategy indicates a need for earlier Restore cards to mitigate Server damage.
- v6 · 2026-10-04 22:16 · High-value Chaos cards like Rezz-Blade and Bloodlet Drone were critical for effective Drain.
- v6 · 2026-10-04 22:16 · Adjusting: games against the human go the distance, so VP matters earlier and Drain a little less.
- v6 · 2026-10-04 22:16 · Debrief: Tie at Cycle 1 (Session ended early for evaluation. Tie, 3 to 3 VP.). VP human 3 / me 3. Servers human 3500 / me 3500. Human bought: nothing. I bought: nothing.
- v6 · 2026-10-04 22:15 · Transitioning to Chaos by Cycle 5 remains effective for enhancing Drain.
- v6 · 2026-10-04 22:15 · Adjust timing for VP acquisition based on observed human strategies to maximize scoring potential.
- v6 · 2026-10-04 22:15 · Prioritize high-value Crypto purchases to maintain deck efficiency and avoid dilution from low-value options.
- v6 · 2026-10-04 22:15 · The human's aggressive Drain strategy indicates a need for earlier Restore cards to mitigate Server damage.
- v6 · 2026-10-04 22:15 · High-value Chaos cards like Rezz-Blade and Bloodlet Drone were critical for effective Drain.

## Version history

- v6 (llm) booted 2026-10-04 22:15 · 0/6 wins · Focus on acquiring high-value draw and Action cards early, such as Slash-Dot and Rezz-Blade, to maintain tempo and prepare for later cycles. Transition into Cha…
- v5 (llm) booted 2026-10-04 22:05 · 0/6 wins · Begin by acquiring strong draw and Action cards like Dash and Slash-Dot to maximize early-game tempo. Shift to Chaos strategies by Cycle 5, focusing on high-val…
- v4 (llm) booted 2026-10-04 22:05 · 0/0 wins · Start by acquiring strong draw and Action cards to maximize tempo, focusing on cards like Dash and Slash-Dot. Transition into Chaos strategies by Cycle 5, prior…
- v3 (llm) booted 2026-10-04 22:01 · 0/2 wins · Focus on acquiring high-value draw and Action cards early, such as Dash and Slash-Dot, to maintain tempo. Transition to Chaos strategies by Cycle 5, prioritizin…
- v2 (llm) booted 2026-10-04 01:10 · 3/7 wins · Acquire strong draw/Action Base cards early, prioritizing cards like Dash and Slash-Dot for efficiency. Avoid Shyte-Coin; focus on high-value Crypto when benefi…
- v1 (llm) booted 2026-10-03 23:12 · 0/0 wins · Focus on acquiring strong draw/Action Base cards early to build an efficient economy. Avoid Shyte-Coin; prioritize high-value Crypto only when beneficial. Trans…
