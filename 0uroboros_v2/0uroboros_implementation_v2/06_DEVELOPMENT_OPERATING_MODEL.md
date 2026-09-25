# Development Operating Model

## Astra owns the method

Astra decides how to achieve the V3 outcome.

This guide does not prescribe:
- a fixed number of agent rounds
- one delivery-runner architecture
- one WorkPackage format
- one critic frequency
- one specialist topology
- one frontend architecture

Astra may reuse or replace previous harness work.

## Responsibility split

### Mel
Owns:
- game rules
- product intention
- human approvals
- final direction

### Astra
Owns:
- development strategy
- prioritization
- delegation
- integration decisions
- when specialist judgment is worth the cost
- when to iterate or abandon a weak approach
- when the build is ready for 80% direction review

### Specialists
Provide bounded domain judgment:
- UX
- LookDev / Art Direction
- Engineering
- Systems / Rules
- Research
- Content
- Worldbuilding
- Reviewer

### Deterministic tooling
Owns:
- tests
- schema validation
- arithmetic
- file/diff inspection
- build/type checks
- known rule invariants
- browser automation where deterministic
- usage accounting

## Smallest capable team

Do not invoke the full swarm for every change.

Use specialists when judgment materially improves the outcome.

## Creator and critic

For material visual work, use independent critique where useful.

A productive pattern is:

`evidence -> direction -> implementation -> running build -> critique -> Astra decision`

## Substantial iteration

Avoid expensive micro-cycles.

Prefer:
1. gather representative evidence
2. perform meaningful UX/LookDev critique
3. synthesize several related deficiencies
4. implement a coherent package
5. run tests and game
6. capture new evidence
7. critique again

## Long-running behavior

Long-running development is a process goal, not one giant model conversation.

Astra may design or simplify the harness as long as:
- work can continue through meaningful iterations
- state is recoverable
- agent usage is observable
- deterministic truth is tested
- human authority is preserved
- authorized budget is respected

If the existing runner gets in the way, replace it.

## Tracing

Keep supported OpenAI Agents SDK tracing for live swarm work.

Tracing is accountability, not orchestration.

Use it to verify:
- Astra actually ran
- specialists actually ran
- models/requests/tokens/tools used
- outputs that informed decisions

Do not store hidden chain-of-thought.

## Cost

Use the currently authorized project API budget; do not silently reset prior spend.

Budget is a ceiling, not a target.

## Historical docs

Historical V2/V3 swarm architecture is evidence and lessons, not mandatory future process.

## Success criterion

Optimize the actual game, not:
- WorkPackage count
- agent-call count
- documentation count
- shader count
- score fields disconnected from observable quality

Optimize:
- correct game
- coherent UX
- strong art direction
- reference-informed effects
- stable multi-cycle play
- meaningful human-review readiness
