/**
 * Capture-backed vision critique. Separate from IMPLEMENTATION_EVIDENCE.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { resolveSwarmConfig } from '../swarm/config';
import { loadLocalEnv } from '../../scripts/openai-connection-config';
import type { QualityCritique } from './state';
import { evidenceDir } from './captureEvidence';

export async function critiqueCapturedBoard(root: string): Promise<{
  critique: QualityCritique;
  spendUsd: number;
  model: string;
  observation: string;
}> {
  loadLocalEnv(root);
  const latestPath = join(evidenceDir(root), 'latest.json');
  if (!existsSync(latestPath)) {
    throw new Error('No evidence/latest.json capture manifest.');
  }
  const latest = JSON.parse(readFileSync(latestPath, 'utf8')) as { files?: string[] };
  const imagePath = latest.files?.[0];
  if (!imagePath || !existsSync(imagePath)) {
    throw new Error('Capture PNG missing.');
  }

  const config = resolveSwarmConfig();
  if (!config.apiKey) throw new Error('OPENAI_API_KEY missing for vision critique.');
  const model = config.models.utility;
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: config.apiKey });
  const dataUrl = `data:image/png;base64,${readFileSync(imagePath).toString('base64')}`;

  const response = await client.responses.create({
    model,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: [
              'You are an independent LookDev/UX critic for the 0uroboros boardgame.io demo.',
              'Score the CURRENT runtime screenshot against a competitive digital card-game visual bar (Snap / STS tactile presence).',
              'Return ONLY compact JSON with keys:',
              'visual_direction (0-1), ux_comprehension (0-1), reference_bar (0-1), spectacle_quality (0-1),',
              'card_physicality_quality (0-1), thematic_cohesion (0-1), passed_competitive_bar (boolean),',
              'deficiencies (string array, max 5), observation (string).',
              'Do not inflate. File existence is irrelevant. Judge only what is visible.',
              'Known targets: octagon table, magenta rim, cyan/magenta pylons, five Node columns,',
              'cards as physical props not HUD chips, readable source→target effects, Collapse spectacle.',
            ].join(' '),
          },
          { type: 'input_image', image_url: dataUrl, detail: 'high' },
        ],
      },
    ],
  });

  const text = extractOutputText(response);
  const parsed = parseCritiqueJson(text);
  const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  const spendUsd = estimateUtilityCost(usage?.input_tokens ?? 0, usage?.output_tokens ?? 0);

  const outDir = evidenceDir(root);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'vision-critique-latest.json'),
    `${JSON.stringify({ at: new Date().toISOString(), model, spendUsd, parsed, text }, null, 2)}\n`,
  );

  return {
    model,
    spendUsd,
    observation: parsed.observation,
    critique: {
      fresh: true,
      source: 'capture-backed-utility-vision',
      at: new Date().toISOString(),
      visual_direction: clamp(parsed.visual_direction),
      ux_comprehension: clamp(parsed.ux_comprehension),
      reference_bar: clamp(parsed.reference_bar),
      spectacle_quality: clamp(parsed.spectacle_quality),
      thematic_cohesion: clamp(parsed.thematic_cohesion),
      card_physicality_quality: clamp(parsed.card_physicality_quality),
      deficiencies: parsed.deficiencies.slice(0, 5),
      specialists: ['utility-vision', 'lookdev-equivalent'],
      passed_competitive_bar: Boolean(parsed.passed_competitive_bar),
    },
  };
}

function extractOutputText(response: unknown): string {
  const record = response as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
  };
  if (typeof record.output_text === 'string' && record.output_text.trim()) return record.output_text;
  const chunks: string[] = [];
  for (const item of record.output ?? []) {
    for (const part of item.content ?? []) {
      if (typeof part.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('\n');
}

function parseCritiqueJson(text: string): {
  visual_direction: number;
  ux_comprehension: number;
  reference_bar: number;
  spectacle_quality: number;
  card_physicality_quality: number;
  thematic_cohesion: number;
  passed_competitive_bar: boolean;
  deficiencies: string[];
  observation: string;
} {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return {
      visual_direction: 0.55,
      ux_comprehension: 0.55,
      reference_bar: 0.55,
      spectacle_quality: 0.5,
      card_physicality_quality: 0.5,
      thematic_cohesion: 0.55,
      passed_competitive_bar: false,
      deficiencies: ['Vision critique returned no JSON.'],
      observation: text.slice(0, 500),
    };
  }
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  return {
    visual_direction: Number(parsed.visual_direction ?? 0.55),
    ux_comprehension: Number(parsed.ux_comprehension ?? 0.55),
    reference_bar: Number(parsed.reference_bar ?? 0.55),
    spectacle_quality: Number(parsed.spectacle_quality ?? 0.5),
    card_physicality_quality: Number(parsed.card_physicality_quality ?? 0.5),
    thematic_cohesion: Number(parsed.thematic_cohesion ?? 0.55),
    passed_competitive_bar: Boolean(parsed.passed_competitive_bar),
    deficiencies: Array.isArray(parsed.deficiencies)
      ? parsed.deficiencies.map(String)
      : [],
    observation: String(parsed.observation ?? ''),
  };
}

function estimateUtilityCost(input: number, output: number): number {
  return Number(((input * 0.4 + output * 1.6) / 1e6).toFixed(6));
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}
