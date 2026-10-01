# Card catalog adaptation audit

## Current activation status — 2026-09-24

The user has since authorized broad playable import with explicit adaptations. **65 historic cards are active, 41 morph/generative definitions are explicitly excluded, and nine renamed retained evaluation definitions bring the test catalog to 74.** Original source names, costs, descriptions, effects metadata and artwork remain preserved. The active implementation is `src/historicCatalog.ts`; the current decisions, schedules, pool composition and renamed identities are documented in `docs/EVALUATION_MARKET.md`.

New Character Power uses approved ceil(cost/2), clamped 1–5; new VP Power equals its VP. Existing assignments stay unchanged. Original descriptions govern direct contradictions; effects supplement omitted clauses. Old turns are Runtime turns, explicit next-N schedules are future-only, and retained evaluation Durations remain Cycle-based. Old Draft clauses transfer existing own Power between the played Node and a neighbor; weight selection is no longer active. Qubit targets the next Runtime hand after refill; Opulent chooses 1–3 when available.

The complete ledger below is retained as the **pre-authorization audit**, not current blocking status. Its references to pending approvals, unsupported primitives, original starter names, percentage transfers, and source-import restrictions are historical. Do not use those stale statements to block the currently authorized import. All 106 definitions remain accounted for, and excluded entries stay explicit.

## Historical audit

Audit scope: all **106 unique definitions** in `assets/card_art/cards.json`. This document makes no gameplay changes and does not promote imported rules over current canon. Art paths may be normalized separately; that is not mechanics approval.

## Main finding

The source is a catalog from a different game. It contains no Node Power values, no current Character/VP/Crypto classification, no canonical Base/Chaos pool assignment and no explicit current Runtime timing fields. Every card has id, name, cost, types, description, effects and artwork; 40 also have video metadata. **40 cards cost zero.** Many of those are forms, generated cards or unspecified bonus cards, not evidence for free unlimited Draft piles.

Eight current canonical starter identities occur in the source. Ten additional names collide with the current provisional evaluation roster. There is no safe wholesale import that preserves approved starters and all tested evaluation mechanics without an explicit adaptation policy.

Exactly twelve definitions mention +Draft: The Inbetweener, Wave Card, Particle Card, Dotkrawler, Quantum Telemetry, Infernal Kernel, Astra Ascii, Wolf Form, Ghost Key, Sacrifical Sigil, Alpha Team and Cat Run. **Every occurrence is +1 Draft**; the source does not contain a +1/+2/+3 scale from which 5/10/15% can be mechanically derived. The user has allowed weight-shift replacements, but tier, source and destination still need either explicit values or delegated evaluation-design authority. A shift must transfer existing weight, never add to the 100% total.

## Minimal global clarification set

Canonical starters stay unchanged. The user has allowed preserving useful tested placeholder mechanics; keep those explicit rather than silently overwriting them with incompatible same-name source rules. Generated forms should remain excluded from ordinary market piles unless a specific offer is deliberately authorized. These safeguards do not require asking the user to reapprove existing rules.

1. **Evaluation design authority:** May we assign missing Node Power and select 5/10/15% shifts with stated source/destination rules, while retaining imported printed costs for ordinary nonstarter candidates? Clarify that source +N Power describes Server restoration where context supports it, not +N Node Power. Do not use VP values or healing magnitudes as Node Power defaults.
2. **Time conversion:** Should old turns become full Cycles? If so, decide whether “next N turns” includes the deployment Cycle, which currently must count as Duration Cycle one; when recurring benefits trigger; and how delayed third/fourth/fifth-turn payouts map to start/end of a Cycle. Current OnReveal Actions remain unavailable until the next Runtime turn, regardless of source wording such as now.
3. **Conflicting source fields:** Which field should govern incomplete descriptions and direct contradictions: effects, description, or explicit per-card adjudication? Cowl Obscyra is the minimal concrete example: description +2 Actions/+1 Card, effects +1 Action/+2 Cards. A precedence choice must still preserve sealed starter rules and explicitly authorized exceptions.

These three grouped decisions unlock planning. They do not resolve the concrete exceptional mechanics below; those should remain visibly blocked or be approved as bounded evaluation definitions rather than silently omitted.

## Exact high-priority conflicts

- Dash-Dot: source +2 Actions versus canonical +1 Action; canonical cost 3, Power 2 and +1 Card remain authoritative.
- Dotkrawler: source cost 4/+2 Actions/+1 Draft/no Crypto versus canonical cost 3/+1 Action/+1 Crypto. Node Power 1 is absent in the source.
- Rezz Razor/Rezz Blade: source spelling lacks canonical hyphens; damage/cost quantities agree, but source effect order places Actions before Cards. Preserve canonical identity, Power and clause order.
- Cowl Obscyra: description +2 Actions/+1 Card versus effects +1 Action/+2 Cards. Direct numeric contradiction.
- Wave Card and Particle Card: descriptions omit +1 Draft/+1 Crypto that effects include. Their zero cost and unclear generation make availability a separate issue.
- Superpositioning and Banishing Ritual: effects add +1 Action absent from descriptions. Invocation of the Sword similarly adds Drain 100 in effects. Those may be abbreviated descriptions, but field authority must be explicit.
- Opulent Void: “up to 3” versus “choose 1–3” disagree over whether zero is legal.
- The Inbetweener: description specifies random, while effects only say OR. Do not substitute a player choice for source randomness.
- The Qubit Kid: choosing an opponent hand card conflicts with hidden-information policy unless the effect explicitly grants a scoped reveal; description's next Runtime timing is absent from effects.
- Glitch-Witch.exe: the shared twelve-Glitch cap and extra-draw exhaustion fallback appear only in description, not effects.
- System Seppuku: explicitly denies ordinary opponent destruction VP. That is a card-specific exception requiring approval, not a normal generic Drain/Destroy operation.
- Alchemic Mega versus Mega-Cache: the old evaluation identity collision is now resolved. Root replaced the cost-9 Crypto pile with source Mega-Cache (+5 Crypto) and matching art. Alchemic Mega stays a zero-cost generated Utility candidate; it was not turned into a free persistent +5 Crypto pile.
- Permanent storage does not specify invulnerability. Never infer attack immunity from Duration 99.
- Background changes and music appear as Widget effects. Audio remains deferred; media directives must not become unreviewed game effects.

## Current-content collisions

Canonical keep: Slash-Dot, Dash-Dot, Dotkrawler, Rezz-Razor, Rezz-Blade, Byte-Coin, Kilo-Coin, Vault Encryption. The latter's +100 Power can be reconciled with described Restore 100, and explicit 2 VP agrees with the user's decision; retain independent Node Power 2.

Ten provisional replacements require an explicit adaptation rather than silent overwriting: Atomic Unit and Atomic Mass are currently VP cards but source actions with durations; Chronos Cache is current repeat Crypto but source delayed Mega-Cache grant; Temporal Rift is current movement but source delayed draw; Quantum Telemetry is current weight-transfer/draw but source resource generation/+Draft; Banishing Ritual is current self-trash/Crypto but source deck filtering; Recursive Seance is current shared-Trash recovery but source repeat Crypto; Ghost Key is current choice but source hand trash/+Draft; Glitch-Witch.exe is current Duration Drain but source Glitch generation; Nyx Luna is current draw/Crypto but source explicit Backup attack. Mega-Cache now agrees exactly with the source and replaces the former Alchemic Mega market identity; that resolved collision is not an outstanding blocker.

## Proposed classification mapping, not an approved import

- Source action/attack/power/utility: likely deployable Character category, with source tags retained as semantic tags. Source power is a class label, not a numeric Node stat. Base versus Chaos pool membership needs deliberate assignment; do not treat all utility as Base when many are generated forms.
- Source encryptedVolume: likely VP category with explicit vp values; determine Node Power independently. Permanent-storage entries additionally need Duration metadata and lifecycle policy.
- Source crypto: nondeployable Crypto; explicit payout at Draft. Four source Crypto identities exceed the three active-pile requirement, so choose the active subset deliberately.
- Source widget + encryptedVolume: generated VP candidates, not seven extra ordinary VP piles.
- Source cat + utility: generated Character candidates, with explicit dead-cat rules still absent.
- Source morph: a transformation tag/state machine, not a separate deploy cost or market.
- Source glitch: generated negative-VP card; scoring supports negative numbers but deployment/category/Power are not specified.
- IDs must remain stable with explicit aliases for rezz spellings, quantum-telementry, 1337_speaker, camelCase Mary/team/Alchemist IDs and misspellings. Do not normalize into duplicate cards.

## Engine support boundaries

Already reusable: fixed draw/reshuffle, delayed OnReveal Actions, Cycle Wallet, generic Primary-first Drain/Restore with no spill/revival, static positive/negative vp metadata, four-slot Duration bank with oldest onCollapse resolution/expiry, self movement to legal open Nodes, probability transfer, shared self-Trash/recovery, local mandatory choice with explicit random timeout API, atomic market purchases, per-player Chaos stock and destination Discard.

Reusable only after extending parameters: arbitrary choice payloads (current Ghost Key choice is hardcoded); explicit Backup/both-DC targeting; data-driven probability source/destination and tier; variable duration schedules, start-of-Cycle and expiry payouts; optional versus mandatory multi-card choices; top/bottom deck acquisition; explicit permanent storage.

New substantial mechanisms: opponent hand/deck discard; scoped private hand/deck reveals; multi-card discard/trash payment; generated-card pools and limits; morph/evolution replacement/reset; cross-form state; delayed acquisition; depletion fallback; self-destruction reward exceptions; background/audio presentation events. No unsupported clause should be discarded to call a card implemented.

Duration entry versus same-boundary expiry remains an existing unresolved edge in the evaluation engine. Importing permanent and long-lived storage magnifies the need to settle that ordering rather than hiding it.

## Complete 106-card ledger

Every source ID appears exactly once below. Status is an adaptation issue class, not approval. PRIMITIVES still requires global missing-Power/classification/timing decisions; CANON means preserve current approved behavior. Generated entries remain inventoried even when excluded from ordinary market pools. Source effect clauses are recorded verbatim for comparison.

Coverage counts: ACQUIRE 1, ACTIVE_SOURCE 1, CANON 8, CHOICE 1, COLLISION 10, CONFLICT 4, DECISION 1, GENERATED 32, HAND 6, MEDIA 3, MILL 4, MORPH 5, PERMANENT 3, POOL 4, PRIMITIVES 3, RESTORE 5, RULE_EXCEPTION 1, SCHEDULE 9, TARGET 3, WEIGHT 2.

### 001. Atomic Unit — `atomic-unit`

Source: cost 2; tags `action`. Status: **COLLISION**.

Effects: +1 Action for the next 5 turns

Source action, cost 2, +1 Action for 5 turns; evaluation is VP 3, cost 4, Power 1. Needs classification/Duration/action-trigger decision.

### 002. Atomic Mass — `atomic-mass`

Source: cost 3; tags `action`. Status: **COLLISION**.

Effects: +1 Card for the next 3 turns

Source action, cost 3, draw each of 3 turns; evaluation is VP 4, cost 6, Power 4. Needs classification/Duration/draw-trigger decision.

### 003. Thorn Shadow — `thorn-shadow`

Source: cost 3; tags `action`. Status: **SCHEDULE**.

Effects: +2 Actions,+1 Crypto on 1st turn / +1 Action,+1 Crypto on 2nd turn

Different first and second turn outputs need Cycle schedule; OnReveal Actions still cannot be spent immediately.

### 004. Dash-Dot — `dash-dot`

Source: cost 3; tags `action`. Status: **CANON**.

Effects: +2 Actions / +1 Card

Source gives +2 Actions; canonical gives +1 Action. Keep cost 3, Power 2, +1 Card/+1 Action.

### 005. Slash-Dot — `slash-dot`

Source: cost 4; tags `action`. Status: **CANON**.

Effects: +3 Cards

Source cost 4/+3 Cards agrees; retain canonical Node Power 3 absent from JSON.

### 006. The Inbetweener — `the-inbetweener`

Source: cost 4; tags `action`. Status: **DECISION**.

Effects: +2 Actions  OR   +2 Cards / +1 Draft / +1 Crypto

Description says randomized either Actions or Cards; effect OR alone does not specify random versus choice. Preserve description as unresolved random distribution; also weight tier/target.

### 007. Wave Card — `wave-card`

Source: cost 0; tags `action`. Status: **CONFLICT**.

Effects: +2 Actions / +1 Draft / +1 Crypto

Description only +2 Actions; effects also +1 Draft/+1 Crypto. Cost 0 and name imply possible generated form but no generator/link explicitly states it.

### 008. Particle Card — `particle-card`

Source: cost 0; tags `action`. Status: **CONFLICT**.

Effects: +2 Cards / +1 Draft / +1 Crypto

Description only +2 Cards; effects also +1 Draft/+1 Crypto. Cost 0 and relationship to Wave Card need generated/market policy.

### 009. Dotkrawler — `dotkrawler`

Source: cost 4; tags `action`. Status: **CANON**.

Effects: +2 Actions / +1 Card / +1 Draft

Source cost 4, +2 Actions/+1 Card/+1 Draft and no Crypto conflicts with canonical cost 3, Power 1, +1 Card/+1 Action/+1 Crypto.

### 010. Quantum Telemetry — `quantum-telementry`

Source: cost 5; tags `action`. Status: **COLLISION**.

Effects: +2 Actions / +1 Draft / +2 Crypto

Source cost 5, +2 Actions/+1 Draft/+2 Crypto; evaluation cost 3, Power 2, highest-weight transfer 5%/+1 Card. Source ID spelling differs from evaluation quantum-telemetry; needs alias plus retention policy.

### 011. Byte Drone — `byte-drone`

Source: cost 5; tags `action`. Status: **SCHEDULE**.

Effects: +2 Crypto for the next 3 turns

+2 Crypto for next 3 turns needs full-Cycle span and payment trigger; cannot assume current onCollapse Duration means same behavior.

### 012. Recursive Seance — `recursive-seance`

Source: cost 5; tags `action`. Status: **COLLISION**.

Effects: +1 Crypto for the next 6 turns

Source cost 5, +1 Crypto for 6 turns; evaluation cost 3 recovers shared Trash. Preserve useful recovery only by explicit adaptation/variant policy.

### 013. Cowl Obscyra — `cowl-obscyra`

Source: cost 5; tags `action`. Status: **CONFLICT**.

Effects: +1 Action / +2 Cards

Description +2 Actions/+1 Card; effects +1 Action/+2 Cards. Direct numerical contradiction, neither field silently wins.

### 014. Infernal Kernel — `infernal-kernel`

Source: cost 6; tags `action`. Status: **WEIGHT**.

Effects: +1 Action / +1 Card / +1 Draft / +1 Crypto

Primitive Actions/draw/Crypto supported; +1 Draft still needs approved probability tier and source/destination.

### 015. The Tesseract Magi — `the-tesseract-magi`

Source: cost 6; tags `action`. Status: **SCHEDULE**.

Effects: +1 Card for the next 6 turns

Draw 1 for next 6 turns needs Cycle span and draw timing; requires repeated draw lifecycle support beyond current Collapse-only duration examples.

### 016. Root Rune — `root-rune`

Source: cost 7; tags `action`. Status: **PRIMITIVES**.

Effects: +2 Actions / +3 Cards

+2 Actions/+3 Cards supported after Node Power and reveal timing decisions.

### 017. Astra Ascii — `astra-ascii`

Source: cost 9; tags `action`. Status: **WEIGHT**.

Effects: +2 Actions / +1 Card / +1 Draft / +2 Crypto

+2 Actions/+1 Card/+2 Crypto supported; +1 Draft replacement tier/target unresolved.

### 018. The Shiva of CERN — `shiva-of-cern`

Source: cost 10; tags `action`. Status: **PRIMITIVES**.

Effects: +1 Action / +4 Cards / +2 Crypto

+1 Action/+4 Cards/+2 Crypto supported after global decisions.

### 019. Nyx Luna — `nyx-luna`

Source: cost 2; tags `attack`. Status: **COLLISION**.

Effects: Drain -75 from your opponent's Backup Server / +1 Action

Source cost 2, explicit Backup Drain 75/+1 Action; evaluation cost 4, Power 3, +1 Card/+1 Crypto. Explicit Backup targeting requires engine extension.

### 020. Rezz Razor — `rezz-razor`

Source: cost 3; tags `attack`. Status: **CANON**.

Effects: Drain -75 / +1 Action / +1 Card

Cost and quantities agree after interpreting Drain -75 as positive damage. Normalize Rezz Razor alias to canonical Rezz-Razor; keep canonical Power 4 and clause order.

### 021. Rezz Blade — `rezz-blade`

Source: cost 4; tags `attack`. Status: **CANON**.

Effects: Drain -100 / +2 Actions / +1 Card

Cost and quantities agree after interpreting Drain -100 as positive damage. Normalize Rezz Blade alias; keep canonical Power 3 and clause order.

### 022. Invocation of the Sword — `invocation-of-the-sword`

Source: cost 4; tags `attack`. Status: **HAND**.

Effects: Opponent must discard 2 cards / Drain -100

Effects add Drain 100 beyond description's discard 2. Need whether opponent chooses, random discard, or attacking player chooses; define short-hand handling without leaking hidden identities.

### 023. Bushido.io — `bushido-io`

Source: cost 4; tags `attack`. Status: **SCHEDULE**.

Effects: Drain -100 when played, -75 for the next 3 turns. Gain +2 Crypto on 4th turn

Immediate Drain 100, next 3 turns Drain 75, +2 Crypto on fourth turn. Need whether deployment is first/fourth counted and whether final payout coincides with last tick.

### 024. Bloodlet Drone — `bloodlet-drone`

Source: cost 4; tags `attack`. Status: **SCHEDULE**.

Effects: Drain -100 for the next 8 turns

Drain 100 for next 8 turns: Cycle length/inclusion and trigger unresolved; do not rebalance long duration silently.

### 025. H3x1-D3x1 — `h3x1-d3x1`

Source: cost 5; tags `attack`. Status: **PRIMITIVES**.

Effects: Drain -250 from your opponent

Generic Drain 250 supported after global Power/timing; preserve case-sensitive artwork association separately.

### 026. 1337 Speaker — `1337_speaker`

Source: cost 5; tags `attack`. Status: **TARGET**.

Effects: Drain -200 from your opponent's Backup Server / +1 Action

Explicit Backup Drain 200/+1 Action requires card-level explicit DC targeting; ID underscore needs stable alias, not a new card.

### 027. Glitch-Witch.exe — `glitch-witch`

Source: cost 6; tags `attack`. Status: **COLLISION**.

Effects: Add a Glitch card (-1vp) to your opponent's discard pile / +1 Card / +1 Action

Source cost 6 generates -1VP Glitch in opponent Discard with +1 Card/+1 Action; evaluation cost 5 Duration 3/Drain 50. Description alone adds a shared limit 12 and extra draw once exhausted; needs generated pool/fallback handling.

### 028. The Qubit Kid — `qubit-kid`

Source: cost 5; tags `attack`. Status: **HAND**.

Effects: Choose a card from your opponent's hand to discard

Effects choose opponent hand card to discard, requiring explicit permitted hand visibility and who makes choice. Description says next Runtime, effects do not state delay.

### 029. Chrome Mitchell — `chrome-mitchell`

Source: cost 7; tags `attack`. Status: **TARGET**.

Effects: Drain -200 from both of your opponent's Servers

Drain 200 from both opposing DCs requires two-target card resolution and defined simultaneous/sequential destruction accounting.

### 030. Mary Mallon — `mary-mallon`

Source: cost 8; tags `attack`. Status: **MORPH**.

Effects: Mary deals exponential damage each time she's played. Draining from -75 up to -600 power

Progression 75 to 600 implies Mary Malice/Malware/Typhoid forms, but exact transformation moment, ownership/history scope, replacement zone and final-state behavior are unstated.

### 031. Mary Malice — `maryMalice`

Source: cost 0; tags `attack`. Status: **GENERATED**.

Effects: Drain -150 / Mary is changing. Do you see?

Cost 0, Drain 150; generated evolution step candidate, not an approved free market pile. No executable evolution rule in flavor clause.

### 032. Mary Malware — `maryMalware`

Source: cost 0; tags `attack`. Status: **GENERATED**.

Effects: Drain -300 / Mary is becoming. Do you see?

Cost 0, Drain 300; same Mary progression/deck-replacement questions.

### 033. Typhoid Mary — `typhoidMary`

Source: cost 0; tags `attack`. Status: **GENERATED**.

Effects: Drain -600 / Mary is reborn. Do you see?

Cost 0, Drain 600; final Mary form/reset/replay behavior missing.

### 034. ∆-Wave — `delta-wave`

Source: cost 9; tags `attack`. Status: **TARGET**.

Effects: Drain -300 from both of your opponent's Servers

Drain 300 from both opposing DCs requires explicit both-target operation; source ∆-Wave name preserved.

### 035. System Seppuku — `system-seppuku`

Source: cost 23; tags `attack`. Status: **RULE_EXCEPTION**.

Effects: Destroy your own backup server and deny your enemy of claiming its points

Explicit self-Backup destruction denies enemy destruction VP, conflicting with ordinary destruction awards unless adopted as a card exception; game-ending consequences and scoring ordering need approval.

### 036. Sudo Demiurge — `sudo-demiurge`

Source: cost 5; tags `power`. Status: **MILL**.

Effects: Opponent discards the top card from their deck / Drain -175 / +1 Action

Opponent top-deck discard plus Drain 175/+1 Action needs mill operation and empty-deck/reshuffle semantics; not discard from hand.

### 037. Cicada 3301 — `cicada-3301`

Source: cost 6; tags `power`. Status: **MILL**.

Effects: Opponent discards top 2 cards / Drain -100 / +300 Power

Opponent mills 2, Drain 100, +300 Power; description identifies own DC integrity. Need generic Restore mapping and mill edge handling.

### 038. Skinwalker — `skinwalker`

Source: cost 6; tags `power`. Status: **MORPH**.

Effects: Morphs into a powerful form, draining between 75-300 power from your opponent.

Randomly becomes one of five named animal forms; distribution, transformation timing, duration/reset, instance preservation and resulting category/Power unstated.

### 039. Leviathan Form — `leviathan-form`

Source: cost 0; tags `power`. Status: **GENERATED**.

Effects: Drain -300

Cost 0, Drain 300. Treat as Skinwalker form candidate; not direct free purchase pending generated policy.

### 040. Spider Form — `spider-form`

Source: cost 0; tags `power`. Status: **GENERATED**.

Effects: Drain -100 / +1 Action / +2 Cards

Cost 0, Drain 100/+1 Action/+2 Cards; primitive payload, transformation framework missing.

### 041. Wasp Form — `wasp-form`

Source: cost 0; tags `power`. Status: **GENERATED**.

Effects: Drain -75 / +2 Actions / +1 Card

Cost 0, Drain 75/+2 Actions/+1 Card; same framework.

### 042. Viper Form — `viper-form`

Source: cost 0; tags `power`. Status: **GENERATED**.

Effects: Drain -150 / +1 Action / +1 Card

Cost 0, Drain 150/+1 Action/+1 Card; same framework.

### 043. Wolf Form — `wolf-form`

Source: cost 0; tags `power`. Status: **GENERATED**.

Effects: Drain -200 / +1 Draft / +1 Crypto

Cost 0, Drain 200/+1 Draft/+1 Crypto; generated framework plus weight tier/target.

### 044. Subroutine Succubus — `subroutine_succubus`

Source: cost 6; tags `power`. Status: **MILL**.

Effects: Opponent discards 1 from deck / Drain -150 / +150 Power / +2 Crypto

Opponent mills 1, Drain 150/+150 Power/+2 Crypto; Restore interpretation and mill operation needed.

### 045. Iterative Incubus — `iterative-incubus`

Source: cost 7; tags `power`. Status: **SCHEDULE**.

Effects: Drain -150, +150 Power, +1 Action, +1 Crypto for the next 4 turns

Four-turn repeating Drain 150/+150 Power/+1 Action/+1 Crypto needs mixed duration schedule, Restore mapping and Action availability timing.

### 046. Node Feratu — `node-feratu`

Source: cost 7; tags `power`. Status: **RESTORE**.

Effects: Drain -225 / +225 Power / +1 Action

Drain 225/+225 Power/+1 Action needs approval that Power means own DC Restore, never +225 Node Power.

### 047. The Azimuthal Kill — `the-azimuthal-kill`

Source: cost 8; tags `power`. Status: **SCHEDULE**.

Effects: Drain -200 when played,-25 for next 4 turns, and drain -450 from Backup on the 5th turn

Immediate Drain 200, next 4 turns Drain 25, Backup Drain 450 on fifth turn; define span and overlap of delayed final tick, plus explicit target.

### 048. Tihkal Hound — `tihkal-hound`

Source: cost 9; tags `power`. Status: **SCHEDULE**.

Effects: Drain -300 when played, -150 for next 3 turns, and +3 Crypto on 3rd turn.

Immediate Drain 300, next 3 turns Drain 150, +3 Crypto on third turn; third-turn payout relative to deployment/last tick ambiguous.

### 049. Veil of Cthulhu — `veil-of-cthulhu`

Source: cost 12; tags `power`. Status: **MILL**.

Effects: Opponent discards top 2 cards / Drain -600 / +300 Power

Opponent mills 2, Drain 600/+300 Power; large damage is source data, not balance approval; mill and Restore interpretation needed.

### 050. Night Scythe — `night-scythe`

Source: cost 2; tags `utility`. Status: **HAND**.

Effects: Trash 1 card from your hand

Trash one own hand card requires generic hand targeting/choice and shared Trash transfer; current trashSelf is insufficient.

### 051. Superpositioning — `superpositioning`

Source: cost 2; tags `utility`. Status: **HAND**.

Effects: You may discard 3 cards from your hand. If you do, draw 3 cards / +1 Action

Optional discard exactly 3 then draw 3, with +1 Action only in effects. Need field precedence, optional cost payment, insufficient-hand handling and own-hand multi-choice.

### 052. Summon the Acolytes — `summon-the-acolytes`

Source: cost 3; tags `utility`. Status: **HAND**.

Effects: Draw 4 cards, then discard any 3 cards from your hand

Draw 4 then choose/discard 3 own cards; ordered multi-step mandatory hand choice, with insufficient-card behavior.

### 053. Temporal Rift — `temporal-rift`

Source: cost 3; tags `utility`. Status: **COLLISION**.

Effects: Goes into storage. Draw 4 cards at the start of your 4th turn.

Source delayed draw 4 at start of fourth turn; evaluation moves itself between Nodes. Same cost 3 but entirely different mechanic; source needs delayed start-of-Cycle scheduling.

### 054. Ghost Key — `ghost-key`

Source: cost 4; tags `utility`. Status: **COLLISION**.

Effects: Trash 1 Card from your hand / +1 Draft / +1 Crypto

Source cost 4: trash own hand card/+1 Draft/+1 Crypto; evaluation cost 2 resource-or-draw choice. Needs hand target, weight policy and explicit retention decision.

### 055. Banishing Ritual — `banishing-ritual`

Source: cost 4; tags `utility`. Status: **COLLISION**.

Effects: Look at the top 5 cards of your deck. You may discard any of them / +1 Action

Source cost 4 peeks top 5, optionally discards any, +1 Action only in effects; evaluation cost 2 +3 Crypto/trashSelf. Needs private peek, selected discards and remaining-order rule.

### 056. Opulent Void — `opulent-void`

Source: cost 4; tags `utility`. Status: **CONFLICT**.

Effects: Trash up to 3 cards from your hand (choose 1-3)

Effects say both up to 3 and choose 1–3; minimum 0 versus 1 unresolved. Own-hand multi-trash mechanic needed.

### 057. Sacrifical Sigil — `sacrifical-sigil`

Source: cost 4; tags `utility`. Status: **HAND**.

Effects: You may discard 2 cards from your hand. If you do, +3 Crypto and +1 Draft

Optional discard 2 as condition for +3 Crypto/+1 Draft; description calls it a buy. Weight conversion and multi-card payment/short-hand behavior needed; preserve source misspelling via alias.

### 058. The Heisenberg Hag — `heisenberg-hag`

Source: cost 4; tags `utility`. Status: **GENERATED**.

Effects: Gain a Schrödinger's Box with either a dead cat in it, or a live cat with a unquie effect / +1 Action

Generates Cat Box plus Action; no explicit destination beyond description into deck, no deck position or live/dead odds, no exact open trigger.

### 059. Byte Heist — `byte-heist`

Source: cost 5; tags `utility`. Status: **ACQUIRE**.

Effects: Add a Byte Coin to the top of your deck / +1 Action / +1 Card

Grant Byte-Coin to top of own deck, +1 Action/+1 Card. Needs generated acquisition to top, supply bypass and exact order (top placement before draw if effects authoritative).

### 060. Cypto Alchemist — `cyptoAlchemist`

Source: cost 5; tags `utility, morph`. Status: **MORPH**.

Effects: Moprhs into +1, +2, +3 or +5 Crypto

Morphs to +1/+2/+3/+5 Crypto, resets every turn; probabilities, reveal timing, type change, reset window and whether effects pay at reveal versus Draft need decisions.

### 061. Code Sniper — `code-sniper`

Source: cost 6; tags `utility`. Status: **CHOICE**.

Effects: Choose one: +2 Actions, +2 Cards, or +2 Crypto

Three-way own choice +2 Actions/+2 Cards/+2 Crypto needs data-driven option payloads; current choice primitive hardcodes only +2 Crypto or +1 Card.

### 062. Kilo Cycle — `kilo-cycle`

Source: cost 7; tags `utility`. Status: **SCHEDULE**.

Effects: Goes into storage. Add a Kilo-Coin to the top of your deck after your 3rd turn

Storage then grant Kilo-Coin to top of deck after third turn; Cycle mapping and delayed end trigger; generated top-deck acquisition needed.

### 063. Entropic Infantry — `entropic-infantry`

Source: cost 8; tags `utility, morph`. Status: **MORPH**.

Effects: Cycles between team Alpha, Bravo, and Charlie. Each team offers a choice-based effect

Cycles Alpha/Bravo/Charlie each with choice; starting form, cycle trigger, instance replacement and resetting are unstated.

### 064. Chronos Cache — `chronos-cache`

Source: cost 9; tags `utility`. Status: **COLLISION**.

Effects: Goes into storage. Add a Mega-Cache to the top of your deck, after your 3rd turn

Source cost 9 grants Mega-Cache to top after third turn; evaluation cost 3 Duration 2/onCollapse +1 Crypto. Source requires delayed grant; preserve useful bank mechanic only through explicit adaptation.

### 065. Merchant of Chaos — `merchant-of-chaos`

Source: cost 12; tags `utility`. Status: **GENERATED**.

Effects: Add a random Widget (1VP) to the bottom of your deck. Each Widget has a unique effect

Random Widget worth 1VP to bottom of deck (effects precise, description only says deck). Need pool of seven, distribution, acquisition timing and generated-copy behavior.

### 066. Alchemic Shyte — `alchemic-shyte`

Source: cost 0; tags `utility`. Status: **GENERATED**.

Effects: +1 Crypto

Cost 0 utility form +1 Crypto; likely Cypto Alchemist outcome, not normal Crypto pile. Resolve form lifecycle/trigger.

### 067. Alchemic Byte — `alchemic-byte`

Source: cost 0; tags `utility`. Status: **GENERATED**.

Effects: +2 Crypto

Cost 0 utility form +2 Crypto; same lifecycle/trigger.

### 068. Alchemic Kilo — `alchemic-kilo`

Source: cost 0; tags `utility`. Status: **GENERATED**.

Effects: +3 Crypto

Cost 0 utility form +3 Crypto; same lifecycle/trigger.

### 069. Alchemic Mega — `alchemic-mega`

Source: cost 0; tags `utility`. Status: **GENERATED**.

Effects: +5 Crypto

Source cost 0 utility morph form +5 Crypto. The old evaluation market collision has been corrected: the priced pile is now Mega-Cache. Alchemic Mega remains an unimplemented generated Utility candidate, not a free persistent pile.

### 070. Alpha Team — `alphaTeam`

Source: cost 0; tags `utility`. Status: **GENERATED**.

Effects: Choose: +2 Actions & +1 Card or +1 Draft & +2 Crypto

Cost 0 team form: +2 Actions/+1 Card OR +1 Draft/+2 Crypto. Multi-effect options plus weight policy and Entropic Infantry lifecycle needed.

### 071. Bravo Team — `bravoTeam`

Source: cost 0; tags `utility`. Status: **GENERATED**.

Effects: Choose: +1 Action & +2 Cards or +3 Crypto

Cost 0 team form: +1 Action/+2 Cards OR +3 Crypto. Compound choice framework and form lifecycle needed.

### 072. Charlie Team — `charlieTeam`

Source: cost 0; tags `utility`. Status: **GENERATED**.

Effects: Choose: +3 Cards or Drain -150

Cost 0 team form: +3 Cards OR Drain 150. Choice framework and form lifecycle needed.

### 073. Shyte-Coin — `shyte-coin`

Source: cost 0; tags `crypto`. Status: **POOL**.

Effects: +1 crypto

Cost 0 Crypto +1. Unlike form cards, explicitly Crypto; decide whether market includes it and whether unlimited zero-cost buying is intended. Not silently eligible for every generated/free pool.

### 074. Byte-Coin — `byte-coin`

Source: cost 3; tags `crypto`. Status: **CANON**.

Effects: +2 crypto

Cost 3, +2 Crypto agrees; preserve nondeployable Crypto and current starter copies.

### 075. Kilo-Coin — `kilo-coin`

Source: cost 6; tags `crypto`. Status: **CANON**.

Effects: +3 crypto

Cost 6, +3 Crypto agrees; preserve nondeployable Crypto.

### 076. Mega-Cache — `mega-cache`

Source: cost 9; tags `crypto`. Status: **ACTIVE_SOURCE**.

Effects: +5 crypto

Cost 9 Crypto +5, nondeployable, no Node Power required. Root has safely adopted this exact definition and matching Crypto art in place of the provisional Alchemic Mega market pile.

### 077. Basic Encryption — `basic-encryption`

Source: cost 2; tags `encryptedVolume`. Status: **RESTORE**.

Effects: 1vp / +50 Power

Cost 2, VP 1/+50 Power; likely Restore 50 per description. Node Power absent, not VP count or healing amount.

### 078. Vault Encryption — `vault-encryption`

Source: cost 3; tags `encryptedVolume`. Status: **CANON**.

Effects: 2vp / +100 Power

Cost 3, VP 2 and described Restore 100 agree with current canon after +Power terminology conversion; retain Node Power 2 from canon.

### 079. Quantum Archive — `quantum-archive`

Source: cost 5; tags `encryptedVolume`. Status: **RESTORE**.

Effects: 3vp / +150 Power

Cost 5, VP 3/+150 Power; needs Restore mapping and independent Node Power assignment.

### 080. BIOS Archive — `bios-archive`

Source: cost 6; tags `encryptedVolume`. Status: **PERMANENT**.

Effects: 4vp / +75 Power per turn / Permanent storage

VP 4, permanent storage, +75 Power per turn. Needs Duration 99/full-Cycle timing, bank-entry behavior, generic Restore mapping; do not grant unstated invulnerability.

### 081. Esoteric Encryption — `esoteric-encryption`

Source: cost 8; tags `encryptedVolume`. Status: **RESTORE**.

Effects: 6vp / +150 Power

Cost 8, VP 6/+150 Power; primitive payload after Restore/Node Power decisions.

### 082. Neural Wetware — `neural-wetware`

Source: cost 8; tags `encryptedVolume`. Status: **PERMANENT**.

Effects: 6vp / +75 Power per turn / Permanent storage

VP 6, permanent storage, +75 Power per turn; same permanent-bank lifecycle/trigger questions.

### 083. Zenith Worx — `zenith-worx`

Source: cost 11; tags `encryptedVolume`. Status: **RESTORE**.

Effects: 8vp / +300 Power

Cost 11, VP 8/+300 Power; description says when played, not permanent storage. Do not confuse with Zenith Wetware.

### 084. Zenith Wetware — `zenith-wetware`

Source: cost 11; tags `encryptedVolume`. Status: **PERMANENT**.

Effects: 8vp / +100 Power per turn / Permanent storage

VP 8, permanent storage, +100 Power per turn; exact permanent-bank behavior needed.

### 085. Schrödinger's Cat Box — `schrodinger-box`

Source: cost 0; tags `utility`. Status: **MORPH**.

Effects: what's in the box?

Cost 0 utility, effect is only what's in the box? No executable rule, open trigger, randomness or post-opening destination.

### 086. Cat Attack — `cat-attack`

Source: cost 0; tags `cat, utility`. Status: **GENERATED**.

Effects: Drain -150

Cost 0 cat/utility, Drain 150; requires Cat Box distribution and generated category/Node Power.

### 087. Big Cat — `big-cat`

Source: cost 0; tags `cat, utility`. Status: **GENERATED**.

Effects: +1 Action / +1 Card / +1 Crypto / +100 Power

Cost 0 cat/utility, +1 Action/+1 Card/+1 Crypto/+100 Power; Restore meaning and Cat Box lifecycle.

### 088. Mad Cat — `mad-cat`

Source: cost 0; tags `cat, utility`. Status: **GENERATED**.

Effects: +1 Action / +2 Cards

Cost 0 cat/utility, +1 Action/+2 Cards; primitives after generated framework.

### 089. Cat Pounce — `cat-pounce`

Source: cost 0; tags `cat, utility`. Status: **GENERATED**.

Effects: +1 Action / Drain -50

Cost 0 cat/utility, +1 Action/Drain 50; primitives after generated framework.

### 090. Cat Run — `cat-run`

Source: cost 0; tags `cat, utility`. Status: **GENERATED**.

Effects: +1 Draft / +2 Crypto

Cost 0 cat/utility, +1 Draft/+2 Crypto; generated framework and weight policy.

### 091. Cat Hack — `cat-hack`

Source: cost 0; tags `cat, utility`. Status: **GENERATED**.

Effects: +1 Action / +1 Card

Cost 0 cat/utility, +1 Action/+1 Card; primitives after generated framework.

### 092. Dead Cat 01 — `dead-cat-01`

Source: cost 0; tags `cat, utility`. Status: **GENERATED**.

Effects: I'm dead

Cost 0 dead-cat variant, flavor-only I'm dead. No specified Power, VP, penalty, discard/trash behavior or difference from other dead cats.

### 093. Dead Cat 02 — `dead-cat-02`

Source: cost 0; tags `cat, utility`. Status: **GENERATED**.

Effects: I'm dead

Same dead-cat rule gap; retain distinct source identity rather than silently merge.

### 094. Dead Cat 03 — `dead-cat-03`

Source: cost 0; tags `cat, utility`. Status: **GENERATED**.

Effects: I'm dead

Same dead-cat rule gap; retain distinct source identity rather than silently merge.

### 095. Dead Cat 04 — `dead-cat-04`

Source: cost 0; tags `cat, utility`. Status: **GENERATED**.

Effects: I'm dead

Same dead-cat rule gap; retain distinct source identity rather than silently merge.

### 096. Quark Widget — `quark`

Source: cost 0; tags `widget, encryptedVolume`. Status: **GENERATED**.

Effects: 1vp / +1 Action

Cost 0 Widget/VP 1, +1 Action. Generated by Merchant; deployment type and Node Power require policy.

### 097. Charm Quark Widget — `charm-quark`

Source: cost 0; tags `widget, encryptedVolume`. Status: **MEDIA**.

Effects: 1vp / +1 Card / Sets Background

Widget VP 1/+1 Card plus Sets Background. Separate cosmetic trigger from rules; background asset/availability unclear; not permission to obscure board.

### 098. Tachyon Widget — `tachyon`

Source: cost 0; tags `widget, encryptedVolume`. Status: **GENERATED**.

Effects: 1vp / +1 Action / +1 Card

Widget VP 1/+1 Action/+1 Card; generated acquisition and classification policy.

### 099. Neutrino Widget — `neutrino`

Source: cost 0; tags `widget, encryptedVolume`. Status: **GENERATED**.

Effects: 1vp / +1 Crypto

Widget VP 1/+1 Crypto; clarify whether Crypto grants during reveal and persists to Draft under current rules.

### 100. Tau Widget — `tau`

Source: cost 0; tags `widget, encryptedVolume`. Status: **MEDIA**.

Effects: 1vp / +1 Card / Sets Background

Widget VP 1/+1 Card plus Sets Background. Cosmetic behavior/asset mapping not specified by effect text.

### 101. Photon Widget — `photon`

Source: cost 0; tags `widget, encryptedVolume`. Status: **GENERATED**.

Effects: 1vp / +50 Power

Widget VP 1/+50 Power; generated framework plus Restore interpretation.

### 102. Strange Quark Widget — `strange-quark`

Source: cost 0; tags `widget, encryptedVolume`. Status: **MEDIA**.

Effects: 1vp / +1 Card / Plays Song

Widget VP 1/+1 Card plus Plays Song. Audio is currently deferred; no source soundtrack/provenance or authorization to reactivate audio implied by a mechanics import.

### 103. Razor Blade Jade — `razor-blade-jade`

Source: cost 0; tags `attack`. Status: **POOL**.

Effects: Drain -100 from both Servers / +1 Action / +1 Card

Cost 0 attack with both-DC Drain 100/+1 Action/+1 Card; no generator relation supplied. Needs availability decision and both-target operation; do not create free attack pile.

### 104. Dit Bot — `dit-bot`

Source: cost 0; tags `utility`. Status: **POOL**.

Effects: Draw 2 for the next 4 turns

Cost 0 utility, draw 2 for next 4 turns. No generator relation; availability plus Duration schedule required.

### 105. The Owl King — `owl-king`

Source: cost 0; tags `utility`. Status: **POOL**.

Effects: +100 Power / Drain -300 / +1 Action / +1 Card / +4 Crypto

Cost 0 utility +100 Power/Drain 300/+1 Action/+1 Card/+4 Crypto. No generator relation; availability, Restore and Node Power decisions required.

### 106. Glitch — `glitch`

Source: cost 0; tags `glitch`. Status: **GENERATED**.

Effects: -1 VP

Cost 0 glitch, -1 VP. Negative VP scoring primitive exists, but category, deployability, Node Power, shared 12-card pool and exhausted-pool fallback require explicit content definition.

## Audit boundary

No engine, approved rule, source definition or source JSON was modified by this audit. All 106 entries are accounted for. Unsupported entries are inventoried with a named blocking decision or required mechanism, not silently imported as inert cards or silently dropped.
