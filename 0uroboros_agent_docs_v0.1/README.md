# 0uroboros agent specification v0.1

**The circuit and the serpent**

This directory is the agent-oriented source of truth for the current 0uroboros MVP rules and product requirements.

## Recommended reading order

1. `01_PROJECT_BRIEF.md`
2. `02_CORE_RULES_CIRCUIT_COLLAPSE.md`
3. `03_DRAFT_RULES.md`
4. `04_ONLINE_PRODUCT_AND_UX.md`
5. `05_TECHNICAL_REQUIREMENTS.md`

## Authority

These files describe the current agreed game rules. Specific card, Location, Chaos, VP, Crypto, generated-card, and Circuit Reward content remains deferred unless explicitly stated.

When implementing:

- Treat the server as authoritative for competitive game state, RNG, timers, and Draft transactions
- Treat current counts, supplies, timers, cooldowns, and balance values as configuration defaults, not structural constants
- Preserve chronological card play order as first-class state
- Use a data-driven content layer on top of a shared rules/resolution engine
- Do not infer new gameplay rules from example card text
- Use proper sentence case in user-facing copy
- Do not use em dashes in 0uroboros user-facing content

## Important terminology

- **Cycle:** Circuit Phase + Wave Collapse + cleanup + Draft
- **Node:** One of five contested positions
- **Location:** The randomly selected rules/content attached to a Node for a Cycle
- **Location Reward:** Reward granted by Location text during that Node's Collapse
- **Circuit Reward:** Separate reward determined by the final probabilistic Wave Collapse selection
- **Trash:** Shared, public, recoverable removal zone
- **Destroyed:** Permanent removal state
- **Effect Bank:** Four-slot public zone for Duration cards
- **Wallet:** Non-material Crypto available for the current Draft
