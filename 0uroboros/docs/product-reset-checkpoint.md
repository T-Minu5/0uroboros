# Human direction checkpoint — product reset

Local play: http://127.0.0.1:5176/  
Look capture: http://127.0.0.1:5176/?look=1  
Screenshots: `tools/agent-harness/delivery/evidence/product-reset/`

## Architecture chosen

- **Retain** `src/game` + Vitest multi-Cycle proof (`tests/gameLoop.test.ts`).
- **Retain** presentation queue / Collapse script (Node-by-Node already existed).
- **Stop** LIVE_OPENAI autonomous harness for this phase (~$100 prior spend frozen). Harness was absorbing budget without fixing UX.
- **Rebuild** timing, deploy flight weight, card impact, first-party art on board cards.
- **Theme firewall** kept: cyan/magenta cyberpunk identity; Snap/HS used for sequencing/weight only.

See `docs/product-reset-architecture.md` and `src/client/presentation/principles.ts`.

## Retained / replaced from V2/V3

| Keep | Drop / de-prioritize |
| --- | --- |
| Approved rules + engine | Endless LIVE_OPENAI critique loop as primary driver |
| Node column UX (rival/power/location/power/self) | Treating file markers as quality evidence |
| Click inspect / drag deploy | look=1 capture chrome as the default product look |
| Effect refs as inspiration only | Shipping effect webps |

## Agents / API this reset

Product work was Cursor-led implementation against Mel’s brief. No new long LIVE_OPENAI autonomous burn. Prior cycle spend remains on the ledger (~$100 known). Ceiling still $200.

## Multi-Cycle validation

`npx vitest run` → **550 passed**, including `tests/gameLoop.test.ts` (Runtime → Collapse → Draft → Cycle 2).

## Snap / Hearthstone UX benchmark audit

1. **Snap — Node gap:** `collapseNodeGapMs` raised to 720ms and applied to each Node’s last Collapse beat so Location/Power for Node N settle before Node N+1 starts (`collapseScript.ts` + `timing.ts`).
2. **Snap — one effect at a time:** local FX group holds use longer minimum read; `FX_STEP_MS` raised so resolution does not dump simultaneous beats.
3. **Snap — Collapse still Node-ordered:** existing script walks Location → Power → reward per Node; gap makes the sequence readable instead of a continuous wall.
4. **Hearthstone — deploy weight:** `CardFlightOverlay` keyframes now windup → travel → contact squash → settle (`WEIGHT_EASE` / `IMPACT_EASE`), duration ≥ 920ms normal.
5. **Hearthstone — board strike:** `CardVisual` source windup + impacted contact punch with slower decay (anticipation/contact/follow-through on Drain/hit).

## Reference → implementation

| Reference | Principle | Implementation |
| --- | --- | --- |
| Marvel Snap footage (resource library) | Staggered resolution | Node gap + ordered Collapse script |
| Hearthstone attack dynamics | Weight | Card flight + CardVisual impact |
| Board concept art | Octagon / pylons / city | Existing TableVisual + arena art |
| Card art assets | Identity | Restored art maps on board cards + title plate |
| Occult/quantum effect webps | Theme tags only | Sigil / interference SVG marks (unchanged policy) |
| WaveField / ScanEffect URLs | Table deformation | Existing WaveField shader |

## Strongest remaining criticisms

- Default play still shows heavy Location text plaques over Nodes; 3D wells are secondary until look=1.
- Hand still fans with overlap; better than before, not yet Snap-clean inspectability at five cards.
- Probability transfer is clear in look capture; mid-Runtime Drain storytelling needs more playtesting with real FX queues.
- Attack follow-through on board cards is present but not yet a dedicated trade cinematic.

## Mel review priorities

1. Drag a Character onto a Node — does deploy feel weighted?
2. Play through Window → Reveal → Collapse — can you track one Node at a time?
3. Compare http://127.0.0.1:5176/ vs `?look=1` for causality readability.
4. Confirm first-party card art on board after reveal.
5. Note whether Location plaques still feel too HUD-like vs concept art.
