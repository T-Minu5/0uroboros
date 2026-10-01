# Content / Worldbuilding

Content and Worldbuilding are advisory Terra specialists. They do not execute, mutate files, or invoke other agents. Astra decides whether one, both, or neither is needed. They do not call each other.

## Content

Content asks what a card, Location, Circuit Reward, Mod, or generated card does in the existing engine.

It may propose Character, Base, Chaos, VP, Crypto, Location, Circuit Reward, Mod, generated, and effect-text concepts. It may not change Runtime, Node control, Wave Collapse, Draft, Actions, Data Centers, or victory conditions. If an idea needs a rule change, `rule_change_required` is true.

Approved starter mechanics remain authoritative. Improving Rezz-Razor cannot silently overwrite `RULE-STARTER-004`.

Default budgets: `MAX_CONTENT_CALLS=1`, `MAX_CONTENT_PROPOSALS=5`.

## Worldbuilding

Worldbuilding asks what a thing is in the 0uroboros universe.

It may propose lore, factions, naming, relationships, Location identity, and Obsidian-oriented links. It does not write card mechanics.

Evidence kinds stay distinct:

- `ESTABLISHED_FACT` from canonical World Bible / approved guidance
- `FIRST_PARTY_WORLD_KNOWLEDGE` from Mel's Obsidian vault: first-party story, setting, narrative, and world-lore. It is not authoritative knowledge of every named game entity
- `ESTABLISHED_WORLD_LORE` for statements supported by retrieved vault story material
- `FIRST_PARTY_WORLD_DRAFT` from draft, proposal, or unknown-status vault notes
- `FIRST_PARTY_VISUAL_OBSERVATION` / `VISUAL_INFERENCE` from cached pixel inspection, not lore
- `EXTERNAL_EVIDENCE` from a curated reference
- `WORLD_PROPOSAL` when a new idea would challenge established vault lore
- `PROPOSED_CHARACTER_LORE` for new character-specific identity or relationships
- `PROPOSED_WORLD_EXTENSION` for a proposed addition to the broader world that the vault does not already establish
- `PROPOSED_LORE` for other new interpretation
- `WORLD_EVIDENCE_TENSION` when vault lore and first-party art appear inconsistent

Current vault profile (not a permanent ban on later character notes):

```text
current_vault_profile:
  world_story_lore: true
  plotline: true
  setting_lore: true
  gameplay_rules: false
  character_specific_canon: false
```

Obsidian currently provides WORLD CONTEXT for character work. It does not currently provide CHARACTER CANON. Search world/story concepts. A character-name miss is expected and is not a defect. `WORLD_KNOWLEDGE_NO_MATCH` does not make a complete candidate incomplete.

A proposed relationship such as "this Character could have emerged from event X" is `PROPOSED_CHARACTER_LORE` unless the vault establishes that relationship.

Authority for world identity:

```text
Approved canonical World / Rules / Design requirements
    ↓
Established FIRST_PARTY_WORLD_KNOWLEDGE from Mel's Obsidian vault
    ↓
FIRST_PARTY_VISUAL_ASSET observations
    ↓
USER_CURATED_REFERENCE_GUIDANCE
    ↓
EXTERNAL_RESEARCH_EVIDENCE
    ↓
MODEL_CLAIM / new proposal
```

Gameplay rules remain above all worldbuilding material. Lore cannot override gameplay semantics. Content may use existing approved mechanics themed by vault lore. It may not invent a new subsystem and claim the vault authorized it.

Vault notes are not automatically canon. Status comes from frontmatter, tags, folder, headings, or explicit words such as draft, approved, canon, idea, deprecated, and archive. Missing status is `UNKNOWN_STATUS` / `FIRST_PARTY_WORLD_DRAFT`.

Worldbuilding searches a bounded `WorldKnowledgePacket` (max 8 notes, 12 excerpts) before proposing. It is read-only against Obsidian. It does not create, patch, delete, rename, or execute vault commands.

A crescent in the art is an observation. A lunar covenant is a proposal.

Default budgets: `MAX_WORLDBUILDING_CALLS=1`, `MAX_WORLDBUILDING_CONCEPTS=5`.

Do not write into the Obsidian vault from this advisory path. Emit structured links only.

## Shared concepts and creative budget

When Astra uses both specialists, pass the same `concept_id`. Count unique concept IDs. The global cap is `MAX_CREATIVE_CONCEPTS_PER_RUN` (default 5). A one-candidate validation task is capped at 1.

Packets include an approved mechanics capability map. `+1 Action` / `Gain 1 Action` is an `APPROVED_PRIMITIVE` (`RULE-ACTION-004`, Dash-Dot, Dotkrawler, Rezz-Razor, Rezz-Blade). A new arrangement of approved primitives is `NEW_COMBINATION`, not a rule change. If Content labels an already-approved primitive as a new mechanic, the harness records `CONTEXT_OMISSION` and does not ask Mel to redesign.

First-party assets in creative packets carry `selection_role`: `IDENTITY_SPECIFIC`, `REPRESENTATIVE_REFERENCE`, `UI_REFERENCE`, or `SYSTEM_ICON`. Representative Chaos samples currently prefer cached Rezz-Razor and Glitch-Witch.exe observations. They are not the new character.

Systems is not invoked for creative-only work merely because mechanics are mentioned. Starting-deck mismatch evidence is query-relevant only.

Astra synthesizes one Candidate Concept Envelope. Alternative names stay inside that envelope. `MAX_CREATIVE_CONCEPTS_PER_RUN=1` produces one envelope, not five backlog notes.

The harness owns the shared `concept_id` and assigns it before Content and Worldbuilding run. Specialists cannot replace it. A mismatched specialist ID is `CONCEPT_ID_MISMATCH`; the harness ID wins. Candidate name is separate from concept ID.

If a required specialist call is consumed, the harness persists either a validated result or a bounded `content-failure.json` / `worldbuilding-failure.json`. A consumed call must not disappear. Required specialist failure makes the envelope `INCOMPLETE`. Astra may summarize what is missing and must not invent Content-owned Power/effect/cost/role/provenance or Worldbuilding-owned lore.

Vault search uses a high-signal query builder. Generic task words and gameplay bookkeeping tokens are filtered. Character names are a cheap verification step, not the primary query budget. Representative art names do not dominate retrieval. Zero relevant notes is valid (`WORLD_KNOWLEDGE_NO_MATCH`) and may still yield `PROPOSED_CHARACTER_LORE`. That empty match does not make the candidate incomplete.

Product, UX, and Engineering stay gated like Systems, Research, and LookDev. They do not run for pure Content + Worldbuilding work. Harness infrastructure (did search run, was a packet bounded, was a concept ID preserved) is never specialist work.

Candidate proposals stay unapproved. Duplicate names/mechanics are collapsed deterministically. Reviewer is not invoked because Content or Worldbuilding proposed ideas.

## First-party visual evidence

Cached `FIRST_PARTY_VISUAL_ASSET` observations may inform theme. They do not become lore or mechanics automatically. Packets include only relevant named or classification-matched assets, not the whole library.
