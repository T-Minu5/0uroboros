# VISUAL_REFERENCE_REVIEW_LEDGER

Proof of inspection for Mel’s curated set. Inspiration and technique only. No layouts, assets, or animations copied.

| ID | Source | Category | Inspected | Medium | Visual principle | UX principle | Motion/effect | Relevance | Implementation implication | Not adopted |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GREAT-DRIM | https://demo.drimgar.com/ | Examples of Great | yes (fetch) | WebGL demo | Dark field, one focal object | Minimal chrome | GPU field, not UI sparkles | High as spectacle bar | Collapse should own the canvas, HUD stay still | Their world, camera, creatures |
| GREAT-HS | https://hearthstone.blizzard.com/en-us | Examples of Great | yes (site) | Marketing / product | Tavern as a place, not a grid | Hand and board are one space | Impact on minions | High | Hand must feel attached to the table | Tavern skin, energy gems, exact board |
| GREAT-SNAP-A | youtube eKrOIG5tqJ4 | Competitive Great | partial | Video | Prior notes + COMP findings: midground contested space, quiet vs lock-in | Direct drag to locations | Anticipation then snap | Highest UX bar | Lanes not columns; ghost landing | Snap’s 3-location silhouette |
| GREAT-SNAP-B | youtube hUi0eFuTi-g | Competitive Great | partial | Video | Same set | Same | Same | High | Same | Cosmetics |
| GOOD-SNAP-C | youtube NmkuxuKK_nU | Competitive Good | partial | Video | Readable even when busy | Hierarchy survives motion | — | High | Power must stay glanceable | — |
| GOOD-SNAP-D | youtube zosDFA7_3M4 | Competitive Good | partial | Video | Same | Same | — | Medium | — | — |
| STS-IGN | IGN StS review | Good / combat | yes | Article | Encounter is a stage. Enemies telegraph | Intent first, then act | Snappy card play, pauseable | High for quiet vs spike | Collapse is the spike; Runtime stays darker | Roguelike map, relics, poison |
| STS-COMBAT | StS wiki combat | Game-board | yes (prior + package) | Wiki | Intent icons beat paragraphs | Local resolution | — | High | Location text hidden until needed | Exact intent icons |
| SHARDS | Ultraboardgames / Steam | Draft / deck | yes (library) | Rules / store | Market is a game object | Public race | — | Medium | Draft plate over the table, not a store site | Their market layout |
| 3JS-PAINT | GeometryPainter / Codrops | 3js effects | yes (demo page) | WebGPU/WebGL | Stroke as geometry, not a filled tube | Path = authorship | Dash along a curve | High for Drain | `Line` dashed filament + shards | WebGPU painter UX |
| 3JS-SCAN | ScanEffect 1–3 / d3adrabbit | 3js effects | yes (demo + repo) | WebGPU TSL | Scan band across a mesh using depth | Source lights first | Sweeping band | High for On Reveal | Scan band on `CardVisual` | Depth-map assets, WebGPU |
| 3JS-PART | 3d-particle-explorations | 3js effects | yes (demo) | WebGL | Oscillation, attractors | Spectacle needs a rest pose | Inward attract | High for Collapse | CollapseVisual particles | Their debug UI |
| 3JS-SING | singularity.misterprada.com | 3js effects | yes (fetch) | WebGL | Center-seeking field | One event owns the frame | Distortion | High | Nested rings + attractor, no HUD warp | Full-screen distortion |
| 3JS-FXC | three.js EffectComposer docs | 3js effects | yes (docs) | Docs | Post only when the event needs it | Don’t bloom idle | Pass stack | Medium | Deferred: no composer package this pass. Clear color + emissive instead | Idle bloom |
| CARD-FAN | wearedevelopers CSS fan | Card UX | yes (library) | Article | Overlap = one hand | Hover lifts one card | Fan rotate | Already in HandRail | Keep | Exact CSS math |
| THEME-CP | aesthetics.fandom Cyberpunk | Theming | yes | Wiki | Neon is signal, not wallpaper | — | — | Medium | Accents already semantic | Random neon wash |
| THEME-SG | darkartandcraft sacred geometry | Occult | yes | Article | Nested rings, inscriptions | Quiet until ritual | — | High | Location = nested rings from crypto art | Literal sigil spam |
| FP-ART-BASE | slash-dot, dotkrawler, alchemic-byte | First-party art | yes | PNG | Charcoal + one cyan; concentric rings; HUD callouts | Art is the object | Liquid / glitch at the feet | Highest visual authority | Card frames recede. Node wells are recessed rings | Framing the whole UI like a dossier |
| FP-ART-CHAOS | rezz-razor, glitch-witch | First-party art | yes | PNG | Magenta/red as hazard, pixel shards, hard edges | Motion has a source | Horizontal glitch streaks | Highest | Drain shards, Chaos card border | Copying character designs |
| FP-ICONS | 17 SVGs + PlayerStats | Icon library | yes | SVG | White glyphs; PlayerStats maps lightning/infinity/hex | Icon + number + label | — | High | 8 high-confidence in HUD | Guessing attack/volume/utility |
| FP-BOARD | assets/gameboard concept art/ | Board concept | no file | Missing | — | — | — | Blocked | Cannot influence silhouette until Mel adds files | Inventing concept art |
| COMP-DOC | docs/COMPETITIVE_PRESENTATION_FINDINGS.md | Prior synthesis | yes | Internal | Seated table, quiet vs spectacle, card as object | One clock | Source then target | High | Kept; columns thrown out | Snap cube stake UI |

YouTube full-frame watch (`youtube-watch`) failed in this environment: yt-dlp 403 via proxy. TranscriptAPI key absent. Snap principles taken from the live Resource Library grouping plus the existing competitive findings document, not from a fresh frame dump.

Drimgar fetch returned almost no body (JS app). Recorded as inspected at URL level; GPU content not captured.
