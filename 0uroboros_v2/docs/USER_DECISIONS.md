# Current user decisions

## Latest override — Location control and full catalog, 2026-09-24

The current user request supersedes earlier percentage/weighted-selection decisions below. Full details and adaptation boundaries are in `CIRCUIT_CONTROL_REVISION.md`.

- Circuit eligibility goes to the player winning more Locations after their closures. **Both players receive eligibility on any equal count**, including 2–2 with one tied Location.
- Reveal priority uses **Locations controlled**, retaining current priority on a tie.
- **Remove Node percentages.** Old +Draft/weight shifts now **transfer the player's existing Power between neighboring Locations**. The user explicitly selected transfer rather than a bonus/penalty to either side. +1/+2/+3 Draft map to 1/2/3 Power.
- Enable all previously created ordinary historic cards using their JSON artwork and text. Conflicting retained evaluation cards receive different names and placeholder art. Morphs and generative cards may remain deferred.
- The user approved temporary new Character Power = ceil(cost/2), clamped from 1 to 5, and VP Power = VP value. Existing assigned Power stays intact.
- Allow placements at unopened Nodes; the guide's deferred-reveal rule applies. Current-turn local cards are face up until End Turn; committed cards at unopened Nodes stay concealed until opening.
- Add a text-only Undo all actions control below the Effect Bank, active after the first placement and unavailable after End Turn.
- New board direction: cyberpunk/occult geometry, longer player lanes, integrated diamond Power displays, aligned wallet/storage housings, and animated glowing gel Servers whose illumination follows integrity. Location award ripples belong only to the winning side, or both sides for a tie.

Earlier entries below are retained as decision history, not current authority when they conflict with this override.

2026-09-23 UTC, current conversation, Mel explicitly selected:

- **Unused Actions carry between Runtime turns within a Cycle.** Actions reset between Cycles, per V3.1.
- Sources are in the “assest” folder. Search found `assets` in this project (visual files only) and sibling `../0uroboros/assets` (visual files); no literal `assest` directory found in Card_IO. Asked for exact missing data file/path.

Historical pending questions at that point: priority direction, Vault Encryption scoring VP and content. Later decisions below resolve the first two and authorize evaluation content. These are not current clarification requests.

These notes record decisions without rewriting the sealed V3.1 package.

Further explicit current-conversation decisions:
- **Higher ControlledWeight receives next-turn reveal priority.** Ties retain current priority (existing canonical rule).
- **Vault Encryption scores 2 VP**, independently of its Power 2.
- Recheck V3.1 for missing content first; if absent, ask Mel again. Full package was rechecked; 15_OPEN_QUESTIONS_AND_TBDS.md explicitly leaves complete production content to sources/approval. Asked for definitions or authorization to draft proposals.

Content-source check completed after user update:
- Read all seven files in newly supplied `0uroboros_implementation_v2`. Despite folder name they identify themselves as implementation guide v3.0 and contain no exact nonstarter catalog.
- Read new V3.1 `06A_CANONICAL_CONTENT_CATALOG.md` and changed start/manifest/changelog. It explicitly marks all exact nonstarter, Location and Circuit Reward content SOURCE_REQUIRED and forbids deriving definitions from names/art/history/model invention. Full Runtime content remains blocked until those tables receive authoritative approved values. No proposal permission inferred.

## Evaluation content approval — 2026-09-23 UTC

User explicitly approved the recovered pack for the next evaluation, not final canon:

- Data exchange: +2 Crypto; Occult archive: +2 VP; Quantum commons: +1 Crypto and +1 VP; Signal tower: draw 1; Breach relay: final losing side takes 200 damage, ties take none.
- Location rewards go to both players on ties. Shuffle these five Locations across Nodes each Cycle.
- Circuit Rewards: Quantum dividend (+5 Crypto), Serpent crown (+4 VP), Integrity patch (restore 400 to Primary only, never revive).
- Offer one random Circuit Reward each Draft, free to claim once per eligible player; tied eligible players each receive a claim. Current targeting and Collapse rules apply.
- Keep the opening schedule: Nodes 1–3 on turn 1, Node 4 on turn 2, Node 5 on turn 3. Hide closed-Node Location identities, effects, and rewards.
- When a draw crosses the end of the draw pile, deal its remaining cards first, shuffle the discard pile, then draw the remaining amount owed.

This approval supersedes the earlier content block for this evaluation pack only. The full nonstarter market catalog remains unresolved.

## Deal and concept-art presentation — 2026-09-23 UTC

- User selected: show all five drawn cards together initially, then move Crypto cards to the cache. This changes presentation, not the five-card draw rule or deck composition.
- Remove redundant per-card reveal/effect narration boxes; keep causal animations and the optional history log.
- Closed Node plaques use the concept's N1–N5 notation; existing opening schedule and hidden-content rules remain.
- Crypto cache uses stacked physical card faces. Servers use illuminated shader tubes, board lighting, and animated integrity drain/fill.

## Randomized Node opening and weight placement — 2026-09-23 UTC

User replaces the fixed Nodes 1–3 / Node 4 / Node 5 schedule. At the start of each Cycle, all Nodes appear visually closed; three randomly selected Nodes then open. One of the remaining Nodes opens on turn 2, the last on turn 3. Node reveal order is sampled without replacement and is not disclosed in the player snapshot. Independently shuffle the starting weights 30%, 25%, 20%, 15%, 10% across the Nodes each Cycle, preserving the 100% total. Existing shuffled Location assignment remains independent. Remove the repetitive “Both players on a tie” Location copy; the tie reward rule itself remains unchanged.

## Resource palette and board HUD — 2026-09-23 UTC

- Gold: VP and Server healing. Green: Crypto. Blue: card draws. Cyan: earned Actions.
- Remove card-type overlays from card art.
- Node Power shows only its number in the authored socket: no Power icon, equals sign, priority icon, or duplicate overlay frame.
- Move database icons from the integrity number to the Server name, sized to the label. Keep integrity readouts outside the illuminated tube.
- Player stats run left-to-right Actions, Crypto, VP, with labels underneath each icon/value pair. VP uses supplied icon-volume.svg.
- During resolution, the Action number displays current plus earned pending Actions; no '+1 next' suffix. This presentation change preserves next-turn Action availability. Crypto updates its counter directly. No additional floating Action/Crypto text appears.
- Initial three Node openings start 800ms apart in the sampled random order (900, 1700, 2500ms after the deal begins).

## Full-lane dragging and board composition — 2026-09-23 UTC

- A dragged card should move seamlessly from the hand and follow the pointer. The entire vertical player-side lane beneath a Node accepts a legal drop; the compact card placement area stays the same.
- Illuminate only the hovered drop lane and its Location. At rest, illuminate the side currently winning each Location. Remove the red lane lines.
- Move the board upward, giving the hand and player stats more breathing room. Lower the player's Server housings so they clear the percentages.
- Use concept-like percentage plates and restore rhombus Power mounts in place of red circular displays.

## Card travel, closure and Runtime timers — 2026-09-23 UTC

- Drawn cards physically enter the hand from the left. Crypto first enters the hand, pauses, then moves to the visible Crypto Wallet. At Draft its stacked cards travel to the Crypto stat as their amounts are credited.
- Lower and space the green Crypto Wallet with its top aligned to the hand's arch. Match both players' Server heights and flash attacked centers red. Remove stat-screen shine.
- End Turn is one integrated countdown control, with a concept-like depleted/remaining color split. Runtime duration is configurable/TBD, shared by all three turns; no standard seconds value is authorized. Early End Turn is allowed.
- A no-input timeout ends the turn and makes the next decision countdown 1.25× faster until input. Two consecutive no-input Runtime turns cause automatic concession. The penalty never accelerates presentation or server resolution.
- First disconnect: up to 20 seconds of timer pause/Waiting, then forfeit without reconnect. Second disconnect: no pause. Third: forfeit. These are network requirements, not a claim that the offline evaluator implements multiplayer.
- Draft remains 90 seconds by default, configurable, with both players able to finish early. Requests arriving before the deadline may finish processing; later requests fail. Mandatory choices started before the deadline may finish afterward, and expired mandatory choices resolve to a random legal server option. Their general duration is also TBD.
- On Node closure, highlight the winner (both if tied), turn both lane panels right around their vertical axis as awards resolve, then close after awards. Collapse must visibly move through the Nodes.

## Strategic evaluation milestone — 2026-09-23 UTC

Mel instructed Astra to make the next milestone a strategically representative evaluation: approve enough market content to exercise missing systems, implement that Draft experience, and test several Cycles with meaningful purchasing on both sides.

This authorizes a **provisional evaluation market** designed for that milestone. It does not finalize production card balance, rewrite the sealed catalog, change the canonical starter deck, or change the established core rules. Exact evaluation definitions and intended coverage are recorded in `EVALUATION_MARKET.md` and `src/evaluationMarket.ts`.

The evaluation uses the canonical market structure and supplies: nine Base piles (8 each), three VP piles (8 each), three Crypto piles (16 each), and three rotating Chaos offerings with two copies per player per Draft. The opponent purchases with its own Wallet. Duration, movement, probability transfer, shared Trash recovery and effect choices are exercised through real acquisitions. New content remains subject to evaluation and revision rather than being represented as restored historical canon.

## Supplied 106-card catalog — 2026-09-24 UTC

Mel supplied `assets/card_art/cards.json` for repurposing into this game, with images in the same folder or nested Base/Chaos folders. The supplied `image_placeHolder.png` may be used when artwork is missing. Old `+Draft` card effects may become 5%, 10% or 15% Node-weight shifts; useful evaluation mechanics such as Trash recovery may be retained.

Artwork paths are normalized separately from gameplay rules. Existing canonical starter mechanics remain unchanged pending explicit conflict resolution. Mega-Cache (cost 9, +5 Crypto) replaces the earlier provisional Alchemic Mega market identity because the new source distinguishes that purchasable Crypto card from a zero-cost Alchemic Utility form.

The source has no Node Power values. Duration references use the other game's “turns,” and some descriptions disagree with effects arrays. These are adaptation decisions, not permission to silently change core rules. See `CARD_CATALOG_ADAPTATION.md` for the complete audit and pending decisions. “Draft effects” is interpreted as the old card resource, not removal of this game's between-Cycle purchase phase.

## Catalog adaptation rulings — 2026-09-24 UTC

Mel clarified how the imported catalog should map into 0uroboros for evaluation use:

- Source `action`, `attack`, `power`, and `utility` are category tags, not direct 0uroboros card classes. They remain playable deployable cards. The source `power` tag is renamed conceptually to `Hacker` to avoid confusion with numeric Node Power.
- Generated cards are not ordinary Draft-market offers. They are created by other cards and remain unique results of gameplay.
- `encryptedVolume` cards are VP cards. They heal and score VP under the existing VP model. Their numeric Node Power is still assigned independently.
- Permanent Storage means the Duration persists indefinitely until it is displaced or otherwise removed.
- Widget and Cat content is deferred for now. Do not include that branch in the current evaluation content pass, including Hesinberg Hag and Merchant of Chaos.
- `morph` is a transformation/state rule only. Morphing does not require an extra deploy cost and does not create a separate market pile.
- `glitch` cards have Node Power 0.
- Source ids and names may be normalized for a cleaner uniform content model, including hyphenation and camel casing where useful. Exact misspellings do not need to be preserved as player-facing canon so long as identities remain unambiguous.

For the current implementation pass, Astra used the existing purchasable Crypto trio of Byte-Coin, Kilo-Coin and Mega-Cache. Shyte-Coin remains outside the Draft market for now rather than being exposed as a zero-cost public pile.
