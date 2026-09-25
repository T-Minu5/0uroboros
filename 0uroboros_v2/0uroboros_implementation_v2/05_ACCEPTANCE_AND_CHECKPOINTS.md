# Acceptance and Human Checkpoints

## Hard gates before confidence

Astra's approximately 80% direction confidence cannot override hard failures.

## Rule integrity

Pass only when:
- no approved rules were changed
- affected systems align with canonical mechanics
- deterministic rule tests pass

## Multi-cycle play

The actual client must demonstrate at least:

`Cycle 1 Runtime -> Collapse -> Draft -> Cycle 2 Runtime -> Collapse -> Draft -> Cycle 3`

Use real gameplay interactions, not only a zero-card shortcut.

Validate:
- deployment
- reveal
- effects
- Collapse
- Draft interaction
- End Draft
- next-cycle initialization

Broken Draft or inability to pass Cycle 1 is automatic failure.

## Approved UX

Require:
- opponent/local Power visible and clearly associated with Node side
- Location visibly belongs to Node
- drop target belongs perceptually to Node
- drag communicates target and landing
- drag does not open full inspect
- click/tap can inspect
- local effects resolve locally
- hidden information is preserved

## Presentation

Require:
- Collapse presented every Cycle
- Draft never appears before required Collapse presentation completes
- no duplicated/stale Collapse
- presentation cannot permanently block progression
- source/target effects can be followed
- timing is human-readable

## Visual/reference evidence

Require fresh current-build comparison against:
- board concept art
- first-party card art/icon use
- Marvel Snap sequencing
- Hearthstone motion weight
- applicable effect references
- broader Examples of Good / Great

File existence alone is not quality evidence.

## Original effects

At checkpoint, show representative newly authored effects derived from supplied references.

Use SVG, R3F/Three.js, particles, shaders, or post-processing where appropriate.

No source reference animation may be used directly.

## Agent evidence

If claiming specialist-led work, actual agent invocations must be traceable.

Record real available usage:
- agent
- model
- requests
- tokens
- trace/run identifiers where supported

Do not claim an agent ran when no OpenAI request occurred.

## 80% direction checkpoint

Stop when Astra has approximately 80% confidence that:
- the game functions coherently
- current direction faithfully represents the product
- UX/visual system is developed enough to judge
- major reference principles are visible
- remaining problems are refinements rather than basic uncertainty

This is qualitative manager judgment supported by evidence, not a file-count formula.

## Checkpoint package

Provide:
- exact local run command/URL
- agents/models actually used
- API usage against authorized budget
- architecture/process chosen
- rule integrity
- multi-cycle play evidence
- screenshots/runtime evidence
- board concept influence
- card art/icon usage
- Snap sequencing before/after
- Hearthstone weight before/after
- effect reference -> original implementation
- Three.js technique -> original implementation
- strongest independent UX/visual criticisms
- major known shortcomings
- 3-5 specific things Mel should test

## Valid early stops

Before 80%, stop only for:
- genuine unresolved rule decision
- authority boundary
- budget limit
- unrecoverable technical blocker after meaningful attempts
- explicit human interruption

Weak first passes, failed effects, test failures, or bad LookDev experiments normally require iteration.
