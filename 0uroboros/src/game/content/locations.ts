/**
 * Placeholder Location content for Phase 1.
 *
 * Locations attach to a Node for a Cycle and resolve their onCollapse text
 * before card effects at that Node. Location Rewards are granted during that
 * Node's Collapse and are separate from the Circuit Reward.
 */

import type { LocationDefinition } from '../types';

export const LOCATION_DEFINITIONS: Record<string, LocationDefinition> = {
  /** Tests a plain Crypto Location Reward to the Node winner. */
  data_exchange: {
    id: 'data_exchange',
    name: 'Data exchange',
    text: 'On collapse, the winner gains 2 Crypto.',
    effects: [
      {
        timing: 'onCollapse',
        text: 'On collapse, the winner gains 2 Crypto.',
        ops: [{ op: 'gainCrypto', amount: 2, target: 'nodeWinner' }],
      },
    ],
  },

  /** Tests a Victory Point Location Reward. */
  occult_archive: {
    id: 'occult_archive',
    name: 'Occult archive',
    text: 'On collapse, the winner gains 2 Victory Points.',
    effects: [
      {
        timing: 'onCollapse',
        text: 'On collapse, the winner gains 2 Victory Points.',
        ops: [{ op: 'gainVictoryPoints', amount: 2, target: 'nodeWinner' }],
      },
    ],
  },

  /** Tests probability redistribution driven by a Location. */
  entanglement_lab: {
    id: 'entanglement_lab',
    name: 'Entanglement lab',
    text: 'On collapse, move 5% probability from this Node to the lowest Node.',
    effects: [
      {
        timing: 'onCollapse',
        text: 'On collapse, move 5% probability from this Node to the lowest Node.',
        ops: [
          {
            op: 'transferProbability',
            amount: 5,
            from: { kind: 'thisNode' },
            to: { kind: 'lowestNode' },
          },
        ],
      },
    ],
  },

  /** Tests Data Center damage originating from a Location. */
  breach_relay: {
    id: 'breach_relay',
    name: 'Breach relay',
    text: 'On collapse, the loser takes 200 Data Center damage.',
    effects: [
      {
        timing: 'onCollapse',
        text: 'On collapse, the loser takes 200 Data Center damage.',
        ops: [{ op: 'damageDataCenter', amount: 200, target: 'nodeLoser' }],
      },
    ],
  },

  /** Tests card acquisition as a Location Reward. */
  fabrication_bay: {
    id: 'fabrication_bay',
    name: 'Fabrication bay',
    text: 'On collapse, the winner adds a Cipher runner to their discard pile.',
    effects: [
      {
        timing: 'onCollapse',
        text: 'On collapse, the winner adds a Cipher runner to their discard pile.',
        ops: [
          {
            op: 'grantCard',
            cardDefId: 'cipher_runner',
            destination: 'discard',
            target: 'nodeWinner',
          },
        ],
      },
    ],
  },

  /** Tests card draw as a Location Reward. */
  signal_tower: {
    id: 'signal_tower',
    name: 'Signal tower',
    text: 'On collapse, the winner draws 1 card.',
    effects: [
      {
        timing: 'onCollapse',
        text: 'On collapse, the winner draws 1 card.',
        ops: [{ op: 'draw', amount: 1, target: 'nodeWinner' }],
      },
    ],
  },

  /** Tests a Location with a reward for both players on a tie. */
  quantum_commons: {
    id: 'quantum_commons',
    name: 'Quantum commons',
    text: 'On collapse, the winner gains 1 Crypto and 1 Victory Point.',
    effects: [
      {
        timing: 'onCollapse',
        text: 'On collapse, the winner gains 1 Crypto and 1 Victory Point.',
        ops: [
          { op: 'gainCrypto', amount: 1, target: 'nodeWinner' },
          { op: 'gainVictoryPoints', amount: 1, target: 'nodeWinner' },
        ],
      },
    ],
  },
};

export const LOCATION_POOL: string[] = Object.keys(LOCATION_DEFINITIONS);

export function getLocationDefinition(locationId: string): LocationDefinition {
  const def = LOCATION_DEFINITIONS[locationId];
  if (!def) throw new Error(`Unknown location definition: ${locationId}`);
  return def;
}
