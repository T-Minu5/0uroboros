/**
 * Minimum viable card content for Phase 1 playtesting.
 *
 * These are original placeholder cards whose only purpose is to exercise the
 * engine. Every card exists to test a specific system, noted in its comment.
 * Balance values are arbitrary and expected to change.
 */

import type { CardDefinition } from '../types';

export const CARD_DEFINITIONS: Record<string, CardDefinition> = {
  // --- Starting deck: 4 Character cards ---

  /** Tests plain deployment and Power comparison with no effect text. */
  cipher_runner: {
    id: 'cipher_runner',
    name: 'Cipher runner',
    kind: 'character',
    power: 3,
    cost: 0,
    deployable: true,
    effects: [],
  },

  /** Tests onReveal timing and self Power modification. */
  echo_analyst: {
    id: 'echo_analyst',
    name: 'Echo analyst',
    kind: 'character',
    power: 2,
    cost: 0,
    deployable: true,
    effects: [
      {
        timing: 'onReveal',
        text: 'On reveal, gain 2 Power.',
        ops: [{ op: 'addPower', amount: 2, target: { kind: 'self' } }],
      },
    ],
  },

  /** Tests onPlay timing and probability transfer between Nodes. */
  phase_broker: {
    id: 'phase_broker',
    name: 'Phase broker',
    kind: 'character',
    power: 1,
    cost: 0,
    deployable: true,
    effects: [
      {
        timing: 'onPlay',
        text: 'On play, move 5% probability from the highest Node to this Node.',
        ops: [
          {
            op: 'transferProbability',
            amount: 5,
            from: { kind: 'highestNode' },
            to: { kind: 'thisNode' },
          },
        ],
      },
    ],
  },

  /** Tests onCollapse timing and Data Center damage. */
  breach_daemon: {
    id: 'breach_daemon',
    name: 'Breach daemon',
    kind: 'character',
    power: 2,
    cost: 0,
    deployable: true,
    effects: [
      {
        timing: 'onCollapse',
        text: 'On collapse, deal 150 damage to the opposing Data Center.',
        ops: [{ op: 'damageDataCenter', amount: 150, target: 'opponent' }],
      },
    ],
  },

  // --- Starting deck: 4 Crypto cards ---

  /** Tests Crypto auto-play at Draft transition and Wallet accumulation. */
  crypto_shard: {
    id: 'crypto_shard',
    name: 'Crypto shard',
    kind: 'crypto',
    power: 0,
    cost: 0,
    cryptoValue: 1,
    deployable: false,
    effects: [],
  },

  /** Tests Crypto card carrying an effect alongside its Wallet value. */
  liquidity_probe: {
    id: 'liquidity_probe',
    name: 'Liquidity probe',
    kind: 'crypto',
    power: 0,
    cost: 3,
    cryptoValue: 2,
    deployable: false,
    effects: [
      {
        timing: 'onDraftStart',
        text: 'At the start of Draft, gain 1 additional Crypto.',
        ops: [{ op: 'gainCrypto', amount: 1, target: 'self' }],
      },
    ],
  },

  // --- Starting deck: 2 Victory Point cards ---

  /** Tests static Victory Point contribution and Data Center healing. */
  ledger_sigil: {
    id: 'ledger_sigil',
    name: 'Ledger sigil',
    kind: 'victoryPoint',
    power: 1,
    cost: 0,
    victoryPoints: 2,
    deployable: true,
    effects: [
      {
        timing: 'onCollapse',
        text: 'On collapse, heal 100 to your Primary Data Center.',
        ops: [{ op: 'healDataCenter', amount: 100, target: 'self', dataCenter: 'primary' }],
      },
    ],
  },

  // --- Draft market: Base offerings ---

  /** Tests enemy Power reduction at a Node. */
  null_vector: {
    id: 'null_vector',
    name: 'Null vector',
    kind: 'base',
    power: 2,
    cost: 3,
    deployable: true,
    effects: [
      {
        timing: 'onReveal',
        text: 'On reveal, reduce each opposing card at this Node by 1 Power.',
        ops: [{ op: 'addPower', amount: -1, target: { kind: 'enemiesAtNode' } }],
      },
    ],
  },

  /** Tests ally Power buffs across a Node. */
  resonance_array: {
    id: 'resonance_array',
    name: 'Resonance array',
    kind: 'base',
    power: 1,
    cost: 4,
    deployable: true,
    effects: [
      {
        timing: 'onReveal',
        text: 'On reveal, give each of your other cards at this Node 1 Power.',
        ops: [{ op: 'addPower', amount: 1, target: { kind: 'alliesAtNode' } }],
      },
    ],
  },

  /** Tests card draw mid-Circuit. */
  signal_cache: {
    id: 'signal_cache',
    name: 'Signal cache',
    kind: 'base',
    power: 4,
    cost: 5,
    deployable: true,
    effects: [
      {
        timing: 'onReveal',
        text: 'On reveal, draw 1 card.',
        ops: [{ op: 'draw', amount: 1, target: 'self' }],
      },
    ],
  },

  /** Tests card destruction targeting. */
  entropy_lance: {
    id: 'entropy_lance',
    name: 'Entropy lance',
    kind: 'base',
    power: 3,
    cost: 6,
    deployable: true,
    effects: [
      {
        timing: 'onReveal',
        text: 'On reveal, destroy the lowest Power opposing card at this Node.',
        ops: [{ op: 'destroyCard', target: { kind: 'lowestPowerEnemyAtNode' } }],
      },
    ],
  },

  /** Tests the Trash zone as distinct from Destroyed. */
  recursive_husk: {
    id: 'recursive_husk',
    name: 'Recursive husk',
    kind: 'base',
    power: 6,
    cost: 4,
    deployable: true,
    effects: [
      {
        timing: 'onCollapse',
        text: 'On collapse, trash this card.',
        ops: [{ op: 'trashSelf' }],
      },
    ],
  },

  /** Tests Effect Bank entry, Duration countdown, and startOfCycle timing. */
  serpent_loop: {
    id: 'serpent_loop',
    name: 'Serpent loop',
    kind: 'base',
    power: 2,
    cost: 5,
    duration: 3,
    deployable: true,
    effects: [
      {
        timing: 'startOfCycle',
        text: 'At the start of each Cycle, gain 1 Crypto.',
        ops: [{ op: 'gainCrypto', amount: 1, target: 'self' }],
      },
    ],
  },

  /** Tests infinite Duration display and permanent Effect Bank occupancy. */
  eternal_recursion: {
    id: 'eternal_recursion',
    name: 'Eternal recursion',
    kind: 'base',
    power: 1,
    cost: 7,
    duration: 99,
    deployable: true,
    effects: [
      {
        timing: 'endOfCycle',
        text: 'At the end of each Cycle, gain 1 Victory Point.',
        ops: [{ op: 'gainVictoryPoints', amount: 1, target: 'self' }],
      },
    ],
  },

  /** Tests probability manipulation toward the lowest Node. */
  probability_sink: {
    id: 'probability_sink',
    name: 'Probability sink',
    kind: 'base',
    power: 2,
    cost: 4,
    deployable: true,
    effects: [
      {
        timing: 'onReveal',
        text: 'On reveal, move 10% probability from the highest Node to the lowest Node.',
        ops: [
          {
            op: 'transferProbability',
            amount: 10,
            from: { kind: 'highestNode' },
            to: { kind: 'lowestNode' },
          },
        ],
      },
    ],
  },

  /** Tests high-Power vanilla scaling for balance comparison. */
  monolith_core: {
    id: 'monolith_core',
    name: 'Monolith core',
    kind: 'base',
    power: 9,
    cost: 8,
    deployable: true,
    effects: [],
  },

  // --- Draft market: Victory Point offerings ---

  /** Tests purchased static Victory Points. */
  gnostic_tablet: {
    id: 'gnostic_tablet',
    name: 'Gnostic tablet',
    kind: 'victoryPoint',
    power: 0,
    cost: 4,
    victoryPoints: 3,
    deployable: true,
    effects: [],
  },

  /** Tests negative Victory Point values alongside strong Power. */
  cursed_ledger: {
    id: 'cursed_ledger',
    name: 'Cursed ledger',
    kind: 'victoryPoint',
    power: 7,
    cost: 3,
    victoryPoints: -2,
    deployable: true,
    effects: [],
  },

  /** Tests Backup Data Center explicit targeting through healing. */
  redundancy_rite: {
    id: 'redundancy_rite',
    name: 'Redundancy rite',
    kind: 'victoryPoint',
    power: 1,
    cost: 5,
    victoryPoints: 1,
    deployable: true,
    effects: [
      {
        timing: 'onCollapse',
        text: 'On collapse, heal 200 to your Backup Data Center.',
        ops: [{ op: 'healDataCenter', amount: 200, target: 'self', dataCenter: 'backup' }],
      },
    ],
  },

  // --- Draft market: Crypto offerings ---

  /** Tests higher-value Wallet contribution. */
  crypto_bloc: {
    id: 'crypto_bloc',
    name: 'Crypto bloc',
    kind: 'crypto',
    power: 0,
    cost: 2,
    cryptoValue: 2,
    deployable: false,
    effects: [],
  },

  /** Tests the top end of Wallet contribution. */
  quantum_vault: {
    id: 'quantum_vault',
    name: 'Quantum vault',
    kind: 'crypto',
    power: 0,
    cost: 5,
    cryptoValue: 4,
    deployable: false,
    effects: [],
  },

  // --- Draft market: Chaos offerings ---

  /** Tests per-player Chaos supply and aggressive Data Center pressure. */
  glitch_swarm: {
    id: 'glitch_swarm',
    name: 'Glitch swarm',
    kind: 'chaos',
    power: 4,
    cost: 4,
    deployable: true,
    effects: [
      {
        timing: 'onCollapse',
        text: 'On collapse, deal 250 damage to the opposing Data Center.',
        ops: [{ op: 'damageDataCenter', amount: 250, target: 'opponent' }],
      },
    ],
  },

  /** Tests granted cards that do not consume market supply. */
  fractal_seed: {
    id: 'fractal_seed',
    name: 'Fractal seed',
    kind: 'chaos',
    power: 2,
    cost: 3,
    deployable: true,
    effects: [
      {
        timing: 'onReveal',
        text: 'On reveal, add a Cipher runner to your discard pile.',
        ops: [
          {
            op: 'grantCard',
            cardDefId: 'cipher_runner',
            destination: 'discard',
            target: 'self',
          },
        ],
      },
    ],
  },

  /** Tests trashing an opposing card as distinct from destroying it. */
  void_auditor: {
    id: 'void_auditor',
    name: 'Void auditor',
    kind: 'chaos',
    power: 3,
    cost: 5,
    deployable: true,
    effects: [
      {
        timing: 'onReveal',
        text: 'On reveal, trash the highest Power opposing card at this Node.',
        ops: [{ op: 'trashCard', target: { kind: 'highestPowerEnemyAtNode' } }],
      },
    ],
  },
};

/**
 * Starting deck composition. Both players begin with identical 10-card decks:
 * 4 Character, 4 Crypto, 2 Victory Point.
 */
export const STARTING_DECK: string[] = [
  'cipher_runner',
  'echo_analyst',
  'phase_broker',
  'breach_daemon',
  'crypto_shard',
  'crypto_shard',
  'crypto_shard',
  'crypto_shard',
  'ledger_sigil',
  'ledger_sigil',
];

/** Card definition ids eligible for each market category at match setup. */
export const MARKET_POOLS = {
  base: [
    'null_vector',
    'resonance_array',
    'signal_cache',
    'entropy_lance',
    'recursive_husk',
    'serpent_loop',
    'eternal_recursion',
    'probability_sink',
    'monolith_core',
  ],
  victoryPoint: ['gnostic_tablet', 'cursed_ledger', 'redundancy_rite'],
  crypto: ['crypto_shard', 'crypto_bloc', 'quantum_vault'],
  chaos: ['glitch_swarm', 'fractal_seed', 'void_auditor'],
} as const;

export function getCardDefinition(cardDefId: string): CardDefinition {
  const def = CARD_DEFINITIONS[cardDefId];
  if (!def) throw new Error(`Unknown card definition: ${cardDefId}`);
  return def;
}
