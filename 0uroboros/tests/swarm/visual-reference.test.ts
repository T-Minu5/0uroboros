import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { SPECIALIST_TOOL_NAMES, createPlanningTeam, toolNames } from '../../src/swarm/agents';
import { visualReferenceCannotBecomeCanonical } from '../../src/swarm/visualReference';
import {
  LOOKDEV_ALLOWED,
  LOOKDEV_FORBIDDEN,
  MAX_PACKET_EXCERPT_CHARS,
  MAX_VISUAL_PACKET_RESOURCES,
  VISUAL_AUTHORITY_LADDER,
  assembleVisualReferencePacket,
  lookDevAgentIsInstantiated,
  researchToLookDevHandoff,
} from '../../src/swarm/visualReference';
import {
  MAX_EXTRACTED_CONTENT_CHARS,
  ingestCuratedSource,
} from '../../src/swarm/ingestion';
import { LIBRARY_TAG } from '../../src/swarm/resourceGuidance';
import {
  auditResourceLibrary,
  loadResourceLibrary,
  parseResourceLibrary,
  resourceLibraryPath,
} from '../../src/swarm/resourceLibrary';
import { detectReviewTriggers, lookDevProposalDoesNotTriggerReview } from '../../src/swarm/review';
import { evidenceAuthorityRank } from '../../src/swarm/research';
import { validateOrchestrationResult } from '../../src/swarm/governance';
import type { CuratedResourceRecord, ExternalEvidenceRecord } from '../../src/swarm/contracts';
import { emptyRuntime, testConfig, workPackage } from './fixtures';
import { hudSmokeOrchestrationResult } from './hud-smoke-fixture';

const ARTICLE_HTML = `
<html>
  <head>
    <title>Shards of Infinity rules</title>
    <style>body { color: red; }</style>
    <meta name="description" content="Turn structure notes">
  </head>
  <body>
    <nav>Home Shop Login</nav>
    <article>
      <h1>Turn structure</h1>
      <p>Players play cards, then buy cards from the market.</p>
      <h2>Mastery</h2>
      <p>Mastery is a shared race, not a 0uroboros rule.</p>
    </article>
    <footer>Copyright footer</footer>
    <script>window.track()</script>
  </body>
</html>
`;

function resource(overrides: Partial<CuratedResourceRecord> & Pick<CuratedResourceRecord, 'url'>): CuratedResourceRecord {
  return {
    resource_id: overrides.resource_id ?? `res-${overrides.url.slice(-12)}`,
    title: overrides.title ?? 'Example',
    tags: overrides.tags ?? ['demo'],
    user_guidance: overrides.user_guidance ?? [],
    reference_types: overrides.reference_types ?? ['TECHNIQUE_REFERENCE'],
    theatrics_tiers: overrides.theatrics_tiers ?? [],
    source_mode: 'CURATED',
    usage_constraints: overrides.usage_constraints ?? ['STUDY_PRINCIPLES_AND_TECHNIQUES'],
    retrieval_status: overrides.retrieval_status ?? 'NOT_RETRIEVED',
    notes: overrides.notes ?? '',
    category: overrides.category ?? 'General',
    categories: overrides.categories ?? ['General'],
    ...overrides,
  };
}

describe('Resource Library structured ingestion', () => {
  it('deduplicates identical URLs while preserving multiple tags', () => {
    const parsed = parseResourceLibrary(`
## Card/code examples
https://github.com/Rymedy/hearthstone-web
## Examples of Great / Good
https://github.com/Rymedy/hearthstone-web
`);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.tags).toEqual(
      expect.arrayContaining([LIBRARY_TAG.CODE_AND_CARD, LIBRARY_TAG.EXAMPLES_OF_GREAT]),
    );
  });

  it('preserves Mel-authored user guidance through ingestion', () => {
    const library = loadResourceLibrary();
    const scan = library.find((item) => item.url.includes('ScanEffect/effect1'));
    const snap = library.find((item) => item.url.includes('eKrOIG5tqJ4'));
    const solar = library.find((item) => item.url.includes('Solarpunk'));
    const singularity = library.find((item) => item.url.includes('singularity.misterprada'));
    expect(scan?.user_guidance.join(' ')).toMatch(/depth-mapped effect/i);
    expect(snap?.user_guidance.join(' ')).toMatch(/Marvel Snap is a Great benchmark/i);
    expect(solar?.user_guidance.join(' ')).toMatch(/sparingly, ideally healing/i);
    expect(singularity?.user_guidance.join(' ')).toMatch(/singularity \+ liquid wave/i);
    expect(scan?.theatrics_tiers).toEqual(expect.arrayContaining(['TIER_2', 'TIER_3']));
  });

  it('supports the required library tags including multi-tag resources', () => {
    const library = loadResourceLibrary();
    const tags = new Set(library.flatMap((item) => item.tags));
    expect(tags.has(LIBRARY_TAG.THREE_JS)).toBe(true);
    expect(tags.has(LIBRARY_TAG.CODE_AND_CARD)).toBe(true);
    expect(tags.has(LIBRARY_TAG.EXAMPLES_OF_GREAT)).toBe(true);
    expect(tags.has(LIBRARY_TAG.EXAMPLES_OF_GOOD)).toBe(true);
    expect(tags.has(LIBRARY_TAG.THEMING)).toBe(true);
    expect(tags.has(LIBRARY_TAG.EFFECTS)).toBe(true);
    expect(tags.has(LIBRARY_TAG.COMPETITIVE_VIDEO)).toBe(true);
    expect(tags.has(LIBRARY_TAG.FONTS)).toBe(true);
    const hearthstone = library.find((item) => item.url.includes('hearthstone-web'));
    expect(hearthstone?.categories.length).toBeGreaterThan(1);
  });

  it('audits unique URLs and does not treat visual design colors as a live library URL set', () => {
    const markdown = readFileSync(resourceLibraryPath(), 'utf8');
    const library = loadResourceLibrary();
    const audit = auditResourceLibrary(library, markdown);
    expect(audit.unique_urls).toBe(library.length);
    expect(audit.duplicates_merged).toBeGreaterThanOrEqual(1);
    expect(audit.tag_counts[LIBRARY_TAG.VISUAL_DESIGN_COLORS] ?? 0).toBe(0);
    expect(audit.video).toBeGreaterThan(0);
    expect(audit.visual_only).toBeGreaterThan(0);
    expect(audit.text_retrievable).toBeGreaterThan(0);
  });
});

describe('Readable curated-source ingestion', () => {
  it('extracts article text, headings, and strips chrome', () => {
    const retrieved = ingestCuratedSource({
      url: 'https://www.ultraboardgames.com/shards-of-infinity/game-rules.php',
      status_code: 200,
      content_type: 'text/html',
      body: ARTICLE_HTML,
    });
    expect(retrieved.retrieval_status).toBe('OK');
    expect(retrieved.title).toBe('Shards of Infinity rules');
    expect(retrieved.headings).toEqual(expect.arrayContaining(['Turn structure', 'Mastery']));
    expect(retrieved.extracted_text).toMatch(/# Turn structure/);
    expect(retrieved.extracted_text).toMatch(/Players play cards/);
    expect(retrieved.extracted_text).not.toMatch(/Home Shop Login/);
    expect(retrieved.extracted_text).not.toMatch(/Copyright footer/);
    expect(retrieved.extracted_text).not.toMatch(/window\.track/);
  });

  it('records a blocked 403 without inventing findings', () => {
    const retrieved = ingestCuratedSource({
      url: 'https://hearthstone.blizzard.com/en-us',
      status_code: 403,
      resource: resource({
        url: 'https://hearthstone.blizzard.com/en-us',
        user_guidance: ['Do not imitate it.'],
        tags: [LIBRARY_TAG.EXAMPLES_OF_GREAT],
      }),
    });
    expect(retrieved.retrieval_status).toBe('BLOCKED');
    expect(retrieved.extracted_text).toBe('');
    expect(retrieved.visual_behavior_claims).toEqual([]);
    expect(retrieved.user_guidance).toEqual(['Do not imitate it.']);
    expect(retrieved.limitations.join(' ')).toMatch(/403/);
  });

  it('classifies a visual demo with minimal text without fabricating behavior', () => {
    const retrieved = ingestCuratedSource({
      url: 'https://singularity.misterprada.com/',
      status_code: 200,
      content_type: 'text/html',
      body: '<html><head><title>Singularity</title></head><body><canvas></canvas></body></html>',
      resource: resource({
        url: 'https://singularity.misterprada.com/',
        user_guidance: ['combine singularity + liquid wave for Wave Collapse'],
        reference_types: ['MATERIAL_SHADER_REFERENCE'],
      }),
    });
    expect(retrieved.retrieval_status).toBe('VISUAL_ONLY');
    expect(retrieved.extracted_text).toBe('');
    expect(retrieved.visual_behavior_claims).toEqual([]);
    expect(retrieved.visual_inspected).toBe(false);
    expect(retrieved.limitations.join(' ')).toMatch(/cannot see animation/i);
    expect(retrieved.user_guidance.join(' ')).toMatch(/liquid wave/);
  });

  it('does not fabricate visual findings for a video without a transcript', () => {
    const retrieved = ingestCuratedSource({
      url: 'https://www.youtube.com/watch?v=eKrOIG5tqJ4',
      status_code: 200,
      body: '<html><title>Marvel Snap gameplay</title></html>',
    });
    expect(retrieved.retrieval_status).toBe('METADATA_ONLY');
    expect(retrieved.transcript_available).toBe(false);
    expect(retrieved.extracted_text).toBe('');
    expect(retrieved.visual_behavior_claims).toEqual([]);
    expect(retrieved.limitations.join(' ')).toMatch(/did not inspect the video/i);
  });

  it('keeps GitHub retrieval bounded to metadata, README, and requested files', () => {
    const retrieved = ingestCuratedSource({
      url: 'https://github.com/Rymedy/hearthstone-web',
      status_code: 200,
      body: '<html><title>hearthstone-web</title><article><p>Repo page chrome</p></article></html>',
      companions: [
        { path: 'README.md', status_code: 200, body: '# Hearthstone web\nCard rendering demo.' },
        { path: 'src/Card.tsx', status_code: 200, body: 'export const Card = () => null;' },
      ],
    });
    expect(retrieved.retrieval_status).toBe('OK');
    expect(retrieved.extracted_text).toMatch(/Card rendering demo/);
    expect(retrieved.companion_files.map((item) => item.path)).toEqual(['README.md', 'src/Card.tsx']);
    expect(retrieved.limitations.join(' ')).toMatch(/was not performed/i);
  });

  it('enforces max extracted-content length', () => {
    const body = `<article><p>${'alpha '.repeat(3000)}</p></article>`;
    const retrieved = ingestCuratedSource({
      url: 'https://threejs.org/docs/',
      status_code: 200,
      body,
      max_chars: 120,
    });
    expect(retrieved.extracted_text.length).toBeLessThanOrEqual(120);
    expect(MAX_EXTRACTED_CONTENT_CHARS).toBe(4000);
  });
});

describe('VisualReferencePacket and LookDev boundary', () => {
  it('keeps visual reference below canonical and does not make it a requirement', () => {
    expect(evidenceAuthorityRank('CANONICAL')).toBeGreaterThan(
      evidenceAuthorityRank('USER_CURATED_REFERENCE_GUIDANCE'),
    );
    expect(evidenceAuthorityRank('USER_CURATED_REFERENCE_GUIDANCE')).toBeGreaterThan(
      evidenceAuthorityRank('EXTERNAL_RESEARCH_EVIDENCE'),
    );
    expect(visualReferenceCannotBecomeCanonical()).toBe(true);
    expect(VISUAL_AUTHORITY_LADDER[0]).toMatch(/canonical/i);
    expect(VISUAL_AUTHORITY_LADDER[1]).toMatch(/first-party/i);
  });

  it('excludes unrelated references and bounds resource count and excerpt length', () => {
    const resources = [
      resource({
        resource_id: 'res-singularity',
        url: 'https://singularity.misterprada.com/',
        tags: [LIBRARY_TAG.EFFECTS, 'singularity'],
        user_guidance: ['combine singularity + liquid wave for Wave Collapse'],
        theatrics_tiers: ['TIER_4'],
        notes: 'Wave Collapse singularity',
      }),
      resource({
        resource_id: 'res-shards',
        url: 'https://www.ultraboardgames.com/shards-of-infinity/game-rules.php',
        tags: ['shards-of-infinity'],
        notes: 'Shards of Infinity rules',
        category: 'Shards of Infinity',
      }),
      ...Array.from({ length: 12 }, (_, index) =>
        resource({
          resource_id: `res-extra-${index}`,
          url: `https://threejs.org/docs/#extra-${index}`,
          tags: [LIBRARY_TAG.EFFECTS, 'wave', 'collapse', 'singularity'],
          notes: 'Wave Collapse singularity liquid extra',
        }),
      ),
    ];
    const packet = assembleVisualReferencePacket({
      objective: 'Wave Collapse singularity liquid wave',
      resources,
      retrievals: [
        ingestCuratedSource({
          url: 'https://singularity.misterprada.com/',
          status_code: 200,
          body: `<article><p>${'wave '.repeat(2000)}</p></article>`,
        }),
      ],
      gameplay_event: 'Wave Collapse',
    });
    expect(packet.resource_ids).not.toContain('res-shards');
    expect(packet.resource_ids.length).toBeLessThanOrEqual(MAX_VISUAL_PACKET_RESOURCES);
    expect(packet.extracted_excerpts.every((item) => item.text.length <= MAX_PACKET_EXCERPT_CHARS)).toBe(
      true,
    );
    expect(packet.theatrics_tier_target).toEqual(['TIER_4']);
    expect(packet.usage_constraints).toEqual(
      expect.arrayContaining([
        'DO_NOT_RECREATE_EXACT_ANIMATION_SEQUENCES',
        'REMAIN_NATIVE_TO_CYBERPUNK_QUANTUM_OCCULT',
      ]),
    );
    expect(packet.user_guidance.some((item) => /liquid wave/i.test(item.text))).toBe(true);
  });

  it('hands Research evidence to Astra as a packet without LookDev instantiation', () => {
    const evidence: ExternalEvidenceRecord = {
      evidence_id: 'ev-visual-1',
      evidence_type: 'EXTERNAL_RESEARCH',
      authority: 'EXTERNAL_RESEARCH_EVIDENCE',
      source_type: 'DEMO',
      title: 'Singularity',
      url: 'https://singularity.misterprada.com/',
      publisher_or_author: 'misterprada',
      retrieved_at: '2026-09-07T00:00:00.000Z',
      published_at: '',
      summary: 'Visual technique reference. No inspection performed.',
      claims: [],
      relevance: 'Wave Collapse theatrics',
      limitations: ['No visual inspection.'],
      canonical_ids_related: ['LOOKDEV-COLLAPSE-002'],
      reference_tags: [LIBRARY_TAG.EFFECTS],
      confidence: 0.4,
      source_quality: 'INSPIRATION_ONLY',
      research_run_id: 'asg-visual',
      visual_reference_kinds: ['MATERIAL_SHADER_REFERENCE', 'MOTION_THEATRICS_REFERENCE'],
      theatrics_tiers: ['TIER_4'],
      usage_constraints: ['DO_NOT_RECREATE_EXACT_ANIMATION_SEQUENCES'],
      user_guidance: ['combine singularity + liquid wave for Wave Collapse'],
      visual_inspected: false,
      visual_vs_technique: 'VISUAL_AND_TECHNIQUE',
    };
    const handoff = researchToLookDevHandoff({
      objective: 'Wave Collapse presentation',
      research_evidence: [evidence],
      resources: [
        resource({
          resource_id: 'res-singularity',
          url: evidence.url,
          tags: [LIBRARY_TAG.EFFECTS, 'wave', 'collapse'],
          user_guidance: evidence.user_guidance,
          theatrics_tiers: ['TIER_4'],
          notes: 'Wave Collapse',
        }),
      ],
    });
    expect(handoff.path).toEqual(['research', 'astra', 'visual_reference_packet', 'lookdev']);
    expect(handoff.research_instructs_lookdev).toBe(false);
    expect(lookDevAgentIsInstantiated()).toBe(true);
    expect(SPECIALIST_TOOL_NAMES.lookdev).toBe('lookDevMotion');
    expect(LOOKDEV_FORBIDDEN).toEqual(
      expect.arrayContaining(['determine gameplay outcome', 'change rules', 'modify first-party assets']),
    );
    expect(LOOKDEV_ALLOWED).toEqual(expect.arrayContaining(['propose motion']));
    const team = createPlanningTeam(testConfig(), emptyRuntime());
    expect(toolNames(team.astra)).toContain('lookDevMotion');
  });

  it('does not trigger Reviewer for visual inspiration or a LookDev proposal', () => {
    const result = validateOrchestrationResult({
      ...hudSmokeOrchestrationResult(),
      objective: 'Study visual references for Wave Collapse theatrics.',
      summary: 'LookDev proposal: use singularity as inspiration only.',
      decisions: ['Keep Marvel Snap as a visual quality benchmark, not a template.'],
      work_packages: [
        workPackage({
          authority_level: 'ADVISORY',
          proposed_authority_level: 'ADVISORY',
          approval_required: false,
          objective: 'Advisory LookDev proposal for motion language.',
        }),
      ],
      candidate_proposals: [],
      conflicts: [],
    });
    expect(detectReviewTriggers(result)).toEqual([]);
    expect(lookDevProposalDoesNotTriggerReview(result)).toBe(true);
  });
});
