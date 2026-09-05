# 0uroboros

> The circuit and the serpent

> Agent specification v0.1, September 4, 2026


# 14. Online match resilience

## Disconnects

- First disconnect: active timer pauses and player has 20 seconds to reconnect
- Opponent sees: Waiting for opponent...
- If the player reconnects within 20 seconds, their timer resumes
- If they fail to reconnect within 20 seconds, they forfeit
- Second disconnect: reconnect remains possible, but the active timer does not pause
- Third disconnect: automatic forfeit
- A player may disconnect/reconnect at most twice before the third-disconnect forfeit
- 20 seconds should be configurable for playtesting/operations
## AFK behavior

- If a turn timer expires and the player never used End Turn, flag them as potentially AFK
- On their next turn, their timer counts down at 1.25× speed until any player input is detected
- After input, restore/adjust to the appropriate normal timer behavior
- If two turns pass with no player input, automatically concede that player
- AFK speed multiplier and turn threshold should be configurable
## Concession and result categories

- Players may voluntarily concede
- Track Concessions and Forfeits distinctly
- Match Abandoned / Server Error outcomes do not count toward player stats
- Normal wins, losses, and ties follow final VP rules


# 15. Matchmaking, private games, and Membership architecture

## Standard matchmaking

- Players choose Runtime Mode or Short-Circuit Mode before queueing
- Each mode button should indicate current matchmaking activity, such as other players looking for a match
- Modes use separate player-selected queues
## Private games

- Private games are a future Membership feature
- Private games are completely configurable, including mode, timers, Cycle limit, and other exposed match parameters
- Private games do not count toward standard player stats
- Keep private/custom match stats separate from standard matchmaking stats
## Accounts and Membership

- MVP authentication supports Google/Gmail sign-in and standard email sign-in
- Free logged-in players may use standard matchmaking
- Player stats may be stored for free players, but are not viewable until Membership is purchased
- Private-game creation/access requires Membership
- Membership is currently envisioned as a one-time purchase
- Architect Account, Player Profile/Stats, Membership, Match, Matchmaking Queue, and Private Game Code as separable systems


# 16. Product screens and LookDev requirements

## Landing screen

- Large splash/hero treatment
- Sign In
- Join Game
- Join Game prompts for a shared game code
## Title screen

- Title: 0uroboros, with intentional numeral 0
- Working subtitle: The circuit and the serpent
- Play centered
- Settings top right
- Logged-in avatar top left
- Card Grid below Play
- Card Grid displays all potentially acquirable cards and supports detailed card inspection
## Lobby and match opening

- Play enters the selected matchmaking queue
- When matched, show both player avatars
- Begin Match opening/title sequence
## Animation and modal system

- Every phase or Circuit beat opens with a mini-animated title so both players share the same vocabulary
- Required titles: Start of Cycle, Node N opens, Reveal, Wave Collapse, Draft, Endgame, and match opening
- Wave Collapse is a major event, not a single title. Play it as a multi-beat sequence: each Node collapses and awards its Location text (if any) to the Node winner, or to both players if tied; then animate which Node probability collapsed into; then announce the Wave Collapse winner to both players before Draft appears
- The Wave Collapse winner is the player eligible for the Circuit Reward (both players if the selected Node tied)
- Choice-resolution modals must support optional, mandatory, and timed choices
- Invalid/no-target effects require explicit user feedback


# 17. Content strategy

- Use proper sentence case throughout product and game content
- One-line titles, subtitles, labels, buttons, and headings do not need a final period
- Gameplay/effect text uses proper terminal punctuation even when it is one line
- Keep all content clear and concise
- Do not use em dashes
- Bulleted lists may simplify multiple effects or instructions
