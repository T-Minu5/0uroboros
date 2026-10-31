import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { BLOWOUT_MARGIN, CLOSE_MARGIN, isBlowoutMargin, isCloseMargin } from './ecoMetrics';

/**
 * Eco-Strat's persistent journal. Every piece of evidence is tagged with the build it came from,
 * and confidence is computed by code from current-build evidence only, so findings from an
 * older build are never mistaken for findings about the current one.
 */
export type Direction = 'for' | 'against' | 'neutral';
export type EvidenceKind = 'measured' | 'interpreted';
export type Confidence = 'strong' | 'moderate' | 'weak' | 'insufficient';

export type HypothesisEvidence = { at: string; buildId: string; gameId?: string; cohortId?: string; direction: Direction; kind: EvidenceKind; note: string };
export type Hypothesis = {
  id: string; topic: string; statement: string;
  /** A short plain-language restatement written for readers; `statement` stays the tested wording. */
  plain?: string;
  origin: 'founding' | 'study' | 'research' | 'game' | 'report';
  createdAt: string; createdBuild: string; status: 'open' | 'retired';
  retiredReason?: string;
  /** Built-in hypotheses are scored by code after every game. */
  test?: string;
  evidence: HypothesisEvidence[];
};
export type Observation = {
  key: string; topic: string; text: string; kind: EvidenceKind;
  firstSeen: string; lastSeen: string; buildId: string;
  /** How many games showed it on `buildId`; 1 means seen once. */
  occurrences: number; gameIds: string[];
};
export type Question = { id: string; at: string; buildId: string; text: string; status: 'open' | 'answered'; answer?: string };
/** Designer teaching from the temporary Chat Q&A tuner (notes for Eco; does not auto-apply balance). */
export type DesignerGuidance = { id: string; at: string; text: string };
export type Recommendation = {
  id: string; at: string; buildId: string; reportId: string; title: string;
  observed: string; evidence: string; likelyCause: string; adjustment: string; expectedEffect: string;
  risks: string; confidence: Confidence; test: string;
  /** Supporting reasons, each citing a measured number. */
  why?: string[];
  /** How Eco-Strat expects the game to change if the recommendation were adopted. */
  hypothesis?: string;
  /** Recommendations are never applied by Eco-Strat; they wait for normal design review. Withdrawn ones were taken back after a correction. */
  status: 'candidate' | 'withdrawn';
  withdrawn?: { at: string; reason: string };
};
export type PurchaseLine = { name: string; cost: number; copies: number; buyerGames: number; buyerWinRate: number };
/** Best and worst market purchases by how often their buyers won, as of the latest report; starting-deck cards are left out. */
export type PurchaseSummary = { at: string; reportId: string; buildId: string; games: number; minBuyerGames: number; startingDeck: string[]; top: PurchaseLine[]; bottom: PurchaseLine[] };
/** Eco-Strat's own view of how a deck-building economy should work; revised, not rewritten, after each report. */
export type PointOfView = {
  at: string; buildId: string; reportId: string; model: string | null;
  summary: string; principles: { principle: string; why: string; here: string }[];
  /** What changed since the previous version, in Eco-Strat's words. */
  changed?: string;
  /** Titles of the sources it had read when it wrote this. */
  basedOn: string[];
};
export type BuildRecord = { id: string; label: string; contentRevision: number | null; firstSeen: string };
/** `via: 'provided'` means the text came from a copy the user supplied in `sources/`, after the direct fetch failed (`fetchFailure`). */
export type ResearchSource = { url: string; fetchedFrom?: string; accessible: boolean; status?: number; reason?: string; fetchedAt: string; title?: string; chars?: number; takeaways: string[]; via?: 'fetched' | 'provided'; providedFile?: string; providedAt?: string; fetchFailure?: string };
/** A source taken off the reading list after a model-backed research run found nothing in it. */
export type RemovedSource = { url: string; title?: string; file?: string; reason: string; at: string };
export type GameEntry = { id: string; source: string; buildId: string; at: string; valid: boolean; invalidReason?: string; winner: 0 | 1 | null; endedBy: string; cycles: number; finalVP: [number, number]; cohortId?: string; seed?: number };
/** Content A/B arm: control vs patched document for one focal card. */
export type CohortArm = {
  role: 'control' | 'patch';
  cardId: string;
  experimentId: string;
  label?: string;
};

export type Cohort = {
  id: string; kind: 'baseline' | 'evaluation'; buildId: string; startedAt: string; finishedAt?: string;
  target: number; seeds: number[]; strategyHash: string;
  /** Strat-G's version label (`v1.3`); cohorts from before version labels hold the bare number. */
  strategyVersion: string | number;
  status: 'running' | 'complete' | 'failed' | 'cancelled';
  validGames: string[]; invalid: { seed: number; reason: string }[]; note?: string;
  /** Present when this cohort is one arm of a content A/B experiment. */
  arm?: CohortArm;
};
export type ReportEntry = { id: string; at: string; kind: 'baseline' | 'periodic' | 'manual'; buildId: string; games: number; markdown: string; json: string; model: string | null };
export type ErrorEntry = { at: string; scope: string; message: string };

export type Journal = {
  schema: 1; agent: 'Eco-Strat'; createdAt: string; updatedAt: string;
  model: { used: string | null; fallbacks: { at: string; from: string; to: string | null; reason: string }[] };
  builds: BuildRecord[]; currentBuild: string | null;
  study: { buildId: string; at: string; mode: 'model' | 'deterministic'; model: string | null; summary: string; economyModel: string[]; risks: string[]; docDiscrepancies: string[] } | null;
  research: { at: string; sources: ResearchSource[]; concepts: string[]; applications: string[]; model: string | null; removed?: RemovedSource[] } | null;
  pointOfView?: PointOfView | null;
  observations: Observation[]; hypotheses: Hypothesis[]; questions: Question[]; recommendations: Recommendation[];
  /** Mel's Chat Q&A guidance for this tuning period. */
  designerGuidance?: DesignerGuidance[];
  games: GameEntry[]; cohorts: Cohort[]; reports: ReportEntry[]; errors: ErrorEntry[];
  gamesSinceReport: number;
  purchases?: PurchaseSummary | null;
  /** One-time corrections already applied, by id. */
  resets?: string[];
};

export function emptyJournal(at: string): Journal {
  return {
    schema: 1, agent: 'Eco-Strat', createdAt: at, updatedAt: at, model: { used: null, fallbacks: [] },
    builds: [], currentBuild: null, study: null, research: null,
    observations: [], hypotheses: [], questions: [], recommendations: [], designerGuidance: [], games: [], cohorts: [], reports: [], errors: [], gamesSinceReport: 0,
  };
}

const GUIDANCE_LIMIT = 80;

/** Append designer Q&A lines to the journal (capped). */
export function appendDesignerGuidance(journal: Journal, texts: string[], at: string): number {
  const lines = texts.map(text => text.trim()).filter(Boolean).slice(0, 8);
  if (!lines.length) return 0;
  const list = journal.designerGuidance ?? (journal.designerGuidance = []);
  for (const text of lines) {
    list.push({ id: `dg-${list.length + 1}`, at, text: text.slice(0, 600) });
  }
  if (list.length > GUIDANCE_LIMIT) journal.designerGuidance = list.slice(-GUIDANCE_LIMIT);
  journal.updatedAt = at;
  return lines.length;
}

/**
 * Mark open questions answered when Mel's reply matches prior agent questions
 * (substring / case-insensitive) or when Mel answers after those questions were asked.
 */
export function answerOpenQuestions(journal: Journal, answer: string, matchingTexts: string[] | undefined, at: string): number {
  const reply = answer.trim().slice(0, 800);
  if (!reply) return 0;
  const needles = (matchingTexts ?? []).map(text => text.trim().toLowerCase()).filter(Boolean);
  let answered = 0;
  for (const item of journal.questions) {
    if (item.status !== 'open') continue;
    const hay = item.text.trim().toLowerCase();
    const hit = needles.length
      ? needles.some(needle => hay.includes(needle) || needle.includes(hay) || hay.slice(0, 48) === needle.slice(0, 48))
      : false;
    if (!hit && needles.length) continue;
    if (!needles.length) continue;
    item.status = 'answered';
    item.answer = reply;
    answered++;
  }
  if (answered) journal.updatedAt = at;
  return answered;
}

/** Measured evidence counts fully; Eco-Strat's own interpretations count half. */
export function tally(hypothesis: Hypothesis, buildId: string | null) {
  const current = hypothesis.evidence.filter(item => item.buildId === buildId);
  const weight = (item: HypothesisEvidence) => item.kind === 'measured' ? 1 : 0.5;
  const support = current.filter(item => item.direction === 'for').reduce((sum, item) => sum + weight(item), 0);
  const against = current.filter(item => item.direction === 'against').reduce((sum, item) => sum + weight(item), 0);
  return { support, against, entries: current.length, priorBuildEntries: hypothesis.evidence.length - current.length };
}

export function confidenceOf(hypothesis: Hypothesis, buildId: string | null): { level: Confidence; leaning: 'supported' | 'contradicted' | 'mixed' | 'untested'; support: number; against: number; priorBuildEntries: number } {
  const { support, against, priorBuildEntries } = tally(hypothesis, buildId);
  const total = support + against;
  const ratio = total ? support / total : 0.5;
  const leaning = total === 0 ? 'untested' : ratio >= 0.65 ? 'supported' : ratio <= 0.35 ? 'contradicted' : 'mixed';
  const lopsided = (threshold: number) => ratio >= threshold || ratio <= 1 - threshold;
  const level: Confidence = total < 3 ? 'insufficient' : total >= 8 && lopsided(0.8) ? 'strong' : total >= 5 && lopsided(0.7) ? 'moderate' : 'weak';
  return { level, leaning, support, against, priorBuildEntries };
}

/**
 * Takes back Eco-Strat's verdicts about one card after a design correction: recommendations that change it are withdrawn,
 * hypotheses built on it retired, open questions about it answered and its examples dropped from the point of view.
 * Mentions of the card as something a reward hands out ("gain Rezz Blade") are not verdicts on the card and are kept.
 */
export function retractCardVerdicts(journal: Journal, card: string, reason: string, at: string) {
  const name = card.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\s-]+/g, '[\\s-]?');
  const named = new RegExp(`(?<!\\b(?:gain|gains|free)\\s)${name}`, 'i');
  const recommendations = journal.recommendations.filter(item => item.status !== 'withdrawn' && named.test(`${item.title} ${item.adjustment}`));
  for (const item of recommendations) Object.assign(item, { status: 'withdrawn', withdrawn: { at, reason } });
  const hypotheses = journal.hypotheses.filter(item => item.status === 'open' && named.test(`${item.statement} ${item.plain ?? ''}`));
  for (const item of hypotheses) Object.assign(item, { status: 'retired', retiredReason: reason });
  const questions = journal.questions.filter(item => item.status === 'open' && named.test(item.text));
  for (const item of questions) Object.assign(item, { status: 'answered', answer: reason });
  let principles = 0;
  for (const item of journal.pointOfView?.principles ?? []) {
    if (!named.test(item.here)) continue;
    const kept = item.here.split(/;\s*/).filter(part => !named.test(part));
    item.here = kept.length ? kept.join('; ') : reason;
    principles++;
  }
  return { recommendations: recommendations.length, hypotheses: hypotheses.length, questions: questions.length, principles };
}

/** Writes only inside `root`; anything else is a programming error and is refused. */
export function createGuardedWriter(root: string) {
  const base = resolve(root);
  const inside = (relative: string) => {
    const target = resolve(base, relative);
    if (target !== base && !target.startsWith(base + sep)) throw new Error(`Eco-Strat may not write outside ${base}: ${target}`);
    return target;
  };
  return {
    root: base,
    path: inside,
    async write(relative: string, text: string) {
      const target = inside(relative);
      await mkdir(dirname(target), { recursive: true });
      const temp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      await writeFile(temp, text, 'utf8');
      await rename(temp, target);
      return target;
    },
    async move(from: string, to: string) {
      const source = inside(from), target = inside(to);
      await mkdir(dirname(target), { recursive: true });
      await rename(source, target);
    },
  };
}

export async function readJournal(file: string): Promise<Journal | null> {
  try {
    const value = JSON.parse(await readFile(file, 'utf8')) as Journal;
    return value?.schema === 1 ? value : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

const date = (iso: string) => iso.slice(0, 16).replace('T', ' ');
const count = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);

/**
 * Open hypotheses in plain language, grouped by how they are holding up on `buildId`.
 * `limit` caps each group; the rest are summarised as a count.
 */
export function hypothesisSections(hypotheses: Hypothesis[], buildId: string | null, heading: string, limit = Infinity): string[] {
  const rows = hypotheses.filter(item => item.status === 'open').map(item => ({ item, c: confidenceOf(item, buildId) }))
    .sort((a, b) => (b.c.support + b.c.against) - (a.c.support + a.c.against));
  const groups: [string, string, typeof rows][] = [
    ['Holding up', 'the evidence so far supports these', rows.filter(row => row.c.leaning === 'supported')],
    ['Not holding up', 'the evidence so far contradicts these', rows.filter(row => row.c.leaning === 'contradicted')],
    ['Mixed evidence', 'games point both ways', rows.filter(row => row.c.leaning === 'mixed')],
    ['Not yet tested', 'no evidence on this build yet', rows.filter(row => row.c.leaning === 'untested')],
  ];
  const strength = (c: ReturnType<typeof confidenceOf>) => c.level === 'insufficient' ? 'too little evidence to judge' : `${c.level} evidence`;
  const line = ({ item, c }: (typeof rows)[number]) => `- ${item.plain || item.statement} *(${c.leaning === 'untested' ? item.topic : `${strength(c)}: ${count(c.support)} for, ${count(c.against)} against`})*`;
  return groups.filter(([, , list]) => list.length).flatMap(([title, note, list]) => [
    `${heading} ${title}`, '', `_${note[0].toUpperCase()}${note.slice(1)}._`, '',
    ...list.slice(0, limit).map(line), ...(list.length > limit ? [`- …and ${list.length - limit} more in the journal.`] : []), '',
  ]);
}

export function pointOfViewSections(view: PointOfView | null | undefined, heading: string): string[] {
  if (!view) return ['_Eco-Strat has not written its point of view yet. It forms one with its next model-backed report, from the research it has read and the games it has measured._', ''];
  return [
    view.summary, '',
    ...view.principles.flatMap((item, index) => [`${heading} ${index + 1}. ${item.principle}`, '', `**Why I believe it:** ${item.why}`, '', `**How 0uroboros measures up:** ${item.here}`, '']),
    ...(view.changed ? [`**What changed since my last version:** ${view.changed}`, ''] : []),
    `_Written ${date(view.at)} with report ${view.reportId}${view.basedOn.length ? `, drawing on: ${view.basedOn.join('; ')}` : ''}._`, '',
  ];
}

/** The recommendations to read first: the latest report's, in its ranked order, topped up from earlier reports on this build. */
export function topRecommendations(journal: Journal, count: number): Recommendation[] {
  const active = journal.recommendations.filter(item => item.status !== 'withdrawn');
  const onBuild = active.filter(item => item.buildId === journal.currentBuild);
  const pool = onBuild.length ? onBuild : active;
  const picked: Recommendation[] = [];
  for (const reportId of [...new Set(pool.map(item => item.reportId))].reverse()) {
    for (const item of pool.filter(entry => entry.reportId === reportId)) {
      if (picked.length < count && !picked.some(entry => entry.title.toLowerCase() === item.title.toLowerCase())) picked.push(item);
    }
  }
  return picked;
}

function summarySections(journal: Journal): string[] {
  const games = journal.games.filter(game => game.valid && game.buildId === journal.currentBuild);
  const margin = (game: GameEntry) => Math.abs(game.finalVP[0] - game.finalVP[1]);
  const share = (part: number, whole: number) => whole ? ` (${Math.round((part / whole) * 100)}%)` : '';
  const row = (label: string, list: GameEntry[]) => {
    const close = list.filter(game => isCloseMargin(margin(game))).length, blowout = list.filter(game => isBlowoutMargin(margin(game))).length;
    return `| ${label} | ${list.length}${share(list.length, games.length)} | ${close} | ${list.length - close - blowout} | ${blowout} |`;
  };
  const destruction = games.filter(game => game.endedBy === 'destruction'), full = games.filter(game => game.endedBy === 'cycle16');
  const other = games.filter(game => game.endedBy !== 'destruction' && game.endedBy !== 'cycle16');
  const top = topRecommendations(journal, 3);
  const buys = journal.purchases?.buildId === journal.currentBuild ? journal.purchases : null;
  const table = (lines: PurchaseLine[]) => ['| Card | Cost | Copies bought | Games bought in | Buyers won |', '| --- | --- | --- | --- | --- |', ...lines.map(line => `| ${line.name} | ${line.cost} | ${line.copies} | ${line.buyerGames} | ${Math.round(line.buyerWinRate * 100)}% |`)];
  return [
    `## Summary`,
    ``,
    `### Top 3 recommendations`,
    ``,
    ...(top.length ? top.flatMap((item, index) => [`${index + 1}. **${item.title}** ${item.adjustment} *(${item.confidence} · report ${item.reportId})*`]) : ['_None yet: recommendations come with the next model-backed report._']),
    ``,
    `### Best purchases`,
    ``,
    ...(buys?.top.length ? [`_The 3 market cards whose buyers won most often (at least ${buys.minBuyerGames} games bought in), from report ${buys.reportId} over ${buys.games} games._`, '', ...table(buys.top)] : ['_Measured with the next report on this build._']),
    ``,
    `### Worst purchases`,
    ``,
    ...(buys?.bottom.length ? [`_The 3 market cards whose buyers won least often._`, '', ...table(buys.bottom)] : ['_Measured with the next report on this build._']),
    ...(buys?.startingDeck.length ? ['', `_Starting-deck cards are left out (${buys.startingDeck.join(', ')}): every deck starts with them, so they lead play in every game._`] : []),
    ``,
    `### How games end`,
    ``,
    ...(games.length ? [
      `${destruction.length} of ${games.length} games on this build${share(destruction.length, games.length)} ended by Server destruction and ${full.length}${share(full.length, games.length)} went the full 16 Cycles.`,
      ``,
      `| Ending | Games | Close (<${CLOSE_MARGIN} VP) | Mid | Blowout (>${BLOWOUT_MARGIN} VP) |`, '| --- | --- | --- | --- | --- |',
      row('Server destruction', destruction), row('Full 16 Cycles', full), ...(other.length ? [row('Other', other)] : []), row('**All games**', games),
    ] : ['_No games on this build yet._']),
    ``,
  ];
}

/** One tab per section, split by the reader at `<!-- tab: … -->` markers; Summary comes first and opens by default. */
export function renderJournal(journal: Journal): string {
  const build = journal.builds.find(item => item.id === journal.currentBuild);
  const currentObs = journal.observations.filter(item => item.buildId === journal.currentBuild).sort((a, b) => b.occurrences - a.occurrences);
  const current = journal.games.filter(game => game.buildId === journal.currentBuild);
  const priorEntries = journal.hypotheses.reduce((total, item) => total + confidenceOf(item, journal.currentBuild).priorBuildEntries, 0);
  const active = journal.recommendations.filter(item => item.status !== 'withdrawn');
  const withdrawn = journal.recommendations.filter(item => item.status === 'withdrawn');
  const withdrawnReasons = [...new Set(withdrawn.map(item => item.withdrawn?.reason ?? 'Withdrawn.'))];
  return [
    `# Eco-Strat journal`,
    ``,
    `Eco-Strat is an independent evaluator of the 0uroboros economy. It observes games and Strat-G's records, and never plays, coaches Strat-G, or changes the game. Data: \`journal.json\` (this file is rendered from it).`,
    ``,
    `Current build: ${build ? `${build.label} (\`${build.id}\`)` : 'unknown'} · games observed on this build: ${current.filter(game => game.valid).length} valid, ${current.filter(game => !game.valid).length} invalid · total all builds: ${journal.games.length}`,
    `Model: ${journal.model.used ?? 'none (deterministic only)'}${journal.model.fallbacks.length ? ` · fallbacks recorded: ${journal.model.fallbacks.length}` : ''}`,
    ``,
    `<!-- tab: Summary -->`,
    ...summarySections(journal),
    `<!-- tab: Point of view -->`,
    `## My point of view`,
    ``,
    ...pointOfViewSections(journal.pointOfView, '###'),
    `<!-- tab: Hypotheses -->`,
    `## Hypotheses`,
    ``,
    `Confidence counts only evidence from the current build: a measured result counts 1, an interpretation 0.5.${priorEntries ? ` ${priorEntries} evidence entries from older builds are kept but not counted.` : ''}`,
    ``,
    ...(journal.hypotheses.some(item => item.status === 'open') ? hypothesisSections(journal.hypotheses, journal.currentBuild, '###') : ['- none yet', '']),
    `<!-- tab: Observations -->`,
    `## Observations on this build`,
    ``,
    ...(currentObs.length ? currentObs.slice(0, 20).map(item => `- ${item.text} *(${item.occurrences > 1 ? `${item.occurrences} games` : 'once'} · ${item.topic}${item.kind === 'interpreted' ? ' · interpretation' : ''})*`) : ['- none yet']),
    ``,
    `## Open questions`,
    ``,
    ...(journal.questions.some(item => item.status === 'open') ? journal.questions.filter(item => item.status === 'open').slice(-10).map(item => `- ${item.text} (${date(item.at)})`) : ['- none']),
    ``,
    `## Designer Q&A guidance`,
    ``,
    ...((journal.designerGuidance?.length) ? journal.designerGuidance.slice(-12).reverse().map(item => `- ${item.text} (${date(item.at)})`) : ['- none yet']),
    ``,
    `<!-- tab: Recommendations -->`,
    `## Recommendations (candidates only, never applied automatically)`,
    ``,
    ...(active.length ? active.slice(-10).reverse().map(item => `- **${item.title}** · ${item.confidence} · from report ${item.reportId}`) : ['- none yet']),
    ``,
    ...(withdrawn.length ? [
      `### Withdrawn (${withdrawn.length})`,
      ``,
      ...withdrawnReasons.flatMap(reason => [`_${reason}_`, ``, ...withdrawn.filter(item => (item.withdrawn?.reason ?? 'Withdrawn.') === reason).slice(-10).reverse().map(item => `- ${item.title} · from report ${item.reportId}`), ``]),
    ] : []),
    `<!-- tab: Reports -->`,
    `## Reports`,
    ``,
    ...(journal.reports.length ? journal.reports.slice(-10).reverse().map(item => `- ${date(item.at)} · ${item.kind} · ${item.games} games · \`${item.markdown}\``) : ['- none yet']),
    ``,
    `<!-- tab: Research -->`,
    `## Study and research`,
    ``,
    journal.study ? `Study of build \`${journal.study.buildId}\` (${journal.study.mode}, ${date(journal.study.at)}): ${journal.study.summary}` : 'Study: not yet run.',
    ``,
    ...(journal.research ? journal.research.sources.flatMap(source => [
      `- ${source.accessible ? source.via === 'provided' ? source.fetchFailure ? `read from a copy provided by the user (direct fetch failed: ${source.fetchFailure})` : 'read from an article provided by the user' : 'read' : 'inaccessible'} · ${source.title ? `${source.title} · ` : ''}${source.url}${source.accessible ? '' : ` (${source.reason ?? 'unknown reason'})`}`,
      ...source.takeaways.map(item => `  - ${item}`),
    ]) : ['Research: not yet run.']),
    ...(journal.research?.concepts.length ? [``, `Concepts:`, ...journal.research.concepts.map(item => `- ${item}`)] : []),
    ...(journal.research?.applications.length ? [``, `Lenses for 0uroboros:`, ...journal.research.applications.map(item => `- ${item}`)] : []),
    ...(journal.research?.removed?.length ? [``, `Removed from the reading list (no takeaways):`, ...journal.research.removed.slice(-15).reverse().map(item => `- ${date(item.at)} · ${item.title ? `${item.title} · ` : ''}${item.url} · ${item.reason}${item.file ? ` · copy moved to \`${item.file}\`` : ''}`)] : []),
    ``,
    `<!-- tab: Errors -->`,
    `## Errors (Eco-Strat only; gameplay is unaffected)`,
    ``,
    ...(journal.errors.length ? journal.errors.slice(-15).reverse().map(item => `- ${date(item.at)} · ${item.scope}: ${item.message}`) : ['- none']),
    ``,
  ].join('\n');
}
