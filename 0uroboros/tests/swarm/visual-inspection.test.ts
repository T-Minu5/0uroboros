import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { inventoryFirstPartyAssets, resolveAssetsRoot } from '../../src/swarm/assets';
import {
  CONTENT_AGENT_INSTANTIATED,
  assembleCreativeHandoffPacket,
} from '../../src/swarm/creativeHandoff';
import {
  boundVisualInspectionAssets,
  inspectFirstPartyVisuals,
  inspectFirstPartyVisualsLive,
  liveVisualInspectionEnabled,
  maxVisualAssetsPerInspection,
  resolveVisualInspectionModel,
  resolveVisualInspectionSample,
  summarizeSampleObservations,
  visualInspectionCapability,
  visualObservationsAreNotLore,
  VISUAL_INSPECTION_SAMPLE_NAMES,
} from '../../src/swarm/visualInspection';
import { tempCwd, testCanonical } from './fixtures';

describe('first-party visual inspection capability', () => {
  it('reports the current OpenAI/SDK seam without fabricating pixels', () => {
    const capability = visualInspectionCapability();
    expect(capability.responses_api_input_image).toBe(true);
    expect(capability.agents_sdk_native_image_tool).toBe(false);
    expect(capability.live_by_default).toBe(false);
    expect(capability.mutates_assets).toBe(false);
    expect(capability.generates_images).toBe(false);
    expect(capability.default_task_class).toBe('utility');
    expect(resolveVisualInspectionModel()).not.toMatch(/astra/i);
    expect(maxVisualAssetsPerInspection()).toBe(4);
    expect(visualObservationsAreNotLore()).toBe(true);
    expect(liveVisualInspectionEnabled({ VISUAL_INSPECTION_LIVE: 'false' })).toBe(false);
  });

  it('bounds inspection batches and does not invent visual descriptions', async () => {
    const assets = inventoryFirstPartyAssets().filter((item) => item.file_name.endsWith('.png'));
    const observations = inspectFirstPartyVisuals(assets.slice(0, 8), {
      cacheCwd: tempCwd(),
    });
    expect(observations.length).toBeLessThanOrEqual(4);
    expect(boundVisualInspectionAssets(assets).length).toBeLessThanOrEqual(4);
    expect(observations.every((item) => item.visible_motifs.length === 0)).toBe(true);
    expect(observations.every((item) => item.not_lore)).toBe(true);
    expect(observations.every((item) => item.confidence === 0)).toBe(true);
    expect(observations.every((item) => item.authority === 'FIRST_PARTY_VISUAL_ASSET')).toBe(true);
    const live = await inspectFirstPartyVisualsLive(['asset-card-art-chaos-cards-rezz-razor-png']);
    expect(live.ran).toBe(false);
  });

  it('caches observations by hash and invalidates when the file changes', () => {
    const source = inventoryFirstPartyAssets().find((item) => item.file_name === 'rezz-razor.png');
    expect(source).toBeDefined();
    const cwd = tempCwd();
    mkdirSync(join(cwd, 'assets/card_art'), { recursive: true });
    const dest = join(cwd, 'assets/card_art/rezz-razor.png');
    copyFileSync(join(resolveAssetsRoot(), source!.relative_path), dest);
    const asset = { ...source!, relative_path: 'card_art/rezz-razor.png' };
    const before = statSync(dest);
    const first = inspectFirstPartyVisuals([asset], { cwd, cacheCwd: cwd });
    const second = inspectFirstPartyVisuals([asset], { cwd, cacheCwd: cwd });
    expect(first[0]?.asset_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(second[0]?.asset_hash).toBe(first[0]?.asset_hash);
    expect(second[0]?.visible_motifs).toEqual([]);
    const afterInspect = statSync(dest);
    expect(afterInspect.size).toBe(before.size);
    expect(afterInspect.mtimeMs).toBe(before.mtimeMs);
    writeFileSync(dest, Buffer.concat([readFileSync(dest), Buffer.from([0])]));
    const third = inspectFirstPartyVisuals([asset], { cwd, cacheCwd: cwd });
    expect(third[0]?.asset_hash).not.toBe(first[0]?.asset_hash);
    expect(third[0]?.visible_motifs).toEqual([]);
  });

  it('keeps visual observations off the lore boundary in the future handoff packet', () => {
    const rezz = inventoryFirstPartyAssets().find((item) => item.file_name === 'rezz-razor.png')!;
    const packet = assembleCreativeHandoffPacket({
      objective: 'Develop Rezz-Razor presentation',
      index: testCanonical(),
      assets: [rezz],
      observations: inspectFirstPartyVisuals([rezz], { cacheCwd: tempCwd() }),
    });
    expect(CONTENT_AGENT_INSTANTIATED).toBe(true);
    expect(packet.notes.some((item) => /not lore/i.test(item))).toBe(true);
    expect(packet.first_party_asset_ids.length).toBeLessThanOrEqual(8);
  });

  it('resolves the four named sample artworks without substitutions', () => {
    const sample = resolveVisualInspectionSample(inventoryFirstPartyAssets());
    expect(sample.assets).toHaveLength(4);
    expect(sample.substitutions).toEqual([]);
    expect(sample.assets.map((item) => item.associated_card_or_character)).toEqual([
      ...VISUAL_INSPECTION_SAMPLE_NAMES,
    ]);
  });

  it('reuses live cache without a second model call and does not overwrite live observations', async () => {
    const inventory = inventoryFirstPartyAssets();
    const sample = resolveVisualInspectionSample(inventory);
    const cacheCwd = tempCwd();
    const env = {
      VISUAL_INSPECTION_LIVE: 'true',
      OPENAI_API_KEY: 'sk-test-not-real',
      UTILITY_MODEL: 'gpt-5.6-luna-test',
    };
    let calls = 0;
    const transport = {
      inspect: async (input: { images: Array<{ asset_id: string; name: string }> }) => {
        calls += 1;
        return input.images.map((image) => ({
          asset_id: image.asset_id,
          subject: image.name,
          visible_motifs: ['chrome filament'],
          silhouette_notes: 'upright figure',
          materials: ['chrome'],
          lighting: 'rim light',
          palette_observations: ['cyan'],
          cyberpunk_signals: ['neon'],
          quantum_signals: [],
          occult_signals: ['geometric marking'],
          subgenre_signals: [],
          recurring_symbols: ['serpent curve'],
          presentation_opportunities: ['reveal flash'],
          uncertainties: ['background glyph unread'],
          confidence: 0.72,
          inspection_status: 'INSPECTED_RASTER' as const,
          inspection_model: env.UTILITY_MODEL,
        }));
      },
    };
    const first = await inspectFirstPartyVisualsLive(
      sample.assets.map((item) => item.asset_id),
      { env, transport, cacheCwd, cwd: process.cwd(), assets: inventory },
    );
    expect(first.failed).toBe(false);
    expect(first.api_calls).toBe(1);
    expect(calls).toBe(1);
    expect(first.observations.every((item) => item.not_lore)).toBe(true);
    expect(first.observations.every((item) => item.authority === 'FIRST_PARTY_VISUAL_ASSET')).toBe(
      true,
    );
    const second = await inspectFirstPartyVisualsLive(
      sample.assets.map((item) => item.asset_id),
      {
        env,
        cacheCwd,
        cwd: process.cwd(),
        assets: inventory,
        transport: {
          inspect: async () => {
            throw new Error('cache should prevent a second inspection call');
          },
        },
      },
    );
    expect(second.api_calls).toBe(0);
    expect(second.from_cache).toHaveLength(4);
    expect(calls).toBe(1);
    const offline = inspectFirstPartyVisuals(sample.assets, {
      cwd: process.cwd(),
      cacheCwd,
      model: env.UTILITY_MODEL,
    });
    expect(offline.every((item) => item.visible_motifs.includes('chrome filament'))).toBe(true);
    const summary = summarizeSampleObservations(first.observations, {
      base_ids: sample.assets
        .filter((item) => item.category === 'base cards')
        .map((item) => item.asset_id),
      chaos_ids: sample.assets
        .filter((item) => item.category === 'chaos cards')
        .map((item) => item.asset_id),
    });
    expect(summary.kind).toBe('OBSERVATION');
    expect(summary.not_canonical).toBe(true);
  });
});
