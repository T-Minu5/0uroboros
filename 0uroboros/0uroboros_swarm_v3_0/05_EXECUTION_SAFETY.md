# Execution / promotion / safety

## Fence (immutable)

- Approved game rules
- Canonical authority
- Protected paths except explicit approved mutation class
- No automatic Obsidian writing
- No git push
- No production deploy
- No destructive git
- No external credential changes
- No rule invention

Protected prefixes (planning executor): `0uroboros_swarm_v2_0/`, `0uroboros_swarm_v3_0/`, `0uroboros_agent_docs_v0.1/`, `src/swarm/`, `.cursor/`, `docs/`, `AGENTS.md`, `tools/agent-harness/runs/`.

Delivery state lives in `tools/agent-harness/delivery/` so the runner can persist without touching protected prose.

## Promotion

Sandbox first. Diffs reviewed. Tests required for rules/engine. Player-facing changes need a running app check when possible. Dirty worktree does not authorize protected writes. Local only.

## Quality failure

A failed quality gate or visual critique schedules another iteration. It does not report success. A valid stop reason is required to leave the loop.
