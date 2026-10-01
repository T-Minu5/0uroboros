# Architecture Questions Answered

1. User objective enters Application Harness, then Astra.
2. Astra controls planning judgment, decomposition, specialist selection, synthesis and WorkPackage proposals.
3. Deterministic code controls validation, authority, budgets, routing, versions, permissions, retries, approvals policy, persistence and canonical mutation gates.
4. Astra may invoke only registered advisory agent-tools. Minimum runtime: Product, UX, Engineering.
5. All Tier B specialists are advisory only.
6. Only authorized Tier C execution agents may modify files within scope. Canonical mutation uses deterministic Curator tooling.
7. SandboxAgents are used only for approved execution needing files/workspace/shell.
8. Tool assignments are defined in `17_AGENT_TOOL_PERMISSIONS.md`.
9. Rule/authority changes, dangerous actions, required canonical mutation, deployment and tool-authority expansion require human approval.
10. Canonical game knowledge changes only through human-approved deterministic Curator pipeline.
11. Idea → candidate → checks/review → Astra synthesis → human approval → canonical patch.
12. Approved plan → validated WorkPackage → scoped execution agent.
13. Execution → tests/QA/review → Execution Result Queue → promotion.
14. Missing Game Contract state → CONTRACT_REQUEST, optional PROVISIONAL_MOCK.
15. Conflicts → max two rounds → human escalation.
16. Proposal count is schema + RunBudget enforced.
17. Specialists cannot recurse because they receive no agent-tools.
18. Models selected centrally by task difficulty/consequence/cost/latency.
19. Code/Luna handle cheap work; Astra reserved for high-leverage planning.
20. Costs/usage use actual SDK metrics + local manifests, no fabricated attribution.
21. Loops bounded by SDK maxTurns + application RunBudget + bounded retries.
22. Built-in SDK tracing is inspected through OpenAI tracing/dashboard tooling, with local run manifests for governance metadata.
23. Skills are reusable procedures/references; agents are reasoning identities with model/tools/authority.
24. New specialist requires charter, authority, model class, contract, tools, Astra registration, budget and tests/evals.
25. Minimum runtime is Harness → Astra → Product/UX/Engineering tools → Astra synthesis → structured plan → human gate.
