import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createPlanningTeam,
  SPECIALIST_TOOL_NAMES,
  toolNames,
} from '../../src/swarm/agents';
import {
  inspectFirstPartyAsset,
  inventoryFirstPartyAssets,
  lookDevCannotMutateAssets,
  queryFirstPartyAssets,
  resetAssetInventoryCache,
  resolveAssetsRoot,
  statsUiIsNotUxRequirement,
  summarizeAssetFolders,
} from '../../src/swarm/assets';
import { BudgetTracker } from '../../src/swarm/budget';
import type { FirstPartyAssetRecord, LookDevResponse } from '../../src/swarm/contracts';
import { BudgetExhaustedError } from '../../src/swarm/errors';
import { LOOKDEV_VALIDATION_OBJECTIVE } from '../../src/swarm/harness';
import {
  assembleLookDevPacket,
  AUTHORITATIVE_GAME_EVENTS,
  externalCannotOverrideFirstPartyIdentity,
  firstPartyCannotOverrideRules,
  lookDevCannotExecute,
  lookDevCannotInvokeAgents,
  lookDevCreatesWorkPackages,
  shouldConsultLookDev,
  validateLookDevAssignment,
  validateLookDevResponse,
  visualDesignAuthorityRank,
} from '../../src/swarm/lookdev';
import { loadResourceLibrary } from '../../src/swarm/resourceLibrary';
import { assignment, emptyRuntime, testConfig } from './fixtures';

function lookdevAssignment() {
  return validateLookDevAssignment(
    {
      ...assignment({
        assignment_id: 'asg-lookdev-1',
        role: 'lookdev',
        objective: 'Develop visual feedback for Drain and Restore using existing icons.',
        proposal_limit: 3,
      }),
      gameplay_event: 'DRAIN_APPLIED',
      allow_alternatives: true,
    },
    testConfig().budget,
  );
}

function lookdevResponse(overrides: Partial<LookDevResponse> = {}): LookDevResponse {
  return {
    agent: 'lookdev',
    assignment_id: 'asg-lookdev-1',
    summary: 'Stage existing Character art; use icons for Drain targeting.',
    asset_observations: [],
    visual_findings: ['Existing Rezz-Razor art already carries identity.'],
    presentation_event_mappings: [
      {
        game_event: 'CARD_REVEALED',
        presentation_event: 'reveal motion',
        theatrics_tier: 'TIER_2',
        notes: 'Presentation only.',
      },
    ],
    recommendations: [
      {
        title: 'Keep first-party art and add Drain impact',
        rationale: 'Identity stays on the existing asset. Icons carry target and magnitude.',
        priority: 'high',
        kind: 'PRIMARY',
        first_party_asset_ids: ['asset-card-art-chaos-cards-rezz-razor-png'],
        reference_evidence_ids: [],
      },
    ],
    reference_evidence_ids: [],
    first_party_asset_ids: ['asset-card-art-chaos-cards-rezz-razor-png'],
    risks: ['Color-only Drain would fail UX-A11Y-001'],
    technical_questions: [],
    ux_questions: ['Confirm Drain target hierarchy with UX.'],
    open_questions: [],
    canonical_ids_referenced: ['LOOKDEV-EFFECT-001', 'UX-A11Y-001'],
    confidence: 0.7,
    ...overrides,
  };
}

describe('first-party asset inventory', () => {
  resetAssetInventoryCache();
  const assets = inventoryFirstPartyAssets();
  const root = resolveAssetsRoot();

  it('inventories ../assets or ./assets without mutation', () => {
    expect(existsSync(join(root, 'card_art'))).toBe(true);
    const sample = assets.find((item) => item.file_name === 'rezz-razor.png');
    expect(sample).toBeDefined();
    const before = statSync(join(root, sample!.relative_path));
    resetAssetInventoryCache();
    const again = inventoryFirstPartyAssets();
    inspectFirstPartyAsset(sample!);
    const after = statSync(join(root, sample!.relative_path));
    expect(again.length).toBe(assets.length);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(after.size).toBe(before.size);
    expect(lookDevCannotMutateAssets()).toBe(true);
  });

  it('associates known card names and leaves unknown filenames unknown', () => {
    const rezz = assets.find((item) => item.file_name === 'rezz-razor.png');
    const blade = assets.find((item) => item.file_name === 'rezz-blade.png');
    const placeholder = assets.find((item) => /placeholder/i.test(item.file_name));
    const waveform = assets.find((item) => item.file_name === 'wave-form.png');
    expect(rezz?.associated_card_or_character).toBe('Rezz-Razor');
    expect(rezz?.identity_locked).toBe(true);
    expect(rezz?.first_party).toBe(true);
    expect(rezz?.authority).toBe('FIRST_PARTY_VISUAL_ASSET');
    expect(blade?.associated_card_or_character).toBe('Rezz-Blade');
    expect(placeholder?.associated_card_or_character).toBe('');
    expect(waveform?.associated_card_or_character).toBe('');
  });

  it('treats icons as first-party evidence, not canonical gameplay', () => {
    const priority = assets.find((item) => item.file_name === 'icon-priority.svg');
    const attack = assets.find((item) => item.file_name === 'icon-attack.svg');
    expect(priority?.asset_type).toBe('ICON');
    expect(priority?.associated_game_system).toBe('priority');
    expect(priority?.authority).toBe('FIRST_PARTY_VISUAL_ASSET');
    expect(attack?.associated_game_system).toBe('');
  });

  it('treats Stats UI assets as first-party UI references, not UX requirements', () => {
    const stats = assets.find((item) => item.file_name === 'PlayerStats.svg');
    const cardStats = assets.find((item) => item.file_name === 'Card-Stats.svg');
    expect(stats?.asset_type).toBe('STATS_UI_REFERENCE');
    expect(cardStats?.asset_type).toBe('STATS_UI_REFERENCE');
    expect(statsUiIsNotUxRequirement(stats!)).toBe(true);
    expect(stats?.ux_requirement).toBe(false);
  });

  it('does not fabricate visual observations when inspection is metadata-only or failed', () => {
    const rezz = assets.find((item) => item.file_name === 'rezz-razor.png')!;
    const inspected = inspectFirstPartyAsset(rezz);
    expect(inspected.inspection_status).toBe('METADATA_ONLY');
    expect(inspected.visual_observations).toEqual([]);
    const missing: FirstPartyAssetRecord = {
      ...rezz,
      relative_path: 'Icons/does-not-exist.svg',
      asset_id: 'asset-missing-test',
    };
    const failed = inspectFirstPartyAsset(missing);
    expect(failed.inspection_status).toBe('FAILED');
    expect(failed.visual_observations).toEqual([]);
    expect(failed.notes).toMatch(/No visual description was invented/);
  });

  it('summarizes known folders without inventing files', () => {
    const folders = summarizeAssetFolders(assets);
    expect(folders.find((item) => item.folder === 'card_art/chaos cards')?.file_count).toBeGreaterThan(0);
    expect(folders.find((item) => item.folder === 'Icons')?.file_count).toBeGreaterThan(0);
    expect(folders.find((item) => item.folder === 'effect_animations')?.file_count).toBeGreaterThan(0);
  });
});

describe('LookDev routing', () => {
  it('allows LookDev for Drain/Restore visual feedback', () => {
    expect(
      shouldConsultLookDev(
        'Develop visual feedback for Drain and Restore using existing icons and effect references.',
      ),
    ).toBe(true);
  });

  it('allows LookDev for Wave Collapse presentation', () => {
    expect(
      shouldConsultLookDev(
        'Explore Wave Collapse presentation using our singularity/liquid-wave references.',
      ),
    ).toBe(true);
  });

  it('does not use LookDev for the starting deck', () => {
    expect(shouldConsultLookDev('What is the starting deck?')).toBe(false);
  });

  it('does not use LookDev for boardgame.io transaction semantics', () => {
    expect(shouldConsultLookDev("Verify boardgame.io's transaction semantics.")).toBe(false);
  });

  it('allows LookDev for the live Drain reveal objective', () => {
    expect(shouldConsultLookDev(LOOKDEV_VALIDATION_OBJECTIVE)).toBe(true);
  });
});

describe('LookDev packet bounds and identity', () => {
  const assets = inventoryFirstPartyAssets();
  const resources = loadResourceLibrary();

  it('keeps the Rezz-Razor packet bounded and first-party first', () => {
    const packet = assembleLookDevPacket({
      objective: 'Develop a presentation treatment for Rezz-Razor.',
      assets,
      resources,
    });
    expect(packet.assets.some((item) => item.associated_card_or_character === 'Rezz-Razor')).toBe(
      true,
    );
    expect(packet.assets.some((item) => item.file_name === 'rezz-razor.png')).toBe(true);
    expect(packet.stats_ui).toEqual([]);
    expect(packet.visual.first_party_asset_ids.length).toBeGreaterThan(0);
    expect(packet.visual.first_party_asset_ids.length).toBeLessThan(assets.length);
    expect(
      [...packet.assets, ...packet.icons, ...packet.stats_ui].every((item) => item.first_party),
    ).toBe(true);
    const blob = JSON.stringify(packet.visual);
    expect(blob).not.toMatch(/hearthstone|marvel snap|drimgar/i);
    expect(externalCannotOverrideFirstPartyIdentity()).toBe(true);
  });

  it('includes Drain/Restore icons without dumping the library', () => {
    const packet = assembleLookDevPacket({
      objective:
        'Develop visual feedback for Drain and Restore using existing icons and effect references.',
      assets,
      resources,
    });
    expect(packet.icons.some((item) => item.associated_game_system === 'Actions')).toBe(true);
    expect(packet.icons.some((item) => item.associated_game_system === 'Data Centers')).toBe(true);
    expect(packet.icons.length).toBeLessThanOrEqual(8);
    expect(packet.visual.first_party_asset_ids.length).toBeLessThanOrEqual(12);
  });

  it('excludes unrelated Stats UI from a Wave Collapse packet', () => {
    const packet = assembleLookDevPacket({
      objective: 'Explore Wave Collapse presentation using our singularity/liquid-wave references.',
      assets,
      resources,
    });
    expect(packet.stats_ui).toEqual([]);
    expect(queryFirstPartyAssets(assets, { query: 'a develop for the', maxResults: 20 })).toEqual(
      [],
    );
  });

  it('ranks first-party visual identity above external inspiration', () => {
    expect(visualDesignAuthorityRank('CANONICAL')).toBeGreaterThan(
      visualDesignAuthorityRank('FIRST_PARTY_VISUAL_ASSET'),
    );
    expect(visualDesignAuthorityRank('FIRST_PARTY_VISUAL_ASSET')).toBeGreaterThan(
      visualDesignAuthorityRank('HARNESS_VERIFIED_EVIDENCE'),
    );
    expect(visualDesignAuthorityRank('FIRST_PARTY_VISUAL_ASSET')).toBeGreaterThan(
      visualDesignAuthorityRank('EXTERNAL_RESEARCH_EVIDENCE'),
    );
    expect(firstPartyCannotOverrideRules()).toBe(true);
  });
});

describe('LookDev agent constraints', () => {
  it('has read-only asset tools and cannot invoke or execute', () => {
    const team = createPlanningTeam(testConfig(), emptyRuntime());
    expect(toolNames(team.specialistAgents.lookdev)).toEqual(
      expect.arrayContaining(['queryFirstPartyAssets', 'inspectFirstPartyAsset']),
    );
    expect(team.specialistAgents.lookdev.handoffs).toEqual([]);
    expect(lookDevCannotInvokeAgents()).toBe(true);
    expect(lookDevCannotExecute()).toBe(true);
    expect(lookDevCreatesWorkPackages(lookdevResponse())).toEqual([]);
    expect(toolNames(team.astra)).toContain(SPECIALIST_TOOL_NAMES.lookdev);
  });

  it('enforces LookDev output and call budgets', () => {
    const asg = lookdevAssignment();
    expect(() =>
      validateLookDevResponse(
        lookdevResponse({
          visual_findings: ['a', 'b', 'c', 'd', 'e', 'f'],
        }),
        asg,
        testConfig().budget,
      ),
    ).toThrow(/findings/);
    const tracker = new BudgetTracker({
      ...testConfig().budget,
      max_lookdev_calls: 1,
      max_total_agent_calls: 8,
    });
    tracker.consumeAgentCall('astra');
    tracker.consumeAgentCall('lookdev');
    expect(tracker.snapshot().lookdev_calls).toBe(1);
    expect(tracker.snapshot().specialist_calls).toBe(1);
    expect(tracker.snapshot().review_calls).toBe(0);
    expect(() => tracker.consumeAgentCall('lookdev')).toThrow(BudgetExhaustedError);
    expect(tracker.exhausted).toBe('MAX_LOOKDEV_CALLS');
  });

  it('maps Game Events without treating them as WorkPackages', () => {
    expect(AUTHORITATIVE_GAME_EVENTS).toContain('DRAIN_APPLIED');
    const parsed = validateLookDevResponse(lookdevResponse(), lookdevAssignment(), testConfig().budget);
    expect(parsed.presentation_event_mappings[0]?.game_event).toBe('CARD_REVEALED');
    expect(parsed).not.toHaveProperty('work_packages');
  });
});
