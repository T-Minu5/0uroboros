# Circuit control evaluation — 2026-09-24

This revision follows the current conversation and supersedes the earlier weight-based rules for the evaluation build.

## Confirmed rules

- Each Location resolves and awards its own reward during Collapse. The Circuit Reward then uses the number of Locations each player won, without a weighted random selection. Equal win counts make both players eligible, including when every Location ties.
- Next-turn reveal priority goes to the player controlling more Locations. Equal counts retain current priority.
- Node percentages are removed from the board. Old +1/+2/+3 Draft effects transfer 1/2/3 of the player's existing Power between the played Location and a directly neighboring Location. Transfers preserve total Power, cannot take the opponent's Power, and cannot wrap between N1 and N5. Former 5/10/15 percent evaluation shifts use the same 1/2/3 conversion.
- Players can place cards at unopened Nodes. The existing implementation guide requires those cards to remain unrevealed until opening, then reveal in chronological order using current priority before new planning begins. Location identity and rewards stay hidden until opening.
- The player sees their current-turn placements face up until End Turn. Committing conceals them before authoritative reveals begin. Earlier committed placements at unopened Nodes stay face down.
- Undo all actions restores the current planning window's placements, hand order, and Action spending. It becomes active after the first placement and stops being available at End Turn. It cannot undo previously committed turns or opening-window effects.

## Card content

The supplied JSON remains the source for historic names, artwork, descriptions and effect text. Descriptions take precedence where they directly contradict the effects array; additional noncontradictory effects are retained. Original descriptions and effect arrays remain inspectable.

All ordinary historic cards are represented by executable recipes. Morphs, generated forms, Cat and Widget generators, and the Glitch generator remain deferred. Retained conflicting evaluation definitions have separate names/identities and placeholder artwork. The Card Catalog exposes all active definitions and a deliberate test-hand control for either player, separate from market purchases. Test cards can be added only at a Runtime planning boundary before any placement.

User-approved temporary Node Power for newly enabled Characters is half Crypto cost rounded up, minimum 1 and maximum 5. New VP cards use their VP value for Node Power. Previously assigned values are retained.

Historic Duration wording uses Runtime turns, while retained evaluation cards explicitly marked in Cycles keep their existing Cycle schedules. Delayed effects cross Cycle boundaries; permanent storage continues until the card leaves storage. OnReveal Actions remain available next Runtime turn, while scheduled start-of-turn Actions are usable in that turn.

Normal Draft keeps four persistent Base piles, two rotating Base offers, three persistent VP piles, three persistent Crypto piles, and three Chaos offers. The test catalog also exposes the additional VP and Crypto definitions without increasing those normal market pile counts.

## Presentation

The board uses the attached cyberpunk/occult reference as visual direction: angular hardware, illuminated sacred geometry, longer local lanes, integrated Power diamonds, and animated neon glass Data Center tubes. Tube fill and local table illumination follow integrity; damage flashes red and healing gold. Percentage plaques and the weighted-selection animation are removed.

Wallet and Effect Bank overlays use the same board projection as their physical housings. The text-only Undo control sits below the local Effect Bank. Local placement flights remain face up. Location award ripples are confined to the winning side, with both sides allowed for a tied award.

Validation results are recorded in the current development-state entry after the build and regression checks complete.
