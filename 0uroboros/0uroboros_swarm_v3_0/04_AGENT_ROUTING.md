# Agent / model routing

## Roles

- **Deterministic code** first: tests, arithmetic, diffs, asset enumeration, schema, cost, scoring, file scope, simple transforms
- **Luna**: cheap extraction / classification
- **Terra**: UX, LookDev, Content, Worldbuilding, ordinary Systems, moderate analysis
- **Sol**: rendering, Three.js, shaders, state architecture, effect engine, hard bugs, Reviewer, hard integration
- **Astra**: delivery manager. Direction, synthesis, priority, decompose, adjudicate within authority. Not the default implementer

## SDK vs project

One `@openai/agents` run with `maxTurns` is a specialist packet. The DemoDeliveryRunner starts another run when the delivery state still has work.

Cursor / local workers may execute a WorkPackage without a paid call when the change is mechanical or already specified.

## Anti-loop

`MAX_WORKPACKAGE_REPAIR_ATTEMPTS = 3` per package. Planning-run LookDev/Astra caps still apply inside `npm run swarm` so a single SDK session cannot spin. They are not the program's iteration budget.
