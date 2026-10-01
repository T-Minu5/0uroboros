import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type {
  CuratedResourceRecord,
  RetrievalStatus,
  TheatricsTier,
  VisualReferenceKind,
  VisualVsTechnique,
} from './contracts';
import { CuratedResourceRecordSchema } from './contracts';
import {
  LIBRARY_TAG,
  LIBRARY_WIDE_GUIDANCE,
  SECTION_SEMANTICS,
  constraintsForTags,
  overlayForUrl,
} from './resourceGuidance';

export type ResourceLibraryEntry = CuratedResourceRecord;

const CATEGORY_TAGS: Record<string, string[]> = {
  'Three.js / R3F': [LIBRARY_TAG.THREE_JS, 'threejs', 'framework', 'official-docs'],
  'Card/code examples': [LIBRARY_TAG.CODE_AND_CARD, 'cards', 'code', 'demo'],
  'Examples of Great / Good': [
    LIBRARY_TAG.EXAMPLES_OF_GREAT,
    LIBRARY_TAG.EXAMPLES_OF_GOOD,
    'examples-of-good',
    'reference-game',
  ],
  'Slay the Spire': [LIBRARY_TAG.EXAMPLES_OF_GOOD, 'slay-the-spire', 'examples-of-good', 'reference-game'],
  'Shards of Infinity': [
    LIBRARY_TAG.EXAMPLES_OF_GOOD,
    'shards-of-infinity',
    'examples-of-good',
    'reference-game',
  ],
  Theming: [LIBRARY_TAG.THEMING, 'theming', 'inspiration'],
  Obsidian: ['obsidian'],
  '3js effects reference': [LIBRARY_TAG.EFFECTS, 'threejs', 'effects', 'inspiration'],
  'Competitive gameplay video benchmarks': [
    LIBRARY_TAG.COMPETITIVE_VIDEO,
    'video',
    'competitive',
    'benchmark',
  ],
  Fonts: [LIBRARY_TAG.FONTS, 'fonts', 'design-system'],
};

const CATEGORY_REFERENCE_TYPES: Record<string, VisualReferenceKind[]> = {
  'Three.js / R3F': ['TECHNIQUE_REFERENCE'],
  'Card/code examples': ['CARD_RENDERING_REFERENCE', 'INTERACTION_REFERENCE', 'TECHNIQUE_REFERENCE'],
  'Examples of Great / Good': ['VISUAL_QUALITY_BENCHMARK', 'GAMEPLAY_PRESENTATION_REFERENCE'],
  'Slay the Spire': ['GAMEPLAY_PRESENTATION_REFERENCE', 'INSPIRATION_ONLY'],
  'Shards of Infinity': ['INSPIRATION_ONLY'],
  Theming: ['THEMING_REFERENCE', 'INSPIRATION_ONLY'],
  Obsidian: ['INSPIRATION_ONLY'],
  '3js effects reference': ['TECHNIQUE_REFERENCE', 'MOTION_THEATRICS_REFERENCE', 'INSPIRATION_ONLY'],
  'Competitive gameplay video benchmarks': [
    'VISUAL_QUALITY_BENCHMARK',
    'GAMEPLAY_PRESENTATION_REFERENCE',
    'MOTION_THEATRICS_REFERENCE',
  ],
  Fonts: ['THEMING_REFERENCE'],
};

interface RawOccurrence {
  url: string;
  title: string;
  category: string;
  localNotes: string[];
  sectionNotes: string[];
  label: string;
}

let cached: CuratedResourceRecord[] | null = null;

export function resourceLibraryPath(cwd: string = process.cwd()): string {
  return resolve(cwd, '0uroboros_swarm_v2_0/06_RESOURCE_LIBRARY.md');
}

export function loadResourceLibrary(cwd: string = process.cwd()): CuratedResourceRecord[] {
  if (cached) return cached;
  const markdown = readFileSync(resourceLibraryPath(cwd), 'utf8');
  cached = parseResourceLibrary(markdown);
  return cached;
}

export function resetResourceLibraryCache(): void {
  cached = null;
}

export function parseResourceLibrary(markdown: string): CuratedResourceRecord[] {
  const occurrences = collectOccurrences(markdown);
  const byUrl = new Map<string, CuratedResourceRecord>();
  for (const item of occurrences) {
    const existing = byUrl.get(item.url);
    const merged = toRecord(item, existing);
    byUrl.set(item.url, merged);
  }
  return [...byUrl.values()];
}

function collectOccurrences(markdown: string): RawOccurrence[] {
  const sections = splitSections(markdown);
  const occurrences: RawOccurrence[] = [];
  for (const section of sections) {
    const headingNotes: string[] = [];
    let seenUrl = false;
    let pending: string[] = [];
    let label = '';
    const sectionUrls: RawOccurrence[] = [];
    for (const raw of section.lines) {
      const line = raw.trim();
      if (!line || line.startsWith('# ')) continue;
      const extracted = extractUrl(line);
      if (extracted) {
        seenUrl = true;
        sectionUrls.push({
          url: extracted.url,
          title: extracted.title || titleFromUrl(extracted.url),
          category: section.category,
          localNotes: pending,
          sectionNotes: [...headingNotes],
          label,
        });
        pending = [];
        continue;
      }
      if (/^[A-Z][\w /+&.-]*:$/.test(line) || /^(Great|Good)\b/i.test(line)) {
        label = line.replace(/:$/, '');
      }
      if (!seenUrl) headingNotes.push(line);
      else pending.push(line);
    }
    const trailingNotes = pending.filter(
      (note) => /^Study /i.test(note) || /Recommended output/i.test(note) || /cannot change approved rules/i.test(note),
    );
    for (const occurrence of sectionUrls) {
      occurrence.sectionNotes = uniqueStrings([
        ...occurrence.sectionNotes,
        ...sectionSemanticsNotes(section.category),
        ...trailingNotes,
      ]);
      occurrences.push(occurrence);
    }
  }
  return occurrences;
}

function splitSections(markdown: string): { category: string; lines: string[] }[] {
  const sections: { category: string; lines: string[] }[] = [];
  let category = 'General';
  let lines: string[] = [];
  const flush = () => {
    if (lines.length > 0 || category !== 'General') {
      sections.push({ category, lines });
    }
    lines = [];
  };
  for (const raw of markdown.split('\n')) {
    const heading = raw.trim().match(/^#{2,3}\s+(.+)$/);
    if (heading) {
      flush();
      category = heading[1]!.trim();
      continue;
    }
    lines.push(raw);
  }
  flush();
  return sections;
}

function extractUrl(line: string): { url: string; title: string } | null {
  const labeled = line.match(/^(.+?):\s+(https?:\/\/\S+)/);
  if (labeled) {
    return {
      title: labeled[1]!.trim(),
      url: labeled[2]!.replace(/[).,]+$/, ''),
    };
  }
  const link = line.match(/https?:\/\/\S+/);
  if (!link) return null;
  return { url: link[0].replace(/[).,]+$/, ''), title: '' };
}

function toRecord(
  occurrence: RawOccurrence,
  existing?: CuratedResourceRecord,
): CuratedResourceRecord {
  const overlay = overlayForUrl(occurrence.url);
  const tags = uniqueStrings([
    ...(existing?.tags ?? []),
    ...(CATEGORY_TAGS[occurrence.category] ?? [slug(occurrence.category)]),
    ...tagsFromLabel(occurrence.label),
    ...(overlay?.extra_tags ?? []),
  ]);
  const referenceTypes = uniqueStrings([
    ...(existing?.reference_types ?? []),
    ...(CATEGORY_REFERENCE_TYPES[occurrence.category] ?? []),
    ...(overlay?.reference_types ?? []),
  ]) as VisualReferenceKind[];
  const theatrics = uniqueStrings([
    ...(existing?.theatrics_tiers ?? []),
    ...(overlay?.theatrics_tiers ?? defaultTheatrics(occurrence.category, occurrence.url)),
  ]) as TheatricsTier[];
  const userGuidance = uniqueStrings([
    ...LIBRARY_WIDE_GUIDANCE,
    ...(existing?.user_guidance ?? []),
    ...occurrence.sectionNotes,
    ...occurrence.localNotes,
    occurrence.label,
    ...(overlay?.user_guidance ?? []),
  ]);
  const categories = uniqueStrings([...(existing?.categories ?? []), occurrence.category]);
  const expected = classifyExpectedRetrievability(occurrence.url);
  return CuratedResourceRecordSchema.parse({
    resource_id: existing?.resource_id ?? resourceIdFromUrl(occurrence.url),
    url: occurrence.url,
    title: existing?.title && existing.title !== titleFromUrl(existing.url) ? existing.title : occurrence.title,
    tags,
    user_guidance: userGuidance,
    reference_types: referenceTypes,
    theatrics_tiers: theatrics,
    source_mode: 'CURATED',
    usage_constraints: constraintsForTags(tags),
    retrieval_status: 'NOT_RETRIEVED',
    notes: userGuidance.join(' '),
    category: existing?.category ?? occurrence.category,
    categories,
    visual_vs_technique: overlay?.visual_vs_technique ?? inferVisualVsTechnique(referenceTypes, expected),
    expected_retrievability: expected,
  });
}

function tagsFromLabel(label: string): string[] {
  const lower = label.toLowerCase();
  if (lower.includes('marvel snap') || /^great\b/.test(lower)) {
    return [LIBRARY_TAG.EXAMPLES_OF_GREAT];
  }
  if (/^good\b/.test(lower)) return [LIBRARY_TAG.EXAMPLES_OF_GOOD];
  return [];
}

function defaultTheatrics(category: string, url: string): TheatricsTier[] {
  if (category !== '3js effects reference') return [];
  if (/singularity/i.test(url)) return ['TIER_4'];
  if (/wavy-cubes|particle/i.test(url)) return ['TIER_3', 'TIER_4'];
  if (/ScanEffect|GeometryPainter|Origami/i.test(url)) return ['TIER_2', 'TIER_3'];
  if (/EffectComposer/i.test(url)) return ['TIER_1', 'TIER_2', 'TIER_3', 'TIER_4'];
  return ['TIER_2'];
}

function inferVisualVsTechnique(
  kinds: VisualReferenceKind[],
  expected: CuratedResourceRecord['expected_retrievability'],
): VisualVsTechnique {
  const visual = kinds.some((kind) =>
    ['VISUAL_QUALITY_BENCHMARK', 'MOTION_THEATRICS_REFERENCE', 'THEMING_REFERENCE'].includes(kind),
  );
  const technique = kinds.includes('TECHNIQUE_REFERENCE') || kinds.includes('MATERIAL_SHADER_REFERENCE');
  if (visual && technique) return 'VISUAL_AND_TECHNIQUE';
  if (expected === 'VIDEO' || expected === 'VISUAL_DEMO') return visual ? 'VISUAL_REFERENCE' : 'VISUAL_AND_TECHNIQUE';
  if (technique) return 'TECHNIQUE_REFERENCE';
  return 'VISUAL_REFERENCE';
}

export function classifyExpectedRetrievability(
  url: string,
): NonNullable<CuratedResourceRecord['expected_retrievability']> {
  const host = safeHost(url);
  if (/youtube\.com|youtu\.be/.test(host)) return 'VIDEO';
  if (/github\.com/.test(host)) return 'GITHUB';
  if (
    /codepen\.io|tympanus\.net\/Development|tympanus\.net\/Tutorials|misterprada|webflow\.io|demo\.drimgar|arkon\.digital|pinterest|deviantart/.test(
      url,
    )
  ) {
    return 'VISUAL_DEMO';
  }
  if (/threejs\.org\/docs|ultraboardgames|medium\.com|wikipedia|fandom\.com|joinplayroom|wearedevelopers|ics\.media/.test(url)) {
    return 'TEXT';
  }
  if (/blizzard\.com|steampowered|reddit\.com|ign\.com/.test(host)) return 'AMBIGUOUS';
  return 'AMBIGUOUS';
}

export function queryResourceLibrary(
  entries: CuratedResourceRecord[],
  options: { query?: string; tags?: string[]; maxResults?: number } = {},
): CuratedResourceRecord[] {
  const query = (options.query ?? '').trim().toLowerCase();
  const tags = (options.tags ?? []).map((tag) => tag.toLowerCase());
  const maxResults = options.maxResults ?? 8;
  return entries
    .filter((entry) => {
      const haystack = [
        entry.url,
        entry.title ?? '',
        entry.category,
        entry.notes,
        ...entry.tags,
        ...entry.user_guidance,
        ...entry.reference_types,
        ...entry.categories,
      ]
        .join(' ')
        .toLowerCase();
      const tagMatch = tags.length === 0 || tags.some((tag) => haystack.includes(tag));
      const queryMatch = !query || query.split(/\s+/).every((token) => haystack.includes(token));
      return tagMatch && queryMatch;
    })
    .slice(0, maxResults);
}

export function isApprovedResourceUrl(
  url: string,
  entries: CuratedResourceRecord[] = loadResourceLibrary(),
): boolean {
  return entries.some((entry) => entry.url === url);
}

export function findResourceByUrl(
  url: string,
  entries: CuratedResourceRecord[] = loadResourceLibrary(),
): CuratedResourceRecord | undefined {
  return entries.find((entry) => entry.url === url);
}

export interface ResourceLibraryAudit {
  unique_urls: number;
  duplicates_merged: number;
  category_counts: Record<string, number>;
  tag_counts: Record<string, number>;
  missing_user_guidance: number;
  text_retrievable: number;
  visual_only: number;
  currently_blocked: number;
  ambiguous: number;
  github: number;
  video: number;
}

export function auditResourceLibrary(
  entries: CuratedResourceRecord[] = loadResourceLibrary(),
  rawMarkdown?: string,
): ResourceLibraryAudit {
  const rawUrlCount = rawMarkdown
    ? (rawMarkdown.match(/https?:\/\/\S+/g) ?? []).length
    : entries.reduce((sum, entry) => sum + entry.categories.length, 0);
  const categoryCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  let missingGuidance = 0;
  let text = 0;
  let visual = 0;
  let blocked = 0;
  let ambiguous = 0;
  let github = 0;
  let video = 0;
  for (const entry of entries) {
    for (const category of entry.categories) {
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    }
    for (const tag of entry.tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
    if (entry.user_guidance.length === 0) missingGuidance += 1;
    if (entry.retrieval_status === 'BLOCKED') blocked += 1;
    switch (entry.expected_retrievability) {
      case 'TEXT':
        text += 1;
        break;
      case 'VISUAL_DEMO':
        visual += 1;
        break;
      case 'GITHUB':
        github += 1;
        break;
      case 'VIDEO':
        video += 1;
        break;
      default:
        ambiguous += 1;
    }
  }
  return {
    unique_urls: entries.length,
    duplicates_merged: Math.max(0, rawUrlCount - entries.length),
    category_counts: categoryCounts,
    tag_counts: tagCounts,
    missing_user_guidance: missingGuidance,
    text_retrievable: text,
    visual_only: visual,
    currently_blocked: blocked,
    ambiguous,
    github,
    video,
  };
}

function sectionSemanticsNotes(category: string): string[] {
  const note = SECTION_SEMANTICS[category];
  return note ? [note] : [];
}

export function resourceIdFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `res-${slug(`${parsed.hostname}${parsed.pathname}`)}`.slice(0, 80);
  } catch {
    return `res-${slug(url)}`.slice(0, 80);
  }
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return url;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function defaultResourceLibraryRoot(cwd: string = process.cwd()): string {
  return join(cwd, '0uroboros_swarm_v2_0');
}

export function withRetrieval(
  entry: CuratedResourceRecord,
  status: RetrievalStatus,
  retrievedAt: string,
  contentRef?: string,
): CuratedResourceRecord {
  return {
    ...entry,
    retrieval_status: status,
    last_retrieved_at: retrievedAt,
    retrieved_content_ref: contentRef,
  };
}
