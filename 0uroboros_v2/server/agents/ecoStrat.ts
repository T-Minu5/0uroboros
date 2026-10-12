import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { DECKBUILDING_BASICS } from './deckbuilding';
import { isHumanSource, type GameEvidence } from './evidence';
import { archetypeResults, BLOWOUT_MARGIN, cardDemand, CLOSE_MARGIN, cohortMetrics, gameMetrics, isBlowoutMargin, isCloseMargin, type ArchetypeResults, type CardDemand, type CohortMetrics, type GameMetrics } from './ecoMetrics';
import { LEAGUE_ROSTER } from './roster';
import {
  confidenceOf, createGuardedWriter, emptyJournal, hypothesisSections, pointOfViewSections, readJournal, renderJournal, retractCardVerdicts,
  type Cohort, type Confidence, type Direction, type Hypothesis, type Journal, type PurchaseLine, type Recommendation, type RemovedSource, type ReportEntry, type ResearchSource,
} from './ecoJournal';

/**
 * Eco-Strat: an independent evaluator of the 0uroboros economy. It is not a player.
 *
 * Inputs (all read-only): sealed game evidence handed to `observe`, the game's facts as plain
 * data, design docs, Strat-G's files on disk, and public research pages. Its only writes go
 * through a writer confined to its own folder. It holds no reference to Strat-G or the game
 * runtime, so it cannot advise, reconfigure or call Strat-G, nor change any game state.
 */

/** Seeds `sources/links.json`, the research reading list; links that give no takeaways are pruned from it. */
export const DEFAULT_RESEARCH_URLS = [
  'https://boardgamegeek.com/blog/17220/blogpost/190804/a-study-of-deck-building',
  'https://tabletopgamesblog.com/2023/05/23/deck-building-a-modern-card-mechanism-topic-discussion/',
  'https://boxkinggaming.com/blogs/news/deck-building-board-games-how-they-work-and-some-of-my-favorites?srsltid=AU7gw4UXLMe_wjjp0Dxtnc46-KzPAWoSIhFkF9--lRO8HfjAEIKGrAZI',
  'https://en.wikipedia.org/wiki/Deck-building_game',
  'https://huggingface.co/learn/deep-rl-course/en/unit7/self-play',
];
export const DEFAULT_ECO_MODELS = ['gpt-5', 'gpt-4.1', 'gpt-4o'];
/** Files whose contents define the rules; any change to them is a new build for evaluation purposes. */
const RULE_SOURCES = ['packages/engine/src/game.ts', 'packages/engine/src/runtime.ts', 'packages/engine/src/evaluationMarket.ts', 'packages/engine/src/content.ts'];
const STUDY_DOCS = [
  '0uroboros_v3_1_clean_start/02_CANONICAL_GAME_RULES.md', '0uroboros_v3_1_clean_start/03_STARTER_DECK_AND_CARD_SEMANTICS.md',
  '0uroboros_v3_1_clean_start/05_DRAFT_REWARDS_ZONES_ENDGAME.md', '0uroboros_v3_1_clean_start/07_UX_PRODUCT_CONTRACT.md',
  'docs/USER_DECISIONS.md', 'docs/CIRCUIT_CONTROL_REVISION.md', 'docs/STRATEGIC_EVALUATION.md',
];
const MAX_RECOMMENDATIONS = 5;
const HYPOTHESIS_LIMIT = 40;
/** One-time corrections to the journal, each applied once on load. */
export const JOURNAL_RESETS = [
  { id: 'starting-deck-rezz-blade', card: 'Rezz Blade', reason: 'Rezz Blade starts in every deck, including the human player\'s, so it leads play, Drain and Actions in every game. Those totals are not evidence that it is overpowered; it is judged per play against market cards from now on.' },
];
/** Cards both players start with are played in every game; Eco-Strat must not read that exposure as power. */
export function startingDeckNote(names: string[]) {
  return names.length ? `Starting deck: ${names.join(', ')} start in both players' decks (the human's too), so they are played in every game from Cycle 1. Their play counts, effect totals, "top Drain card" status and win rates come from that exposure, not from power: never call a card marked inStartingDeck overpowered or dominant from its totals. Judge a starting card only by its per-play effect against market cards of similar cost, and leave starting cards out of purchase comparisons.` : '';
}
/** The designer's stated goals; Eco-Strat judges balance against these, not against its own taste. */
const stratGVersion = (cohort: Cohort) => typeof cohort.strategyVersion === 'number' ? `v${cohort.strategyVersion}` : cohort.strategyVersion;

/** The designer's timing targets for the two pure archetypes. Aggression's target is destroying both Servers, whatever their integrity. */
export const ARCHETYPE_TARGETS = { damageCycles: [10, 13], vpBought: 25, vpBoughtCycles: [11, 14], endCycles: [11, 14], aggressionGap: [5, 8] } as const;
const T = ARCHETYPE_TARGETS;
/** Only when the rules facts cannot be read; the real figure always comes from the current rules. */
const FALLBACK_SERVER_INTEGRITY = 3500;
/** Both Servers' full integrity (Primary + Backup) in the current rules. The designer may rebalance it. */
function bothServersIntegrity(facts: Facts | null): number | null {
  const rules = facts?.rules as { primaryServer?: unknown; backupServer?: unknown } | undefined;
  return typeof rules?.primaryServer === 'number' && typeof rules?.backupServer === 'number' ? rules.primaryServer + rules.backupServer : null;
}
export const DESIGN_GOALS = [
  `Most games should end by Server destruction, usually between Cycles ${T.endCycles[0]} and ${T.endCycles[1]}.`,
  `Final scores should be close: a narrow winner–loser VP margin (${CLOSE_MARGIN} VP or less is close, ${BLOWOUT_MARGIN} VP or more is a blowout), even when a game ends by destruction.`,
  `A pure aggression deck should be able to destroy both enemy Servers by Cycles ${T.damageCycles[0]}-${T.damageCycles[1]}. The goal of aggression is Server destruction, not a damage number: the damage that takes is both Servers' full integrity in the current rules (rules.primaryServer + rules.backupServer), which the designer may rebalance, plus whatever the opponent Restores.`,
  `A pure economy deck should be able to buy about ${T.vpBought} or more VP from the market by Cycles ${T.vpBoughtCycles[0]}-${T.vpBoughtCycles[1]}.`,
  'A balanced deck should read its opponent and adapt: against aggression it should have more VP when the aggressor ends the game, and against economy it should destroy the Servers before more VP can be bought.',
  `Balanced should perform best overall, Engine and Economy should sit in the middle, and pure aggression should fall short more often (mostly for lack of VP) but no more than ${T.aggressionGap[0]}-${T.aggressionGap[1]} percentage points behind the middle tier.`,
];
/** League agent id to the archetype it plays; Eco-Strat reads only these labels, never an agent's strategy. */
const ARCHETYPES: Record<string, string> = { ...Object.fromEntries(LEAGUE_ROSTER.map(agent => [agent.id, agent.archetype])), human: 'Human' };
const AGENT_NAMES: Record<string, string> = Object.fromEntries(LEAGUE_ROSTER.map(agent => [agent.id, agent.name]));
/** The agent the human played; games recorded before the opponent could be picked were all against Strat-G. */
const humanOpponent = (evidence: Pick<GameEvidence, 'source' | 'agent'>) => evidence.agent ?? (evidence.source === 'human-vs-strat-g' ? 'strat-g' : null);

type Facts = { rules?: unknown; market?: unknown; startingDeck?: { name: string; count: number }[]; cards?: { id: string; name: string; pool: string; cost: number; vp?: number }[]; locations?: { id: string; name: string; rule: string; read?: string }[]; circuitRewards?: { id: string; name: string; text: string }[] };
export type EcoStratOptions = {
  /** Eco-Strat's own folder; the only place it writes. */
  root: string;
  projectRoot: string;
  /** Strat-G's folder, read but never written. */
  stratGRoot: string;
  apiKey?: string;
  models?: string[];
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
  now?: () => string;
  loadFacts: () => Promise<Facts>;
  /** Settings are read on every call so toggles take effect immediately. */
  settings: () => { active: boolean; observeHumanGames: boolean; continuous: boolean; reportEvery: number; baselineGames: number };
};
export type EcoStatus = {
  active: boolean; state: string; busy: string | null; modelConfigured: boolean; model: string | null; preferredModels: string[];
  /** A report is queued or being written; `reportFailure` is the last report that could not be written. */
  reporting: boolean; reportFailure: { at: string; message: string } | null;
  /** League games delivered but not yet read; reports and cohorts do not wait for them. */
  leagueBacklog: number;
  build: { id: string; label: string } | null;
  baseline: { status: 'not-started' | 'running' | 'complete' | 'failed' | 'cancelled'; valid: number; target: number; invalid: number; cohortId: string | null };
  gamesObserved: { currentBuild: number; invalid: number; allBuilds: number };
  hypotheses: number; observations: number; recommendations: number; questions: number;
  study: string | null; research: { read: number; inaccessible: number } | null;
  lastReport: { id: string; at: string; kind: string; games: number; markdown: string } | null; nextReportIn: number | null;
  errors: number; lastError: string | null;
  paths: { root: string; journal: string; journalJson: string; reports: string };
};

type FoundingTest = (m: GameMetrics) => { direction: Direction; note: string } | null;
const FOUNDING: { id: string; topic: string; statement: string; test: FoundingTest }[] = [
  { id: 'destruction-decides', topic: 'Damage vs healing', statement: 'Server destruction, not accumulated VP, decides most games.',
    test: m => m.endedBy === 'destruction' ? { direction: 'for', note: `ended by Server destruction at Cycle ${m.cycles}` } : m.endedBy === 'cycle16' ? { direction: 'against', note: 'went the full 16 Cycles' } : null },
  { id: 'healing-not-viable', topic: 'Damage vs healing', statement: 'Restore cannot keep pace with Drain, so healing is not a viable defensive line.',
    test: m => { if (m.winner === null) return null; const loser = 1 - m.winner, offset = m.healOffset[loser]; return offset < 0.25 ? { direction: 'for', note: `loser healed ${Math.round(offset * 100)}% of the damage it took` } : offset >= 0.5 ? { direction: 'against', note: `loser healed ${Math.round(offset * 100)}% of the damage it took` } : { direction: 'neutral', note: `loser healed ${Math.round(offset * 100)}%` }; } },
  { id: 'circuit-snowball', topic: 'Circuit Rewards', statement: 'Circuit Rewards compound the Location leader\'s advantage instead of helping the trailing player.',
    test: m => { if (m.winner === null) return null; const [w, l] = [m.circuitClaims[m.winner], m.circuitClaims[1 - m.winner]]; return w === l ? { direction: 'neutral', note: `claims equal (${w})` } : { direction: w > l ? 'for' : 'against', note: `Circuit claims winner ${w}, loser ${l}` }; } },
  { id: 'location-control-wins', topic: 'Locations', statement: 'Winning more Locations across a game predicts winning the game.',
    test: m => { if (m.winner === null) return null; const [w, l] = [m.locationsWon[m.winner], m.locationsWon[1 - m.winner]]; return w === l ? null : { direction: w > l ? 'for' : 'against', note: `Locations won: winner ${w}, loser ${l}` }; } },
  { id: 'early-lead-holds', topic: 'Snowballing and comebacks', statement: 'The VP leader at Cycle 8 usually wins; comebacks are rare.',
    test: m => { if (m.winner === null) return null; if (m.winnerMaxDeficit >= 5) return { direction: 'against', note: `winner came back from ${m.winnerMaxDeficit} VP down` }; const leader = m.vpLeaderAt['8']; return leader === null ? null : { direction: leader === m.winner ? 'for' : 'against', note: `Cycle 8 VP leader ${leader === m.winner ? 'won' : 'lost'}` }; } },
  { id: 'crypto-overflow', topic: 'Economy', statement: 'Wallets often end the Draft holding Crypto nothing worthwhile can absorb (weak sinks).',
    test: m => { const left = (m.economy.walletLeftAtDraftEnd[0] + m.economy.walletLeftAtDraftEnd[1]) / 2; return left >= 3 ? { direction: 'for', note: `average ${left.toFixed(1)} Crypto left when Drafts ended` } : left <= 1 ? { direction: 'against', note: `average ${left.toFixed(1)} Crypto left` } : { direction: 'neutral', note: `average ${left.toFixed(1)} Crypto left` }; } },
  { id: 'purchase-convergence', topic: 'Strategic diversity', statement: 'Both seats converge on the same purchases, suggesting one dominant line.',
    test: m => m.purchaseSimilarity >= 0.5 ? { direction: 'for', note: `same-game purchase overlap ${Math.round(m.purchaseSimilarity * 100)}%` } : m.purchaseSimilarity <= 0.25 ? { direction: 'against', note: `overlap ${Math.round(m.purchaseSimilarity * 100)}%` } : { direction: 'neutral', note: `overlap ${Math.round(m.purchaseSimilarity * 100)}%` } },
  { id: 'narrow-margins', topic: 'Final scores', statement: `Final scores are usually close: the winner leads by ${CLOSE_MARGIN} VP or less, even when a game ends by Server destruction.`,
    test: m => { const note = `final VP ${m.finalVP[0]}-${m.finalVP[1]}, margin ${m.vpMargin}${m.endedBy === 'destruction' ? ' (Server destruction)' : ''}`; return isCloseMargin(m.vpMargin) ? { direction: 'for', note } : isBlowoutMargin(m.vpMargin) ? { direction: 'against', note } : { direction: 'neutral', note }; } },
];

const redact = (text: string) => text.replace(/sk-[A-Za-z0-9_*\-.]+/g, 'sk-…redacted').replace(/Bearer\s+\S+/gi, 'Bearer …redacted');
const message = (error: unknown) => redact(error instanceof Error ? error.message : String(error));
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const str = (value: unknown, max = 1200) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const strings = (value: unknown, count: number, max = 400) => Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()).slice(0, count).map(item => (item as string).trim().slice(0, max)) : [];

export async function computeBuild(projectRoot: string) {
  const hash = createHash('sha256');
  let revision: number | null = null;
  try {
    const content = JSON.parse(await readFile(join(projectRoot, 'content/authored-content.json'), 'utf8')) as { revision?: number; document?: Record<string, unknown> };
    revision = typeof content.revision === 'number' ? content.revision : null;
    const { cards, locations, circuitRewards, startingDeck } = content.document ?? {};
    hash.update(JSON.stringify({ cards, locations, circuitRewards, startingDeck }));
  } catch { hash.update('no-content'); }
  for (const file of RULE_SOURCES) { try { hash.update(await readFile(join(projectRoot, file), 'utf8')); } catch { hash.update(`missing:${file}`); } }
  const id = hash.digest('hex').slice(0, 12);
  return { id, label: `content r${revision ?? '?'} · rules ${id.slice(0, 6)}`, contentRevision: revision };
}

function htmlToText(html: string): { title?: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim();
  const text = html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—').replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  return { title: title ? htmlToText(title).text : undefined, text };
}

export function createEcoStrat(options: EcoStratOptions) {
  const writer = createGuardedWriter(options.root);
  const journalFile = writer.path('journal.json');
  const log = options.log ?? ((text: string) => console.log(`[Eco-Strat] ${text}`));
  const now = options.now ?? (() => new Date().toISOString());
  const fetchImpl = options.fetchImpl ?? fetch;
  const models = (options.models?.length ? options.models : DEFAULT_ECO_MODELS).filter(Boolean);
  let modelIndex = 0;
  let journal: Journal = emptyJournal(now());
  let build: { id: string; label: string; contentRevision: number | null } | null = null;
  let busy: string | null = null;
  let loaded: Promise<void> | null = null;
  let reportsQueued = 0;
  let reportFailure: { at: string; message: string } | null = null;
  let starterCache: { buildId: string | null; names: string[] } | null = null;

  /** One task touches the journal at a time. League games arrive in bursts far faster than they can be read, so they wait in their own lane and everything else goes first. */
  type Job = { task: () => Promise<unknown>; resolve: (value: never) => void; reject: (error: unknown) => void };
  const lanes: { first: Job[]; league: Job[] } = { first: [], league: [] };
  let draining = false;
  const serialize = <T>(task: () => Promise<T>, lane: keyof typeof lanes = 'first'): Promise<T> => new Promise<T>((resolve, reject) => {
    lanes[lane].push({ task, resolve: resolve as (value: never) => void, reject });
    void drain();
  });
  async function drain() {
    if (draining) return;
    draining = true;
    try {
      for (let job = lanes.first.shift() ?? lanes.league.shift(); job; job = lanes.first.shift() ?? lanes.league.shift()) {
        await job.task().then(job.resolve as (value: unknown) => void, job.reject);
      }
    } finally { draining = false; }
  }

  function recordError(scope: string, error: unknown) {
    const text = message(error);
    journal.errors.push({ at: now(), scope, message: text.slice(0, 500) });
    if (journal.errors.length > 200) journal.errors = journal.errors.slice(-200);
    log(`${scope} failed: ${text}`);
  }

  async function save() {
    journal.updatedAt = now();
    await writer.write('journal.json', `${JSON.stringify(journal, null, 2)}\n`);
    await writer.write('JOURNAL.md', renderJournal(journal));
  }

  /** Loads the journal and registers the current build; founding hypotheses are added once and restarted when their definition changes. */
  function load(): Promise<void> {
    loaded ??= (async () => {
      journal = (await readJournal(journalFile)) ?? emptyJournal(now());
      for (const cohort of journal.cohorts.filter(item => item.status === 'running')) Object.assign(cohort, { status: 'cancelled', finishedAt: now(), note: `interrupted by a server restart after ${cohort.validGames.length} valid games` });
      await refreshBuild();
      for (const founding of FOUNDING) {
        const existing = journal.hypotheses.find(item => item.id === founding.id);
        if (existing && existing.statement !== founding.statement) Object.assign(existing, { statement: founding.statement, plain: undefined, status: 'open', evidence: [], createdAt: now(), createdBuild: build!.id });
        if (!existing) journal.hypotheses.push({ id: founding.id, topic: founding.topic, statement: founding.statement, origin: 'founding', createdAt: now(), createdBuild: build!.id, status: 'open', test: founding.id, evidence: [] });
      }
      for (const reset of JOURNAL_RESETS.filter(item => !journal.resets?.includes(item.id))) {
        const taken = retractCardVerdicts(journal, reset.card, reset.reason, now());
        journal.resets = [...(journal.resets ?? []), reset.id];
        log(`correction ${reset.id}: withdrew ${taken.recommendations} recommendations, retired ${taken.hypotheses} hypotheses, answered ${taken.questions} questions, revised ${taken.principles} principles.`);
      }
      await save();
    })().catch(error => { loaded = null; throw error; });
    return loaded;
  }

  async function refreshBuild() {
    build = await computeBuild(options.projectRoot);
    if (!journal.builds.some(item => item.id === build!.id)) {
      journal.builds.push({ id: build.id, label: build.label, contentRevision: build.contentRevision, firstSeen: now() });
      if (journal.currentBuild && journal.currentBuild !== build.id) log(`new build ${build.label}; earlier evidence is kept but no longer counts toward confidence.`);
    }
    if (journal.currentBuild !== build.id) journal.gamesSinceReport = 0;
    journal.currentBuild = build.id;
  }

  async function startingDeck(): Promise<string[]> {
    if (starterCache && starterCache.buildId === (build?.id ?? null)) return starterCache.names;
    const facts = await options.loadFacts().catch(() => null);
    starterCache = { buildId: build?.id ?? null, names: [...new Set((facts?.startingDeck ?? []).map(entry => entry.name))] };
    return starterCache.names;
  }
  const markStarters = <T extends { name: string }>(cards: T[], starters: Iterable<string>) => {
    const names = new Set(starters);
    return cards.map(card => names.has(card.name) ? { ...card, inStartingDeck: true } : card);
  };

  /** One JSON request; walks the model list on model errors and records each fallback. */
  async function askModel(system: string, payload: unknown, effort: 'low' | 'medium', timeoutMs: number): Promise<{ data: Record<string, unknown>; model: string } | null> {
    if (!options.apiKey) return null;
    while (modelIndex < models.length) {
      const model = models[modelIndex];
      const reasoning = /^(gpt-5|o\d)/.test(model);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
          body: JSON.stringify({
            model, response_format: { type: 'json_object' }, ...(reasoning ? { reasoning_effort: effort } : { temperature: 0.3 }),
            messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(payload) }],
          }),
        });
        if (!response.ok) {
          const text = redact((await response.text()).slice(0, 300));
          if ((response.status === 404 || response.status === 400 || response.status === 403) && /model|not exist|not found|unsupported|access/i.test(text)) {
            const next = models[modelIndex + 1] ?? null;
            journal.model.fallbacks.push({ at: now(), from: model, to: next, reason: `HTTP ${response.status}: ${text.slice(0, 160)}` });
            log(`model ${model} unavailable (HTTP ${response.status}); ${next ? `falling back to ${next}` : 'no fallback left'} (recorded in the journal).`);
            modelIndex++;
            continue;
          }
          throw new Error(`OpenAI responded ${response.status}: ${text}`);
        }
        const body = await response.json() as { choices?: { message?: { content?: string } }[] };
        const content = body.choices?.[0]?.message?.content;
        if (!content) throw new Error('empty model response');
        journal.model.used = model;
        return { data: JSON.parse(content) as Record<string, unknown>, model };
      } catch (error) {
        recordError(`model ${model}`, controller.signal.aborted ? new Error(`timed out after ${timeoutMs / 1000}s`) : error);
        return null;
      } finally { clearTimeout(timer); }
    }
    return null;
  }

  const ROLE = `You are Eco-Strat, an independent expert evaluator of the economy and strategy of the two-player deck-building game 0uroboros: strategy, deck-builders, game economy, balance, systems design, player experience, resource systems, strategic diversity, feedback loops, snowballing and comebacks. You are NOT a player and never coach the AI player (Strat-G); you only evaluate. Your central question: does 0uroboros create an interesting, understandable, reasonably balanced economy that supports multiple meaningful strategies? All numbers you receive were computed by deterministic code; do not recompute or invent numbers, cite the ones given. Fields about the AI player (aiPlayer, decisions, Strat-G) describe how the AI played, not the game's rules: for example, choices the AI picks at random are an AI limitation, not randomness in the design. Per-card effect totals include effects that Locations, Circuit Rewards or attachments granted to that card. rules.locations explains when Location effects fire and who benefits; each Location's read is how the default AI values holding it, so judge whether a Location creates a real choice (worth contesting or worth conceding) or is noise. Distinguish evidence from speculation, say when a sample is too small, and keep your own opinion even when Strat-G's records disagree. ${DECKBUILDING_BASICS} Use these basics to judge deck-building play: an AI that never trashes its weak starting cards, or keeps buying filler, plays below what the cards allow, and that is an AI limitation, not evidence about the cards. The designer's goals for 0uroboros, which define what "balanced" means here: ${DESIGN_GOALS.map((goal, index) => `(${index + 1}) ${goal}`).join(' ')} Judge the game against these goals; never recommend moving away from one, and say plainly when a change would trade one goal for another. Reply with one JSON object only.`;

  async function study() {
    return serialize(async () => {
      await load(); busy = 'studying';
      try {
        const facts = await options.loadFacts();
        const docs: { file: string; excerpt: string }[] = [];
        for (const file of STUDY_DOCS) {
          try { docs.push({ file, excerpt: (await readFile(join(options.projectRoot, file), 'utf8')).slice(0, 6000) }); }
          catch { docs.push({ file, excerpt: '(missing)' }); }
        }
        const advice = await askModel(`${ROLE}\n\nTask: study the implemented game before observing any games. The FACTS were extracted from the running code and are authoritative; the DOCS are design documents that may be stale. Where they disagree, the code wins: list each disagreement you can see. Reply as {"summary": string (<=900 chars), "economyModel": string[] (resources, sources, sinks, conversions and their rates; <=10), "risks": string[] (economic or balance risks you expect to test; <=8), "docDiscrepancies": string[] (<=10), "hypotheses": [{"topic": string, "statement": string (one plain sentence <=160 chars)}] (<=6 testable hypotheses), "questions": string[] (<=6)}.`,
          { facts, docs }, 'medium', 240_000);
        const cards = facts.cards ?? [];
        journal.study = advice ? {
          buildId: build!.id, at: now(), mode: 'model', model: advice.model, summary: str(advice.data.summary, 900),
          economyModel: strings(advice.data.economyModel, 10), risks: strings(advice.data.risks, 8), docDiscrepancies: strings(advice.data.docDiscrepancies, 10),
        } : {
          buildId: build!.id, at: now(), mode: 'deterministic', model: null,
          summary: `Catalog: ${cards.length} cards (${['Base', 'Chaos', 'VP', 'Crypto'].map(pool => `${cards.filter(card => card.pool === pool).length} ${pool}`).join(', ')}), ${facts.locations?.length ?? 0} Locations, ${facts.circuitRewards?.length ?? 0} Circuit Rewards. Starting deck: ${(facts.startingDeck ?? []).map(entry => `${entry.count}× ${entry.name}`).join(', ')}. No model was available, so this study is the extracted facts only.`,
          economyModel: [], risks: [], docDiscrepancies: [],
        };
        if (advice) {
          for (const proposal of Array.isArray(advice.data.hypotheses) ? advice.data.hypotheses.slice(0, 6) : []) addHypothesis(proposal, 'study');
          for (const text of strings(advice.data.questions, 6)) addQuestion(text);
        }
        await save();
        log(`study complete (${journal.study.mode}).`);
        return journal.study;
      } catch (error) { recordError('study', error); await save().catch(() => undefined); return null; }
      finally { busy = null; }
    });
  }

  async function fetchSource(url: string): Promise<ResearchSource & { text?: string }> {
    const attempt = async (target: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        const response = await fetchImpl(target, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Eco-Strat research reader; 0uroboros design evaluation)', Accept: 'text/html,application/json;q=0.9,*/*;q=0.5' } });
        const body = await response.text();
        return { status: response.status, ok: response.ok, body };
      } finally { clearTimeout(timer); }
    };
    const fetchedAt = now();
    try {
      const result = await attempt(url), fetchedFrom = url;
      if (!result.ok) return { url, fetchedFrom, accessible: false, status: result.status, reason: `HTTP ${result.status}`, fetchedAt, takeaways: [] };
      const { title, text } = htmlToText(result.body);
      if (text.length < 400) return { url, fetchedFrom, accessible: false, status: result.status, reason: `page returned too little readable text (${text.length} chars), likely blocked or script-rendered`, fetchedAt, takeaways: [] };
      return { url, fetchedFrom, accessible: true, status: result.status, fetchedAt, title, chars: text.length, takeaways: [], text: text.slice(0, 12000) };
    } catch (error) {
      return { url, accessible: false, reason: message(error).slice(0, 200), fetchedAt, takeaways: [] };
    }
  }

  /**
   * Copies of sources the user pasted in, as `sources/*.md` with a front-matter `url:` (and optional
   * `title:`, `providedAt:`). They are used only when the direct fetch fails, and are credited as such.
   */
  async function providedSources(): Promise<Map<string, { file: string; title?: string; providedAt?: string; text: string }>> {
    const found = new Map<string, { file: string; title?: string; providedAt?: string; text: string }>();
    let files: string[] = [];
    try { files = (await readdir(writer.path('sources'))).filter(file => file.endsWith('.md')); } catch { return found; }
    for (const file of files) {
      const raw = await readFile(writer.path(`sources/${file}`), 'utf8').catch(() => '');
      const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw.replace(/\r\n/g, '\n'));
      if (!match) continue;
      const field = (name: string) => new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(match[1])?.[1].trim();
      const url = field('url'), text = match[2].trim();
      if (url && text.length >= 400) found.set(url, { file: `sources/${file}`, title: field('title'), providedAt: field('providedAt'), text });
    }
    return found;
  }

  async function researchLinks(): Promise<string[]> {
    try {
      const saved = JSON.parse(await readFile(writer.path('sources/links.json'), 'utf8')) as { links?: unknown };
      return Array.isArray(saved.links) ? saved.links.filter((link): link is string => typeof link === 'string' && /^https?:\/\//.test(link)) : [...DEFAULT_RESEARCH_URLS];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return [...DEFAULT_RESEARCH_URLS];
      await writer.write('sources/links.json', `${JSON.stringify({ links: DEFAULT_RESEARCH_URLS }, null, 2)}\n`);
      return [...DEFAULT_RESEARCH_URLS];
    }
  }

  /**
   * After a research run the model answered, sources that gave no takeaways leave the reading list: links are dropped
   * from `links.json` and pasted copies move to `sources/removed/`. Links that failed for a transient reason stay.
   */
  async function pruneSources(sources: ResearchSource[], links: string[]): Promise<RemovedSource[]> {
    const removed: RemovedSource[] = [];
    const definitive = (source: ResearchSource) => source.accessible || (source.status !== undefined && source.status >= 400 && source.status < 500 && source.status !== 429);
    let kept = links;
    for (const source of sources) {
      if (source.takeaways.length || !definitive(source)) continue;
      kept = kept.filter(link => link !== source.url);
      let file: string | undefined;
      if (source.providedFile) {
        file = `sources/removed/${source.providedFile.replace(/^sources\//, '')}`;
        await writer.move(source.providedFile, file).catch(() => { file = undefined; });
      }
      removed.push({ url: source.url, ...(source.title ? { title: source.title } : {}), ...(file ? { file } : {}), reason: source.accessible ? 'read, but gave no takeaways' : `inaccessible (${source.reason ?? `HTTP ${source.status}`})`, at: now() });
    }
    if (kept.length !== links.length) await writer.write('sources/links.json', `${JSON.stringify({ links: kept }, null, 2)}\n`);
    return removed;
  }

  async function research() {
    return serialize(async () => {
      await load(); busy = 'researching';
      try {
        const fetched = [];
        const provided = await providedSources();
        const links = await researchLinks();
        for (const url of links) {
          const source = await fetchSource(url), copy = provided.get(url);
          fetched.push(source.accessible || !copy ? { ...source, via: source.accessible ? 'fetched' as const : undefined }
            : { url, fetchedFrom: source.fetchedFrom, accessible: true, status: source.status, fetchedAt: source.fetchedAt, title: copy.title, chars: copy.text.length, takeaways: [], via: 'provided' as const, providedFile: copy.file, providedAt: copy.providedAt, fetchFailure: source.reason, text: copy.text.slice(0, 9000) });
        }
        // Articles the user handed over directly (no fetchable page) are read from their copy alone.
        for (const [url, copy] of provided) if (!links.includes(url)) {
          fetched.push({ url, accessible: true, fetchedAt: now(), title: copy.title, chars: copy.text.length, takeaways: [], via: 'provided' as const, providedFile: copy.file, providedAt: copy.providedAt, text: copy.text.slice(0, 24000) });
        }
        const readable = fetched.filter(source => source.accessible && source.text);
        const advice = readable.length ? await askModel(`${ROLE}\n\nTask: extract deck-building, game-design and economic design knowledge from the SOURCES below (some were pasted in by the user, either because the site blocked direct reading or as articles handed over directly; treat them like any other source). Use only what the given text says; do not add knowledge the text does not contain, and leave takeaways empty for a source that has nothing relevant. Then relate the concepts to 0uroboros as questions or lenses, not conclusions. Reply as {"sources": [{"id": string (the source's id, exactly as given), "takeaways": string[] (<=6)}] with one entry per source, "concepts": string[] (<=10), "applications": string[] (<=8)}.`,
          { sources: readable.map((source, index) => ({ id: `s${index + 1}`, url: source.url, title: source.title, text: source.text })) }, 'low', 480_000) : null;
        // Keyed by the short id: models tend to normalise URLs (dropping #part-2 fragments, tracking parameters).
        const takeaways = new Map<string, string[]>();
        if (advice && Array.isArray(advice.data.sources)) for (const entry of advice.data.sources as { id?: unknown; url?: unknown; takeaways?: unknown }[]) {
          const index = typeof entry?.id === 'string' ? Number(/^s(\d+)$/.exec(entry.id.trim())?.[1]) - 1 : -1;
          const url = readable[index]?.url ?? (typeof entry?.url === 'string' ? entry.url : null);
          if (url) takeaways.set(url, strings(entry.takeaways, 6));
        }
        const sources: ResearchSource[] = fetched.map(({ text: _text, ...source }) => ({ ...source, takeaways: takeaways.get(source.url) ?? [] }));
        const answered = sources.some(source => source.takeaways.length);
        const removed = advice && answered ? await pruneSources(sources, links) : [];
        journal.research = {
          at: now(), model: advice?.model ?? null,
          sources: sources.filter(source => !removed.some(item => item.url === source.url)),
          concepts: advice ? strings(advice.data.concepts, 10) : [], applications: advice ? strings(advice.data.applications, 8) : [],
          removed: [...(journal.research?.removed ?? []), ...removed].slice(-40),
        };
        await save();
        log(`research: ${readable.length}/${fetched.length} sources readable (${readable.filter(source => source.via === 'provided').length} from user-provided copies)${removed.length ? `; removed ${removed.length} that gave no takeaways` : ''}.`);
        return journal.research;
      } catch (error) { recordError('research', error); await save().catch(() => undefined); return null; }
      finally { busy = null; }
    });
  }

  function addHypothesis(proposal: unknown, origin: Hypothesis['origin']) {
    const entry = proposal as { topic?: unknown; statement?: unknown };
    const statement = str(entry?.statement, 300), topic = str(entry?.topic, 60) || 'General';
    if (!statement) return;
    const id = slug(statement.split(/\s+/).slice(0, 7).join(' ')) || `h-${journal.hypotheses.length + 1}`;
    if (journal.hypotheses.some(item => item.id === id)) return;
    if (journal.hypotheses.filter(item => item.status === 'open').length >= HYPOTHESIS_LIMIT) return;
    journal.hypotheses.push({ id, topic, statement, origin, createdAt: now(), createdBuild: build!.id, status: 'open', evidence: [] });
  }

  function addQuestion(text: string) {
    if (journal.questions.some(item => item.text === text)) return;
    journal.questions.push({ id: `q-${journal.questions.length + 1}`, at: now(), buildId: build!.id, text, status: 'open' });
    if (journal.questions.length > 120) journal.questions = journal.questions.slice(-120);
  }

  function observeFact(key: string, topic: string, text: string, gameId: string) {
    const existing = journal.observations.find(item => item.key === key && item.buildId === build!.id);
    if (existing) {
      existing.occurrences++; existing.lastSeen = now(); existing.text = text;
      if (!existing.gameIds.includes(gameId)) existing.gameIds = [...existing.gameIds, gameId].slice(-20);
      return;
    }
    journal.observations.push({ key, topic, text, kind: 'measured', firstSeen: now(), lastSeen: now(), buildId: build!.id, occurrences: 1, gameIds: [gameId] });
    if (journal.observations.length > 600) journal.observations = journal.observations.slice(-600);
  }

  /** Signals worth tracking across games; keys are stable so repeats are counted, not duplicated. */
  function measuredObservations(m: GameMetrics, gameId: string) {
    observeFact(`ended:${m.endedBy}`, 'Game length', m.endedBy === 'destruction' ? 'Game ended by Server destruction.' : m.endedBy === 'cycle16' ? 'Game went the full 16 Cycles.' : 'Game ended another way.', gameId);
    if (m.firstDestructionCycle !== null && m.firstDestructionCycle <= 6) observeFact('early-destruction', 'Damage vs healing', `A Server fell by Cycle ${m.firstDestructionCycle}.`, gameId);
    for (const destruction of m.destructions.filter(item => item.source !== 'card')) observeFact(`indirect-destruction:${destruction.source}:${destruction.sourceId}`, destruction.source === 'location' ? 'Locations' : 'Circuit Rewards', `A ${destruction.server} Server was destroyed by ${destruction.source} effect ${destruction.sourceId}.`, gameId);
    const restoreEvents = m.restoreEvents[0] + m.restoreEvents[1];
    if (restoreEvents && (m.wastedRestores[0] + m.wastedRestores[1]) / restoreEvents >= 0.3) observeFact('wasted-healing', 'Damage vs healing', `${m.wastedRestores[0] + m.wastedRestores[1]} of ${restoreEvents} Restores healed nothing (Servers full or gone).`, gameId);
    const topDrain = [...m.cards].sort((a, b) => (b.drain[0] + b.drain[1]) - (a.drain[0] + a.drain[1]))[0];
    if (topDrain && topDrain.drain[0] + topDrain.drain[1] > 0) observeFact(`top-drain:${topDrain.definitionId}`, 'Card value', `${topDrain.name} (cost ${topDrain.cost}) dealt the most Drain of any card.`, gameId);
    const topBought = [...m.cards].sort((a, b) => (b.bought[0] + b.bought[1]) - (a.bought[0] + a.bought[1]))[0];
    if (topBought && topBought.bought[0] + topBought.bought[1] >= 3) observeFact(`top-bought:${topBought.definitionId}`, 'Strategic diversity', `${topBought.name} was the most-bought card.`, gameId);
    if (m.winnerMaxDeficit >= 5) observeFact('comeback', 'Snowballing and comebacks', `The winner came back from ${m.winnerMaxDeficit} VP behind.`, gameId);
    if (isBlowoutMargin(m.vpMargin)) observeFact('blowout', 'Final scores', `A blowout: final margin of ${m.vpMargin} VP.`, gameId);
    if (m.winner !== null && isCloseMargin(m.vpMargin)) observeFact(`close-finish:${m.endedBy}`, 'Final scores', `A close finish (${m.vpMargin} VP apart)${m.endedBy === 'destruction' ? ' in a game ended by Server destruction' : ''}.`, gameId);
    if (m.economy.purchases[0] === 0 || m.economy.purchases[1] === 0) observeFact('idle-seat', 'Economy', 'A seat bought nothing all game.', gameId);
    if (m.decisions.aiRandomPicks > 0) observeFact('random-ai-choices', 'Strat-G', `The AI resolved ${m.decisions.aiRandomPicks} choices at random because it has no strategic rule for them (an AI limitation, not game randomness).`, gameId);
    if ((m.economy.walletLeftAtDraftEnd[0] + m.economy.walletLeftAtDraftEnd[1]) / 2 >= 3) observeFact('unspent-wallet', 'Economy', 'Seats ended Drafts with 3+ Crypto unspent on average.', gameId);
    if (Math.max(...m.economy.finalDeckSize) >= 30) observeFact('deck-bloat', 'Economy', `A deck reached ${Math.max(...m.economy.finalDeckSize)} cards.`, gameId);
  }

  function addEvidence(id: string, direction: Direction, note: string, kind: 'measured' | 'interpreted', gameId?: string, cohortId?: string) {
    const hypothesis = journal.hypotheses.find(item => item.id === id && item.status === 'open');
    if (!hypothesis) return;
    hypothesis.evidence.push({ at: now(), buildId: build!.id, ...(gameId ? { gameId } : {}), ...(cohortId ? { cohortId } : {}), direction, kind, note: note.slice(0, 300) });
    if (hypothesis.evidence.length > 400) hypothesis.evidence = hypothesis.evidence.slice(-400);
  }

  function hypothesesForModel() {
    return journal.hypotheses.filter(item => item.status === 'open').map(item => ({ id: item.id, topic: item.topic, statement: item.statement, ...(item.plain ? {} : { needsPlain: true }), ...confidenceOf(item, build!.id) }));
  }

  /** Records one game. Never throws: Eco-Strat faults are journaled and play goes on. */
  async function observe(evidence: Readonly<GameEvidence>): Promise<void> {
    return serialize(async () => {
      const settings = options.settings();
      if (!settings.active) return;
      if (isHumanSource(evidence.source) && !settings.observeHumanGames) return;
      try {
        await load(); await refreshBuild();
        if (journal.games.some(game => game.id === evidence.id)) return;
        const matchReport = evidence.report;
        const m = gameMetrics(matchReport);
        journal.games.push({ id: evidence.id, source: evidence.source, buildId: build!.id, at: now(), valid: evidence.valid, ...(evidence.invalidReason ? { invalidReason: evidence.invalidReason } : {}), winner: m.winner, endedBy: m.endedBy, cycles: m.cycles, finalVP: [...matchReport.finalVP] as [number, number], ...(evidence.cohortId ? { cohortId: evidence.cohortId } : {}), ...(evidence.seed !== undefined ? { seed: evidence.seed } : {}) });
        await writer.write(`games/${evidence.id}.json`, `${JSON.stringify({ ...evidence, buildId: build!.id }, null, 1)}\n`);
        if (!evidence.valid) { await save(); return; }
        busy = 'observing';
        for (const founding of FOUNDING) { const outcome = founding.test(m); if (outcome) addEvidence(founding.id, outcome.direction, outcome.note, 'measured', evidence.id, evidence.cohortId); }
        measuredObservations(m, evidence.id);
        const starters = await startingDeck();
        const interpretation = await askModel(`${ROLE}\n\nTask: privately update your hypotheses from one finished game. Use the measured METRICS; the aiPlayer fields show what the AI player (the agent named there) decided and believed, which is evidence about play quality, not truth about the game. In league games and human games, seatArchetypes names the deck archetype in seat 0 and seat 1 (Human is the designer playing); judge each AI against its design goal. ${startingDeckNote(starters)} Reply as {"observations": [{"topic": string, "text": string}] (<=4, specific, cite numbers), "hypothesisUpdates": [{"id": existing hypothesis id, "direction": "for"|"against"|"neutral", "note": string}] (only where this game is real evidence), "newHypotheses": [{"topic": string, "statement": string (one plain sentence <=160 chars stating a general, testable rule; no numbers from this one game)}] (<=2), "questions": string[] (<=2)}.`,
          { game: { id: evidence.id, source: evidence.source, ...(evidence.seats ? { seatArchetypes: evidence.seats.map(agent => ARCHETYPES[agent] ?? agent) } : {}), metrics: compactGame(m, starters) }, aiPlayer: stratGSummary(evidence), hypotheses: hypothesesForModel() }, 'low', 120_000);
        if (interpretation) {
          for (const item of Array.isArray(interpretation.data.observations) ? interpretation.data.observations.slice(0, 4) as { topic?: unknown; text?: unknown }[] : []) {
            const text = str(item?.text, 400);
            if (text) journal.observations.push({ key: `note:${evidence.id}:${journal.observations.length}`, topic: str(item?.topic, 60) || 'General', text, kind: 'interpreted', firstSeen: now(), lastSeen: now(), buildId: build!.id, occurrences: 1, gameIds: [evidence.id] });
          }
          for (const update of Array.isArray(interpretation.data.hypothesisUpdates) ? interpretation.data.hypothesisUpdates as { id?: unknown; direction?: unknown; note?: unknown }[] : []) {
            const direction = (['for', 'against', 'neutral'] as const).find(item => item === update?.direction);
            if (typeof update?.id === 'string' && direction) addEvidence(update.id, direction, str(update.note, 300), 'interpreted', evidence.id, evidence.cohortId);
          }
          for (const proposal of Array.isArray(interpretation.data.newHypotheses) ? interpretation.data.newHypotheses.slice(0, 2) : []) addHypothesis(proposal, 'game');
          for (const text of strings(interpretation.data.questions, 2)) addQuestion(text);
        }
        if (!evidence.cohortId) journal.gamesSinceReport++;
        await save();
        if (!evidence.cohortId && settings.continuous && baselineComplete() && journal.gamesSinceReport >= settings.reportEvery && reportsQueued === 0) {
          reportsQueued++;
          setImmediate(() => { void writeReport('periodic').finally(() => { reportsQueued--; }); });
        }
      } catch (error) { recordError(`observe ${evidence.id}`, error); await save().catch(() => undefined); }
      finally { busy = null; }
    }, evidence.source === 'league' ? 'league' : 'first');
  }

  function baselineComplete() {
    return journal.cohorts.some(cohort => cohort.kind === 'baseline' && cohort.buildId === build?.id && cohort.status === 'complete');
  }

  function compactGame(m: GameMetrics, starters: string[]) {
    const { cards, timeline, locations, ...rest } = m;
    return {
      ...rest, timeline: timeline.filter(row => row.cycle % 2 === 0 || row.cycle === m.cycles),
      locationsByWinner: locations.length, cards: markStarters(cards.filter(card => card.plays[0] + card.plays[1] + card.bought[0] + card.bought[1] > 0).slice(0, 25), starters),
    };
  }

  function stratGSummary(evidence: Readonly<GameEvidence>) {
    const decisions = evidence.report.decisions ?? [];
    const drafts = decisions.filter(item => item.kind === 'draft') as Extract<(typeof decisions)[number], { kind: 'draft' }>[];
    const agent = isHumanSource(evidence.source) ? humanOpponent(evidence) : null;
    return {
      ...(agent ? { agent: AGENT_NAMES[agent] ?? agent } : {}),
      aiSeats: evidence.report.aiSeats, plan: evidence.stratG?.plan ?? null, notes: evidence.stratG?.notes.slice(-6) ?? [],
      purchasesByPhase: drafts.slice(0, 60).map(item => `${item.owner}@C${item.cycle} ${item.phase}: ${item.bought} (wallet ${item.wallet}; top alternatives ${item.alternatives.slice(0, 3).map(alt => `${alt.name} ${alt.score}`).join(', ')})`),
    };
  }

  async function readStratG() {
    try {
      const memory = JSON.parse(await readFile(join(options.stratGRoot, 'memory.json'), 'utf8')) as { version?: number; mode?: string; plan?: string; profile?: { cardBias?: Record<string, number>; economyUntilCycle?: number; chaosFromCycle?: number; vpFromCycle?: number; weights?: Record<string, number> }; theories?: { id: string; text: string; status: string; confidence: number; support: number; against: number }[]; record?: unknown };
      const bias = Object.entries(memory.profile?.cardBias ?? {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 12);
      return {
        version: memory.version, mode: memory.mode, plan: memory.plan, record: memory.record,
        schedule: { economyUntilCycle: memory.profile?.economyUntilCycle, chaosFromCycle: memory.profile?.chaosFromCycle, vpFromCycle: memory.profile?.vpFromCycle }, weights: memory.profile?.weights,
        strongestCardBiases: Object.fromEntries(bias),
        theories: (memory.theories ?? []).filter(theory => theory.status !== 'retired').map(({ id, text, status, confidence, support, against }) => ({ id, text, status, confidence, support, against })),
      };
    } catch { return null; }
  }

  async function loadGames(ids: string[]) {
    const games: { id: string; evidence: GameEvidence }[] = [];
    for (const id of ids) {
      try { games.push({ id, evidence: JSON.parse(await readFile(writer.path(`games/${id}.json`), 'utf8')) as GameEvidence }); }
      catch (error) { recordError(`load game ${id}`, error); }
    }
    return games;
  }

  /** Writes an assessment over current-build evidence (or one cohort). Recommendations stay candidates. */
  function report(kind: ReportEntry['kind'], cohortId?: string): Promise<ReportEntry | null> {
    reportsQueued++;
    return writeReport(kind, cohortId).finally(() => { reportsQueued--; });
  }

  async function writeReport(kind: ReportEntry['kind'], cohortId?: string): Promise<ReportEntry | null> {
    return serialize(async () => {
      try {
        await load(); await refreshBuild(); busy = 'reporting';
        const cohort = cohortId ? journal.cohorts.find(item => item.id === cohortId) : undefined;
        const ids = cohort ? cohort.validGames : journal.games.filter(game => game.valid && game.buildId === build!.id).map(game => game.id);
        if (!ids.length) throw new Error('no valid games on the current build to report on');
        const games = await loadGames(ids);
        const metrics = cohortMetrics(games.map(game => ({ id: game.id, report: game.evidence.report })));
        const stratG = await readStratG();
        const sources = [...new Set(games.map(game => game.evidence.source))];
        const decisions = games.flatMap(game => game.evidence.report.decisions ?? []);
        const draftDecisions = decisions.filter(item => item.kind === 'draft') as Extract<(typeof decisions)[number], { kind: 'draft' }>[];
        const phaseBuys = ['economy', 'build', 'endgame'].map(phase => ({ phase, buys: Object.entries(draftDecisions.filter(item => item.phase === phase).reduce<Record<string, number>>((tally, item) => { tally[item.bought] = (tally[item.bought] ?? 0) + 1; return tally; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6) }));
        const facts = await options.loadFacts().catch(() => null);
        const starters = new Set((facts?.startingDeck ?? []).map(entry => entry.name));
        const demand = cardDemand(games.map(game => ({ id: game.id, report: game.evidence.report })), (facts?.cards ?? []).filter(card => !starters.has(card.name)));
        const cardVP = new Map((facts?.cards ?? []).map(card => [card.id, card.vp ?? 0]));
        const league = games.filter(game => game.evidence.seats).map(game => ({ id: game.id, report: game.evidence.report, seats: game.evidence.seats! }));
        const integrity = bothServersIntegrity(facts) ?? FALLBACK_SERVER_INTEGRITY;
        const archetypes = league.length ? archetypeResults(league, { labels: ARCHETYPES, vpOf: id => cardVP.get(id) ?? 0, vpBought: T.vpBought, damage: integrity }) : null;
        const humanGames = games.filter(game => isHumanSource(game.evidence.source)).length;
        const humanOpponents = [...new Set(games.filter(game => isHumanSource(game.evidence.source)).map(game => humanOpponent(game.evidence)).filter((id): id is string => !!id))].map(id => AGENT_NAMES[id] ?? id);
        const readSources = (journal.research?.sources ?? []).filter(source => source.accessible && source.takeaways.length);
        const advice = await askModel(`${ROLE}\n\nTask: write your balance report on the 0uroboros economy for the game's designer. Context: ${cohort ? `this is a ${cohort.kind} cohort of ${ids.length} complete AI-vs-AI games in which both seats are Strat-G running one frozen profile (a mirror match), so strategic diversity reflects one AI's preferences, not the design space` : `these are ${ids.length} complete games (${sources.join(', ')})`}. Be honest about sample size.

Write plainly: short sentences, everyday words, game terms as the game uses them. Cite the given numbers in words a designer understands ("the Cycle 8 VP leader won 75% of games", never "vpLeaderWins.at8 0.75"). Do not turn a single game into a general rule. Lead with what to change; keep everything else brief and about balance.

Reply as one JSON object:
{"headline": string (<=350 chars: the state of the economy and the single most important balance issue),
 "recommendations": [{"title": string (<=80, imperative), "change": string (<=250: the concrete change, naming cards and numbers), "why": string[] (2-4 reasons, each <=200 chars and citing a measured number), "cause": string (<=200: what you think produces the problem), "hypothesis": string (<=350: if this were implemented, how the game would change: which measured numbers move which way and roughly how far, and how play would feel), "watchFor": string (<=200: risks and side effects), "confidence": "strong"|"moderate"|"weak"|"insufficient", "test": string (<=200: how to confirm it with a seeded A/B run)}] (at most ${MAX_RECOMMENDATIONS}, ranked by expected impact on balance, only where evidence supports a change; each is a proposal for human design review and is never applied automatically),
 "findings": {"goals": [{"goal": string, "verdict": string (<=220: is the game meeting it today, citing numbers)}] (one per design goal, in order), "working": string[] (<=4, each <=180 chars), "problems": string[] (<=5, each <=200 chars, most important for balance first), "areas": {"finalScores": string, "economy": string, "damageVsHealing": string, "circuitRewards": string, "locations": string, "cardValue": string, "strategicDiversity": string, "snowballing": string, "playerExperience": string} (a one-sentence verdict each, <=200 chars), "neglected": [{"card": string, "verdict": "game dynamic"|"the card"|"AI player"|"unclear", "note": string (<=200)}] (<=8), "stratG": {"agree": string[], "disagree": string[], "insufficient": string[]} (<=3 each, <=180 chars), "uncertainties": string[] (<=4, <=180 chars: what you could not determine and why)},
 "pointOfView": {"summary": string (<=600: how you believe a deck-building game's economy should work), "principles": [{"principle": string (<=110), "why": string (<=260: your reasoning, naming the concept, article or game-theory idea it comes from), "here": string (<=260: how 0uroboros measures up today, citing numbers)}] (5-7), "changed": string (<=220: what you changed from previousPointOfView and why; empty if this is your first version)},
 "plainHypotheses": [{"id": string, "plain": string (<=140 chars, one plain sentence)}] (one for every hypothesis marked needsPlain),
 "hypothesisUpdates": [{"id": string, "direction": "for"|"against"|"neutral", "note": string}],
 "newHypotheses": [{"topic": string, "statement": string (one plain sentence <=160 chars stating a general, testable rule; no single-game numbers)}] (<=3),
 "questions": string[] (<=3)}

Final scores: metrics.vp.margins splits games into close (margin of ${CLOSE_MARGIN} VP or less), competitive and blowouts (${BLOWOUT_MARGIN} VP or more), overall and by how the game ended; metrics.vp.winnerLead says how much of the winner's lead came from destroying Servers versus every other VP source, and bothDestroyed counts games where each player destroyed at least one enemy Server. Use these to explain why margins are wide or narrow and what would close them without making destruction endings rare. metrics.cycles.destructionEnd says in which Cycle destruction endings came.

Archetypes: ${archetypes ? `archetypes holds ${archetypes.games} league games by the deck archetype in each seat (Balanced, Pure aggression, Engine, Pure economy; each is an AI agent held to that style): win rates, head-to-head records, how often and by which Cycle each destroyed both enemy Servers (the pure aggression goal), how many games each dealt ${integrity} total Server damage (both Servers' full integrity on this build; the designer may change it, so judge aggression by destruction and treat the number only as the current size of the job) and bought ${T.vpBought} VP from the market, and how often it destroyed both Servers yet lost on VP. Judge the archetype goals from these numbers, and when one archetype misses its timing, look for the economy or timing cause (prices, Drain per cost, VP pile values, Restore) rather than blaming the agent. A missed target can also be an AI limitation: say which you think it is.` : 'there are no league games on this build, so the archetype goals cannot be measured yet: say so in their verdicts.'}

Neglected cards: cardDemand counts each Draft once per seat and lists cards that were affordable but almost never bought, with a diagnosis computed by code. Game dynamics: rarely offered, priced above typical budgets, offered when nobody buys that kind of card, or a whole price band ignored. AI player: the AI's rules refuse the card. The card itself: same-cost peers get bought instead. ${humanGames ? `${humanGames} of these games had a human seat; every other buyer was the AI` : 'Every buyer here was the AI'}, so "the card" can still mean the AI's scoring undervalues it: say so when you suspect it. Give your own verdict for each neglected card and what would make it wanted, or why the dynamic hides it.

${startingDeckNote([...starters])}

Strat-G: compare your view with Strat-G's (agree / disagree / it over- or undervalues X / not enough data). Do not address Strat-G or give it instructions.

Point of view: your own considered view of how a deck-building economy should work, built from the research you have read (research.sources, concepts), economic and game-theory ideas (feedback loops, dominant strategies, opportunity cost, tempo versus value, scarcity, information) and what you have measured here. If previousPointOfView exists, revise it: keep principles you still hold and change one only when the evidence or your reading changed your mind.`,
          { metrics: { ...metrics, cards: markStarters(metrics.cards.slice(0, 30), starters) }, archetypes, cardDemand: { ...demand, cards: demand.cards.slice(0, 40) }, hypotheses: hypothesesForModel(), repeatedObservations: journal.observations.filter(item => item.buildId === build!.id && item.kind === 'measured').sort((a, b) => b.occurrences - a.occurrences).slice(0, 25).map(item => ({ topic: item.topic, text: item.text, games: item.occurrences })), study: journal.study, research: journal.research ? { concepts: journal.research.concepts, applications: journal.research.applications, sources: readSources.map(source => ({ title: source.title ?? source.url, takeaways: source.takeaways })) } : null, previousPointOfView: journal.pointOfView ?? null, stratG: { onDisk: stratG, purchasesByPhase: phaseBuys, choicesPickedAtRandomByAiPerGame: metrics.aiPlayer.choicesPickedAtRandomByAiPerGame }, facts },
          'medium', 300_000);
        const id = `${now().slice(0, 10)}-${kind}-${journal.reports.length + 1}`;
        const recommendations: Recommendation[] = advice && Array.isArray(advice.data.recommendations) ? (advice.data.recommendations as Record<string, unknown>[]).slice(0, MAX_RECOMMENDATIONS).map((item, index) => {
          const why = strings(item.why, 4, 240), change = str(item.change, 300), hypothesis = str(item.hypothesis, 450);
          return {
            id: `${id}-r${index + 1}`, at: now(), buildId: build!.id, reportId: id, title: str(item.title, 120) || `Recommendation ${index + 1}`,
            observed: why[0] ?? '', evidence: why.join(' '), likelyCause: str(item.cause, 300), adjustment: change, expectedEffect: hypothesis,
            risks: str(item.watchFor, 300), confidence: (['strong', 'moderate', 'weak', 'insufficient'] as Confidence[]).find(level => level === item.confidence) ?? 'insufficient',
            test: str(item.test, 300), why, hypothesis, status: 'candidate',
          };
        }) : [];
        if (advice) {
          for (const update of Array.isArray(advice.data.hypothesisUpdates) ? advice.data.hypothesisUpdates as { id?: unknown; direction?: unknown; note?: unknown }[] : []) {
            const direction = (['for', 'against', 'neutral'] as const).find(item => item === update?.direction);
            if (typeof update?.id === 'string' && direction) addEvidence(update.id, direction, `report ${id}: ${str(update.note, 260)}`, 'interpreted', undefined, cohortId);
          }
          for (const entry of Array.isArray(advice.data.plainHypotheses) ? advice.data.plainHypotheses.slice(0, HYPOTHESIS_LIMIT * 2) as { id?: unknown; plain?: unknown }[] : []) {
            const hypothesis = journal.hypotheses.find(item => item.id === entry?.id), plain = str(entry?.plain, 160);
            if (hypothesis && plain && !hypothesis.plain) hypothesis.plain = plain;
          }
          for (const proposal of Array.isArray(advice.data.newHypotheses) ? advice.data.newHypotheses.slice(0, 3) : []) addHypothesis(proposal, 'report');
          for (const text of strings(advice.data.questions, 3)) addQuestion(text);
          const view = advice.data.pointOfView as Record<string, unknown> | undefined;
          const principles = Array.isArray(view?.principles) ? (view.principles as Record<string, unknown>[]).slice(0, 7).map(item => ({ principle: str(item?.principle, 140), why: str(item?.why, 320), here: str(item?.here, 320) })).filter(item => item.principle) : [];
          if (view && principles.length) {
            const changed = str(view.changed, 260);
            journal.pointOfView = { at: now(), buildId: build!.id, reportId: id, model: advice.model, summary: str(view.summary, 700), principles, ...(changed ? { changed } : {}), basedOn: [...new Set(readSources.map(source => (source.title ?? source.url).replace(/,? part \d+ of \d+[\s\S]*$/i, '').replace(/&ndash;/g, '–').replace(/\s+/g, ' ').trim().slice(0, 90)))].slice(0, 8) };
          }
        }
        journal.recommendations.push(...recommendations);
        const minBuyerGames = Math.max(3, Math.ceil(games.length * 0.05));
        const market: PurchaseLine[] = metrics.cards.filter(card => !starters.has(card.name) && card.buyerGames >= minBuyerGames && card.buyerWinRate !== null)
          .map(card => ({ name: card.name, cost: card.cost, copies: card.copies, buyerGames: card.buyerGames, buyerWinRate: card.buyerWinRate! }));
        const top = [...market].sort((a, b) => b.buyerWinRate - a.buyerWinRate || b.buyerGames - a.buyerGames).slice(0, 3);
        const bottom = market.filter(line => !top.includes(line)).sort((a, b) => a.buyerWinRate - b.buyerWinRate || b.buyerGames - a.buyerGames).slice(0, 3);
        journal.purchases = { at: now(), reportId: id, buildId: build!.id, games: games.length, minBuyerGames, startingDeck: [...starters], top, bottom };
        const markdown = renderReport({ id, kind, cohort, metrics, archetypes, demand, advice: advice?.data ?? null, model: advice?.model ?? null, recommendations, games: games.length, sources, humanOpponents });
        const entry: ReportEntry = { id, at: now(), kind, buildId: build!.id, games: games.length, markdown: `reports/${id}.md`, json: `reports/${id}.json`, model: advice?.model ?? null };
        await writer.write(entry.markdown, markdown);
        await writer.write(entry.json, `${JSON.stringify({ ...entry, cohortId: cohortId ?? null, metrics, archetypes, cardDemand: demand, assessment: advice?.data ?? null, recommendations }, null, 2)}\n`);
        journal.reports.push(entry);
        journal.gamesSinceReport = 0;
        await save();
        log(`report ${id} written (${games.length} games, ${advice ? advice.model : 'deterministic only'}).`);
        reportFailure = null;
        return entry;
      } catch (error) {
        recordError(`report (${kind})`, error);
        reportFailure = { at: now(), message: message(error).slice(0, 300) };
        await save().catch(() => undefined); return null;
      }
      finally { busy = null; }
    });
  }

  /** Three tabs, split by the reader at `<!-- tab: … -->` markers: Recommendations, Findings, Point of view. */
  function renderReport(input: { id: string; kind: string; cohort?: Cohort; metrics: CohortMetrics; archetypes: ArchetypeResults | null; demand: CardDemand; advice: Record<string, unknown> | null; model: string | null; recommendations: Recommendation[]; games: number; sources: string[]; humanOpponents?: string[] }) {
    const { metrics: m, demand: d, advice: a } = input;
    const pct = (value: number | null) => value === null ? 'n/a' : `${Math.round(value * 100)}%`;
    const findings = (a?.findings ?? {}) as Record<string, unknown>;
    const areas = (findings.areas ?? {}) as Record<string, unknown>;
    const stratG = (findings.stratG ?? {}) as Record<string, unknown>;
    const bullets = (value: unknown, count: number, prefix = '') => strings(value, count, 260).map(line => `- ${prefix}${line}`);
    const cell = (text: string) => text.replace(/\|/g, '/');
    const humanLabel = `human vs ${input.humanOpponents?.length ? input.humanOpponents.join(', ') : 'Strat-G'}`;
    const sourceLabel = [...new Set(input.sources.map(source => source === 'self-play' ? 'AI vs AI self-play' : source === 'online-pvp' ? 'human vs human online' : isHumanSource(source as GameEvidence['source']) ? humanLabel : source))].join(', ');
    const seeds = input.cohort?.seeds.length ? `seeds ${Math.min(...input.cohort.seeds)}–${Math.max(...input.cohort.seeds)}` : '';
    const noModel = '_No model was available for this report, so this tab has measured facts only._';
    const glance: [string, string][] = [
      ['Games', `${m.games} (${sourceLabel}${input.cohort ? `, both seats Strat-G ${stratGVersion(input.cohort)}` : ''})`],
      ['How games end', `${m.endedBy.destruction} by Server destruction, ${m.endedBy.cycle16} at Cycle 16${m.endedBy.other ? `, ${m.endedBy.other} another way` : ''}`],
      ['Length', `${m.cycles.avg} Cycles on average (${m.cycles.min}–${m.cycles.max}); the first Server falls around Cycle ${m.damage.avgFirstDestructionCycle || 'n/a'}`],
      ['Final score', `winners ${m.vp.avgWinner} VP, losers ${m.vp.avgLoser} VP on average; margin ${m.vp.margins.avgMargin} on average (median ${m.vp.margins.medianMargin})`],
      ['Close vs blowout', `${m.vp.margins.close} close (≤${CLOSE_MARGIN} VP), ${m.vp.margins.competitive} in between, ${m.vp.margins.blowout} blowouts (≥${BLOWOUT_MARGIN} VP)`],
      ['Seat balance', `${m.seatWins[0]}–${m.seatWins[1]}${m.ties ? `, ${m.ties} tied` : ''}`],
      ['Spending per seat', `${m.economy.avgPurchasesPerSeat} cards for ${m.economy.avgSpentPerSeat} Crypto; ${m.economy.avgWalletLeftAtDraftEnd} Crypto left unspent per Draft`],
      ['Draft budget', `Cycles 1–4: ${m.economy.avgWallet.cycles1to4}, 5–10: ${m.economy.avgWallet.cycles5to10}, 11–16: ${m.economy.avgWallet.cycles11to16} Crypto`],
      ['What gets bought', Object.entries(m.economy.categoryShare).sort((x, y) => y[1] - x[1]).map(([key, value]) => `${key} ${pct(value)}`).join(' · ')],
      ['Damage vs healing', `healing equals ${pct(m.damage.restoreToDrain)} of Drain dealt; ${pct(m.damage.wastedRestoreRate)} of heals were wasted; the winner dealt more Drain in ${pct(m.damage.winnerDrainedMore.rate)} of games`],
      ['Snowballing', `the Cycle 8 VP leader won ${pct(m.snowball.vpLeaderWins.at8.rate)}; ${m.snowball.avgLeadChanges} lead changes per game; ${m.snowball.comebacks5vp} comebacks from 5+ VP down`],
      ['Locations', `the player who won more Locations won the game ${pct(m.locations.winnerWonMoreLocations.rate)} of the time`],
      ['Circuit Rewards', `${m.circuit.claimsPerGame} claims per game; the player who claimed more won ${pct(m.circuit.winnerClaimedMore.rate)}`],
      ['Variety', `${m.diversity.distinctCardsBought} different cards bought; the top three were ${pct(m.diversity.topThreeShare)} of purchases`],
      ['Neglected cards', d.gamesWithMarketData ? `${d.neglected.length} cards were often affordable but almost never bought` : 'not measured yet (these games predate market tracking)'],
    ];
    const notes = new Map((Array.isArray(findings.neglected) ? findings.neglected as Record<string, unknown>[] : []).map(item => [str(item?.card, 80).toLowerCase(), { verdict: str(item?.verdict, 20), note: str(item?.note, 240) }]));
    const margins = m.vp.margins, endings = margins.byEnding;
    const goalVerdicts = (Array.isArray(findings.goals) ? findings.goals as Record<string, unknown>[] : []).map(item => str(item?.verdict, 260));
    const arch = input.archetypes;
    const byArchetype = (label: string) => arch?.agents.find(agent => agent.archetype === label);
    const noLeague = (label: string) => `No league games with the ${label.toLowerCase()} deck in this report yet.`;
    const record = (entry?: { wins: number; losses: number; ties: number }) => entry ? `${entry.wins}–${entry.losses}${entry.ties ? `–${entry.ties}` : ''}` : 'no games';
    const by = (summary: { avgCycle: number | null }) => summary.avgCycle !== null ? ` (by Cycle ${summary.avgCycle} on average)` : '';
    const aggression = byArchetype('Pure aggression'), economy = byArchetype('Pure economy'), balanced = byArchetype('Balanced');
    const middle = ['Engine', 'Pure economy'].map(label => byArchetype(label)?.winRate).filter((value): value is number => value !== null && value !== undefined);
    const middleRate = middle.length ? middle.reduce((total, value) => total + value, 0) / middle.length : null;
    const aggressionGap = middleRate !== null && aggression?.winRate != null ? Math.round((middleRate - aggression.winRate) * 100) : null;
    const ends = m.cycles.destructionEnd;
    const goals: [string, string, string[]][] = [
      [`Most games end by Server destruction, in Cycles ${T.endCycles[0]}–${T.endCycles[1]}`, `${m.endedBy.destruction} of ${m.games} games (${pct(m.games ? m.endedBy.destruction / m.games : null)}) ended by Server destruction; the first Server fell around Cycle ${m.damage.avgFirstDestructionCycle || 'n/a'}.${ends.games ? ` ${ends.cycles11to14} of those ${ends.games} ended in Cycles ${T.endCycles[0]}–${T.endCycles[1]} and ${ends.before11} earlier (average Cycle ${ends.avg}).` : ''}`, []],
      ['Close final scores, narrow margins', `${margins.close} of ${margins.games} games were close (${pct(margins.closeShare)}) and ${margins.blowout} were blowouts (${pct(margins.blowoutShare)}); average margin ${margins.avgMargin} VP, median ${margins.medianMargin}.`, [
        ...(endings.destruction.games ? [`Games ended by destruction: ${endings.destruction.games}, average margin ${endings.destruction.avgMargin} VP, ${endings.destruction.close} close, ${endings.destruction.blowout} blowouts.`] : []),
        ...(endings.cycle16.games ? [`Games that reached Cycle 16: ${endings.cycle16.games}, average margin ${endings.cycle16.avgMargin} VP, ${endings.cycle16.close} close, ${endings.cycle16.blowout} blowouts.`] : []),
        `Where the winner's lead came from: ${m.vp.winnerLead.fromDestruction} VP from destroying Servers, ${m.vp.winnerLead.fromOther} VP from everything else (on average). Both players destroyed a Server in ${m.vp.bothDestroyed} of ${m.games} games.`,
      ]],
      [`Pure aggression destroys both Servers by Cycles ${T.damageCycles[0]}–${T.damageCycles[1]}`, aggression && arch
        ? `The pure aggression deck destroyed both Servers in ${aggression.destroyedBothServers.games} of ${aggression.games} games${by(aggression.destroyedBothServers)} and still lost on VP in ${aggression.lostAfterDestroyingBoth} of them. It dealt ${aggression.avgDrainDealt} Server damage per game on average and reached ${arch.targets.damage.toLocaleString('en-US')} (both Servers' full integrity on this build) in ${aggression.reachedDamageTarget.games} games${by(aggression.reachedDamageTarget)}.`
        : noLeague('Pure aggression'), []],
      [`Pure economy buys ${T.vpBought}+ VP by Cycles ${T.vpBoughtCycles[0]}–${T.vpBoughtCycles[1]}`, economy
        ? `The pure economy deck bought ${economy.avgVpBought} VP from the market per game on average and reached ${T.vpBought} in ${economy.reachedVpBoughtTarget.games} of ${economy.games} games${by(economy.reachedVpBoughtTarget)}.`
        : noLeague('Pure economy'), []],
      ['Balance reads its opponent and adapts', balanced
        ? `The balanced deck went ${record(balanced.byOpponent.find(entry => entry.opponent === 'Pure aggression'))} against pure aggression and ${record(balanced.byOpponent.find(entry => entry.opponent === 'Pure economy'))} against pure economy (wins–losses${balanced.ties ? '–ties' : ''}).`
        : noLeague('Balanced'), []],
      [`Balanced best, Engine and Economy in the middle, aggression ${T.aggressionGap[0]}–${T.aggressionGap[1]} points behind at most`, arch
        ? `League win rates: ${arch.agents.map(agent => `${agent.archetype} ${pct(agent.winRate)}`).join(', ')}.${aggressionGap !== null ? ` Pure aggression is ${aggressionGap} points behind the middle tier (Engine and Economy average ${pct(middleRate)}).` : ''}`
        : 'No league games in this report yet; run the league with Eco-Strat watching.',
        arch ? arch.agents.map(agent => `${agent.archetype}: ${record(agent)} over ${agent.games} games, ${agent.avgFinalVP} final VP and ${agent.avgDrainDealt} Server damage dealt on average.`) : []],
    ];
    const areaLines = ([['Final scores', 'finalScores'], ['Economy', 'economy'], ['Damage vs healing', 'damageVsHealing'], ['Circuit Rewards', 'circuitRewards'], ['Locations', 'locations'], ['Card value', 'cardValue'], ['Strategic diversity', 'strategicDiversity'], ['Snowballing and comebacks', 'snowballing'], ['Player experience', 'playerExperience']] as const)
      .map(([label, key]) => [label, str(areas[key], 260)] as const).filter(([, text]) => text).map(([label, text]) => `- **${label}:** ${text}`);
    return [
      `# Eco-Strat report · ${input.id.slice(0, 10)} (${input.kind})`,
      '',
      `${m.games} games (${sourceLabel}) on ${build!.label} · model ${input.model ?? 'none (measured facts only)'}. Recommendations are proposals for design review; nothing here changes the game.`,
      '',
      '<!-- tab: Recommendations -->',
      '## What I recommend',
      '',
      ...(a ? [`**In short:** ${str(a.headline, 400) || 'No headline given.'}`, ''] : [noModel, '']),
      ...(input.recommendations.length ? input.recommendations.flatMap((item, index) => [
        `### ${index + 1}. ${item.title}`, '',
        `**The change:** ${item.adjustment}`, '',
        '**Why:**', '',
        ...(item.why ?? []).map(line => `- ${line}`), ...(item.likelyCause ? [`- *Likely cause:* ${item.likelyCause}`] : []), '',
        `**If implemented, I expect:** ${item.hypothesis ?? item.expectedEffect}`, '',
        ...(item.risks ? [`**Watch for:** ${item.risks}`, ''] : []),
        `**Confidence:** ${item.confidence}${item.test ? ` · **How to test it:** ${item.test}` : ''}`, '',
      ]) : [a ? '_No change is supported by the evidence this time._' : '', '']),
      '<!-- tab: Findings -->',
      '## What the games show',
      '',
      '### Your design goals',
      '',
      ...goals.flatMap(([goal, measured, details], index) => [
        `**${goal}.** ${measured}${goalVerdicts[index] ? ` *Eco-Strat: ${goalVerdicts[index]}*` : ''}`, '',
        ...(details.length ? [...details.map(line => `- ${line}`), ''] : []),
      ]),
      '### At a glance',
      '',
      '| Measure | Result |', '| --- | --- |', ...glance.map(([label, value]) => `| ${label} | ${cell(value)} |`),
      '',
      ...(a ? [
        ...(strings(findings.working, 4).length ? ['### Working', '', ...bullets(findings.working, 4), ''] : []),
        ...(strings(findings.problems, 5).length ? ['### Out of balance', '', ...bullets(findings.problems, 5), ''] : []),
        ...(areaLines.length ? ['### Area by area', '', ...areaLines, ''] : []),
      ] : [noModel, '']),
      '### Neglected cards: the card, or the game?',
      '',
      ...(d.gamesWithMarketData ? [
        `_Cards that were often affordable at the start of a Draft but almost never bought (${d.gamesWithMarketData} games with market data; each Draft counts once per seat). The likely cause is computed from the market data; ${input.sources.some(source => isHumanSource(source as GameEvidence['source'])) ? 'most buyers were' : 'every buyer was'} the AI, so a weak-looking card may also be one the AI undervalues._`, '',
        ...(d.neglected.length ? d.neglected.slice(0, 10).flatMap(item => {
          const note = notes.get(item.name.toLowerCase());
          return [`- **${item.name}** (${item.category}, cost ${item.cost}): affordable ${item.affordable} times, bought ${item.picks}. **Likely cause: ${item.blame}.** ${item.reason}${note?.note ? ` *Eco-Strat${note.verdict && note.verdict !== item.blame ? ` (thinks: ${note.verdict})` : ''}: ${note.note}*` : ''}`];
        }) : ['- None: every card that was affordable often got bought at least sometimes.']),
        ...(d.rarelyOffered.length ? [`- *Too rarely offered to judge:* ${d.rarelyOffered.slice(0, 12).join(', ')}.`] : []),
        ...(d.neverOffered.length ? [`- *Never offered in these games:* ${d.neverOffered.slice(0, 12).join(', ')}${d.neverOffered.length > 12 ? ` and ${d.neverOffered.length - 12} more` : ''}.`] : []),
        '',
        ...(d.autoPicks.length ? ['**The opposite: bought almost whenever affordable**', '', ...d.autoPicks.map(item => `- **${item.name}** (${item.category}, cost ${item.cost}): bought ${pct(item.pickRate)} of the ${item.affordable} times it was affordable; its buyers won ${pct(item.buyerWinRate)}.`), ''] : []),
      ] : ['_Not measured yet: these games were recorded before the market offer was tracked. The next games will include it._', '']),
      '### Strat-G comparison',
      '',
      ...(a ? [...bullets(stratG.agree, 3, 'Agree: '), ...bullets(stratG.disagree, 3, 'Disagree: '), ...bullets(stratG.insufficient, 3, 'Not enough data: ')] : []),
      `- Measured: the AI picked ${m.aiPlayer.choicesPickedAtRandomByAiPerGame} choices per game at random because it has no rule for them (an AI limitation, not game randomness).`,
      '',
      '### Hypotheses',
      '',
      ...hypothesisSections(journal.hypotheses, build!.id, '####', 5),
      ...(a && strings(findings.uncertainties, 4).length ? ['### What I could not tell', '', ...bullets(findings.uncertainties, 4), ''] : []),
      '### Data',
      '',
      `- Build ${build!.label} (\`${build!.id}\`)${input.cohort ? `; ${input.cohort.kind} cohort ${input.cohort.id}, ${seeds}; Strat-G ${stratGVersion(input.cohort)} profile ${input.cohort.strategyHash} frozen for the run` : ''}.`,
      ...(input.cohort?.invalid.length ? [`- Invalid runs excluded: ${input.cohort.invalid.map(run => `seed ${run.seed} (${run.reason})`).join('; ')}.`] : []),
      `- Numbers were computed by code from game telemetry; the prose is Eco-Strat's interpretation. Every measured figure (per-card, per-Location and per-Circuit-Reward tables) is in \`reports/${input.id}.json\`.`,
      '',
      '<!-- tab: Point of view -->',
      '## How I think a deck-building economy should work',
      '',
      ...(journal.pointOfView && journal.pointOfView.reportId !== input.id ? [`_Not revised in this report; this is my view as of ${journal.pointOfView.at.slice(0, 10)}._`, ''] : []),
      ...pointOfViewSections(journal.pointOfView, '###'),
    ].join('\n');
  }

  async function beginCohort(input: { kind: Cohort['kind']; target: number; seeds: number[]; strategyHash: string; strategyVersion: string }) {
    return serialize(async () => {
      await load(); await refreshBuild();
      const cohort: Cohort = { id: `${input.kind}-${build!.id}-${journal.cohorts.length + 1}`, kind: input.kind, buildId: build!.id, startedAt: now(), target: input.target, seeds: [], strategyHash: input.strategyHash, strategyVersion: input.strategyVersion, status: 'running', validGames: [], invalid: [] };
      journal.cohorts.push(cohort);
      await save();
      return cohort.id;
    });
  }

  async function updateCohort(id: string, change: { seed?: number; validGame?: string; invalid?: { seed: number; reason: string }; status?: Cohort['status']; note?: string }) {
    return serialize(async () => {
      const cohort = journal.cohorts.find(item => item.id === id);
      if (!cohort) return;
      if (change.seed !== undefined && !cohort.seeds.includes(change.seed)) cohort.seeds.push(change.seed);
      if (change.validGame) cohort.validGames.push(change.validGame);
      if (change.invalid) cohort.invalid.push(change.invalid);
      if (change.note) cohort.note = change.note;
      if (change.status) { cohort.status = change.status; if (change.status !== 'running') cohort.finishedAt = now(); }
      await save();
    });
  }

  async function archive() {
    return serialize(async () => {
      await load();
      const stamp = now().replace(/[:.]/g, '-');
      await save();
      await writer.move('journal.json', `archive/${stamp}/journal.json`);
      await writer.move('JOURNAL.md', `archive/${stamp}/JOURNAL.md`);
      journal = emptyJournal(now()); loaded = null;
      await load();
      return `archive/${stamp}`;
    });
  }

  function status(): EcoStatus {
    const settings = options.settings();
    const baseline = [...journal.cohorts].reverse().find(cohort => cohort.kind === 'baseline' && cohort.buildId === build?.id);
    const current = journal.games.filter(game => game.buildId === build?.id);
    const last = journal.reports.at(-1);
    const rel = (path: string) => relative(options.projectRoot, path) || '.';
    return {
      active: settings.active, state: !settings.active ? 'off' : busy ?? (baseline?.status === 'running' ? 'running baseline' : 'observing'), busy,
      reporting: reportsQueued > 0 || busy === 'reporting', reportFailure, leagueBacklog: lanes.league.length,
      modelConfigured: !!options.apiKey, model: journal.model.used, preferredModels: models,
      build: build ? { id: build.id, label: build.label } : null,
      baseline: { status: baseline?.status ?? 'not-started', valid: baseline?.validGames.length ?? 0, target: baseline?.target ?? settings.baselineGames, invalid: baseline?.invalid.length ?? 0, cohortId: baseline?.id ?? null },
      gamesObserved: { currentBuild: current.filter(game => game.valid).length, invalid: current.filter(game => !game.valid).length, allBuilds: journal.games.length },
      hypotheses: journal.hypotheses.filter(item => item.status === 'open').length, observations: journal.observations.filter(item => item.buildId === build?.id).length,
      recommendations: journal.recommendations.length, questions: journal.questions.filter(item => item.status === 'open').length,
      study: journal.study ? `${journal.study.mode} · ${journal.study.at.slice(0, 16).replace('T', ' ')}` : null,
      research: journal.research ? { read: journal.research.sources.filter(item => item.accessible).length, inaccessible: journal.research.sources.filter(item => !item.accessible).length } : null,
      lastReport: last ? { id: last.id, at: last.at, kind: last.kind, games: last.games, markdown: rel(writer.path(last.markdown)) } : null,
      nextReportIn: settings.continuous && baselineComplete() ? Math.max(0, settings.reportEvery - journal.gamesSinceReport) : null,
      errors: journal.errors.length, lastError: journal.errors.at(-1)?.message ?? null,
      paths: { root: rel(options.root), journal: rel(writer.path('JOURNAL.md')), journalJson: rel(journalFile), reports: rel(writer.path('reports')) },
    };
  }

  return {
    load, study, research, observe, report, beginCohort, updateCohort, archive, status,
    hasStudied: () => journal.study?.buildId === build?.id,
    hasResearched: () => !!journal.research,
    journal: () => journal,
    root: resolve(options.root),
  };
}
export type EcoStrat = ReturnType<typeof createEcoStrat>;
