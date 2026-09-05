# Competitive UX baseline

> Internal research note, Phase 1
> Purpose: establish interaction baselines for the 0uroboros first playable build

This note studies interaction patterns and product conventions from Marvel Snap, Hearthstone, and Slay the Spire. It is a baseline, not a template. No proprietary artwork, copy, animation, or visual identity is reproduced.

Each pattern is evaluated as: problem the competitor solves, why the solution works, whether the problem exists in 0uroboros, and how 0uroboros should solve it.

---

## 1. Board and layout

### Pattern: centered contested play space with mirrored player halves

**Marvel Snap** uses three fixed Locations in a horizontal row at screen center. Each Location shows a shared name/effect band, with the local player's cards below the band and the opponent's above it. Power totals sit adjacent to each Location.

**Why it works.** A single glance answers the only question that matters: who is winning each contested position. Ownership is communicated by vertical position rather than by color-coding or labels, which removes reading work. Because the number of contested positions is small and fixed, the player builds spatial memory and stops re-scanning.

**Does 0uroboros have this problem?** Yes, and more acutely. We have five Nodes instead of three, each with a Location, a probability weight, per-player card stacks up to four, and a Power comparison.

**0uroboros solution.** Five Nodes in a horizontal row across the center of the 3D board, ordered 1 to 5 left to right, matching the Node opening order and the Wave Collapse resolution order. Reading order equals rules order, so the spatial arrangement teaches the sequence. Local player cards deploy toward the camera, opponent cards away from it. Each Node column carries three stacked readouts: Location identity, probability weight, and the Power comparison. Node index labels are permanent because rules text and the log refer to Nodes by number.

### Pattern: hand anchored at the bottom edge, fanned and overlapping

All three references anchor the hand to the bottom of the screen. Snap and Hearthstone fan cards along an arc with overlap, expanding the focused card upward and outward.

**Why it works.** The hand is the highest-frequency interaction target, so it belongs closest to the pointer's resting area. Overlap keeps a growing hand within a fixed footprint. Arc fanning gives every card a distinct hit region even when overlapped.

**Does 0uroboros have this problem?** Yes, and our hand grows more than Snap's. Default draw is five per Cycle, there is no maximum hand size, and unspent cards are discarded at end of Cycle rather than carried.

**0uroboros solution.** Bottom-anchored 2D hand rail, not 3D. Cards overlap with a fixed total width and a hover lift that raises the focused card above its neighbors. Because our hand can hold non-deployable Crypto cards, the rail must show deployability as a first-class visual state rather than relying on a failed drop to communicate illegality.

### Pattern: persistent resource and progression readouts at fixed screen positions

Hearthstone pins mana crystals near the hand, hero health at the board edges, and deck count at the board's right. Snap pins Energy bottom-right and the cube stake at top-center. Slay the Spire pins HP, gold, potions, and relics along a single top bar.

**Why it works.** Fixed position means the player learns where to look once. Values change but locations never move, so checking a resource costs a saccade instead of a search.

**Does 0uroboros have this problem?** Yes. We carry more persistent state than any of the three references: two Data Centers per player, Victory Points, Wallet during Draft, Effect Bank slots, and the probability distribution.

**0uroboros solution.** A fixed HUD frame around the 3D board. Local player status occupies the bottom-left, opponent status the top-left, both using an identical component so the comparison is positional. Cycle, turn, phase, and timer occupy the top-center as the single authority on "where am I in the game." The probability distribution gets a dedicated persistent strip because it is the mechanic most likely to confuse new players and it changes during play.

---

## 2. Cards

### Pattern: hover reveals, click or drag commits

Snap allows both drag-to-Location and click-card-then-click-Location. Hearthstone standardizes on drag with a targeting arrow for effects that need a target.

**Why it works.** Hover is free and reversible, so inspection never risks a misplay. Separating inspection from commitment lets players read dense rules text without fear. Supporting both click and drag serves both mouse and touch without a separate mode.

**Does 0uroboros have this problem?** Yes. Our cards carry timing tags (on play, on reveal, on collapse) and Duration values, so they need more inspection than a Snap card.

**0uroboros solution.** Hover lifts and enlarges the card in the 2D rail with full rules text. Selection is click-to-select, then click a Node to deploy, with drag as an equivalent path. On selection, legal Nodes highlight and illegal Nodes dim, so legality is taught before the attempt rather than after a rejection.

### Pattern: explicit unplayable state before the attempt

Hearthstone desaturates cards that cost more mana than available. Slay the Spire dims unplayable cards and refuses the drag.

**Why it works.** Preventing an illegal action costs the player nothing, while rejecting one costs a failed attempt and a moment of doubt about whether the rules or the interface is at fault.

**Does 0uroboros have this problem?** Yes, in a stronger form. Crypto cards are never deployable to Nodes at all, Nodes cap at four cards per player, and unopened Nodes accept deployment while opened-and-collapsed Nodes do not.

**0uroboros solution.** Deployability is computed from game state and rendered as a card state in the rail: deployable, not deployable at Nodes, and no legal Node available. When an effect has no valid target, the UI states "No valid target" explicitly, as the rules documentation requires.

### Pattern: face-down commitment with simultaneous reveal

Snap's core tension is that both players commit face-down and reveal together, with a priority rule deciding reveal order.

**Why it works.** Simultaneous commitment removes turn-order advantage from the decision itself, then reintroduces it in a controlled way at reveal. Watching cards flip one at a time turns resolution into a readable sequence rather than an instant state jump.

**Does 0uroboros have this problem?** Yes, and this is central to our design. We commit secretly, reveal in alternating order by reveal priority, and preserve each player's exact chronological play order within their own sequence.

**0uroboros solution.** Committed cards render face-down in their Node with a visible commitment count. Reveal is a queued, stepped animation rather than a single state swap, and running Node Power totals update as each card reveals. Because our reveal order depends on chronological play order, the debug view exposes the play-order index so playtesters can verify the sequence.

---

## 3. Player displays

### Pattern: identity, long-term status, and turn ownership as separate signals

Hearthstone renders hero portrait for identity, a health globe for long-term status, and a glowing end-turn button plus rope timer for turn ownership. Snap uses avatar for identity, cube stake for match stakes, and an explicit submit state for turn ownership.

**Why it works.** Each signal has one job and one visual language, so no single element has to be interpreted in two ways.

**Does 0uroboros have this problem?** Yes. We must communicate identity, two Data Center health pools, Victory Points, Wallet, turn ownership, reveal priority, and end-turn readiness.

**0uroboros solution.** Identity is an avatar and name. Long-term status is two separate Data Center bars, Primary and Backup, never merged into a single pool, because damage does not spill between them and each awards different Victory Points on destruction. Victory Points sit adjacent but visually distinct from health, since Victory Points determine the win and health does not directly. Reveal priority is a badge on the player status block because it changes between turns and players need to predict reveal order.

### Pattern: opponent information mirrors your own, minus private data

All three references show the opponent's persistent status in the same visual language as the player's own, while hiding hand contents and deck order.

**Why it works.** Identical treatment makes comparison instant. Differences in the display mean differences in game state, not differences in presentation.

**Does 0uroboros have this problem?** Yes, and our privacy boundary is explicitly specified: hand contents, face-down identity, draw order, and discard contents are private, while revealed cards, Node Power, probability, Effect Banks, Victory Points, Wallets, and the shared Trash are public.

**0uroboros solution.** One shared status component, rendered twice. Private data never reaches the client, enforced by boardgame.io's `playerView` rather than by client-side hiding, so the privacy boundary is a server guarantee rather than a rendering convention.

---

## 4. Transitions and feedback

### Pattern: named phase announcements

Snap announces reveal. Hearthstone announces turn start with a distinct sound and banner. Slay the Spire announces combat start and rewards.

**Why it works.** A short interruption resets attention at exactly the moment the rules change. Naming the phase teaches vocabulary through repetition.

**Does 0uroboros have this problem?** Yes, and the documentation requires a dedicated announcement animation for every major phase and state transition.

**0uroboros solution.** A single announcement overlay component driven by phase transitions, using rules vocabulary: Node opening, reveal, Wave Collapse, Circuit Reward, Draft, Start of Cycle, End of Cycle. Phase 1 ships plain text with correct timing hooks; the motion treatment is layered in later without changing the trigger contract.

### Pattern: resolution as a stepped sequence, not an instant recalculation

Snap reveals and resolves one card at a time with a brief pause between each. Slay the Spire animates each damage instance separately.

**Why it works.** Sequential resolution makes causality legible. When a total changes, the player saw which card changed it.

**Does 0uroboros have this problem?** Yes, most acutely during Wave Collapse, which resolves Location effects and card effects across five Nodes in order, then the Effect Bank, then a probabilistic selection.

**0uroboros solution.** Wave Collapse renders as a stepped walk across Nodes 1 through 5 with the active Node emphasized, then the Effect Bank as a sixth step, then the probabilistic selection as its own distinct beat. The engine already resolves in this order, so presentation follows the resolution queue rather than reconstructing it.

### Pattern: outcome moments get disproportionate weight

All three references give victory, defeat, and reward moments more time and emphasis than routine actions.

**Why it works.** Emphasis communicates importance without text.

**Does 0uroboros have this problem?** Yes. Our probabilistic Circuit Reward selection is the emotional peak of a Cycle and must feel like a measurement, not a calculation.

**0uroboros solution.** The probabilistic selection is a separate visual beat where the probability strip is the focus, since that is the moment where manipulated probability pays off or does not.

---

## 5. Information density

### What must always be visible

Derived from the references and our own rules requirements:

| Always visible | Reason |
| --- | --- |
| Node Power comparison | The primary competitive question every turn |
| Probability distribution | Changes during play and drives the Circuit Reward |
| Cycle, turn, phase, timer | Answers "where am I and how long do I have" |
| Both Data Centers, both players | Loss condition and Victory Point source |
| Victory Points, both players | The actual win condition |
| Hand | Highest-frequency interaction target |
| Reveal priority | Needed to predict reveal order |

### What appears only when relevant

| Contextual | Trigger |
| --- | --- |
| Full card rules text | Hover or focus |
| Legal Node highlighting | Card selected |
| Location full text | Node hover or focus |
| Wallet and market | Draft phase |
| Choice modal | Pending player decision |
| Draft Log | Explicit control |
| Trash contents | Explicit control |

### How the references prevent complexity from overwhelming players

Three techniques recur, and all three apply to us. First, progressive disclosure: dense text lives behind hover rather than on the board. Second, fixed positions: the player learns where to look once. Third, sequential resolution: complex interactions are shown one step at a time instead of as a single recalculation.

Our largest density risk is the probability system, because it is unfamiliar and it changes during play. Mitigation is a dedicated persistent strip, 0.5% increment display precision matching the rules, and visible change indication when an effect transfers probability.

---

## 6. Locked layout for Phase 1

```
┌─────────────────────────────────────────────────────────────┐
│ [opponent status]        Cycle / turn / phase / timer       │
│  avatar, DC bars,        (top center, single authority)     │
│  VP, priority badge                                        │
├─────────────────────────────────────────────────────────────┤
│  opponent Effect Bank (4 slots)                            │
│                                                             │
│   ╭───────╮ ╭───────╮ ╭───────╮ ╭───────╮ ╭───────╮        │
│   │ Node1 │ │ Node2 │ │ Node3 │ │ Node4 │ │ Node5 │  3D    │
│   │ 30%   │ │ 25%   │ │ 20%   │ │ 15%   │ │ 10%   │        │
│   ╰───────╯ ╰───────╯ ╰───────╯ ╰───────╯ ╰───────╯        │
│                                                             │
│  local Effect Bank (4 slots)                               │
├─────────────────────────────────────────────────────────────┤
│ [local status]     hand rail (2D, fanned)      [End turn]  │
└─────────────────────────────────────────────────────────────┘
   debug drawer: left edge, toggleable, dev only
```

Technology split, decided per interaction rather than by default:

| Element | Technology | Reason |
| --- | --- | --- |
| Nodes, placed cards, board space | Three.js | Spatial relationships, camera framing, reveal and collapse motion |
| Hand rail | 2D | Text density, hit precision, responsive layout |
| Status blocks, timers, counters | 2D | Text and numbers, accessibility, cheap updates |
| Probability strip | 2D | Precise numeric display at 0.5% increments |
| Modals, announcements, Draft, debug | 2D | Text-heavy, needs to sit above the board |

Visual treatment for Phase 1 is a clean cyberpunk interface: dark ground, restrained neon accents used only for state meaning, technical grid on the board plane, and high contrast for Power and probability numerals. Accents carry information rather than decoration, so a neon highlight always means legal, active, or changed. Card presentation is deliberately plain, communicating name, type, cost, Power, rules text, ownership, and legality, and nothing more.

---

## 7. Explicitly not adopted

| Reference pattern | Why 0uroboros does not adopt it |
| --- | --- |
| Snap's three-Location board | We have five Nodes and a probability weight per Node, so the row must be wider and carry more per-column state |
| Hearthstone's single hero health pool | We have two independent Data Centers with no damage spillover and different destruction rewards |
| Hearthstone's mana curve pacing | Our economy is Wallet-based during a separate Draft phase, not a per-turn ramp |
| Slay the Spire's single-player run pacing | We are competitive and simultaneous, so no pattern may assume the opponent waits |
| Snap's cube stake escalation | Our stakes are Victory Points accumulated across Cycles, not a per-match multiplier |

---

## 8. Open UX questions for product

These are surfaced rather than decided in implementation:

- Should the probability strip show pre-Collapse projected weights alongside current weights, or only current
- Should opponent commitment counts be visible per Node before reveal, or only total commitment
- Should the Victory Point display default to visible, given the rules allow a player setting to hide it
- How much Wave Collapse step timing is readable without becoming slow across sixteen Cycles
