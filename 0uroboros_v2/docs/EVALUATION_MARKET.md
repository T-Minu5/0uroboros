# Playable historic catalog and retained evaluation market

The user authorized activation of the ordinary historic catalog for testing. This is a playable adaptation, not final balance. `assets/card_art/cards.json` remains the original mechanics/text source; its artwork references were normalized separately. Videos and audio are not activated.

## Coverage and identity

`src/historicCatalog.ts` admits **65 of the 106 historic definitions** and explicitly accounts for the other **41** as morph/evolution generators, their derived forms, Cats, Widgets, related generators, and the generated Glitch mechanic. No ordinary action, utility, attack, Hacker, Crypto, VP, or runtime-hack definition is silently omitted. Wave Card, Particle Card and the zero-cost runtime-hack cards remain eligible because the supplied source does not establish them as excluded generated forms.

`EVALUATION_ALL_CARDS` in `src/evaluationMarket.ts` contains **74 definitions**: the 65 originals plus nine retained evaluation identities. Historic id, name, printed cost, original description, original effects metadata and assigned artwork remain exact. Inspect can retrieve original metadata through `HISTORIC_SOURCE_METADATA[definitionId]`. Conflicting original fields remain available for reference; the description governs direct contradictions, while effects add non-contradictory omitted clauses.

The retained identities use the supplied placeholder, not historic art:

- Dash Relay: former canonical Dash-Dot, unchanged +1 Card/+1 Action, Power 2, cost 3.
- Cache Crawler: former canonical Dotkrawler, unchanged +1 Card/+1 Action/+1 Crypto, Power 1, cost 3.
- Cycle Cache: former evaluation Chronos Cache, unchanged two-Cycle duration and +1 Crypto on collapse.
- Phase Runner: former evaluation Temporal Rift, unchanged move-to-open-Node effect.
- Signal Surveyor: former evaluation Quantum Telemetry, now the approved transfer of one own Power between neighboring Nodes, followed by +1 Card.
- Burn Ledger: former evaluation Banishing Ritual, unchanged +3 Crypto then self-trash.
- Salvage Relay: former evaluation Recursive Seance, unchanged shared-Trash recovery.
- Forked Signal: former evaluation Ghost Key, unchanged +2 Crypto/+1 Card choice.
- Persistent Leech: former evaluation Glitch-Witch, unchanged three-Cycle duration and Drain 50 on collapse.

Original Dash-Dot, Dotkrawler, Chronos Cache, Temporal Rift, Quantum Telemetry, Banishing Ritual, Recursive Seance and Ghost Key retain their old names and original source mechanics. Original Glitch-Witch is excluded with its generated Glitch system; its retained evaluation mechanic has a distinct name.

## Draft and catalog access

Normal Draft keeps four persistent Base piles: Slash-Dot, Dash Relay, Cache Crawler and Cycle Cache. Each Cycle adds two rotating offers from the full remaining Base pool and three distinct Chaos offers from the combined attack/Hacker pool. Base cards use shared supply; each Chaos offer permits two copies per player. Core supply persists; rotating offers refresh. Ordinary buys enter Discard and retain the two-second per-player/per-pile cooldown.

The normal persistent VP shelf remains Basic Encryption, Vault Encryption and Quantum Archive. The normal Crypto shelf remains Byte-Coin, Kilo-Coin and Mega-Cache. All eight historic VP definitions and all four Crypto definitions are exported in the full catalog, including Shyte-Coin, permanent-storage VP cards and the high-cost VP cards, for explicit catalog testing. This preserves normal Draft composition rather than flooding it with every definition simultaneously.

## Numeric and rules adaptation

Previously assigned Node Power stays unchanged for already-live identities. Newly introduced Characters use the approved `ceil(cost / 2)` clamped to 1–5. Newly introduced VP cards use their scoring VP as Node Power. Crypto has no Node Power. Historic positive Power effects are Data Center restoration, not large Node Power bonuses.

Old +1/+2/+3 Draft clauses become transfers of 1/2/3 of the acting player's existing Power between the played Node and one linear adjacent Node, in either legal direction. Total own Power is conserved; opponent Power is never transferred; there is no wraparound. Legacy 5/10/15% evaluation effects map to 1/2/3 own Power. Circuit selection and priority no longer rely on Node weights. Original printed +Draft text stays available alongside the adaptation note.

Historic schedules count **Runtime turns**, including boundaries between Cycles. Retained Cycle Cache and Persistent Leech continue to count **Cycles**, preserving their earlier mechanics. Schedule age 1 is the deployment Runtime; age 2 is the next Runtime after hand refill. Explicit “next N turns” means N future ticks. Plain “for N turns” includes deployment. Start/end wording is retained.

Notable exact decisions:

- Atomic Unit: +1 Action on deployment and turns 2–5; its description says stored for five turns. Atomic Mass similarly draws on turns 1–3. Their effects arrays say “next,” but the description is authoritative.
- Recursive Seance: +1 Crypto on turns 1–6. Bloodlet Drone: Drain 100 on turns 1–8. Their descriptions similarly govern the conflicting “next” in effects arrays.
- Byte Drone: three future Crypto ticks, turns 2–4. Tesseract Magi: six future draw ticks, turns 2–7. Dit Bot: four future draw ticks, turns 2–5.
- Temporal Rift draws four at the start of turn 4. Kilo Cycle and historic Chronos Cache acquire their named coin to the top of Draw at the end of turn 3.
- Bushido IO drains 100 immediately, drains 75 on turns 2–4 and grants +2 Crypto at the end of turn 4.
- Azimuthal Kill drains 200 immediately, then 25 on turns 2–5; turn 5 also drains 450 from Backup. Tihkal Hound drains 300 immediately, 150 on turns 2–4 and grants +3 Crypto on turn 3. These overlapping numbered payouts preserve the literal approved interpretation.
- The Qubit Kid schedules a scoped opponent-hand discard choice for the next Runtime after refill; the attacking owner chooses.
- Cowl Obscyra follows its description: +2 Actions/+1 Card. The contradictory source effects remain visible as original metadata.
- Opulent Void chooses 1–3 hand cards when available. Superpositioning permits declining the exact three-card discard payment; its additional +1 Action is retained from the non-contradictory effects array.
- Permanent-storage VP cards remain indefinite until displaced under the bank rules; no immunity is inferred.

## Validation and source limitations

`tests/historicCatalog.test.ts` accounts for all 106 source IDs exactly once, preserves original identity/cost/text/art, checks all retained identities use placeholder art, enforces offer composition, validates Power defaults and schedule/gain references, and checks each admitted +Draft clause becomes a Power transfer. `scripts/normalize-card-art.mjs --check` validates repeatable artwork normalization. Runtime primitive and per-card tests live in the rules suite.

Source art is preserved even when its baked lettering disagrees with source mechanics. In particular, Zenith Worx and Zenith Wetware reference files named `10vp` while their source effects specify **8 VP**. The engine follows the original effects value; this visual mismatch is a source-content issue, not permission to invent or replace art. Browser coverage and balance conclusions must be reported separately from static catalog and engine coverage.
