# LookDev boundary

LookDev / Motion is an advisory Terra specialist. It proposes visual language, motion, and presentation. It does not implement, mutate assets, or change rules.

Default budgets: `MAX_LOOKDEV_CALLS=1`, 5 findings, 5 recommendations, 3 concept alternatives. LookDev also counts against specialist and total agent calls.

## Handoff

Research produces bounded visual evidence.

Astra / the harness assembles a `VisualReferencePacket` plus a bounded first-party asset packet from `assets/` (or `../assets` when that tree contains `card_art`).

Before sending a LookDev assignment, the harness resolves gameplay concepts in the objective (`Drain`, `Restore`, `Wave Collapse`, `priority`, `Data Center` destruction, `Draft` purchase) and attaches only the matching current canonical excerpts, Game Contract fields, and Game Events. Missing those excerpts is `CONTEXT_OMISSION`, a packet-assembly defect. It is not `RULE_AMBIGUITY` and it does not retry a paid specialist call.

Approved design tokens are sent as resolved values (`token_id`, `token_type`, `name`, `value`, `usage`, `constraints`, `canonical_id`). Palette IDs include hex. Inter and Orbitron include family/style usage. Semantic color-to-gameplay mapping is not implied.

If the objective does not name a character, included card art is `REPRESENTATIVE_REFERENCE` or omitted. Named characters are `IDENTITY_SPECIFIC`. Uncertain icon filename associations stay `UNCERTAIN`.

LookDev receives that packet. Research does not instruct LookDev.

The packet is not the full Resource Library and not the full asset folder.

## Authority

For visual-design interpretation:

1. Canonical UX / LookDev / design requirements
2. First-party 0uroboros visual assets and Mel-authored project guidance (`FIRST_PARTY_VISUAL_ASSET`)
3. Harness-verified project implementation evidence
4. User-curated reference guidance (how a reference should be used)
5. External visual/reference evidence
6. Model claim

A first-party asset cannot override a gameplay rule. Existing Rezz-Razor art informs Rezz-Razor presentation. It cannot change Rezz-Razor mechanics.

Usage classifications such as `VISUAL_QUALITY_BENCHMARK` or `TECHNIQUE_REFERENCE` are not authority.

A visual reference does not become a design requirement unless Mel promotes a derived decision.

`USER_CURATED_REFERENCE_GUIDANCE` does not override canonical rules.

Stats UI files under `assets/Icons/` are first-party UI references, not automatic UX requirements. UX owns information hierarchy. LookDev owns presentation, motion, and polish.

Icons are first-party design-system input. They do not redefine gameplay. Critical information must not rely on color alone.

## Visual reference vs technique reference

A visual reference shows a quality, motion, or feeling that is desirable. Marvel Snap gameplay is a visual and motion quality benchmark. It is not a replacement identity for existing 0uroboros card art.

A technique reference shows a possible technical method. Three.js EffectComposer is a technique reference. A CodePen card is an interaction and card-rendering technique reference. The singularity demo is both visual and shader technique.

LookDev may recommend a technique as `TECHNIQUE_RECOMMENDATION`. Engineering decides whether the implementation is technically appropriate.

## Theatrics tiers

- Tier 1: subtle / local
- Tier 2: card / Node scale
- Tier 3: major board-space event
- Tier 4: cinematic / global

Wave Collapse is the strongest cinematic candidate. Singularity plus liquid-wave is a promising bespoke 0uroboros direction, not a copy target. Readability is mandatory. LookDev never selects the Node or match outcome.

## LookDev may

- propose visual language
- propose motion
- propose shader / effect techniques
- propose phase / reveal / Collapse presentation
- map authoritative Game Events to Presentation Events
- integrate first-party art and icons into UI treatments
- use approved visual references as technique or inspiration
- create visual specifications

## LookDev may not

- determine gameplay outcome
- invent Game Contract state
- create card mechanics
- change rules
- rename approved characters
- replace existing first-party card art because an external reference looks different
- treat reference-game behavior as 0uroboros behavior
- modify first-party assets
- modify production code
- execute shaders or WorkPackages
- invoke Astra, specialists, or Reviewer
- override UX information hierarchy
- copy exact visual expression

## Anti-imitation

Every visual-reference record carries `usage_constraints`:

- study principles and techniques
- do not recreate exact animation sequences
- do not reproduce another game's visual identity
- do not copy card art
- do not copy exact layouts
- do not reuse proprietary UI expression
- do not lift code blindly from examples
- remaining work stays native to Cyberpunk + Quantum Physics + Occult
- gameplay readability overrides spectacle

## Reviewer

Visual inspiration alone does not trigger Reviewer.

A LookDev proposal alone does not trigger Reviewer.

Reviewer still triggers only for implementation promotion, canonical mutation, high-impact architecture change, authority expansion, verified-evidence disagreement, or an explicit review request.

## Visual inspection

Visual inspection is a read-only capability, not an agent. The installed Agents SDK 0.17.0 has no native image tool. The supported seam is the OpenAI Responses API `input_image` part with a local base64 data URL.

Default routing uses the utility model (`gpt-5.6-luna`), not Astra. Batches cap at `MAX_VISUAL_ASSETS_PER_INSPECTION` (4). Observations cache by asset hash, model, and schema version. A changed file invalidates its cache entry.

Offline inspection records metadata only and does not invent pixel descriptions. Structured `FirstPartyVisualObservation` records are `FIRST_PARTY_VISUAL_ASSET` evidence. They are not lore, mechanics, biography, or faction membership.

Live inspection stays off unless `VISUAL_INSPECTION_LIVE=true` or `npm run swarm:inspect-visuals`. Do not enable it for ordinary LookDev or creative swarm runs. Cached observations may later inform Content and Worldbuilding packets. They still are not lore.
