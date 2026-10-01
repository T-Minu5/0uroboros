# Model Routing

## Central defaults

```env
ASTRA_MODEL=gpt-6-astra
ENGINEERING_MODEL=gpt-5.6-sol
SPECIALIST_MODEL=gpt-5.6-terra
UTILITY_MODEL=gpt-5.6-luna
ALLOW_MODEL_FALLBACK=false
ASTRA_FALLBACK_MODEL=gpt-5.6-sol
```

Current official model IDs were verified during this revision.

## Routing

- Astra: cross-functional consequential planning, synthesis, difficult tradeoffs.
- Sol: hard engineering, architecture review, difficult QA/security/concurrency, complex execution.
- Terra: Product, UX, normal Systems, Content, Worldbuilding, Research.
- Luna: classification, extraction, formatting, repetitive low-risk transformations.

```text
Mechanical deterministic task → CODE
Simple LLM transformation → LUNA
Normal specialist reasoning → TERRA
Hard technical/review → SOL
Cross-functional consequential planning → ASTRA
```

Role definitions are independent of model IDs. IDs live in central config.

Astra fallback is disabled by default, explicit opt-in only, prominently logged, and never represented as Astra.

Reasoning settings are centralized and used only when supported by the configured model. Current Astra documentation indicates reasoning effort supports low, medium, high, xhigh and max, not none.
