import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { z } from 'zod';

import type { FirstPartyAssetRecord, FirstPartyVisualObservation } from './contracts';
import { FirstPartyVisualObservationSchema } from './contracts';
import { inventoryFirstPartyAssets, resolveAssetsRoot } from './assets';
import { DEFAULT_UTILITY_MODEL } from './config';

export const VISUAL_OBSERVATION_SCHEMA_VERSION = 'visual-observation-v1';
export const MAX_VISUAL_ASSETS_PER_INSPECTION = 4;
export const DEFAULT_VISUAL_INSPECTION_MODEL = DEFAULT_UTILITY_MODEL;

export interface VisualInspectionCapability {
  mechanism: string;
  agents_sdk_native_image_tool: false;
  responses_api_input_image: true;
  live_by_default: false;
  mutates_assets: false;
  generates_images: false;
  max_assets: number;
  default_model: string;
  default_task_class: 'utility';
  later_validation_command: string;
}

export function visualInspectionCapability(): VisualInspectionCapability {
  return {
    mechanism:
      'OpenAI Responses API input_image with a read-only base64 data URL. The installed Agents SDK 0.17.0 has no native image tool.',
    agents_sdk_native_image_tool: false,
    responses_api_input_image: true,
    live_by_default: false,
    mutates_assets: false,
    generates_images: false,
    max_assets: maxVisualAssetsPerInspection(),
    default_model: DEFAULT_VISUAL_INSPECTION_MODEL,
    default_task_class: 'utility',
    later_validation_command:
      'VISUAL_INSPECTION_LIVE=true npx tsx -e "import { inspectFirstPartyVisualsLive } from \'./src/swarm/visualInspection.ts\'; inspectFirstPartyVisualsLive([\'asset-card-art-chaos-cards-rezz-razor-png\'])"',
  };
}

export function visualObservationsAreNotLore(): boolean {
  return true;
}

export function boundVisualInspectionAssets<T>(assets: T[]): T[] {
  return assets.slice(0, maxVisualAssetsPerInspection());
}

export function emptyVisualObservation(
  asset: FirstPartyAssetRecord,
  options: { inspection_status?: FirstPartyVisualObservation['inspection_status']; notes?: string[] } = {},
): FirstPartyVisualObservation {
  return FirstPartyVisualObservationSchema.parse({
    asset_id: asset.asset_id,
    inspection_status: options.inspection_status ?? 'METADATA_ONLY',
    subject: asset.associated_card_or_character || asset.file_name,
    visible_motifs: [],
    silhouette_notes: '',
    materials: [],
    lighting: '',
    palette_observations: asset.observed_colors,
    cyberpunk_signals: [],
    quantum_signals: [],
    occult_signals: [],
    subgenre_signals: [],
    recurring_symbols: [],
    presentation_opportunities: [],
    uncertainties: options.notes ?? [
      'Raster pixel inspection was not run. No visual description was invented.',
    ],
    confidence: 0,
    inspection_model: '',
    schema_version: VISUAL_OBSERVATION_SCHEMA_VERSION,
    asset_hash: '',
    authority: 'FIRST_PARTY_VISUAL_ASSET',
    not_lore: true,
  });
}

export function maxVisualAssetsPerInspection(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.MAX_VISUAL_ASSETS_PER_INSPECTION);
  if (Number.isInteger(raw) && raw > 0 && raw <= 8) return raw;
  return MAX_VISUAL_ASSETS_PER_INSPECTION;
}

export function liveVisualInspectionEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VISUAL_INSPECTION_LIVE === 'true';
}

export function isLiveVisualObservation(observation: FirstPartyVisualObservation): boolean {
  return (
    (observation.inspection_status === 'INSPECTED_RASTER' ||
      observation.inspection_status === 'INSPECTED_VECTOR') &&
    Boolean(observation.inspection_model) &&
    observation.confidence > 0
  );
}

export const VISUAL_INSPECTION_SAMPLE_NAMES = [
  'Slash-Dot',
  'Dotkrawler',
  'Rezz-Razor',
  'Glitch-Witch.exe',
] as const;

export interface VisualInspectionTransportInput {
  model: string;
  images: Array<{ asset_id: string; data_url: string; name: string }>;
}

export interface VisualInspectionTransport {
  inspect(
    input: VisualInspectionTransportInput,
  ): Promise<Array<Omit<FirstPartyVisualObservation, 'asset_hash' | 'schema_version' | 'authority' | 'not_lore'>>>;
}

export interface LiveVisualInspectionResult {
  ran: boolean;
  failed: boolean;
  reason: string;
  model: string;
  observations: FirstPartyVisualObservation[];
  substitutions: string[];
  api_calls: number;
  from_cache: string[];
}

const LiveObservationSchema = z.object({
  asset_id: z.string(),
  subject: z.string(),
  visible_motifs: z.array(z.string()),
  silhouette_notes: z.string(),
  materials: z.array(z.string()),
  lighting: z.string(),
  palette_observations: z.array(z.string()),
  cyberpunk_signals: z.array(z.string()),
  quantum_signals: z.array(z.string()),
  occult_signals: z.array(z.string()),
  subgenre_signals: z.array(z.string()),
  recurring_symbols: z.array(z.string()),
  presentation_opportunities: z.array(z.string()),
  uncertainties: z.array(z.string()),
  confidence: z.number(),
});

const LiveBatchSchema = z.object({
  observations: z.array(LiveObservationSchema).max(MAX_VISUAL_ASSETS_PER_INSPECTION),
});

export function resolveVisualInspectionSample(
  assets: FirstPartyAssetRecord[],
): { assets: FirstPartyAssetRecord[]; substitutions: string[] } {
  const substitutions: string[] = [];
  const selected: FirstPartyAssetRecord[] = [];
  for (const name of VISUAL_INSPECTION_SAMPLE_NAMES) {
    const match = assets.find(
      (item) =>
        item.associated_card_or_character === name &&
        (item.asset_type === 'CHARACTER_ART' || item.asset_type === 'CARD_ART'),
    );
    if (match) {
      selected.push(match);
      continue;
    }
    const fallbackGroup = /rezz-razor|glitch-witch/i.test(name) ? 'chaos cards' : 'base cards';
    const fallback = assets.find(
      (item) =>
        item.category === fallbackGroup &&
        item.identity_locked &&
        !selected.some((picked) => picked.asset_id === item.asset_id),
    );
    if (fallback) {
      substitutions.push(`${name} unresolved; used ${fallback.associated_card_or_character || fallback.file_name}`);
      selected.push(fallback);
    }
  }
  return { assets: boundVisualInspectionAssets(selected), substitutions };
}

export function summarizeSampleObservations(
  observations: FirstPartyVisualObservation[],
  groups: { base_ids: string[]; chaos_ids: string[] },
): {
  kind: 'OBSERVATION';
  sample_size: number;
  base_tendencies: string[];
  chaos_tendencies: string[];
  shared: string[];
  not_canonical: true;
  caution: string;
} {
  const base = observations.filter((item) => groups.base_ids.includes(item.asset_id));
  const chaos = observations.filter((item) => groups.chaos_ids.includes(item.asset_id));
  const collect = (items: FirstPartyVisualObservation[], field: keyof FirstPartyVisualObservation) =>
    uniqueStrings(items.flatMap((item) => (Array.isArray(item[field]) ? (item[field] as string[]) : [])));
  const shared = collect(observations, 'visible_motifs').filter(
    (motif) =>
      base.some((item) => item.visible_motifs.includes(motif)) &&
      chaos.some((item) => item.visible_motifs.includes(motif)),
  );
  return {
    kind: 'OBSERVATION',
    sample_size: observations.length,
    base_tendencies: collect(base, 'visible_motifs').slice(0, 8),
    chaos_tendencies: collect(chaos, 'visible_motifs').slice(0, 8),
    shared: shared.slice(0, 8),
    not_canonical: true,
    caution: 'A four-card sample cannot establish a canonical faction-wide art rule.',
  };
}

export async function inspectFirstPartyVisualsLive(
  assetIds: string[] = [],
  options: {
    cwd?: string;
    cacheCwd?: string;
    env?: NodeJS.ProcessEnv;
    transport?: VisualInspectionTransport;
    assets?: FirstPartyAssetRecord[];
  } = {},
): Promise<LiveVisualInspectionResult> {
  const env = options.env ?? process.env;
  const model = resolveVisualInspectionModel(env);
  if (!liveVisualInspectionEnabled(env)) {
    return {
      ran: false,
      failed: false,
      reason:
        'Live visual inspection is disabled. Set VISUAL_INSPECTION_LIVE=true for the bounded first-party sample.',
      model,
      observations: [],
      substitutions: [],
      api_calls: 0,
      from_cache: [],
    };
  }
  const cwd = options.cwd ?? process.cwd();
  const cacheCwd = options.cacheCwd ?? cwd;
  const inventory = options.assets ?? inventoryFirstPartyAssets(cwd);
  const sample = assetIds.length > 0
    ? {
        assets: boundVisualInspectionAssets(
          assetIds
            .map((id) => inventory.find((item) => item.asset_id === id))
            .filter((item): item is FirstPartyAssetRecord => Boolean(item)),
        ),
        substitutions: [] as string[],
      }
    : resolveVisualInspectionSample(inventory);
  const observations: FirstPartyVisualObservation[] = [];
  const from_cache: string[] = [];
  const pending: FirstPartyAssetRecord[] = [];
  for (const asset of sample.assets) {
    const cached = cachedVisualObservation(asset, cacheCwd, model, cwd);
    if (cached && isLiveVisualObservation(cached)) {
      observations.push(cached);
      from_cache.push(asset.asset_id);
    } else {
      pending.push(asset);
    }
  }
  if (pending.length === 0) {
    return {
      ran: true,
      failed: false,
      reason: 'All requested observations were already cached.',
      model,
      observations,
      substitutions: sample.substitutions,
      api_calls: 0,
      from_cache,
    };
  }
  try {
    const parsed = options.transport
      ? await options.transport.inspect({
          model,
          images: pending.map((asset) => ({
            asset_id: asset.asset_id,
            name: asset.associated_card_or_character || asset.file_name,
            data_url: assetDataUrl(asset, cwd),
          })),
        })
      : await callOpenAiVisualInspection(pending, cwd, env, model);
    for (const asset of pending) {
      const raw = parsed.find((item) => item.asset_id === asset.asset_id) ?? parsed[pending.indexOf(asset)];
      const observation = FirstPartyVisualObservationSchema.parse({
        ...emptyVisualObservation(asset),
        ...raw,
        asset_id: asset.asset_id,
        inspection_status: 'INSPECTED_RASTER',
        inspection_model: model,
        schema_version: VISUAL_OBSERVATION_SCHEMA_VERSION,
        asset_hash: hashAssetFile(asset, cwd),
        authority: 'FIRST_PARTY_VISUAL_ASSET',
        not_lore: true,
        confidence: Math.min(1, Math.max(0, raw?.confidence ?? 0.4)),
      });
      rememberVisualObservation(observation, cacheCwd, model);
      observations.push(observation);
    }
    return {
      ran: true,
      failed: false,
      reason: 'Live visual inspection completed. Observations are FIRST_PARTY_VISUAL_ASSET evidence, not lore.',
      model,
      observations,
      substitutions: sample.substitutions,
      api_calls: 1,
      from_cache,
    };
  } catch (error) {
    return {
      ran: true,
      failed: true,
      reason: error instanceof Error ? error.message : String(error),
      model,
      observations,
      substitutions: sample.substitutions,
      api_calls: 1,
      from_cache,
    };
  }
}

async function callOpenAiVisualInspection(
  assets: FirstPartyAssetRecord[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  model: string,
): Promise<Array<z.infer<typeof LiveObservationSchema>>> {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured for live visual inspection.');
  }
  const { default: OpenAI } = await import('openai');
  const { zodTextFormat } = await import('openai/helpers/zod');
  const client = new OpenAI({ apiKey });
  const content: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'low' }> = [
    {
      type: 'input_text',
      text: [
        'Describe only what is visibly present in these 0uroboros first-party character artworks.',
        'Do not invent biography, factions, mechanics, or lore.',
        'Return one observation per image using the supplied asset_id.',
        `Asset order: ${assets.map((item) => `${item.asset_id}=${item.associated_card_or_character || item.file_name}`).join('; ')}`,
      ].join(' '),
    },
  ];
  for (const asset of assets) {
    content.push({ type: 'input_image', image_url: assetDataUrl(asset, cwd), detail: 'low' });
    content.push({
      type: 'input_text',
      text: `asset_id=${asset.asset_id} name=${asset.associated_card_or_character || asset.file_name}`,
    });
  }
  const response = await client.responses.parse({
    model,
    input: [{ role: 'user', content }],
    text: { format: zodTextFormat(LiveBatchSchema, 'visual_observations') },
  });
  const parsed = LiveBatchSchema.parse(response.output_parsed);
  return parsed.observations;
}

function assetDataUrl(asset: FirstPartyAssetRecord, cwd: string): string {
  const root = resolveAssetsRoot(cwd);
  const abs = resolve(root, asset.relative_path);
  if (!abs.startsWith(root) || !existsSync(abs)) {
    throw new Error(`Asset file missing: ${asset.relative_path}`);
  }
  const mime = asset.extension === 'jpg' || asset.extension === 'jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${readFileSync(abs).toString('base64')}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function resolveVisualInspectionModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.UTILITY_MODEL?.trim() || DEFAULT_VISUAL_INSPECTION_MODEL;
}

export function inspectFirstPartyVisualsOffline(
  assets: FirstPartyAssetRecord[],
  cwd: string = process.cwd(),
): FirstPartyVisualObservation[] {
  return boundVisualInspectionAssets(assets).map((asset) => metadataObservation(asset, cwd));
}

export function liveCachedAssetIds(
  assets: FirstPartyAssetRecord[],
  options: { cwd?: string; cacheCwd?: string; model?: string } = {},
): string[] {
  const cwd = options.cwd ?? process.cwd();
  const cacheCwd = options.cacheCwd ?? cwd;
  const model = options.model ?? resolveVisualInspectionModel();
  return assets
    .filter((asset) => {
      const cached = cachedVisualObservation(asset, cacheCwd, model, cwd);
      return Boolean(cached && isLiveVisualObservation(cached));
    })
    .map((asset) => asset.asset_id);
}

export function inspectFirstPartyVisuals(
  assets: FirstPartyAssetRecord[],
  options: { cwd?: string; cacheCwd?: string; model?: string } = {},
): FirstPartyVisualObservation[] {
  const cwd = options.cwd ?? process.cwd();
  const cacheCwd = options.cacheCwd ?? cwd;
  const model = options.model ?? resolveVisualInspectionModel();
  return boundVisualInspectionAssets(assets).map((asset) => {
    const hash = hashAssetFile(asset, cwd);
    if (!hash) {
      return metadataObservation(asset, cwd);
    }
    const cached = cachedVisualObservation(asset, cacheCwd, model, cwd);
    if (cached && isLiveVisualObservation(cached)) return cached;
    if (cached && cached.inspection_status === 'METADATA_ONLY') {
      return cached;
    }
    const observation = metadataObservation(asset, cwd);
    if (!cached) {
      rememberVisualObservation(observation, cacheCwd, model);
    }
    return observation;
  });
}

function metadataObservation(
  asset: FirstPartyAssetRecord,
  cwd: string,
): FirstPartyVisualObservation {
  const hash = hashAssetFile(asset, cwd);
  if (asset.inspection_status === 'UNSUPPORTED' || asset.inspection_status === 'FAILED') {
    return {
      ...emptyVisualObservation(asset, {
        inspection_status: asset.inspection_status,
        notes: ['Inspection failed or is unsupported. No visual description was invented.'],
      }),
      asset_hash: hash,
    };
  }
  return {
    ...emptyVisualObservation(asset),
    asset_hash: hash,
    palette_observations: asset.observed_colors,
  };
}

export function visualObservationCachePath(cwd: string = process.cwd()): string {
  return join(cwd, 'tools/agent-harness/visual-cache/observations.json');
}

export function readVisualObservationCache(
  cwd: string = process.cwd(),
): Record<string, FirstPartyVisualObservation> {
  const path = visualObservationCachePath(cwd);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, FirstPartyVisualObservation>) : {};
  } catch {
    return {};
  }
}

export function writeVisualObservationCache(
  cache: Record<string, FirstPartyVisualObservation>,
  cwd: string = process.cwd(),
): void {
  const path = visualObservationCachePath(cwd);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cache, null, 2));
}

export function cacheKey(assetHash: string, model: string): string {
  return `${VISUAL_OBSERVATION_SCHEMA_VERSION}:${model}:${assetHash}`;
}

export function cachedVisualObservation(
  asset: FirstPartyAssetRecord,
  cacheCwd: string = process.cwd(),
  model: string = DEFAULT_VISUAL_INSPECTION_MODEL,
  assetCwd: string = cacheCwd,
): FirstPartyVisualObservation | null {
  const hash = hashAssetFile(asset, assetCwd);
  const cached = readVisualObservationCache(cacheCwd)[cacheKey(hash, model)];
  if (!cached) return null;
  if (cached.asset_hash !== hash || cached.schema_version !== VISUAL_OBSERVATION_SCHEMA_VERSION) {
    return null;
  }
  return cached;
}

export function rememberVisualObservation(
  observation: FirstPartyVisualObservation,
  cwd: string = process.cwd(),
  model: string = DEFAULT_VISUAL_INSPECTION_MODEL,
): void {
  const cache = readVisualObservationCache(cwd);
  cache[cacheKey(observation.asset_hash, model)] = observation;
  writeVisualObservationCache(cache, cwd);
}

export function hashAssetFile(asset: FirstPartyAssetRecord, cwd: string = process.cwd()): string {
  const root = resolveAssetsRoot(cwd);
  const abs = resolve(root, asset.relative_path);
  if (!abs.startsWith(root) || !existsSync(abs)) return '';
  return createHash('sha256').update(readFileSync(abs)).digest('hex');
}
