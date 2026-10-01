import type { CanonicalIndex } from './context';
import type { FirstPartyAssetRecord, FirstPartyVisualObservation } from './contracts';
import { resolveAssignmentContext } from './assignmentContext';

export const CONTENT_AGENT_INSTANTIATED = true;
export const WORLDBUILDING_AGENT_INSTANTIATED = true;

export interface CreativeHandoffPacket {
  established_names: string[];
  first_party_asset_ids: string[];
  visual_observation_ids: string[];
  canonical_theme_ids: string[];
  gameplay_taxonomy_ids: string[];
  resource_ids: string[];
  user_guidance: string[];
  notes: string[];
}

export function assembleCreativeHandoffPacket(input: {
  objective: string;
  index: CanonicalIndex;
  assets: FirstPartyAssetRecord[];
  observations?: FirstPartyVisualObservation[];
}): CreativeHandoffPacket {
  const context = resolveAssignmentContext(input.objective, input.index);
  const named = input.assets.filter(
    (item) =>
      item.identity_locked &&
      item.associated_card_or_character &&
      input.objective.toLowerCase().includes(item.associated_card_or_character.toLowerCase()),
  );
  return {
    established_names: [...new Set(named.map((item) => item.associated_card_or_character))],
    first_party_asset_ids: named.map((item) => item.asset_id).slice(0, 8),
    visual_observation_ids: (input.observations ?? [])
      .filter((item) => named.some((asset) => asset.asset_id === item.asset_id))
      .map((item) => item.asset_id)
      .slice(0, 4),
    canonical_theme_ids: ['LOOKDEV-COLLAPSE-003', 'DESIGN-COLOR-001', 'DESIGN-TYPE-001'],
    gameplay_taxonomy_ids: context.canonical_ids.slice(0, 12),
    resource_ids: [],
    user_guidance: [],
    notes: [
      'Content proposes game content inside approved mechanics. Worldbuilding proposes lore and cohesion. Neither writes the other domain.',
      'First-party visual observations are evidence about existing art. They are not lore, mechanics, or biography.',
      'Do not dump the full asset library.',
    ],
  };
}
