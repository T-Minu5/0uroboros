/**
 * Shared look of the table: dark metal in a magenta city.
 *
 * Cyan is the local seat. Amber is the opponent. Magenta is the world rim,
 * probability, and Collapse. Red is Drain. Mint is Restore and Crypto.
 */

export const COLOR = {
  obsidian: '#07050f',
  obsidianDeep: '#03020a',
  metal: '#12101c',
  rim: '#1a2438',
  self: '#27e2ff',
  rival: '#ffcc12',
  drain: '#fa0048',
  restore: '#1fffb1',
  chance: '#bc64ff',
  world: '#e2187a',
  accent: '#4173f2',
  crypto: '#1fffb1',
  legal: '#3fbfe0',
  closed: '#1a1a28',
} as const;

export type Atmosphere = 'play' | 'draft' | 'collapse';
