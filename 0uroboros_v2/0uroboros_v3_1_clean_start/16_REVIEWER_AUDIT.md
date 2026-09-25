# Reviewer Audit — Clean-Start V3

## Purpose
Second-pass consistency audit to prevent stale placeholders, contradictory assumptions, or creative guidance masquerading as canon.

## Conflicts resolved
### Starter deck
Accepted: 5 Character / 3 Crypto / 2 VP, 10 total; Slash-Dot, Dash-Dot, Dotkrawler, Rezz-Razor, Rezz-Blade; Byte-Coin x2, Kilo-Coin; Vault Encryption x2.

Rejected placeholders: Data Broker / Firewall Architect / Packet Sniffer / Quantum Gambler; Cipher Runner / Echo Analyst / Phase Broker / Breach Daemon; old 4/4/2 implementation.

### Crypto
Accepted Byte-Coin +2, Kilo-Coin +3. Old Crypto Shard +1 is not canon.

### Vault Encryption
Accepted Power 2, Restore 100, VP, Runtime deployment cost 0, Draft cost 3. Old Ledger Sigil is not canon.

### Restore
Accepted Primary first, Backup fallback. Historical Primary-only implementation is a bug.

### Drain
Accepted available Primary first, then Backup; no spill.

### Power
Accepted one total per player per Node; no third shared Node-Power value.

### Wave Collapse
Accepted deterministic Nodes 1-5, then Effect Bank, then one probabilistic Circuit selection. Location Reward and Circuit Reward remain separate.

### Draft timing
Accepted Draft follows completed Wave Collapse presentation/transition. Any Draft-before-Collapse UI behavior is a bug.

## UX decisions checked
Accepted: opponent cards -> opponent Power/priority -> Location -> local Power/priority -> local cards; Power unobstructed; Location belongs to Node; drag=deploy; click/tap=inspect; local resolves local; global announces global.

## Reference policy checked
Accepted: first-party art controls identity; competitive references control craft principles only; effect animations reference-only; filename theme tags are matching metadata; production effects original; Snap sequencing benchmark; Hearthstone motion-weight benchmark.

## Obsidian checked
Accepted: world/story/plot/setting, read-only, not rules, not automatically character-specific canon.

## Intentional TBDs
Action carryover default, player-choice timer, complete content library, missing art if absent, new detailed LookDev, audio, Short-Circuit.

## Result
**PASS — suitable as a fresh-context bootstrap package.**

Condition: Astra must inspect actual new project paths/assets; historical counts/paths are not canonical.
