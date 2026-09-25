# Canonical Content Catalog — Nonstarter Cards, Locations, and Circuit Rewards

## Purpose

This file is the V3/V3.1 authority location for **specific playable content that is not part of the starting deck**, including:

- nonstarter card definitions
- printed Draft costs
- card Power values
- exact card effect text
- Location names and exact Location effects / rewards
- Circuit Reward names and exact reward behavior

Astra and Content specialists must read this file before implementing or proposing content for these categories.

## Important source-status finding

The archived V0.1 / V1 / V1.1 / V2 project documents available during the clean-start rebuild explicitly **deferred**:

- the full nonstarter card catalog
- exact nonstarter card definitions
- Location catalog and exact Location effects
- Circuit Reward pool and exact reward behavior
- Chaos / VP / Crypto / Base / Glitch / generated-card definitions beyond explicitly approved starter content

Therefore, the archived documentation does **not** support reconstructing exact nonstarter effects, Power values, costs, Location rewards, or Circuit Rewards.

Do not fill missing values from memory, theme, card art, filenames, competitive references, or model invention.

If Mel supplies the authoritative prior content source, migrate those exact values into the canonical tables below and change status from `SOURCE_REQUIRED` to `APPROVED`.

---

# 1. Starting-deck exclusion

The following cards are already canonical in `03_STARTER_DECK_AND_CARD_SEMANTICS.md` and should **not** be duplicated here as nonstarter definitions:

- Slash-Dot
- Dash-Dot
- Dotkrawler
- Rezz-Razor
- Rezz-Blade
- Byte-Coin
- Kilo-Coin
- Vault Encryption

---

# 2. Established nonstarter name seeds

These names existed in prior first-party/world-bible guidance.

**Important:** a name seed is not an approved gameplay definition.

Do not infer Power, card type, effect, cost, faction, rarity, Duration, timing, or lore from the name alone.

## Base name seeds

- Atomic Unit
- Atomic Mass
- Thorn Shadow
- The Inbetweener
- Wave Card
- Particle Card
- Quantum Telemetry
- Byte Drone
- Recursive Seance
- Cowl Obscyra
- Infernal Kernel
- The Tesseract Magi
- Root Rune
- Astra Ascii
- The Shiva of CERN
- Night Scythe
- Super-positioning
- Summon the Acolytes
- Temporal Rift
- Ghost Key
- Banishing Ritual
- Opulent Void
- Sacrificial Sigil
- The Heisenberg Hag
- Byte Heist
- Cypto Alchemist
- Code Sniper
- Kilo Cycle
- Entropic Infantry
- Chronos Cache
- Merchant of Chaos
- Alpha Team
- Bravo Team
- Charlie Team

## Chaos name seeds

- Nyx Luna
- Invocation of the Sword
- Bushido.io
- Bloodlet Drone
- H3x1-D3x1
- 1337 Speaker
- Glitch-Witch.exe
- The Qubit Kid
- Chrome Mitchell
- Mary Mallon
- Mary Malice
- Mary Malware
- Typhoid Mary
- ∆-Wave
- System Seppuku
- Sudo Demiurge
- Cicada 3301
- Skinwalker
- Leviathan Form
- Spider Form
- Wasp Form
- Viper Form
- Wolf Form
- Subroutine Succubus
- Iterative Incubus
- Node Feratu
- The Azimuthal Kill
- Tihkal Hound
- Veil of Cthulhu
- Razor Blade Jade
- Dit Bot
- The Owl King

These lists exclude Rezz-Razor and Rezz-Blade because they are starter cards in the current canonical deck.

---

# 3. Canonical nonstarter card definitions

## Current status

`SOURCE_REQUIRED`

The exact approved values were not present in the archived documentation available during the clean-start rebuild.

| Card | Classification | Power | Exact effect text | Printed Draft cost | Other approved parameters | Status |
|---|---|---:|---|---:|---|---|
| TBD from authoritative source | TBD | TBD | TBD | TBD | TBD | SOURCE_REQUIRED |

## Migration rules

When importing the authoritative prior content:

1. Preserve exact approved spelling and punctuation unless Mel explicitly updates it.
2. Preserve exact Power.
3. Preserve exact printed Draft cost.
4. Preserve exact effect text and numbers.
5. Do not rebalance values during migration.
6. Do not reinterpret an effect during migration.
7. If a prior definition conflicts with current canonical core rules, flag the conflict instead of silently rewriting it.
8. Record classification and any explicit timing, targeting, Duration, or choice behavior.

---

# 4. Canonical Locations

## Current status

`SOURCE_REQUIRED`

The archived source defines how Locations behave structurally, but does not contain the exact Location catalog.

### Structural rules that remain canonical

A Location:
- is attached to a Node for a Cycle
- may have continuous, timed, or `onCollapse` text
- resolves Location `onCollapse` before card `onCollapse` effects at that Node
- may provide a Location Reward
- uses a Location Reward that is separate from the Circuit Reward
- grants applicable tied-Node rewards to both players unless exact approved Location text says otherwise
- may be silenced according to canonical silence rules

## Exact Location catalog

| Location | Exact rules/effect text | Exact Location Reward | Timing | Targets / choices | Status |
|---|---|---|---|---|---|
| TBD from authoritative source | TBD | TBD | TBD | TBD | SOURCE_REQUIRED |

Do not convert a thematic Location name into mechanics.

---

# 5. Canonical Circuit Rewards

## Current status

`SOURCE_REQUIRED`

The archived source defines the Circuit Reward **system**, but not the exact reward pool.

### Structural rules that remain canonical

- Location Rewards and Circuit Rewards are separate.
- After deterministic Node resolution, exactly one Node is selected using final probability weights.
- Winner of the selected Node receives Circuit Reward eligibility.
- If the selected Node is tied, both players receive their own eligibility/opportunity according to the canonical rule.
- The Circuit Reward appears in a dedicated privileged Draft slot.
- Eligible player(s) have the Draft window to claim it.
- Circuit Reward activity is logged.
- Game-ending Data Center destruction during Wave Collapse stops before Circuit Reward selection.

## Exact Circuit Reward pool

| Circuit Reward | Exact effect / acquisition behavior | Cost if any | Destination | Timing / choices | Status |
|---|---|---:|---|---|---|
| TBD from authoritative source | TBD | TBD | TBD | TBD | SOURCE_REQUIRED |

---

# 6. Authority after restoration

Once exact values are restored here and approved by Mel:

- this file becomes canonical for specific nonstarter content
- Astra may implement the definitions
- Engineering should encode them data-first
- Content may propose additions but may not overwrite approved entries
- LookDev may interpret them visually but may not alter mechanics
- Worldbuilding may propose lore but may not alter mechanics

Any gameplay change to an approved entry requires Mel.

---

# 7. Machine-readable companions

Once restored, keep implementation data aligned with this catalog, for example:

```text
content/cards.json
content/locations.json
content/circuit-rewards.json
```

The absence of a value here is **not permission for Astra to invent it**.

Use `SOURCE_REQUIRED` until the authoritative content source is available.
