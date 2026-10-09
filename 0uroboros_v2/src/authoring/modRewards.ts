import type { Card } from '@0uroboros/engine/game';
import { describeSteps } from '@0uroboros/engine/effects/catalog';
import type { EffectStep } from '@0uroboros/engine/effects/types';
import type { AuthoredCircuitReward, AuthoredMod, ContentDocument } from '@0uroboros/engine/authoring/contentModel';

/** Attach the mod to a random Character in the claiming player's deck, Discard or hand. */
export function modRewardEffects(modId: string): EffectStep[] {
  return [{ action: 'attachModifier', modifier: modId, target: { type: 'card', who: 'self', where: 'collection', filter: { cardType: 'Character' } }, pick: { mode: 'random' } }];
}

const rewardText = (effects: EffectStep[], document: ContentDocument) =>
  describeSteps(effects, 'circuit', document.cards as unknown as Card[], document.mods ?? []);

/** The Circuit reward created alongside a new card mod; `document` must already hold the mod. */
export function createModReward(id: string, mod: AuthoredMod, document: ContentDocument): AuthoredCircuitReward {
  const effects = modRewardEffects(mod.id);
  return { id, name: mod.name, text: rewardText(effects, document), cost: 0, effects, enabled: true };
}

/** A reward that only attaches this mod, as created with it. Rewards edited into something else are left alone. */
export function isModReward(reward: AuthoredCircuitReward, modId: string): boolean {
  return reward.effects.length === 1 && reward.effects[0].action === 'attachModifier' && reward.effects[0].modifier === modId;
}

export function withTrailing(reward: AuthoredCircuitReward, on: boolean): AuthoredCircuitReward {
  const { awardTrailing: _awardTrailing, ...rest } = reward;
  return on ? { ...rest, awardTrailing: true } : rest;
}

/** After a mod is renamed, its rewards that still carry the old name take the new one, and every reward attaching it rewrites its text. */
export function followModRename(document: ContentDocument, before: AuthoredMod, after: AuthoredMod): ContentDocument {
  if (before.name === after.name) return document;
  const needle = `"modifier":${JSON.stringify(after.id)}`;
  return {
    ...document,
    circuitRewards: document.circuitRewards.map(reward => {
      if (!JSON.stringify(reward.effects).includes(needle)) return reward;
      const name = isModReward(reward, after.id) && reward.name === before.name ? after.name : reward.name;
      return { ...reward, name, text: rewardText(reward.effects, document) };
    }),
  };
}
