import { describe, expect, it } from 'vitest';

import {
  CERTAIN_ICON_SYSTEMS,
  iconSemanticConfidence,
  inventoryFirstPartyAssets,
} from '../../src/swarm/assets';
import {
  CONTENT_AGENT_INSTANTIATED,
  WORLDBUILDING_AGENT_INSTANTIATED,
} from '../../src/swarm/creativeHandoff';
import { LOOKDEV_VALIDATION_OBJECTIVE } from '../../src/swarm/harness';
import { assembleLookDevPacket } from '../../src/swarm/lookdev';
import { loadResourceLibrary } from '../../src/swarm/resourceLibrary';
import { testCanonical } from './fixtures';

const index = testCanonical();
const assets = inventoryFirstPartyAssets();
const resources = loadResourceLibrary();

function packet(objective: string) {
  return assembleLookDevPacket({
    objective,
    assets,
    resources,
    canonical: index,
  });
}

describe('LookDev gameplay-context completeness', () => {
  it('includes Drain canonical rules, Data Center contract fields, and events', () => {
    const result = packet(LOOKDEV_VALIDATION_OBJECTIVE);
    expect(result.concepts).toContain('drain');
    expect(result.gameplay_canonical_ids).toEqual(
      expect.arrayContaining([
        'RULE-DATA-001',
        'RULE-DATA-002',
        'RULE-DATA-003',
        'RULE-DATA-004',
        'RULE-DATA-008',
        'UX-BOARD-001',
        'UX-BOARD-002',
        'UX-BOARD-003',
        'UX-A11Y-001',
        'UX-A11Y-002',
        'LOOKDEV-EFFECT-001',
        'LOOKDEV-FX-001',
        'LOOKDEV-FX-004',
      ]),
    );
    expect(result.gameplay_excerpt_text).toMatch(/RULE-DATA-002/);
    expect(result.gameplay_excerpt_text).toMatch(/Primary first, then Backup/);
    expect(result.contract_fields).toEqual(
      expect.arrayContaining(['data_centers.primary', 'data_centers.backup']),
    );
    expect(result.game_events).toEqual(
      expect.arrayContaining(['CARD_REVEALED', 'DRAIN_APPLIED', 'DATA_CENTER_DESTROYED']),
    );
    expect(result.visual.theatrics_tier_target).toEqual(['TIER_2', 'TIER_3']);
  });

  it('includes Restore canonical context', () => {
    const result = packet(
      'Develop visual feedback for Restore using existing icons and effect references.',
    );
    expect(result.gameplay_canonical_ids).toEqual(
      expect.arrayContaining(['RULE-DATA-005', 'RULE-DATA-006', 'RULE-DATA-007']),
    );
    expect(result.gameplay_excerpt_text).toMatch(/RULE-DATA-005/);
  });

  it('includes Collapse and probability rules for Wave Collapse without dumping unrelated domains', () => {
    const result = packet(
      'Explore Wave Collapse presentation using our singularity/liquid-wave references.',
    );
    expect(result.gameplay_canonical_ids).toEqual(
      expect.arrayContaining(['RULE-COLLAPSE-001', 'RULE-PROB-001', 'LOOKDEV-COLLAPSE-001']),
    );
    expect(result.gameplay_canonical_ids.some((id) => id.startsWith('RULE-COLLAPSE-'))).toBe(true);
    expect(result.gameplay_canonical_ids).not.toContain('RULE-DECK-001');
    expect(result.gameplay_canonical_ids).not.toContain('RULE-DRAFT-009');
    expect(result.visual.theatrics_tier_target).toEqual(['TIER_4']);
  });

  it('includes RULE-PROB-007 for reveal-priority presentation', () => {
    const result = packet('Develop visual feedback for reveal priority on the Runtime board.');
    expect(result.gameplay_canonical_ids).toEqual(
      expect.arrayContaining([
        'RULE-PROB-007',
        'RULE-RUNTIME-012',
        'RULE-RUNTIME-013',
        'RULE-RUNTIME-014',
      ]),
    );
    expect(result.gameplay_excerpt_text).toMatch(/RULE-PROB-007/);
  });
});

describe('LookDev resolved design tokens', () => {
  it('includes palette hex values and typography families', () => {
    const result = packet(LOOKDEV_VALIDATION_OBJECTIVE);
    const byName = Object.fromEntries(result.resolved_tokens.map((item) => [item.name, item]));
    expect(byName.Blue?.value).toBe('#4173F2');
    expect(byName.Cyan?.value).toBe('#27E2FF');
    expect(byName.Black?.value).toBe('#030012');
    expect(byName['Darkest normal design color']?.value).toBe('#030012');
    expect(byName['Darkest normal design color']?.constraints).toMatch(/darker/i);
    expect(byName.Inter?.value).toMatch(/Thin/);
    expect(byName.Inter?.value).toMatch(/Italic|italics/i);
    expect(byName['Orbitron Regular']?.value).toBe('Regular');
    expect(result.resolved_tokens.every((item) => item.value.length > 0)).toBe(true);
  });
});

describe('LookDev asset selection and icon confidence', () => {
  it('does not treat unnamed Drain art as the triggering card', () => {
    const result = packet(LOOKDEV_VALIDATION_OBJECTIVE);
    expect(result.assets.every((item) => item.selection_role !== 'IDENTITY_SPECIFIC')).toBe(true);
    expect(result.visual.associated_card_or_character).toEqual([]);
    expect(result.assets.some((item) => item.associated_card_or_character === 'Byte Drone')).toBe(
      false,
    );
  });

  it('labels named character art as identity-specific', () => {
    const result = packet('Develop a presentation treatment for Rezz-Razor.');
    expect(result.assets.some((item) => item.file_name === 'rezz-razor.png')).toBe(true);
    expect(
      result.assets
        .filter((item) => item.file_name === 'rezz-razor.png')
        .every((item) => item.selection_role === 'IDENTITY_SPECIFIC'),
    ).toBe(true);
  });

  it('labels unnamed visual-identity samples as representative references', () => {
    const result = packet('Understand Base visual identity from first-party card art.');
    expect(result.assets.length).toBeGreaterThan(0);
    expect(result.assets.length).toBeLessThanOrEqual(4);
    expect(result.assets.every((item) => item.selection_role === 'REPRESENTATIVE_REFERENCE')).toBe(
      true,
    );
    expect(result.visual.associated_card_or_character).toEqual([]);
  });

  it('preserves uncertain icon semantics', () => {
    expect(iconSemanticConfidence('icon-priority.svg', 'ICON', 'priority')).toBe('CERTAIN');
    expect(iconSemanticConfidence('icon-attack.svg', 'ICON', '')).toBe('UNCERTAIN');
    expect(CERTAIN_ICON_SYSTEMS['icon-attack']).toBeUndefined();
    const attack = assets.find((item) => item.file_name === 'icon-attack.svg');
    const volume = assets.find((item) => item.file_name === 'icon-volume.svg');
    expect(attack?.semantic_confidence).toBe('UNCERTAIN');
    expect(volume?.semantic_confidence).toBe('UNCERTAIN');
    const result = packet(
      'Develop visual feedback for Drain using existing icons and effect references.',
    );
    expect(result.icons.some((item) => item.semantic_confidence === 'CERTAIN')).toBe(true);
    expect(
      result.icons
        .filter((item) => ['', 'attack', 'volume', 'trash', 'utility', 'duration', 'infinite'].includes(
          item.associated_game_system,
        ))
        .every((item) => item.semantic_confidence === 'UNCERTAIN'),
    ).toBe(true);
  });
});

describe('Content / Worldbuilding agents', () => {
  it('instantiates Content and Worldbuilding as advisory specialists', () => {
    expect(CONTENT_AGENT_INSTANTIATED).toBe(true);
    expect(WORLDBUILDING_AGENT_INSTANTIATED).toBe(true);
  });
});
