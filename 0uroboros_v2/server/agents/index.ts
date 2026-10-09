import { readFile, readdir, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { relative, resolve } from 'node:path';
import { DEFAULT_STRATEGY, sanitizeProfile, versionLabel, type StrategyProfile } from '@0uroboros/engine/ai/strategy';
import { opponentBaseline } from '@0uroboros/engine/ai/opponents';
import type { ContentDocument } from '@0uroboros/engine/authoring/contentModel';
import type { MatchReport } from '@0uroboros/engine/runtime';
import { createStrategist, type StratGGameRecord } from '../aiStrategist';
import { isLocalRequest } from '../contentApi';
import { runCohort, type SelfPlayHarness } from './cohortRunner';
import { createEcoStrat } from './ecoStrat';
import { createEvidenceBus } from './evidence';
import { createOnlineEvidence } from './onlineEvidence';
import { createLeague, type LeagueMember } from './league';
import { coach, coachingTips, combineTips, createCoachingStore, withoutCoaching, type CoachingStore } from './coaching';
import { baselineTips, createMentoringStore, handOff, TIPS_PER_MENTOR, type MentoringStore } from './mentoring';
import { DV_8, STRAT_G, STRAT_G_PHASES, T_5, VP_DOG } from './roster';
import { createSettingsStore, dv8Active, ecoStratActive, stratGActive, t5Active, vpDogActive } from './settings';

/**
 * Wires the agents for the dev server. Whichever agent the human plays publishes the finished game to an
 * evidence bus; Eco-Strat subscribes. Nothing flows the other way: Eco-Strat is created without any handle
 * to the agents, and the routes here only read their status.
 *
 * Strat-G is the default opponent; the human can pick T-5, DV-8 or VP-Dog instead (`/api/ai/*?agent=`).
 * The league referee runs AI-vs-AI games between the agents and hands each one its own results only.
 * Mentoring and coaching are the designer-run channels between agents: VP-Dog's and DV-8's tips go into the
 * baselines of T-5 and Strat-G, and coaching moves Strat-G's baseline a set share toward its competitors' play.
 */
export type AgentSystemOptions = {
  cwd: string;
  env: Record<string, string | undefined>;
  loadModule: (path: string) => Promise<Record<string, unknown>>;
  log?: (message: string) => void;
};

const COMPLETE_ENDING = /^(Cycle 16 final Draft complete\.|Both Servers destroyed)/;

export function createAgentSystem(options: AgentSystemOptions) {
  const { cwd, env } = options;
  const log = options.log ?? ((message: string) => console.log(`[agents] ${message}`));
  const settings = createSettingsStore(resolve(cwd, 'ai-agents/settings.json'));
  const bus = createEvidenceBus(log);
  const stratGRoot = resolve(cwd, 'ai-strategist');
  const contentFile = resolve(cwd, 'content/authored-content.json');
  const readDocument = async () => {
    const stored = (JSON.parse(await readFile(contentFile, 'utf8')) as { document: unknown }).document;
    const model = await options.loadModule('/packages/engine/src/authoring/contentModel.ts') as { upgradeDocument: (value: unknown) => unknown };
    return model.upgradeDocument(stored) as ContentDocument;
  };

  const strategistKey = env.AI_STRATEGIST_DISABLE_MODEL ? undefined : env.OPENAI_API_KEY;
  const loadSelfPlay = () => options.loadModule('/packages/engine/src/ai/selfPlay.ts') as never;
  const mentoringStore = createMentoringStore(resolve(cwd, 'ai-agents/league/mentoring.json'));
  const coachingStore = createCoachingStore(resolve(cwd, 'ai-agents/league/coaching.json'));
  const recordDecisions = () => settings.read().stratG.recordDecisions;
  /** Every agent can play the human; each finished game goes out to Eco-Strat tagged with the agent that played it. */
  const publishHumanGame = (agent: string) => (record: StratGGameRecord) => {
    const reason = record.report.endedReason ?? '';
    const valid = record.report.phase === 'gameover' && COMPLETE_ENDING.test(reason);
    bus.publish({
      id: `human-${agent}-${record.gameId}`, source: 'human-vs-agent', recordedAt: new Date().toISOString(), agent, seats: ['human', agent],
      valid, ...(valid ? {} : { invalidReason: record.report.phase !== 'gameover' ? `unfinished (${record.report.phase})` : `ended by: ${reason}` }),
      report: record.report as MatchReport, stratG: record.stratG,
    });
  };
  const strategist = createStrategist({
    root: stratGRoot, contentFile, identity: STRAT_G, league: true,
    mentorTips: async () => combineTips(baselineTips(await mentoringStore.read(), 'strat-g'), coachingTips(await coachingStore.read())),
    apiKey: strategistKey, model: env.AI_STRATEGIST_MODEL,
    enabled: () => stratGActive(settings.read()),
    loadSelfPlay, recordDecisions, onGameRecorded: publishHumanGame('strat-g'),
  });
  const t5Root = resolve(cwd, 'ai-agents/t-5'), dv8Root = resolve(cwd, 'ai-agents/dv-8'), vpDogRoot = resolve(cwd, 'ai-agents/vp-dog');
  const t5 = createStrategist({ root: t5Root, contentFile, identity: T_5, league: true, mentorTips: async () => baselineTips(await mentoringStore.read(), 't-5'), apiKey: strategistKey, model: env.AI_STRATEGIST_MODEL, enabled: () => t5Active(settings.read()), recordDecisions, onGameRecorded: publishHumanGame('t-5'), log: message => log(`T-5 ${message}`) });
  const dv8 = createStrategist({ root: dv8Root, contentFile, identity: DV_8, league: true, apiKey: strategistKey, model: env.AI_STRATEGIST_MODEL, enabled: () => dv8Active(settings.read()), recordDecisions, onGameRecorded: publishHumanGame('dv-8'), log: message => log(`DV-8 ${message}`) });
  const vpDog = createStrategist({ root: vpDogRoot, contentFile, identity: VP_DOG, league: true, apiKey: strategistKey, model: env.AI_STRATEGIST_MODEL, enabled: () => vpDogActive(settings.read()), recordDecisions, onGameRecorded: publishHumanGame('vp-dog'), log: message => log(`VP-Dog ${message}`) });

  const learners: Record<string, { agent: typeof strategist; root: string }> = {
    'strat-g': { agent: strategist, root: stratGRoot }, 't-5': { agent: t5, root: t5Root }, 'dv-8': { agent: dv8, root: dv8Root }, 'vp-dog': { agent: vpDog, root: vpDogRoot },
  };
  /** The agent's current best profile (never a running experiment's arm), sanitized for the content pack. */
  async function publishable(id: string) {
    const learner = learners[id];
    if (!learner) return null;
    let memory: { version?: unknown; plan?: unknown; profile?: unknown } = learner.agent.memory();
    if (learner.agent.status().state !== 'online') {
      try { memory = JSON.parse(await readFile(resolve(learner.root, 'memory.json'), 'utf8')); } catch { /* never played: its seed */ }
    }
    const version = typeof memory.version === 'number' ? memory.version : 0;
    const source = memory.profile && typeof memory.profile === 'object' ? memory.profile : {};
    return { agent: id, label: versionLabel(version), profile: sanitizeProfile({ ...source, version, plan: memory.plan }, opponentBaseline(id)) };
  }

  const member = (id: string, name: string, agent: typeof strategist, active: () => boolean): LeagueMember => ({
    id, name, active, start: agent.start, snapshots: agent.leagueSnapshots, trialArms: agent.leagueTrialArms, concludeTrial: agent.concludeLeagueTrial,
  });
  const league = createLeague({
    root: resolve(cwd, 'ai-agents/league'),
    members: [
      member('strat-g', 'Strat-G', strategist, () => stratGActive(settings.read())),
      member('t-5', 'T-5', t5, () => t5Active(settings.read())),
      member('dv-8', 'DV-8', dv8, () => dv8Active(settings.read())),
      member('vp-dog', 'VP-Dog', vpDog, () => vpDogActive(settings.read())),
    ],
    harness: loadSelfPlay,
    document: readDocument,
    settings: () => settings.read().league,
    publish: evidence => bus.publish(evidence),
    log: message => log(`league ${message}`),
  });

  const ecoRoot = resolve(cwd, 'ai-agents/eco-strat');
  const eco = createEcoStrat({
    root: ecoRoot, projectRoot: cwd, stratGRoot,
    apiKey: env.ECO_STRAT_DISABLE_MODEL ? undefined : env.OPENAI_API_KEY,
    models: env.ECO_STRAT_MODEL?.split(',').map(model => model.trim()).filter(Boolean),
    loadFacts: async () => {
      const module = await options.loadModule('/packages/engine/src/ai/systemFacts.ts') as { systemFacts: (document: ContentDocument) => object };
      return module.systemFacts(await readDocument());
    },
    settings: () => { const s = settings.read(); return { active: ecoStratActive(s), observeHumanGames: s.ecoStrat.observeHumanGames, continuous: s.ecoStrat.continuous, reportEvery: s.ecoStrat.reportEvery, baselineGames: s.ecoStrat.baselineGames }; },
  });
  bus.subscribe(evidence => eco.observe(evidence));
  // Hosted games reach Eco-Strat too, when the studio knows where the server is and holds its admin token.
  const online = env.OUROBOROS_EVIDENCE_URL && env.OUROBOROS_ADMIN_TOKEN
    ? createOnlineEvidence({ url: env.OUROBOROS_EVIDENCE_URL, adminToken: env.OUROBOROS_ADMIN_TOKEN, cursorFile: resolve(cwd, 'ai-agents/online-evidence.json'), publish: evidence => bus.publish(evidence), log: message => log(`online evidence ${message}`) })
    : null;

  type CohortState = { running: boolean; kind: 'baseline' | 'evaluation' | null; phase: 'studying' | 'researching' | 'playing' | null; seedBase: number | null; cohortId: string | null; valid: number; invalid: number; target: number; error: string | null; stop: boolean };
  let cohort: CohortState = { running: false, kind: null, phase: null, seedBase: null, cohortId: null, valid: 0, invalid: 0, target: 0, error: null, stop: false };

  /** Strat-G's current profile, read without touching Strat-G: its live snapshot if online, else its saved memory. */
  async function stratGProfile(): Promise<{ profile: StrategyProfile; version: number; mode: string; plan: string }> {
    if (strategist.status().state === 'online') {
      const memory = strategist.snapshot();
      return { profile: structuredClone(memory.profile), version: memory.version, mode: memory.mode, plan: memory.plan };
    }
    try {
      const saved = JSON.parse(await readFile(resolve(stratGRoot, 'memory.json'), 'utf8')) as { profile?: unknown; version?: number; mode?: string; plan?: string };
      return { profile: sanitizeProfile(saved.profile), version: saved.version ?? 0, mode: saved.mode ?? 'heuristic', plan: saved.plan ?? '' };
    } catch { return { profile: { ...DEFAULT_STRATEGY }, version: 0, mode: 'default', plan: DEFAULT_STRATEGY.plan }; }
  }

  async function runEvaluationCohort(kind: 'baseline' | 'evaluation') {
    const target = settings.read().ecoStrat.baselineGames;
    // Baselines replay the same seeds on every build so builds compare like for like; extra games use fresh seeds.
    const seedBase = kind === 'baseline' ? 1001 : 10_000 + Math.floor(Math.random() * 900_000);
    cohort = { running: true, kind, phase: null, seedBase, cohortId: null, valid: 0, invalid: 0, target, error: null, stop: false };
    try {
      if (!eco.hasStudied()) { cohort.phase = 'studying'; await eco.study(); }
      if (!eco.hasResearched()) { cohort.phase = 'researching'; await eco.research(); }
      if (cohort.stop) return;
      cohort.phase = 'playing';
      await runCohort({
        kind, target, eco,
        harness: () => options.loadModule('/packages/engine/src/ai/selfPlay.ts') as unknown as Promise<SelfPlayHarness>,
        document: readDocument, stratG: await stratGProfile(), seedBase, log: message => log(`Eco-Strat cohort ${message}`),
        shouldStop: () => cohort.stop || !ecoStratActive(settings.read()),
        onProgress: state => { cohort = { ...cohort, ...state }; },
      });
    } catch (error) {
      cohort.error = error instanceof Error ? error.message : String(error);
      log(`cohort failed (gameplay unaffected): ${cohort.error}`);
    } finally { cohort.running = false; cohort.phase = null; }
  }

  let mentoring: { running: boolean; error: string | null; store: MentoringStore | null } = { running: false, error: null, store: null };
  void mentoringStore.read().then(store => { mentoring.store = store; }).catch(() => undefined);

  /** VP-Dog and DV-8 share their top tips; T-5 gets all of them and Strat-G each mentor's top two, folded into their baselines. */
  async function runMentoring() {
    mentoring = { ...mentoring, running: true, error: null };
    try {
      const [vp, dv] = [await vpDog.shareTips(TIPS_PER_MENTOR), await dv8.shareTips(TIPS_PER_MENTOR)];
      await Promise.all([t5.start(), strategist.start()]);
      const store = handOff(
        { 'vp-dog': { name: VP_DOG.name, ...vp }, 'dv-8': { name: DV_8.name, ...dv } },
        { 't-5': { profile: t5.memory().profile, envelope: T_5.envelope }, 'strat-g': { profile: strategist.memory().profile, envelope: STRAT_G.envelope } },
      );
      await mentoringStore.write(store);
      mentoring.store = store;
      await Promise.all([t5.reboot(), strategist.reboot()]);
      log(`mentoring: T-5 took ${store.recipients['t-5'].tips.length} tips, Strat-G ${store.recipients['strat-g'].tips.length}`);
    } catch (error) {
      mentoring.error = error instanceof Error ? error.message : String(error);
      log(`mentoring failed (gameplay unaffected): ${mentoring.error}`);
    } finally { mentoring.running = false; }
  }

  let coaching: { running: boolean; error: string | null; store: CoachingStore | null } = { running: false, error: null, store: null };
  void coachingStore.read().then(store => { coaching.store = store; }).catch(() => undefined);

  /** Strat-G plays MIRROR_SHARE closer to T-5's, DV-8's and VP-Dog's current best, folded into its baseline. */
  async function runCoaching() {
    coaching = { ...coaching, running: true, error: null };
    try {
      await Promise.all([strategist.start(), t5.start(), dv8.start(), vpDog.start()]);
      const competitors = ([[T_5, t5], [DV_8, dv8], [VP_DOG, vpDog]] as const).map(([identity, agent]) => ({ id: identity.id, name: identity.name, version: versionLabel(agent.memory().version), profile: agent.memory().profile }));
      const store = coach(withoutCoaching(strategist.memory().profile, await coachingStore.read()), competitors, STRAT_G.envelope);
      await coachingStore.write(store);
      coaching.store = store;
      await strategist.reboot();
      log(`coaching: ${store.lines[0]}`);
    } catch (error) {
      coaching.error = error instanceof Error ? error.message : String(error);
      log(`coaching failed (gameplay unaffected): ${coaching.error}`);
    } finally { coaching.running = false; }
  }

  function start() {
    const current = settings.read();
    if (stratGActive(current)) void strategist.start();
    if (t5Active(current)) void t5.start();
    if (dv8Active(current)) void dv8.start();
    if (vpDogActive(current)) void vpDog.start();
    if (ecoStratActive(current)) void eco.load().catch(error => log(`Eco-Strat failed to load its journal (gameplay unaffected): ${error instanceof Error ? error.message : String(error)}`));
    if (ecoStratActive(current)) online?.start();
  }

  function status() {
    const current = settings.read();
    const rel = (path: string) => relative(cwd, path);
    return {
      settings: current,
      effective: { stratG: stratGActive(current), t5: t5Active(current), dv8: dv8Active(current), vpDog: vpDogActive(current), ecoStrat: ecoStratActive(current) },
      settingsFile: rel(settings.file),
      stratG: { ...strategist.status(), paths: { notebook: rel(resolve(stratGRoot, 'NOTEBOOK.md')), memory: rel(resolve(stratGRoot, 'memory.json')), games: rel(resolve(stratGRoot, 'games')) } },
      t5: { ...t5.status(), paths: { notebook: rel(resolve(t5Root, 'NOTEBOOK.md')), memory: rel(resolve(t5Root, 'memory.json')) } },
      dv8: { ...dv8.status(), paths: { notebook: rel(resolve(dv8Root, 'NOTEBOOK.md')), memory: rel(resolve(dv8Root, 'memory.json')) } },
      vpDog: { ...vpDog.status(), paths: { notebook: rel(resolve(vpDogRoot, 'NOTEBOOK.md')), memory: rel(resolve(vpDogRoot, 'memory.json')) } },
      league: league.status(),
      mentoring: { running: mentoring.running, error: mentoring.error, store: mentoring.store, file: rel(mentoringStore.file) },
      coaching: { running: coaching.running, error: coaching.error, store: coaching.store, file: rel(coachingStore.file), phases: STRAT_G_PHASES },
      ecoStrat: eco.status(),
      cohort: { running: cohort.running, kind: cohort.kind, phase: cohort.phase, seedBase: cohort.seedBase, cohortId: cohort.cohortId, valid: cohort.valid, invalid: cohort.invalid, target: cohort.target, error: cohort.error },
    };
  }

  /** The agents' readable outputs, newest report first. Only these files can be read through the documents route. */
  async function documents() {
    const order = (name: string) => [name.slice(0, 10), Number(/-(\d+)\.md$/.exec(name)?.[1] ?? 0)] as const;
    const reports = (await readdir(resolve(ecoRoot, 'reports')).catch(() => [] as string[])).filter(name => /^[\w.-]+\.md$/.test(name))
      .sort((a, b) => { const [dateA, numberA] = order(a), [dateB, numberB] = order(b); return dateB.localeCompare(dateA) || numberB - numberA || b.localeCompare(a); });
    const entries = [
      { id: 'strat-g-notebook', agent: 'strat-g', title: 'Notebook', file: resolve(stratGRoot, 'NOTEBOOK.md') },
      { id: 't-5-notebook', agent: 't-5', title: 'Notebook', file: resolve(t5Root, 'NOTEBOOK.md') },
      { id: 'dv-8-notebook', agent: 'dv-8', title: 'Notebook', file: resolve(dv8Root, 'NOTEBOOK.md') },
      { id: 'vp-dog-notebook', agent: 'vp-dog', title: 'Notebook', file: resolve(vpDogRoot, 'NOTEBOOK.md') },
      { id: 'eco-strat-journal', agent: 'eco-strat', title: 'Journal', file: resolve(ecoRoot, 'JOURNAL.md') },
      ...reports.map(name => ({ id: `eco-strat-report-${name.slice(0, -3)}`, agent: 'eco-strat', title: `Report ${name.slice(0, -3)}`, file: resolve(ecoRoot, 'reports', name) })),
    ];
    const found = await Promise.all(entries.map(async entry => { try { return { ...entry, updatedAt: (await stat(entry.file)).mtime.toISOString() }; } catch { return null; } }));
    return found.filter(entry => entry !== null).map(({ file, ...entry }) => ({ ...entry, path: relative(cwd, file), file }));
  }

  const reply = (response: ServerResponse, code: number, value: unknown) => {
    response.statusCode = code;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(JSON.stringify(value));
  };
  async function body(request: IncomingMessage) {
    const chunks: Uint8Array[] = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 64 * 1024) throw Object.assign(new Error('Body too large.'), { status: 413 }); chunks.push(chunk); }
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  }

  const middleware = async (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => {
    const path = (request.url ?? '').split('?')[0];
    if (!path.startsWith('/api/agents')) return next();
    if (!isLocalRequest(request)) { reply(response, 403, { error: 'Agent controls are available only from this local app.' }); return; }
    try {
      if (path === '/api/agents/status' && request.method === 'GET') { reply(response, 200, status()); return; }
      if (path === '/api/agents/documents' && request.method === 'GET') { reply(response, 200, (await documents()).map(({ file: _file, ...entry }) => entry)); return; }
      const documentId = /^\/api\/agents\/documents\/([\w.-]+)$/.exec(path)?.[1];
      if (documentId && request.method === 'GET') {
        const entry = (await documents()).find(item => item.id === documentId);
        if (!entry) { reply(response, 404, { error: 'That agent document does not exist yet.' }); return; }
        const { file, ...meta } = entry;
        reply(response, 200, { ...meta, markdown: await readFile(file, 'utf8') }); return;
      }
      if (path === '/api/agents/publishable' && request.method === 'GET') {
        const best = await publishable(new URLSearchParams((request.url ?? '').split('?')[1] ?? '').get('agent') ?? '');
        if (!best) { reply(response, 404, { error: 'Only Strat-G, T-5, DV-8 and VP-Dog can be published as opponents.' }); return; }
        reply(response, 200, best); return;
      }
      if (path === '/api/agents/settings' && request.method === 'PUT') {
        settings.write(await body(request));
        start();
        reply(response, 200, status()); return;
      }
      const leagueAction = /^\/api\/agents\/league\/(run|stop)$/.exec(path)?.[1];
      if (leagueAction && request.method === 'POST') {
        if (leagueAction === 'stop') { league.stop(); reply(response, 202, status()); return; }
        if (!settings.read().agentsEnabled) { reply(response, 409, { error: 'AI agents are switched off.' }); return; }
        if (cohort.running) { reply(response, 409, { error: 'Wait for the Eco-Strat run to finish.' }); return; }
        if (mentoring.running || coaching.running) { reply(response, 409, { error: 'Wait for the mentoring or coaching hand-off to finish.' }); return; }
        const started = league.run();
        if (!started.ok) { reply(response, 409, { error: started.reason }); return; }
        reply(response, 202, status()); return;
      }
      if (path === '/api/agents/mentoring/ask' && request.method === 'POST') {
        const current = settings.read();
        if (!current.agentsEnabled) { reply(response, 409, { error: 'AI agents are switched off.' }); return; }
        if (!vpDogActive(current) || !dv8Active(current) || !t5Active(current) || !stratGActive(current)) { reply(response, 409, { error: 'Mentoring needs VP-Dog, DV-8, T-5 and Strat-G switched on.' }); return; }
        if (mentoring.running) { reply(response, 409, { error: 'Mentoring is already running.' }); return; }
        if (league.running()) { reply(response, 409, { error: 'Wait for the league run to finish.' }); return; }
        if (cohort.running) { reply(response, 409, { error: 'Wait for the Eco-Strat run to finish.' }); return; }
        void runMentoring();
        reply(response, 202, status()); return;
      }
      if (path === '/api/agents/coaching/apply' && request.method === 'POST') {
        const current = settings.read();
        if (!current.agentsEnabled) { reply(response, 409, { error: 'AI agents are switched off.' }); return; }
        if (!stratGActive(current) || !t5Active(current) || !dv8Active(current) || !vpDogActive(current)) { reply(response, 409, { error: 'Coaching needs Strat-G, T-5, DV-8 and VP-Dog switched on.' }); return; }
        if (coaching.running || mentoring.running) { reply(response, 409, { error: 'Wait for the current hand-off to finish.' }); return; }
        if (league.running()) { reply(response, 409, { error: 'Wait for the league run to finish.' }); return; }
        if (cohort.running) { reply(response, 409, { error: 'Wait for the Eco-Strat run to finish.' }); return; }
        void runCoaching();
        reply(response, 202, status()); return;
      }
      const action = /^\/api\/agents\/eco-strat\/(study|research|baseline|evaluate|report|archive|stop)$/.exec(path)?.[1];
      if (action && request.method === 'POST') {
        if (action === 'stop') { cohort.stop = true; reply(response, 202, status()); return; }
        if (!ecoStratActive(settings.read())) { reply(response, 409, { error: 'Eco-Strat is switched off.' }); return; }
        if (cohort.running && action !== 'report') { reply(response, 409, { error: 'An evaluation cohort is running.' }); return; }
        if ((action === 'baseline' || action === 'evaluate') && league.running()) { reply(response, 409, { error: 'Wait for the league run to finish.' }); return; }
        if (action === 'evaluate' && eco.status().baseline.status !== 'complete') { reply(response, 409, { error: 'Run the baseline for this build first.' }); return; }
        const task = action === 'study' ? eco.study() : action === 'research' ? eco.research() : action === 'report' ? eco.report('manual') : action === 'archive' ? eco.archive() : runEvaluationCohort(action === 'evaluate' ? 'evaluation' : 'baseline');
        void Promise.resolve(task).catch(error => log(`Eco-Strat ${action} failed (gameplay unaffected): ${error instanceof Error ? error.message : String(error)}`));
        reply(response, 202, status()); return;
      }
      reply(response, 404, { error: 'Unknown agents route.' });
    } catch (error) {
      reply(response, (error as { status?: number }).status ?? 500, { error: error instanceof Error ? error.message : 'Agents error.' });
    }
  };

  return { start, status, middlewares: [strategist.middleware, t5.middleware, dv8.middleware, vpDog.middleware, middleware], strategist, t5, dv8, vpDog, league, eco, settings, runEvaluationCohort, runMentoring, runCoaching, coachingState: () => ({ ...coaching }), mentoringState: () => ({ ...mentoring }), cohortState: () => ({ ...cohort }) };
}
