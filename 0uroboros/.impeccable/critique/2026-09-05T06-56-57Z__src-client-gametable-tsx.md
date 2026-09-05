---
target: GameTable visuals
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/Users/t-minus/Library/CloudStorage/Dropbox/00_AI Projects/Card_IO/0uroboros/src/client/GameTable.tsx"
target_fingerprint: "sha256:1271efbf23e3b3b49123b4310810297e5e7b742847ef50e6ad627f9acae1cdc4"
target_path: /Users/t-minus/Library/CloudStorage/Dropbox/00_AI Projects/Card_IO/0uroboros/src/client/GameTable.tsx
timestamp: 2026-09-05T06-56-57Z
slug: src-client-gametable-tsx
---
# Critique: src/client/GameTable.tsx

Mode: Operate. Dual-agent review of the Phase 1 playtest table against `0uroboros_agent_docs_v0.1` and `docs/competitive-ux-baseline.md`. Gameplay and legality were out of scope.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Clock names Cycle and window; timer slot was empty; board cards after reveal were nameless slabs |
| 2 | Match System / Real World | 2 | Rules say End Turn; UI said End window. Location text exists in data and was never shown |
| 3 | User Control and Freedom | 2 | Concede sat next to End window with no confirm. Hand cards were not keyboard-operable |
| 4 | Consistency and Standards | 1 | Amber meant rival and Crypto. Cyan meant self, legal Nodes, and Collapse selection |
| 5 | Error Prevention | 2 | Illegal deploys blocked well; Concede was a one-click loss |
| 6 | Recognition Rather Than Recall | 1 | Revealed board cards had no name or Power. Location rules required memory |
| 7 | Flexibility and Efficiency | 1 | Drag and click existed; no keyboard path through the hand |
| 8 | Aesthetic and Minimalist Design | 2 | Authored cyberpunk frame; 8 to 10px type and bounce easing undercut it |
| 9 | Error Recovery | 2 | Blocked reasons are plain; no undo for a misclick Concede |
| 10 | Help and Documentation | 2 | Contextual hints exist; one used an em dash, which the product brief bans |
| **Total** | | **17/40** | **Poor** |

## Design Specificity Verdict

**LLM assessment**: Authored for 0uroboros. Five Nodes, dual Data Centers, violet probability, cyan self / amber rival. Not a generic card-game skin. Execution leaked meaning across tokens and hid the information the docs say must appear on hover.

**Deterministic scan (at assessment)**: 3 warnings in `src/client/styles.css`: bounce-easing on `--ease-snap`, layout-transition on `.dc__fill` and `.chance__fill` width.

**Deterministic scan (after this pass)**: `impeccable detect --json src/client` returned `[]`.

**Visual overlays**: No reliable user-visible overlay. Browser mutation/injection was unavailable; Playwright screenshots of the live table were the fallback.

## Overall Impression

The table already knows who it is. The failure was literacy: players could not read the board they were playing, and color meant too many things. The single biggest opportunity was to put name, Power, and Location text back in the 2D layer without touching the engine.

## What's Working

- Split of 2D hand / 3D board / persistent probability matches the locked competitive baseline.
- Closed Nodes stay hidden and still accept commits, which is the rules text made visible.
- Deployability is computed before the drop, so illegal plays fail in the hand, not after a rejected gesture.

## Priority Issues

### [P0] Board cards were nameless slabs
**Why it matters**: After reveal, Snap and our own baseline require name and Power on the contested position. A dark proxy answers none of the competitive questions.
**Fix**: 2D pile summaries on Node headers name face-up cards and Power; facedown cards stay "N committed".
**Suggested command**: /impeccable polish

### [P1] Location text was selected and never shown
**Why it matters**: Docs and the competitive note require full Location text on hover or focus of an open Node.
**Fix**: Hover/focus inspect on open and collapsed Nodes. Closed Nodes still hide the Location.
**Suggested command**: /impeccable polish

### [P1] Color meaning leaked across systems
**Why it matters**: Amber as rival and as Crypto trains the wrong association. Cyan as Collapse selection steals probability's violet.
**Fix**: `--crypto` for Wallet and cost. Collapse selection stays violet. Duration numerals use text color, not chance.
**Suggested command**: /impeccable colorize

### [P1] Type, focus, and keyboard
**Why it matters**: 8 to 10px rules text and `pointer-events: none` on `.card` lock out reading and keyboard play.
**Fix**: Larger card type, `:focus-visible`, hand cards tabbable with Enter/Space to select. End turn is a real button.
**Suggested command**: /impeccable typeset

### [P2] Copy and destructive controls
**Why it matters**: "End window" is not the rules verb. Concede shared the primary control family. One em dash violated the brief.
**Fix**: Sentence-case End turn. Demoted Concede with confirm. Hint copy without an em dash. Honest "Playtest: no countdown".
**Suggested command**: /impeccable clarify

## Persona Red Flags

**Jordan (First-Timer)**: "End window", "Wave Collapse", and a timer-shaped hole with no first-move prompt. Closed Nodes look illegal until a card is selected.

**Alex (Power User)**: Hand was pointer-only. Concede sat on the same stack as the turn closer.

**Sam (Accessibility)**: 3D canvas is still outside the accessibility tree. Color still carries ownership on Power numerals. Focus rings now exist on chrome and the hand.

## Cognitive Load

Checklist failures at assessment: 7/8 (single focus, chunking, hierarchy, one thing at a time, minimal choices, working memory, progressive disclosure). Grouping of status / clock / probability / board was the pass.

## Emotional Journey

Reveal and Collapse are the peaks. Nameless slabs and an instant Concede flattened both. Sequential reveal playback was already in place and was left alone.

## Minor Observations

- Brand, clock, and Draft titles still use tracked uppercase as identity chrome.
- Unfocused fan cards clip names by overlap; hover lift is the read path.
- 3D CardProxy remains a positional slab. Names live in the 2D header so text stays out of Three.js.

## Questions to Consider

- Should facedown commitment show a per-Node count to the opponent before reveal?
- Is a later 3D card face worth the text-in-WebGL cost, or is the 2D pile enough?
- When playtest timers land, does the clock become a countdown or stay a window index?

## Applied in this pass (presentation only)

No `src/game/` rules, legality, phases, or scoring were changed.

- Node headers name revealed cards and Power; Location text on hover/focus for open/collapsed Nodes.
- `--crypto` token; Collapse selection stays violet; meter fills use `scaleX`; bounce easing removed.
- Larger hand type and hover scale; focus rings; keyboard select on the fan.
- End turn, Concede confirm, no em dash, playtest timer label.
