# Product Constitution

## Non-negotiable rule authority

No agent may change approved gameplay rules without Mel.

Implementation may iterate. Rules may not.

If a genuine unresolved rule blocks implementation, Astra stops with a concise rule decision request. Do not invent a rule in order to keep coding.

## Runtime V1

Primary loop:

`Runtime Circuit -> Wave Collapse -> End of Cycle -> Draft -> End of Draft -> New Cycle`

Start of a new Cycle:

`End Draft -> New Cycle -> Wallet reset -> Location setup -> Start-of-Cycle effects -> draw hand`

The implementation presented for review must support repeated Cycles.

## Starting deck

Each player starts with the same 10-card deck:

Characters:
- Slash-Dot
- Dash-Dot
- Dotkrawler
- Rezz-Razor
- Rezz-Blade

Crypto:
- Byte-Coin x2
- Kilo-Coin x1

VP:
- Vault Encryption x2

Composition: **5 Character / 3 Crypto / 2 VP**.

Cycle 1 uses a mirrored initial shuffle so both players receive the same first hand. After the mirrored opening, future shuffles are independent.

## Actions

- Character deployment costs 1 Action unless approved text overrides.
- VP cards cost 0 Actions to deploy.
- Crypto is not deployable at Nodes.
- Runtime Turn 1 grants +2 Actions.
- Runtime Turn 2 grants +1 Action.
- Runtime Turn 3 grants +1 Action.
- No maximum Action count.
- OnReveal Actions become available on the next Runtime turn.
- Actions clear between Cycles.
- Carryover between Runtime turns remains configurable according to canonical rules.

## Runtime Nodes

- Turn 1 opens Nodes 1-3.
- Turn 2 opens Node 4.
- Turn 3 opens Node 5.
- Open Nodes remain playable until Collapse.
- Maximum 4 cards per player per Node.
- Cards deploy face down.
- Unopened-Node cards remain unrevealed until that Node opens.

## Approved Node information relationship

`Opponent cards`

`Opponent Power / priority`

`Location`

`Local Power / priority`

`Local cards / deployment region`

Exact geometry may evolve, but this relationship must remain immediately understandable.

Power must stay visible and unobstructed during resolution.

The Location must visibly belong to the Node.

## Reveal and priority

Reveal priority is global for the Runtime turn/window, not independently owned by each Node.

Within each player, reveal order follows chronological play order.

Eligible reveals alternate between priority player and the other player until one player has no remaining eligible cards, then the other player's remaining cards continue.

Use current canonical ControlledWeight and priority rules.

## Probability

Starting Node weights:
- Node 1: 30%
- Node 2: 25%
- Node 3: 20%
- Node 4: 15%
- Node 5: 10%

Weights sum to 100%.

Approved redistribution semantics include:
- source cannot fall below 0
- transfer larger than available source transfers all available
- 0% and 100% are legal
- 0.5% increments are supported where required
- final weighted selection uses final normalized weights

## Wave Collapse

Resolve Nodes 1 through 5.

Per Node:
1. Location onCollapse
2. Card onCollapse
3. recalculate Power
4. determine winner/tie
5. apply Location Reward

After Node 5, Effect Bank onCollapse resolves as the sixth location, oldest to newest.

Then exactly one Node is selected probabilistically from final weights for the separate Circuit Reward.

Location Reward and Circuit Reward are separate systems.

If game-ending Data Center destruction occurs during Collapse, finish the current Node including awards, then stop later Nodes and skip Draft.

## Data Centers and scoring

Each player has:
- Primary Data Center: 2000
- Backup Data Center: 1500

Generic Drain targets available Primary first, then Backup. No overkill spill unless explicit text says otherwise.

Generic Restore targets available Primary first; if Primary is destroyed/unavailable, Backup. Destroyed Data Centers cannot be restored. No overheal; excess Restore is lost.

Destroying:
- Primary awards 8 VP
- Backup awards 12 VP

Game ends when both Data Centers of a player are destroyed or after Cycle 16 according to canonical scoring flow.

## Draft

Draft is simultaneous and server-authoritative.

Core approved behavior includes:
- Wallet is for the current Draft only
- Crypto auto-plays entering Draft as approved
- unspent Crypto expires
- persistent Base/VP/Crypto supply structure
- refreshed Chaos offering per Draft
- special Circuit Reward offering for eligible winner(s)
- fixed printed costs plus approved modifiers
- atomic first-confirmed purchase semantics
- acquired cards normally go to Discard
- players may End Draft early
- final Cycle includes Draft before normal scoring unless the game ended by Data Center destruction

Use canonical sources for exact supply sizes, timers, cooldowns, and edge cases.

## Zones and Effect Bank

- Trash is shared and recoverable by effects.
- Destroyed is permanent.
- Effect Bank has 4 slots per player.
- Duration cards move to the Bank after Collapse when eligible and space exists.
- Duration timing and expiry follow canonical rules.
- Effect Bank onCollapse resolves after Node 5.

## Interaction locks

- Drag means deployment.
- Click/tap means card inspection.
- Drag must not open the full inspect view.
- During drag, the candidate Node and intended landing location must be clear.
- Hidden information must never be leaked.

## Presentation principle

**Global events announce globally. Local events resolve locally.**

Local presentation must preserve cause -> effect -> target comprehension.
