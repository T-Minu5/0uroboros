# Figma card presentation

Implemented from the six user-supplied Circuit variants on September 25, 2026. Inspected directly in the Figma desktop app; the public web reader could not access the file. Existing card artwork and rules are retained.

## Reference mapping

- [Hacker, 511:7811](https://www.figma.com/design/kUko5evw6b4IK5jnf6N4o2/Circuit?node-id=511-7811&m=dev): purple gradient `#5B0F94` → `#320055`; existing `icon-power.svg` class mark.
- [Action, 690:7955](https://www.figma.com/design/kUko5evw6b4IK5jnf6N4o2/Circuit?node-id=690-7955&m=dev): blue gradient `#202F78` → `#0C1230`; `icon-runtime.svg`.
- [Attack, 690:7989](https://www.figma.com/design/kUko5evw6b4IK5jnf6N4o2/Circuit?node-id=690-7989&m=dev): red gradient `#7E1839` → `#370715`; `icon-attack.svg`.
- [Utility, 690:8019](https://www.figma.com/design/kUko5evw6b4IK5jnf6N4o2/Circuit?node-id=690-8019&m=dev): cyan gradient `#286C8C` → `#0D2635`; `icon-utility.svg`.
- [Crypto, 511:7895](https://www.figma.com/design/kUko5evw6b4IK5jnf6N4o2/Circuit?node-id=511-7895&m=dev): green gradient `#057642` → `#0C2B1F`; `icon-crypto.svg`.
- [VP, 691:8079](https://www.figma.com/design/kUko5evw6b4IK5jnf6N4o2/Circuit?node-id=691-8079&m=dev): gold gradient `#94581C` → `#44290F`; `icon-volume.svg`.

The reference frame is 158 × 224 with an 8px corner radius, a 4px border, full-card art, a bottom name strip, and a class-colored Power circle at the upper right. Duration sits at the upper left. Draft cost sits above the name strip on the right in green. These are component-based faces, not flattened screenshots or replacements for authored art.

## Behavior

`CardFace` is shared by authoring preview, hand and dragging, board, Effect Bank, Crypto Cache, catalog, Draft, and inspector. Compact board/bank/cache faces preserve art, frame, Power and Duration while omitting the name strip. Full names remain accessible through inspection. Cost appears only when the face receives Draft context; authoring explicitly offers an In play / Draft switch.

Power is shown when the card has a numeric Power, including zero. Modifiers preserve boosted/reduced badge treatments and the existing presentation hooks. Duration is absent when undefined, retains remaining-time updates in the Effect Bank, and displays infinity for permanent duration 99. Existing privacy rules still determine whether a board card shows its face or back.

Names use measured Orbitron text, resizing down from 22px to 14pt (18.6667 CSS pixels). Once that floor is reached, overflow uses an ellipsis. Measurements update for card edits, font loading and container resizing; full text remains in the DOM and tooltip.

Class metadata takes precedence over historic tags. Former Power tags map to Hacker; Runtime uses the Action frame. Generated follows its underlying class/type rather than creating a seventh visual type. No class is inferred from card effects.

## Verification

`npm run test:card-styles` checks the six references, artwork preservation, badges, long and short names, mobile layout, pointer dragging, deployment, and actual Draft/inspection after a full Cycle. The script does not save authoring edits. Screenshots are in `docs/evidence/card-styles/`. Rule tests also cover explicit class precedence and generated/historical classification.
