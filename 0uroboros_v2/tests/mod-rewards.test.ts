import { describe, expect, it } from 'vitest';
import type { AuthoredMod, ContentDocument } from '@0uroboros/engine/authoring/contentModel';
import { createModReward, followModRename, isModReward } from '../src/authoring/modRewards';
import { createStep } from '@0uroboros/engine/effects/catalog';

const mod = (name: string): AuthoredMod => ({ id: 'mod-test', name, enabled: true, onReveal: [createStep('gainCrypto', 'card')] });
const doc = (mods: AuthoredMod[], circuitRewards: ContentDocument['circuitRewards'] = []): ContentDocument => ({ version: 3, cards: [], locations: [], circuitRewards, mods, runtimeHacks: [] });

describe('Circuit rewards made with card mods', () => {
  it('attaches the new mod to a chosen Character in the claiming player’s deck', () => {
    const giver = mod('The Giver');
    const reward = createModReward('reward-test', giver, doc([giver]));
    expect(reward).toMatchObject({ id: 'reward-test', name: 'The Giver', cost: 0, enabled: true, text: 'Attach the “The Giver” mod to a Character in your deck.' });
    expect(reward.effects).toEqual([{ action: 'attachModifier', modifier: 'mod-test', target: { type: 'card', who: 'self', where: 'collection', filter: { cardType: 'Character' } }, pick: { mode: 'choose' } }]);
    expect(isModReward(reward, 'mod-test')).toBe(true);
    expect(isModReward(reward, 'mod-other')).toBe(false);
  });

  it('follows a rename, but keeps a reward name that was changed by hand', () => {
    const before = mod('New mod'), after = mod('Repairman');
    const linked = createModReward('reward-a', before, doc([before]));
    const renamed = { ...createModReward('reward-b', before, doc([before])), name: 'Fix-it Kit' };
    const next = followModRename(doc([after], [linked, renamed]), before, after);
    expect(next.circuitRewards.map(reward => [reward.name, reward.text])).toEqual([
      ['Repairman', 'Attach the “Repairman” mod to a Character in your deck.'],
      ['Fix-it Kit', 'Attach the “Repairman” mod to a Character in your deck.'],
    ]);
  });
});
