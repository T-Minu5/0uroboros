# Historical Location and Circuit Reward recovery

Status update: the user explicitly approved the five-Location/three-Circuit evaluation proposal below. That subset is now implemented in `src/content.ts`; see `USER_DECISIONS.md`. This is evaluation approval, not final canon. The recovery notes below preserve the original source distinctions.

## Source status and search scope

The current `0uroboros_v3_1_clean_start/06A_CANONICAL_CONTENT_CATALOG.md` explicitly marks exact Locations and Circuit Rewards `SOURCE_REQUIRED`. Its migration rules require an authoritative prior source and approval before status changes to `APPROVED`.

The strongest exact-definition sources found are:

- `../0uroboros/src/game/content/locations.ts`: seven concrete definitions. Its first comment explicitly says **“Placeholder Location content for Phase 1.”** Each definition has a “Tests …” comment.
- `../0uroboros/src/game/content/circuitRewards.ts`: four concrete definitions. Its first comment explicitly says **“Placeholder Circuit Reward content for Phase 1.”**
- `../0uroboros/docs/phase-1-handoff.md`: explicitly describes placeholder content and recommends authoring real content in a later phase. It also documents historical implementation assumptions. Its obsolete five-window Runtime and 4/4/2 starter description demonstrate why this handoff is not current gameplay authority.

Historical approved rules specify the reward system and ordering, not these names or numbers. `../0uroboros_agent_docs_v0.1/05_TECHNICAL_REQUIREMENTS.md`, lines 93–97, explicitly defers the Location catalog/exact effects and Circuit Reward pool/exact behavior.

Content searches covered sibling V0.1 guides, V2 approved-rule/game-contract files, sibling implementation and handoff docs, content TypeScript, engine resolution code, tests referencing recovered names, the world-bible Markdown, current `0uroboros_implementation_v2`, and textual entries inside these Downloads archives without modifying or extracting over any source:

- `0uroboros_swarm_v1.zip` — 15 entries.
- `0uroboros_swarm_v1_1.zip` — 21 entries.
- `0uroboros_swarm_v2_0.zip` — 29 entries.
- `0uroboros_implementation_v3_0.zip` — 7 entries.
- `0uroboros_v3_1_clean_start_with_content_catalog.zip` — 24 entries.

The archives supplied structural rules, contracts, guidance and source-required status, but no additional exact approved Location/reward pool. The newly supplied implementation V2 guide likewise describes sequencing and presentation, not a named content catalog. Recovered fixture names also appear in tests and an effect-reference registry; those are usage evidence, not content approval.

## Exact recovered Location candidates

All seven entries below have status **HISTORICAL_IMPLEMENTATION_FIXTURE — REQUIRES MEL APPROVAL**. Their shared source is `../0uroboros/src/game/content/locations.ts`. No purchase cost is defined for a Location.

### Data exchange — `data_exchange`

Exact text: “On collapse, the winner gains 2 Crypto.”

Operation: `gainCrypto`, amount 2, target `nodeWinner`. Historical destination is the winner's Wallet for that Cycle's Draft. Historical tied outcome targets both players. Although the definition says `onCollapse`, the historical engine delays this winner-dependent reward until the final Power comparison and reward stage.

### Occult archive — `occult_archive`

Exact text: “On collapse, the winner gains 2 Victory Points.”

Operation: `gainVictoryPoints`, amount 2, target `nodeWinner`. Destination is the player's persistent earned-VP counter, not a granted VP card. Ties grant each player 2 VP. Resolves in the Location Reward stage after final Power comparison.

### Entanglement lab — `entanglement_lab`

Exact text: “On collapse, move 5% probability from this Node to the lowest Node.”

Operation: `transferProbability`, amount 5, from `thisNode`, to `lowestNode`. This is Location text at the first per-Node Collapse stage, before card effects and final Power comparison; it has no separate winner reward.

Important recovered implementation semantics: `../0uroboros/src/game/engine/probability.ts` resolves “lowest Node” as **lowest current probability**, not lowest numbered Node. Equal probabilities choose the first Node in ascending Node iteration order. If the source is itself the selected minimum, transfer is a no-op. Transfer caps at available source weight. These tie/no-op details are implementation evidence that should be explicitly accepted if adopting this exact fixture.

### Breach relay — `breach_relay`

Exact text: “On collapse, the loser takes 200 Data Center damage.”

Operation: `damageDataCenter`, amount 200, target `nodeLoser`, no explicit Data Center override. Historical implementation uses available Primary first, then Backup, with no overkill spill. A tied Node has no loser, so no target/damage. The damage is winner-dependent and therefore resolves in the reward stage after final comparison, not in initial Location text resolution.

Adoption must include proper Collapse lethal handling: finish this Node including all awards, then stop later Nodes, skip Circuit selection and Draft. The current starter-only engine does not yet implement Location-triggered lethal Collapse.

### Fabrication bay — `fabrication_bay`

Exact text: “On collapse, the winner adds a Cipher runner to their discard pile.”

Operation: `grantCard`, card definition `cipher_runner`, destination `discard`, target `nodeWinner`. Ties grant one new card to each player. Generated cards do not consume market stock.

Dependency from `../0uroboros/src/game/content/cards.ts`: Cipher runner is explicitly a fixture Character, Power 3, printed cost 0, deployable, no effects. It is a deprecated starter placeholder, not an approved current nonstarter. Adopting this Location requires a separate explicit decision about that fixture card. Substituting Slash-Dot would change the recovered definition and must not happen silently.

### Signal tower — `signal_tower`

Exact text: “On collapse, the winner draws 1 card.”

Operation: `draw`, amount 1, target `nodeWinner`. Destination is Hand using normal draw/reshuffle. Ties draw one for each player. Resolves in the Location Reward stage. End-of-Cycle cleanup follows afterward; a drawn non-Crypto card therefore discards in this same Cycle, while drawn Crypto can resolve into the upcoming Draft Wallet. Do not reinterpret this as a next-Cycle draw or change the destination.

### Quantum commons — `quantum_commons`

Exact text: “On collapse, the winner gains 1 Crypto and 1 Victory Point.”

Ordered operations: `gainCrypto` amount 1, then `gainVictoryPoints` amount 1, both targeting `nodeWinner`. Destinations: current Draft Wallet and persistent earned VP. Ties grant both benefits to each player. Resolves after final Power comparison.

## Exact recovered Circuit Reward candidates

All four entries below have status **HISTORICAL_IMPLEMENTATION_FIXTURE — REQUIRES MEL APPROVAL**. Shared definition source: `../0uroboros/src/game/content/circuitRewards.ts`.

Definitions do not declare a price field. The historical `claimCircuitReward` in `../0uroboros/src/game/engine/draft.ts`, lines 156–183, checks eligibility and previous claim, runs `onAcquire`, deducts no Wallet and returns cost 0. Thus **free claim** is recovered implementation behavior, not a printed cost recovered from an approved catalog. Eligible tied players claim their own instance independently, once each during Draft.

### Quantum dividend — `quantum_dividend`

Exact text: “Gain 5 Crypto for this Draft.”

On-acquire operation: `gainCrypto`, amount 5, target self. Destination: claimant's current Draft Wallet. Historical claim cost: 0. No card acquisition.

### Serpent crown — `serpent_crown`

Exact text: “Gain 4 Victory Points.”

On-acquire operation: `gainVictoryPoints`, amount 4, target self. Destination: persistent earned VP counter. Historical claim cost: 0. No card acquisition.

### Fabricator grant — `fabricator_grant`

Exact text: “Add a Monolith core to your discard pile.”

On-acquire operation: `grantCard`, card definition `monolith_core`, destination `discard`, target self. Historical claim cost: 0; grant does not consume market supply.

Dependency: Monolith core is a fixture Base card, Power 9, printed card cost 8, deployable, no effects. **The card's printed Draft cost 8 is not the Circuit claim price.** This unapproved nonstarter must be explicitly adopted before the reward can be implemented.

### Integrity patch — `integrity_patch`

Exact text: “Heal 400 to your Primary Data Center.”

On-acquire operation: `healDataCenter`, amount 400, target self, explicit `dataCenter: 'primary'`. Destination: claimant's Primary integrity, clamped at maximum. Historical claim cost: 0. Explicit destroyed Primary produces no heal; it does **not** fall back to Backup. Do not silently change this to generic “Restore 400,” which has different targeting under current rules.

## Starting selection and pool evidence

There is no recovered fixed “starting five Locations” list. Historical `setupLocations` in `../0uroboros/src/game/engine/cycle.ts`, lines 125–132, shuffles all seven fixture Location IDs and assigns the first five, without replacement, on each Cycle.

Historical Draft setup in that file, lines 330–331, selects one random Circuit Reward from all four fixture definitions and attaches the selected Node's eligibility. No fixed opening Circuit Reward was recovered. These are implementation selection policies, not approved exact content.

Winner-target rewards versus non-winner Location text are split by the historical Collapse engine (`engine/collapse.ts`, `dependsOnNodeOutcome` and step 5). This distinction must survive any migration, rather than running every `onCollapse` definition at the first Location stage.

## Concrete evaluation pack for Mel's approval

This is a **proposal to approve an evaluation pack**, not a declaration of final content canon. It uses exact recovered implementation fixtures. No rule numbers or card identities have been substituted.

Proposed five-Location pool, shuffled once each into the five Nodes every Cycle:

1. **Data exchange:** “On collapse, the winner gains 2 Crypto.” Reward phase after final Power; tied players each gain 2 current-Draft Crypto.
2. **Occult archive:** “On collapse, the winner gains 2 Victory Points.” Reward phase after final Power; tied players each gain 2 earned VP.
3. **Quantum commons:** “On collapse, the winner gains 1 Crypto and 1 Victory Point.” Reward phase after final Power; tied players each gain both benefits, Crypto first then earned VP.
4. **Signal tower:** “On collapse, the winner draws 1 card.” Reward phase after final Power; tied players each draw 1 into Hand, with normal reshuffle and same-Cycle cleanup. Drawn Crypto may enter the upcoming Draft Wallet.
5. **Breach relay:** “On collapse, the loser takes 200 Data Center damage.” Outcome-dependent reward phase AFTER card onCollapse and final Power comparison, using the final loser. A tie has no loser, therefore no damage. Generic Primary-first/Backup-fallback damage, no spill. No target choice. If this destroys both Data Centers, complete the current Node and awards, stop later Nodes, skip Circuit selection and Draft, score VP.

The exact words “On collapse” in these fixture definitions do not mean they all execute in the initial Location-text stage: historical `dependsOnNodeOutcome` delays winner/loser-dependent operations until the Location Reward phase. Current canonical Location→cards→Power→winner→reward ordering takes precedence. For these five fixtures the initial Location stage can announce its rule; the actual outcome-dependent consequence belongs to the later reward stage.

Proposed three-Circuit-Reward pool, select one randomly each Cycle and offer it in a dedicated privileged Draft slot:

- **Quantum dividend:** “Gain 5 Crypto for this Draft.” Free claim; +5 to claimant's current Wallet.
- **Serpent crown:** “Gain 4 Victory Points.” Free claim; +4 persistent earned VP.
- **Integrity patch:** “Heal 400 to your Primary Data Center.” Free claim; heal claimant's Primary only, clamped at maximum. Destroyed Primary cannot heal and does not redirect to Backup.

Each eligible player may optionally claim once during the Draft window; ties give both players an independent claim. Reward claims consume no normal market stock and cost 0 in the recovered implementation. The zero claim cost, optionality, multiplicity, random pool selection and shuffled Location assignment should be included explicitly in the evaluation approval.

This pack excludes Entanglement lab's terse “lowest Node” targeting, Fabrication bay's deprecated Cipher runner dependency and Fabricator grant's unapproved Monolith core dependency. No new content is required to evaluate the proposed five plus three.

If approved only for evaluation, record `EVALUATION_APPROVED` with the decision date and preserve the distinction from final production approval. Implement and test the lethal Breach relay Node-finish path before exposing this pack. Until approval, canonical entries remain `SOURCE_REQUIRED`; recovered fixtures are not silently promoted.
