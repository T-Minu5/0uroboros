# 0uroboros

> The circuit and the serpent

> Agent specification v0.1, September 4, 2026


# 1. Project brief

## Product concept

0uroboros is a two-player strategic deck-building game inspired by quantum mechanics. Players compete for control of five Nodes by deploying cards, manipulating Power and probability, resolving a deterministic Circuit, then performing a probabilistic Wave Collapse that selects one Node for a separate Circuit Reward.

The core design combines deterministic tactical control with strategically manipulated uncertainty. Players should be able to influence probability without fully controlling the final measured outcome.

## Design pillars

- Readable strategy: players can understand Power, current Node control, probability, public resources, and market state at a glance
- Meaningful uncertainty: probability can be manipulated, but the final Wave Collapse remains server-authoritative and probabilistic
- Persistent deck growth: early Cycles emphasize acquiring cards that improve later Circuits
- Open competitive Draft: players draft simultaneously while seeing opponent purchases, Wallet value, and shared supply
- Fast rules engine: effects resolve sequentially and deterministically, with explicit timing and no hidden effect stack
- Scalable architecture: core systems must support future Membership, private/custom games, stats, larger content pools, and tuning without rebuilding the game
## MVP product flow

Landing → Sign in / Join Game → Title Screen → Mode selection → Matchmaking Lobby → Match opening → Game Setup → repeated Cycles (Circuit + Wave Collapse + Cleanup + Draft) → Endgame

## Non-goals for this document

- Specific card definitions and balance
- Specific Location text
- Specific Circuit Reward pool contents
- Final art direction and animation treatment
- Final monetization pricing
- Ranked matchmaking or ranking formulas


# 2. Quantum model

The five Nodes begin each Cycle with a normalized probability distribution of 30%, 25%, 20%, 15%, and 10%. The quantum-inspired formulation uses probability amplitudes αi, where the probability of state i is |αi|².

|ψ⟩ = α₁|1⟩ + α₂|2⟩ + α₃|3⟩ + α₄|4⟩ + α₅|5⟩

P(i) = |αᵢ|²     and     Σ P(i) = 1

| Node | Base probability | Positive real amplitude |
| --- | --- | --- |
| 1 | 30% | √0.30 ≈ 0.548 |
| 2 | 25% | √0.25 = 0.500 |
| 3 | 20% | √0.20 ≈ 0.447 |
| 4 | 15% | √0.15 ≈ 0.387 |
| 5 | 10% | √0.10 ≈ 0.316 |

- Probability is Cycle-local by default and resets to 30/25/20/15/10 at the next Cycle
- Probability may reach 0% or 100%
- Probability cannot go negative
- Probability uses 0.5% increments
- If an effect attempts to transfer more probability than the source has, transfer all available probability and reduce the source to 0%
- A 0% Node still resolves normally and can grant Location rewards, but cannot be selected by the final probabilistic Collapse
- A 100% Node makes the final probabilistic Collapse deterministic


# 3. Core game objects and zones

## Player zones and resources

- Draw pile / deck: hidden and not freely inspectable
- Hand: hidden
- Discard pile: hidden and not freely inspectable unless effect text grants access
- Shared Trash pile: public and inspectable by both players; trashed cards may return through effects
- Destroyed zone/state: permanent removal; destroyed cards cannot return
- Wallet: non-material Crypto available for the current Draft
- Effect Bank: four visible slots for Duration cards
- Primary Data Center: 2,000 maximum health
- Backup Data Center: 1,500 maximum health
- Victory Point total: maintained in real time; display is on by default and may be hidden by player setting
## Card ownership and control

Cards must model Owner and Controller separately. They are normally the same player, but the architecture must support future control-changing effects and correct zone return behavior.

## Starting deck

- Both players begin with identical 10-card decks
- 4 Character cards
- 4 Crypto cards
- 2 Victory Point cards
- Character cards have effect text with explicit timing
- Crypto cards are not playable at Nodes; they are used for Draft purchasing and may contain effects
- VP cards are playable at Nodes and will often focus on Data Center healing, though exact content is deferred


# 4. Match setup and Cycle structure

## Match setup

1. Create both players with identical starting decks and empty Effect Banks
1. Initialize Primary and Backup Data Centers
1. Randomly select the persistent Draft market: 9 Base card types, 3 VP card types, and 3 Crypto card types
1. Initialize persistent shared supply for those market piles
1. Set game mode and match configuration
1. Randomize initial reveal priority
1. Begin Cycle 1
## Cycle structure

1. Circuit Phase
1. Wave Collapse
1. Post-Collapse cleanup and End-of-Cycle processing
1. Draft Phase
1. End of Draft
1. New Cycle
1. Wallet reset to 0
1. Location setup
1. Start-of-Cycle effects
1. Draw hand
Default hand draw is 5 cards every Cycle unless effects modify it. There is no maximum hand size. If a draw requests more cards than exist across available Draw and reshufflable Discard, draw all available cards and stop.

Cycle 1 draws the first 5 cards of the starting deck. Cycle 2 draws the remaining 5. When the Draw pile is exhausted, reshuffle the Discard pile, including newly acquired cards, and continue drawing.
