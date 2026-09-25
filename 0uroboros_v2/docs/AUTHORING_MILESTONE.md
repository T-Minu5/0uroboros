# Content authoring and tactical effects milestone

Requested September 25, 2026. Astra owns integration and final verification; three bounded implementation tasks are delegated to GPT-6 Sol.

## Current authoring workflow

The user's latest correction supersedes the shared-library design below: **recipes belong to the item being edited**. Cards, Locations, and Circuit Rewards are the three authoring sections. There is no separate Effect Library or reference-attachment control.

- Compose, reorder, and remove Effect / Count / Target steps directly inside each item. Cards expose On Reveal, On Collapse, Recurring, and Scheduled recipes; Locations expose On Closure; Circuit Rewards expose On Claim.
- Duplicating an item clones its complete recipe. Editing the duplicate cannot change its source. Legacy shared references are copied into each item's local recipe on load without changing their execution order. The legacy library remains in exported documents only for format compatibility.
- Circuit Rewards now execute every step in their ordered recipe for each eligible claimant, with individual presentation events and one claim per player.
- The card workbench places search across the top, New Card alongside it, and category tabs below. The thumbnail list sorts by name, cost, or Power; the live preview and editable properties sit on its right.
- Tabs include All, Base, Chaos, Hacker, VP, Crypto, Generated, Action, Utility, Runtime, Attack, and Disabled. Historic Power-class cards are seeded as Hacker within Chaos.
- Authored Generated cards remain available to gain/Morph effects and the test catalog while being excluded from all Draft pools. This does not automatically import previously deferred historical families.
- Save to disk, import/export, validation, conflict detection, and preservation of unapplied JSON drafts continue to work with item-owned recipes.

Verification passed: 245 tests, the production build, and the browser evaluation. The browser evaluation uses an isolated temporary save file and checks recipe independence, filters and numeric sorting, save/reload, conflicting saves, a live Morph into an authored Generated form, complete Circuit Reward execution, and the mobile layout. Screenshots: `docs/evidence/item-recipe-workbench.png`, `docs/evidence/item-recipe-circuit.png`, and `docs/evidence/item-recipe-mobile.png`.

The sections below record the earlier delivery stages; their references to four authoring sections and reusable libraries describe the superseded design.

## Delivery plan

1. **Tactical rules — effect_rules**
   - Select and move a revealed friendly or opposing card to a legal open Node.
   - Preserve ownership, reveal state, and duration; respect four-card lane capacity and Collapse resolution.
   - Apply positive or negative Power to a specific revealed card. Effective Power floors at zero and follows the card while deployed; the printed definition is unchanged.
   - Test choices, opponent behavior, hidden information, cleanup, and Node totals.
2. **Persistent content — authoring_storage**
   - One versioned content document for Cards, Locations, Circuit Rewards, and reusable effect recipes.
   - Validate fields, references, and required game pools before accepting changes.
   - Save to `content/authored-content.json` through the local server with atomic writes, a previous-version backup, and conflict detection.
   - Include saved content in production builds. Browser-only storage is not the source of truth.
3. **Authoring interface — authoring_ui**
   - Open `/author` to search, create, edit, duplicate, and delete all four content types.
   - Provide readable forms, effect editing, artwork previews, advanced properties, and explicit save/error/dirty states.
   - Offer reusable recipes for existing effects and the new movement and Power effects.
4. **Integration and evaluation — Astra**
   - Route the authoring app and provide an entry point from the game.
   - Use saved definitions in new matches, markets, rewards, and the evaluation catalog.
   - Animate the affected card moving to its destination; update its Power badge and Location total together.
   - Verify real disk saves, reload persistence, invalid-save rejection, stale-edit conflicts, and playable saved definitions.

## Working rules for this milestone

- Movement changes a card's Node, never its owner. Revealed cards are selectable; hidden opposing cards stay hidden.
- Power modifiers last for the current deployment and never rewrite a reusable card definition.
- Existing historic card text and identities stay intact. New evaluation cards use distinct identities and placeholder art.
- Text describes an effect; structured recipes execute it. Unsupported new engine primitives require implementation, not just a text edit.
- Saved content is used by new games. A match already in progress keeps its content snapshot.
- Historical Morph/generator families remain outside the seeded evaluation catalog. Authored Morph recipes can use enabled Character/VP definitions as forms.

## Acceptance checks

- Friendly and opposing cards can move through legal effect choices and visibly land in the correct lane.
- Buffs and debuffs change the targeted badge and Node score; returning to a deck zone clears the modifier.
- All four authoring sections support creation, reading, editing, duplication, deletion, and durable saving.
- Referenced effects resolve into live gameplay behavior; invalid or dangling recipes cannot be saved.
- A saved change remains after a page reload and appears in a new game; concurrent editors cannot overwrite newer revisions silently.
- Existing engine tests and a production build pass; a browser pass exercises the editor and tactical effects.

## Delivered

All four work packages are implemented. The three delegated packages used GPT-6 Sol; Astra integrated the content snapshot, starting-deck definitions, market selection, artwork overrides, animation, and badge presentation.

- `/author` is linked from game setup and the top navigation.
- The four test definitions are **Relocation Relay**, **Hostile Reroute**, **Signal Amplifier**, and **Power Siphon**. Add them from Card catalog to exercise the new rules immediately.
- New matches load the saved pack. Starting-deck slots retain their ten-card composition and unique instance IDs while resolving their properties from authored definitions.
- Local saves are validated, revision checked, written atomically, and backed up to `content/authored-content.json.bak`. The initial null document means the seeded pack is used until the first save.
- Structured effects support the existing engine primitives plus selected-card movement and signed Power changes. Nested choices and schedules are available through Advanced JSON. Creating a genuinely new primitive still requires engine work.
- Required starter references and minimum market/location pools are protected by validation. Historical Morph/generator families remain excluded from the seeded catalog.

Verification: the automated suite covers rules, hidden information, Effect Bank cleanup, authored runtime behavior, schema validation, disk round trips, concurrent writes, and invalid requests. Browser checks passed CRUD in all four sections, save/reload persistence, conflicting editor saves, edited content in a new match, friendly and opposing movement, both Power badge directions, and modifiers following moved cards. Mobile editor checks found no horizontal overflow at 390 pixels.

Evidence: `docs/evidence/content-studio.png` and `docs/evidence/card-movement-power.png`. Browser save checks use a temporary isolated content file; the user's pack is untouched by test edits.

## Effect recipes and Morph

Recipes now use **Effect · Count · Target** in the library and on Cards, Locations, and Circuit Rewards. Human-readable summaries appear beside reusable effects. Existing recipes keep their meaning; old probability-transfer values are displayed in Power units and converted only when edited.

- Gain Card has a searchable definition picker, a count of 0–100 independent copies, and destinations in either player's hand, draw-pile top, or discard. It does not purchase or consume market stock.
- Draw Card, Gain Action, and Gain Crypto can target either player. Resource events retain the source owner and identify the recipient separately.
- Gain Power and Drain Power use positive counts in the editor, with the appropriate signed modifier saved for the engine. Move identifies the card to move; its legal destination is chosen during play.
- Morph provides an ordered form picker and **Sequential evolution** or **Random selected form**. Sequential advances one form per activation and holds the final form; random uses the match's random source. Recurring effects require a Runtime duration, as shown in the card editor.
- Forms use enabled Character/VP definitions. Transformation preserves the physical instance and ownership, changes the form's artwork, text, stats, and future abilities, and refreshes Power and VP. It does not spend an Action or rerun the new form's On Reveal abilities. A violet turn animation presents the change on the board or in the Effect Bank.
- Direct recurring/scheduled source Morph cadence continues across forms, while unrelated source abilities are replaced by the new form's abilities. Shared evolution recipes across successive forms fire once; intentionally repeated steps within a recipe keep their multiplicity. A Morph nested inside a Choice or Random branch resolves that activation but does not retain the old branch as an evolution controller. The chosen form stays on the physical card in deck zones. Historical bespoke Morph/generator cards are not automatically added by this editor feature.
- Location and Circuit targets remain constrained to the recipients supported by their reward rules. Nested branches and schedules remain available through Advanced JSON.

Validation rejects empty, missing, disabled, Crypto, or duplicate Morph forms and invalid selection modes. Saving and starting a new match uses the same compiled definitions and ordered recipes.

The browser check now covers quantity/recipient controls, ordered-form reordering and reload, saving random selection, an authored card transforming in a new match, its visible Power badge, and the 390-pixel editor layout. An unapplied Advanced JSON draft locks the ID field to prevent a rename from discarding the draft. Evidence: `docs/evidence/effect-recipes.png` and `docs/evidence/morph-card.png`.

Final verification: all 239 tests pass and the production build succeeds. The browser verification saves only to a temporary content file; the user's saved pack is not replaced by fixtures.
