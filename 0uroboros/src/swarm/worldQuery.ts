export const GENERIC_WORLD_QUERY_NOISE = new Set([
  'a',
  'an',
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'about',
  'using',
  'should',
  'must',
  'not',
  'one',
  'both',
  'only',
  'existing',
  'approved',
  'engine',
  'task',
  'requires',
  'required',
  'contribution',
  'contributions',
  'develop',
  'create',
  'propose',
  'proposed',
  'candidate',
  'candidates',
  'concept',
  'concepts',
  'new',
  'card',
  'cards',
  'character',
  'characters',
  '0uroboros',
  'ouroboros',
  'game',
  'games',
  'lore',
  'define',
  'retrieve',
  'inspect',
  'relevant',
  'first',
  'party',
  'visual',
  'summarize',
  'identify',
  'unresolved',
  'small',
  'worldbuilding',
  'content',
  'astra',
  'preserve',
  'before',
  'after',
  'finalizing',
  'search',
  'read',
  'vault',
  'use',
  'shared',
  'exactly',
  'assumptions',
  'assumption',
  'onreveal',
  'bounded',
  'draft',
  'power',
  'drain',
  'action',
  'actions',
  'effect',
  'effects',
  'mechanic',
  'mechanics',
  'primitive',
  'combination',
  'strategic',
  'purpose',
  'provenance',
  'offensive',
  'tempo',
  'attacker',
  'cost',
  'draw',
]);

const NAMED_ENTITY_RE =
  /\b(?:Node[- ]Feratu|Rezz-Razor|Glitch-Witch\.exe|Hex-Hackers|Sigil-Shamans|Tesseract Magi)\b/gi;

const REPRESENTATIVE_ART_RE = /^(rezz-razor|glitch-witch(?:\.exe)?)$/i;

const THEME_TAGS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /cyberpunk/i, tag: 'Cyberpunk' },
  { pattern: /quantum(?:\s+physics)?/i, tag: 'Quantum' },
  { pattern: /\boccult\b/i, tag: 'Occult' },
];

const ENTITY_FOCUSED_RE =
  /\b(retriev(?:e|ing)|established lore|lore for|world (?:lore|bible|knowledge) for)\b/i;

export interface WorldKnowledgeQueryInput {
  objective: string;
  content_summary?: string;
  content_concept?: string;
  candidate_name?: string;
  candidate_type?: string;
  canonical_theme_tags?: string[];
  existing_entity_names?: string[];
  visual_motifs?: string[];
  representative_asset_names?: string[];
  discovered_world_terms?: string[];
}

export interface WorldKnowledgeQueryPlan {
  queries: string[];
  named_entities: string[];
  character_verification_queries: string[];
  filtered_noise: string[];
}

export function isGenericWorldQueryToken(token: string): boolean {
  const normalized = token.trim().toLowerCase();
  return normalized.length < 3 || GENERIC_WORLD_QUERY_NOISE.has(normalized);
}

export function isRepresentativeArtName(name: string): boolean {
  return REPRESENTATIVE_ART_RE.test(name.trim());
}

export function extractNamedWorldEntities(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/"([^"]+)"/g)) {
    names.push(match[1] ?? '');
  }
  for (const match of text.matchAll(/\b[A-Z][\w]+(?:-[\w.]+)+\b/g)) {
    names.push(match[0] ?? '');
  }
  for (const match of text.matchAll(NAMED_ENTITY_RE)) {
    names.push(match[0] ?? '');
  }
  if (/\bnode[- ]?feratu\b/i.test(text)) {
    names.push('Node Feratu', 'Node-Feratu');
  }
  return uniqueKeepOrder(names.map((item) => item.trim()).filter(Boolean));
}

export function canonicalThemeTagsFromText(text: string): string[] {
  return THEME_TAGS.filter((item) => item.pattern.test(text)).map((item) => item.tag);
}

export function candidateTypeTokens(objective: string, candidateType?: string): string[] {
  const haystack = `${objective} ${candidateType ?? ''}`;
  const tokens: string[] = [];
  if (/\bchaos\b/i.test(haystack)) tokens.push('Chaos');
  if (/\bhex[- ]hackers\b/i.test(haystack)) tokens.push('Hex-Hackers');
  if (/\bsigil[- ]shamans\b/i.test(haystack)) tokens.push('Sigil-Shamans');
  if (/\bbase\b/i.test(haystack) && /\b(card|character)\b/i.test(haystack)) tokens.push('Base');
  return tokens;
}

export function isWorldEntityFocusedTask(objective: string): boolean {
  return ENTITY_FOCUSED_RE.test(objective);
}

export function buildWorldKnowledgeQueries(input: WorldKnowledgeQueryInput): WorldKnowledgeQueryPlan {
  const filtered_noise: string[] = [];
  const keep = (item: string): boolean => {
    if (isGenericWorldQueryToken(item) || isRepresentativeArtName(item)) {
      filtered_noise.push(item);
      return false;
    }
    return true;
  };

  const named_entities = uniqueKeepOrder([
    ...extractNamedWorldEntities(input.objective),
    ...(input.existing_entity_names ?? []),
  ]).filter((item) => {
    if (input.candidate_name && item.toLowerCase() === input.candidate_name.toLowerCase()) {
      return false;
    }
    return keep(item);
  });

  const contentTerms = uniqueKeepOrder([
    ...tokensFromText(input.content_concept),
    ...tokensFromText(input.content_summary),
  ])
    .filter(keep)
    .sort((left, right) => right.length - left.length)
    .slice(0, 4);

  const typeTokens = uniqueKeepOrder([
    ...candidateTypeTokens(input.objective, input.candidate_type),
    ...(input.visual_motifs ?? []).map((item) => item.trim()),
    ...(input.discovered_world_terms ?? []),
  ]).filter(keep);

  const genreFallback = uniqueKeepOrder([
    ...canonicalThemeTagsFromText(input.objective),
    ...(input.canonical_theme_tags ?? []),
  ]).filter(keep);

  const character_verification_queries = uniqueKeepOrder(
    input.candidate_name ? extractNamedWorldEntities(input.candidate_name).concat(input.candidate_name) : [],
  )
    .filter((item) => item.trim().length >= 3)
    .slice(0, 1);

  const worldFirst = isWorldEntityFocusedTask(input.objective) && named_entities.length > 0;
  const primary = worldFirst
    ? uniqueKeepOrder([...named_entities, ...contentTerms, ...typeTokens])
    : uniqueKeepOrder([...contentTerms, ...typeTokens, ...named_entities]);

  const withGenre =
    primary.length >= 4 ? primary : uniqueKeepOrder([...primary, ...genreFallback]);
  const queries = uniqueKeepOrder([
    ...withGenre,
    ...(withGenre.length < 4 ? character_verification_queries : []),
  ]).slice(0, 6);

  return {
    queries,
    named_entities,
    character_verification_queries,
    filtered_noise: uniqueKeepOrder(filtered_noise),
  };
}

function tokensFromText(text: string | undefined): string[] {
  if (!text?.trim()) return [];
  return text
    .split(/[^A-Za-z0-9+]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !isGenericWorldQueryToken(token));
}

function uniqueKeepOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
