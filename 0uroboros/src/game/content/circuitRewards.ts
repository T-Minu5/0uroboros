/**
 * Placeholder Circuit Reward content for Phase 1.
 *
 * The Circuit Reward is separate from Location Rewards. After all normal Collapse
 * processing, one Node is selected using the final probability weights, and that
 * Node's winner receives the Circuit Reward as a privileged Draft offering.
 */

import type { CircuitRewardDefinition } from '../types';

export const CIRCUIT_REWARD_DEFINITIONS: Record<string, CircuitRewardDefinition> = {
  /** Tests a Crypto windfall entering the upcoming Draft. */
  quantum_dividend: {
    id: 'quantum_dividend',
    name: 'Quantum dividend',
    text: 'Gain 5 Crypto for this Draft.',
    effects: [
      {
        timing: 'onAcquire',
        text: 'Gain 5 Crypto for this Draft.',
        ops: [{ op: 'gainCrypto', amount: 5, target: 'self' }],
      },
    ],
  },

  /** Tests direct Victory Point award through the Circuit Reward path. */
  serpent_crown: {
    id: 'serpent_crown',
    name: 'Serpent crown',
    text: 'Gain 4 Victory Points.',
    effects: [
      {
        timing: 'onAcquire',
        text: 'Gain 4 Victory Points.',
        ops: [{ op: 'gainVictoryPoints', amount: 4, target: 'self' }],
      },
    ],
  },

  /** Tests granted cards bypassing market supply. */
  fabricator_grant: {
    id: 'fabricator_grant',
    name: 'Fabricator grant',
    text: 'Add a Monolith core to your discard pile.',
    effects: [
      {
        timing: 'onAcquire',
        text: 'Add a Monolith core to your discard pile.',
        ops: [
          {
            op: 'grantCard',
            cardDefId: 'monolith_core',
            destination: 'discard',
            target: 'self',
          },
        ],
      },
    ],
  },

  /** Tests Data Center repair as a reward. */
  integrity_patch: {
    id: 'integrity_patch',
    name: 'Integrity patch',
    text: 'Heal 400 to your Primary Data Center.',
    effects: [
      {
        timing: 'onAcquire',
        text: 'Heal 400 to your Primary Data Center.',
        ops: [{ op: 'healDataCenter', amount: 400, target: 'self', dataCenter: 'primary' }],
      },
    ],
  },
};

export const CIRCUIT_REWARD_POOL: string[] = Object.keys(CIRCUIT_REWARD_DEFINITIONS);

export function getCircuitRewardDefinition(rewardId: string): CircuitRewardDefinition {
  const def = CIRCUIT_REWARD_DEFINITIONS[rewardId];
  if (!def) throw new Error(`Unknown circuit reward definition: ${rewardId}`);
  return def;
}
