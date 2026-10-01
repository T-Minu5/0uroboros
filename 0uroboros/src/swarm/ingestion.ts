import { RetrievedContentSchema, type RetrievedContent } from './contracts';
import type { CuratedResourceRecord } from './contracts';

export const MAX_EXTRACTED_CONTENT_CHARS = 4000;
export const MIN_READABLE_TEXT_CHARS = 280;

export interface CompanionFile {
  path: string;
  status_code: number;
  body: string;
}

export interface IngestInput {
  url: string;
  status_code: number;
  content_type?: string;
  body?: string;
  companions?: CompanionFile[];
  resource?: CuratedResourceRecord;
  max_chars?: number;
  transcript?: string;
  visual_inspected?: boolean;
}

export interface VisualInspectionSeam {
  inspectVisualUrl(url: string): Promise<{ notes: string[] } | null>;
}

export const NO_VISUAL_INSPECTION: VisualInspectionSeam = {
  async inspectVisualUrl() {
    return null;
  },
};

export function ingestCuratedSource(input: IngestInput): RetrievedContent {
  const maxChars = input.max_chars ?? MAX_EXTRACTED_CONTENT_CHARS;
  const userGuidance = input.resource?.user_guidance ?? [];
  const base = {
    url: input.url,
    resource_id: input.resource?.resource_id,
    status_code: input.status_code,
    content_type: input.content_type ?? '',
    user_guidance: userGuidance,
    visual_inspected: input.visual_inspected === true,
    visual_behavior_claims: [] as string[],
    visual_inspection_seam: {
      supported: false,
      reason: 'No visual-inspection tool is wired. Text extraction cannot see animation.',
    },
  };

  if (input.status_code === 403 || input.status_code === 401) {
    return RetrievedContentSchema.parse({
      ...base,
      retrieval_status: 'BLOCKED',
      title: pageTitle(input.body) || input.resource?.title || titleFromUrl(input.url),
      extracted_text: '',
      limitations: [
        `Retrieval failed with HTTP ${input.status_code}.`,
        'No evidence claim beyond Resource Library metadata and user guidance.',
      ],
      metadata: {
        source_identity: input.url,
        resource_id: input.resource?.resource_id ?? '',
      },
    });
  }

  if (input.status_code >= 400 || input.status_code === 0) {
    return RetrievedContentSchema.parse({
      ...base,
      retrieval_status: 'FAILED',
      title: input.resource?.title || titleFromUrl(input.url),
      extracted_text: '',
      limitations: [`Retrieval failed with HTTP ${input.status_code || 0}.`],
    });
  }

  if (isVideoUrl(input.url)) {
    const transcript = (input.transcript ?? '').trim();
    return RetrievedContentSchema.parse({
      ...base,
      retrieval_status: transcript ? 'OK' : 'METADATA_ONLY',
      title: pageTitle(input.body) || input.resource?.title || titleFromUrl(input.url),
      extracted_text: boundText(transcript, maxChars),
      transcript_available: transcript.length > 0,
      metadata: metadataFromHtml(input.body, input.url),
      limitations: transcript
        ? ['Transcript is not a visual inspection.']
        : [
            'No transcript was available.',
            'Do not claim visual observations. The agent did not inspect the video.',
          ],
    });
  }

  if (isGitHubRepoUrl(input.url)) {
    return ingestGitHub(input, maxChars, base);
  }

  const html = input.body ?? '';
  const extracted = extractReadableHtml(html);
  const title = extracted.title || input.resource?.title || titleFromUrl(input.url);
  if (isVisualDemoUrl(input.url) && extracted.text.length < MIN_READABLE_TEXT_CHARS) {
    return RetrievedContentSchema.parse({
      ...base,
      retrieval_status: 'VISUAL_ONLY',
      title,
      extracted_text: '',
      headings: extracted.headings,
      metadata: metadataFromHtml(html, input.url),
      limitations: [
        'Readable text was minimal.',
        'Classified as a visual or technique reference.',
        'No fabricated description of visual behavior.',
        'Text extraction cannot see animation.',
      ],
    });
  }

  return RetrievedContentSchema.parse({
    ...base,
    retrieval_status: 'OK',
    title,
    extracted_text: boundText(extracted.text, maxChars),
    headings: extracted.headings,
    metadata: metadataFromHtml(html, input.url),
    companion_files: companionsToRecords(input.companions, maxChars),
    limitations: extracted.text.length === 0 ? ['No readable article text was extracted.'] : [],
  });
}

function ingestGitHub(
  input: IngestInput,
  maxChars: number,
  base: Record<string, unknown>,
): RetrievedContent {
  const readme = input.companions?.find((file) => /readme/i.test(file.path) && file.status_code < 400);
  const requested = (input.companions ?? []).filter((file) => file.status_code < 400);
  const htmlMeta = metadataFromHtml(input.body, input.url);
  const extracted = extractReadableHtml(input.body ?? '');
  const parts = [
    readme ? boundText(stripMarkdownNoise(readme.body), maxChars) : '',
    ...requested
      .filter((file) => file !== readme)
      .map((file) => `## ${file.path}\n${boundText(stripMarkdownNoise(file.body), Math.min(1200, maxChars))}`),
  ].filter(Boolean);
  const text = boundText(parts.join('\n\n') || extracted.text, maxChars);
  return RetrievedContentSchema.parse({
    ...base,
    retrieval_status: text ? 'OK' : 'METADATA_ONLY',
    title: htmlMeta.title || extracted.title || input.resource?.title || titleFromUrl(input.url),
    extracted_text: text,
    headings: extracted.headings,
    metadata: {
      ...htmlMeta,
      repository: githubRepoPath(input.url),
      readme_included: readme ? 'true' : 'false',
    },
    companion_files: companionsToRecords(requested, maxChars),
    limitations: readme
      ? ['Repository crawl was not performed. Only metadata, README, and requested files were read.']
      : [
          'Repository crawl was not performed.',
          'README was not retrieved. Only page metadata and any requested files are available.',
        ],
  });
}

export function extractReadableHtml(html: string): { title: string; text: string; headings: string[] } {
  if (!html.trim()) return { title: '', text: '', headings: [] };
  const title = pageTitle(html);
  const withoutChrome = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ');
  const main =
    firstMatch(withoutChrome, /<article\b[^>]*>([\s\S]*?)<\/article>/i) ??
    firstMatch(withoutChrome, /<main\b[^>]*>([\s\S]*?)<\/main>/i) ??
    firstMatch(withoutChrome, /<div[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div>/i) ??
    withoutChrome;
  const headings = [...main.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((match) =>
    decodeEntities(stripTags(match[2] ?? '')),
  );
  const withHeadingMarks = main.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_all, level, inner) => {
    const marks = '#'.repeat(Math.min(Number(level), 6));
    return `\n\n${marks} ${stripTags(inner)}\n\n`;
  });
  const text = decodeEntities(
    stripTags(withHeadingMarks.replace(/<li\b[^>]*>/gi, '\n- ').replace(/<p\b[^>]*>/gi, '\n\n'))
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  );
  return { title, text, headings: headings.filter(Boolean) };
}

export function githubRawReadmeUrl(repoUrl: string): string | null {
  const parsed = githubRepoPath(repoUrl);
  if (!parsed) return null;
  return `https://raw.githubusercontent.com/${parsed}/HEAD/README.md`;
}

export function isGitHubRepoUrl(url: string): boolean {
  return /github\.com\/[^/]+\/[^/]+/i.test(url);
}

export function isVideoUrl(url: string): boolean {
  return /youtube\.com\/watch|youtu\.be\//i.test(url);
}

export function isVisualDemoUrl(url: string): boolean {
  return /codepen\.io|tympanus\.net\/(?:Development|Tutorials)|misterprada|webflow\.io|demo\.drimgar|arkon\.digital/i.test(
    url,
  );
}

export function boundText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars).trimEnd();
}

function companionsToRecords(companions: CompanionFile[] | undefined, maxChars: number) {
  return (companions ?? [])
    .filter((file) => file.status_code < 400)
    .map((file) => ({
      path: file.path,
      extracted_text: boundText(stripMarkdownNoise(file.body), maxChars),
    }));
}

function githubRepoPath(url: string): string {
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/i);
  return match ? match[1]!.replace(/\.git$/, '') : '';
}

function pageTitle(html: string | undefined): string {
  if (!html) return '';
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i);
  if (og?.[1]) return decodeEntities(og[1]);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return title ? decodeEntities(stripTags(title[1] ?? '')) : '';
}

function metadataFromHtml(html: string | undefined, url: string): Record<string, string> {
  const title = pageTitle(html);
  const description =
    html?.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1] ??
    html?.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i)?.[1] ??
    '';
  return {
    url,
    title,
    description: decodeEntities(description),
  };
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ');
}

function stripMarkdownNoise(value: string): string {
  return value.replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim();
}

function firstMatch(value: string, pattern: RegExp): string | null {
  const match = value.match(pattern);
  return match?.[1] ?? null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return url;
  }
}
