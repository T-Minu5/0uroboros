# Starter Deck and Card Semantics

## Canonical starting deck
Exactly 10 cards per player.

### Characters — 5
**Slash-Dot** — Character; Power 3; Draft cost 4; `+3 Cards.`

**Dash-Dot** — Character; Power 2; Draft cost 3; `+1 Card. +1 Action.`

**Dotkrawler** — Character; Power 1; Draft cost 3; `+1 Card. +1 Action. +1 Crypto.`

**Rezz-Razor** — Character; Power 4; Draft cost 3; `Drain 75. +1 Card. +1 Action.`

**Rezz-Blade** — Character; Power 3; Draft cost 4; `Drain 100. +1 Card. +2 Actions.`

### Crypto — 3
**Byte-Coin x2** — Crypto; not Node deployable; Draft cost 3; `+2 Crypto.`

**Kilo-Coin x1** — Crypto; not Node deployable; Draft cost 6; `+3 Crypto.`

### VP — 2
**Vault Encryption x2** — VP; Power 2; Runtime Action cost 0; Draft cost 3; `Restore 100.`

## Deployment vs Draft cost
Character default Runtime deployment cost = 1 Action. VP default = 0 Actions. Crypto cannot deploy. Printed Draft cost is a separate value.

## Keywords
### `+N Cards`
Draw N using normal draw/reshuffle rules.

### `+N Action(s)`
Gain Actions. If granted through OnReveal, available on the next Runtime turn.

### `+N Crypto`
Gain N Crypto for the current Cycle's eventual Draft Wallet.

### Drain N
Generic Drain targets opponent's available Primary first, then Backup if Primary is destroyed/unavailable. No overkill spill. Explicit Backup/Both targeting overrides generic targeting when approved by text.

### Restore N
Generic Restore targets owner's available Primary first, then Backup if Primary is destroyed/unavailable. Destroyed Servers cannot be restored. No overheal; excess is lost.

### Gain/acquire a card
Acquisition to the destination defined by the effect. Default Draft acquisition goes to Discard unless text overrides.

## Game copy style
- sentence case
- effect clauses end with periods
- labels need no period
- avoid em dash in game copy

## Deprecated historical starters
Do not reintroduce old placeholder rosters such as Data Broker / Firewall Architect / Packet Sniffer / Quantum Gambler; Cipher Runner / Echo Analyst / Phase Broker / Breach Daemon; old 4 Character / 4 Crypto / 2 VP assumptions; generic Crypto Shard / Ledger Sigil placeholders.
