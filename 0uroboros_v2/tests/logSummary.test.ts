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

describe('logSummary copy and discard gains', () => {
  it('records what a copy card copied, or that there was no target', () => {
    const copied = summarizeEvents([
      { kind: 'reveal', owner: 0, cardId: 'deepfake', text: 'Deepfake reveals.', node: 0 },
      { kind: 'choice', owner: 0, cardId: 'deepfake', sourceName: 'Deepfake', text: "Deepfake copied 'Glitch-Witch': Put a Glitch into the enemy Discard. Draw 2" },
      { kind: 'draw', owner: 0, cardId: 'deepfake', targetOwner: 1, target: 'discard', amount: 1, sourceName: 'Deepfake', text: 'Deepfake: gain 1 Glitch-A to Discard.' },
    ] as RuntimeEvent[], names).find(group => group.owner === 0)!.lines;
    expect(copied.some(line => /Copying Glitch-Witch/.test(line))).toBe(true);
    expect(copied.some(line => /Giving Glitch-A to Opponent's Discard/.test(line))).toBe(true);

    const missed = summarizeEvents([
      { kind: 'reveal', owner: 0, cardId: 'koppy', text: 'Koppy-Kat reveals.', node: 0 },
      { kind: 'choice', owner: 0, cardId: 'koppy', sourceName: 'Koppy-Kat', text: 'Koppy-Kat: no previous revealed card to copy.' },
    ] as RuntimeEvent[], names).find(group => group.owner === 0)!.lines;
    expect(missed.some(line => /No card to copy/.test(line))).toBe(true);
  });
});

describe('logSummary choice outcomes', () => {
  it('records picks, skips, and no-target choice results on the play line', () => {
    const lines = summarizeEvents([
      { kind: 'reveal', owner: 0, cardId: 'scythe', text: 'Night Scythe reveals.', node: 1 },
      { kind: 'choice', owner: 0, cardId: 'scythe', sourceName: 'Night Scythe', text: 'You chooses: Slash-Dot.' },
      { kind: 'choice', owner: 0, cardId: 'scythe', sourceName: 'Night Scythe', text: 'Night Scythe: optional trash skipped.' },
      { kind: 'choice', owner: 0, sourceName: 'Ghost Key', text: 'Ghost Key: No target.' },
    ] as RuntimeEvent[], names).find(group => group.owner === 0)!.lines;
    expect(lines.some(line => /Choosing Slash-Dot/.test(line))).toBe(true);
    expect(lines.some(line => /Optional trash skipped/.test(line))).toBe(true);
    expect(lines.some(line => /No target/.test(line))).toBe(true);
  });
});
