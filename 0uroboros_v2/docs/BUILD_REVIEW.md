# Evaluation build: Locations, Circuit Rewards and board presentation

The user-approved historical evaluation pack now supplies five shuffled Locations and three possible Circuit Rewards. It is evaluation content, not a declaration of final canon. The full nonstarter market remains unavailable; the explicit practice market uses supported starter cards.

Open http://127.0.0.1:5173 with `npm run dev` and choose **Enter evaluation build**. Reloading starts a fresh session.

## Playable changes

- Data exchange (+2 Crypto), Occult archive (+2 VP), Quantum commons (+1 Crypto and +1 VP), Signal tower (draw 1), and Breach relay (200 damage to the final losing side, none on ties). Tied reward winners each receive their reward. Locations shuffle across the five Nodes each Cycle.
- One Circuit offering per Draft: Quantum dividend (+5 Crypto), Serpent crown (+4 VP), or Integrity patch (restore up to 400 to Primary only, never revive). Each eligible player has an independent free claim. The local opponent claims its own privilege automatically.
- Each Cycle starts visually sealed, then opens three random Nodes on turn 1 and one additional random Node on each of turns 2 and 3. The 30/25/20/15/10 weights are independently shuffled across Nodes at Cycle start. Closed Location identities, rules and rewards are removed from the player snapshot and rendered interface. Sealed shutters make the state visible.
- Drawing consumes the remaining draw pile before shuffling Discard to supply the balance. Location draws participate in the same real hand and subsequent Crypto resolution.
- Location and Circuit resource changes use the authoritative event queue. VP awards persist, damage follows current targeting rules, and lethal Collapse finishes the current Node before ending the game.

The original starter mechanics remain: mirrored five-card opening, Actions carry within a Cycle, higher ControlledWeight priority, Vault Encryption 2 VP, alternating reveals, Drain/Restore caps, destruction awards, weighted selection, purchases and repeated Cycles.

## Visual evidence

The actual Blender-authored GLB remains the board. This pass adds opaque sealed wells and shutters, opening motion, clearer Power/ownership, portrait field cards, localized source emphasis, and inspectable Location rules. Official Snap screenshots and sampled official gameplay informed the review; exact sources and observation limits are in `SNAP_ALIGNMENT.md`. No external game artwork ships.

The board remains an original first-party concept implementation. Some identity illustrations are still missing and use labeled placeholders. This is not a claim of final visual parity or complete Runtime V1.

## Validation and remaining scope

52 deterministic tests pass. Chrome completed two full evaluation Cycles into Cycle 3: 14 card deployments, two purchases, two Circuit Reward claims, both inspect flows, two initially sealed Nodes, and zero browser exceptions. See `docs/evidence/browser-play.json` for the result and `docs/evidence/` for screenshots. A final additional Cycle verified the adjusted field-card placement with no card/probability overlap and no browser errors (`layout-browser-play.json`, `populated-board-final.png`). Production build passes. Engine regressions cover draw/reshuffle ordering, visibility, Location rewards, tied independent claims, reward VP, no-revive healing, dynamic Crypto draws and lethal Collapse.

Remaining work requires the full Base/VP/Crypto/Chaos market catalog and its interactions. Online authority, simultaneous purchase races, disconnect rules, full Duration/movement/Trash/Mods content, and broader display sizes remain outside this evaluation. The local opponent makes legal deployments and skips market purchases. Production currently emits a large-bundle warning.

Approval and provenance: `USER_DECISIONS.md`, `HISTORICAL_CONTENT_RECOVERY.md`, and `src/content.ts`. No sealed canonical source tables were rewritten.

## Concept alignment and visible deal update

All five opening cards are now shown together for 1.7 seconds, then Crypto flies into a physical cache stack one card at a time. Runtime commands unlock after the transfer. The same presentation runs on each new Cycle. No draw/deck rules changed. Redundant per-Node reveal/effect text boxes are removed; the optional history log remains. Closed plaques use N4/N5 and concept-style purple metal framing. Four cyan shader tubes cast point lighting onto the board; shader fill and accessible integrity bars animate with the authoritative damage/healing result at contact.

Validation: 52 engine tests pass and production build passes. Additional Chrome Cycle verified five visible opening cards, five preserved across hand/cache after transfer, six deployments, one purchase, one reward claim, next Cycle, no marker overlap, and zero browser exceptions. Evidence: `concept-browser-play.json`, `concept-five-card-opening.png`, and `concept-runtime-initial.png`.

## Complete-Cycle pacing pass

The presentation now skips waits for reward bookkeeping, empty starter on-Collapse stages, the empty Duration bank, and zero-value effects. Every event still executes and is retained in history; no rules, targeting, rewards, or ordering changed. A deterministic 87-event Cycle's scheduled normal-speed resolution drops from 107.25 seconds to 54.82 seconds. Positive resource/damage/healing results keep a 1.05-second beat; fast mode retains at least 500 milliseconds for contact and recovery.

Quiet progress marks the three turns, Collapse and Draft. Turn-ready status reports Actions and reveal priority. Draft appears after queued resolution finishes and includes VP earned, net integrity change and the selected Node. Acquisitions visibly acknowledge entry into Discard and disable the affected pile during its existing two-second cooldown. Private opponent rewards remain hidden. Full effect prose remains available in history, without returning the per-card narration boxes.

54 automated tests pass, including event timing safety and completion of all authoritative events. Browser validation covers normal pace for the first Cycle and fast pace for the second; see the latest browser-play.json for the result.

## Randomized board setup

The user replaced the fixed numbered reveal schedule. The first 900ms show all five sealed plaques; three randomly chosen Nodes then open during the five-card deal. The two remaining Nodes reveal one per subsequent turn, with their future order absent from player snapshots. AI deployment, local legality, chronological reveal eligibility, Location masking and weighted selection all use the same authoritative board setup. Reveal order, weight placement and Location placement are separately shuffled each Cycle. Weight values stay 30/25/20/15/10 and sum to 100.

Repeated tie-rule reminders were removed from Location copy without changing tie payouts. 56 automated tests pass, including 40 randomized board seeds, deployment on arbitrary open Nodes, rejection on closed Nodes, masking, weighted-selection boundaries, deterministic reproduction and repeated Cycles.

Browser verification of randomized setup: two complete Cycles (normal then fast pace), 14 deployments, two purchases, all five Nodes initially sealed, the 3/4/5 reveal counts, and zero exceptions. The captured opening used N1/N4/N5 with weights 10/20/25/15/30 across N1–N5.

## Resource palette, score sockets, and HUD refinement

Gold now identifies VP and healing; green Crypto; blue draws; cyan Actions. This applies to player counters, effect paths, localized pulses, healing tube illumination, card placeholders, Location reward tokens and acquisition prices. VP uses the supplied volume icon. Each console presents Actions / Crypto / VP as three icon-value pairs with labels below. Earned pending Actions are included in the displayed counter during resolution; their spend timing is unchanged. Actions and Crypto no longer add floating text or '+next' suffixes.

Card-type art overlays and Node Power/priority/equality icons were removed. Power numbers now sit directly over the authored sockets. Database icons moved to Server names at label size, with the name/value row above the far tubes and below the near tubes, avoiding opaque number plaques over the energy surface.

The first three randomly chosen Nodes open at 900, 1700 and 2500ms. Browser observation measured adjacent intervals of 794 and 812ms (render-frame variation around the requested 800ms). Two full Cycles passed with 14 deployments, two purchases, all four observed effect color checks, no marker overlap, and zero browser exceptions. All 56 engine/presentation tests and the production build pass. Final visual evidence: resource-hud-final.png.


## Board material and perimeter pass

The client now loads the versioned Blender V2 board with layered perimeter geometry, original procedural surface maps, distinct metal/polymer/glass materials, rectangular Server lights, soft contact grounding and restrained bloom. Approved center Node plaques, text and reveal timing remain intact. Smaller-window review corrected far-score clipping with raised physical score mounts. Full work, iteration evidence, source links and validation limits are recorded in `BOARD_LOOKDEV_V2.md`.
