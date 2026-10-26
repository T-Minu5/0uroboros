import { describe, expect, it } from 'vitest';
import { summarizeEvents } from '../src/logSummary';
import type { RuntimeEvent } from '@0uroboros/engine/runtime';

const names = ['You', 'Opponent'] as const;

describe('logSummary trash/destroy names', () => {
  it('names trashed and destroyed cards instead of only counting them', () => {
    const events = [
      { kind: 'reveal', owner: 0, cardId: 'a', text: 'Night Scythe reveals.', node: 0 },
      { kind: 'trash', owner: 0, cardId: 'a', amount: 1, text: 'Night Scythe trashes Shyte-Coin from your hand.' },
      { kind: 'trash', owner: 0, cardId: 'a', amount: 1, text: 'Night Scythe destroys Slash-Dot.' },
    ] as RuntimeEvent[];
    const lines = summarizeEvents(events, names).find(group => group.owner === 0)!.lines;
    expect(lines.some(line => /Trashing Shyte-Coin/.test(line))).toBe(true);
    expect(lines.some(line => /Destroying Slash-Dot/.test(line))).toBe(true);
  });
});
