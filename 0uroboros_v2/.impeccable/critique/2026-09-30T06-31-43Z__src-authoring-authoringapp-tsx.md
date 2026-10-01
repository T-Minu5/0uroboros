---
target: Authoring tool (Content Studio)
total_score: 20
p0_count: 0
p1_count: 3
timestamp: 2026-09-30T06-31-43Z
slug: src-authoring-authoringapp-tsx
---
# Critique: Authoring tool (Content Studio, /author)

Register: product (internal authoring tool). No PRODUCT.md; context from docs/AUTHORING_MILESTONE.md.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | "Unsaved changes" shows the same green dot as "Saved"; no per-item modified markers; validation only runs on Save |
| 2 | Match System / Real World | 3 | Mostly game vocabulary; raw values leak ("runtime", "start/end", "Loser · Backup"); Orbitron step numbers read as "Ø1" |
| 3 | User Control and Freedom | 2 | No undo/redo; typing in search swaps the item being edited |
| 4 | Consistency and Standards | 2 | "Gain card" vs "Gain Crypto"; Enabled toggle placed differently per section; ARIA tab/listbox roles without their keyboard behavior |
| 5 | Error Prevention | 2 | Renaming a card silently rewrites its ID; printed text can drift from the recipe; duration rules enforced only at save |
| 6 | Recognition Rather Than Recall | 2 | 4,789px editor scroll with no section map; schedule headings scroll away |
| 7 | Flexibility and Efficiency | 1 | No Cmd+S, no list arrow keys, no bulk actions, 107 tab stops before the first field |
| 8 | Aesthetic and Minimalist Design | 2 | Eyebrow on every panel, repeated chain sentence on every step, 10px text dominates |
| 9 | Error Recovery | 2 | Conflict/offline recovery is excellent; validation errors are index-coded ("cards[57].duration: ...") in a 10px footer |
| 10 | Help and Documentation | 2 | Good inline hints and per-step summaries; no reference for effects/targets or Advanced JSON schema |
| **Total** | | **20/40** | **Acceptable** |

## Anti-Patterns Verdict

LLM assessment: Mostly earns its familiarity. It reads as a themed game tool, not generic SaaS. The AI tells: uppercase tracked eyebrows on nearly every block (EDITING CARD, LIVE PREVIEW, UNIQUE TO THIS CARD, 86 SHOWN), colored side-stripes, gradient + glow primary buttons, radial glow blobs in the background, Orbitron (display font) used for step numbers.

Deterministic scan: markup files clean. With CSS included, 2 side-tab warnings: recipe-editor.css:22 (`border-left: 2px solid #65dbe7` on the per-step summary) and recipe-editor.css:49 (`border-left: 3px solid #e7b865` on chained steps). Both confirmed, no false positives. Detector missed a third stripe: `.au-catalog-list .au-list-item.active { box-shadow: inset 3px 0 #69d9df }` in authoring-workbench.css, plus the eyebrow and gradient-button tells.

Visual overlays: browser overlay step stalled and was skipped; no overlay available.

## Overall Impression

A capable, safe editor whose weak point is the moment of truth: it lets you build freely, then judges everything at Save with machine-coded errors. Biggest opportunity: make the editor tell you what is wrong, where, as you type, and make a card's long recipe navigable.

## What's Working

- Save safety is genuinely excellent: revision conflict detection, offline mode, protected JSON drafts, beforeunload, and human messages ("Your edits are still here. Export them or reload the newer version").
- Live card preview with In play / Draft toggle, sticky while you scroll the recipe.
- Plain-language summary under every recipe step ("Give 1 Crypto to your wallet").
- Catalog list: art thumbnails, sortable Cost/Power, filter tabs with counts.

## Priority Issues

1. [P1] Renaming a card silently rewrites its ID. `rename()` in CardEditor derives id + definitionId from the name on every keystroke. References to the old ID (Gain Card, Morph forms, starter decks, Locations like "Penny for the poor") break, surfacing only as a save error. Clearing the name makes the ID `new-item`. Fix: derive the ID only for never-saved items; afterwards show the ID read-only with an explicit "Change ID…" action that rewrites references across the document. Command: /impeccable harden
2. [P1] Validation happens only at Save, and errors are unreadable. Output looks like `cards[57].duration: schedule and recurring effects require a positive runtime duration`, joined with " · " into a 10px footer. Fix: validate live (debounced), translate paths to item name + field label, show an error count on Save, mark offending list rows, click an error to jump to and focus the field. Command: /impeccable clarify + /impeccable harden
3. [P1] The card editor is one ~4,800px scroll. Iterative Incubus: 16 recipe steps, 39 dropdowns, 3 schedules, and every step repeats "Chain — later steps wait until this one resolves (skipped, declined or no target cancels them)". Fix: a sticky section rail in the editor (Properties · On reveal 4 · On collapse · Recurring · Schedules 3 · Art · JSON) with counts; collapse inactive recipe sections to their summaries; reduce the chain control to a compact toggle with one tooltip. Command: /impeccable layout + /impeccable distill
4. [P2] Change tracking and undo are missing. Dirty state uses the default green dot (only loading/saving/error states have their own colors); list rows do not mark modified items; no undo/redo; search clears selection so typing swaps the editor to the first match, and zero matches shows "Create your next card". Fix: amber dirty dot + "3 unsaved items"; modified dot on rows; Cmd+Z/Cmd+Shift+Z over document snapshots; per-item Revert; keep selection pinned while filtering; honest empty state ("No cards match 'zzzz' · Clear search"). Command: /impeccable harden
5. [P2] Printed text can silently disagree with the recipe. Recipes seed printed text only while blank; afterwards the two drift with no signal besides an enabled "Regenerate from effects" button. Fix: when derived ≠ printed, show an inline "Printed text differs from effects" notice with the derived text for comparison; add a filter/badge for mismatched cards. Command: /impeccable clarify

## Persona Red Flags

Alex (power user, i.e. the designer iterating between playtests): no Cmd+S; ↑/↓ does nothing in a list announced as role="listbox"; 107 tab stops before the first property; no duplicate-step or copy-recipe-between-cards; bulk enable/disable only via Advanced JSON.

Sam (keyboard / screen reader): role="tab" buttons with no tabpanel and no arrow keys; listbox of buttons without arrow navigation; 10px hints and footer status. Positives: recipe controls have specific aria-labels; visible focus ring.

Riley (stress tester): clear the Name → ID becomes `new-item`; rename to an existing name → silent `-2` suffix; switch Duration period to "cycle" on a scheduled card → blocked save with an index-coded error; search gibberish → "Create your next card"; + New card lands off-screen in the sorted list with no scroll-into-view.

## Minor Observations

- Locations show two disabled textareas with identical text (Location text / Reward text).
- Orbitron step numbers render 0 with a slash: "Ø1".
- Raw enum values in selects: "runtime"/"cycle", "start"/"end".
- Artwork is a typed path with silent placeholder fallback; no picker or broken-path warning.
- Switching sections keeps the old list scroll position, so the selected item can be off-screen.
- Font sizes: 10px is the most common text size; bump hints/footers to 12px and body to 13px.
- Delete/discard use native window.confirm; fine for a tool, but an undo toast would be kinder.

## Questions to Consider

- What if Save could never fail, because every error were already visible on the item?
- Should the ID be a name at all, or a stable identity you rarely see?
- What would a single card's recipe look like as a readable sentence you edit in place?
- Does a designer need to see all 16 steps at once, or just the one being tuned plus the card preview?
