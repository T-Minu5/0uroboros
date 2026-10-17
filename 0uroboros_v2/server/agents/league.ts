import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ELO_START, expectedScore, kFactor, eloUpdate } from '@0uroboros/engine/elo';
import type { SelfPlayResult } from '@0uroboros/engine/ai/selfPlay';
import type { StrategyProfile } from '@0uroboros/engine/ai/strategy';
import type { LeagueArms, LeagueOutcome, Snapshot } from '../aiStrategist';
import type { GameEvidence } from './evidence';

/**
 * The AI league: a neutral referee for adversarial self-play between Strat-G, T-5, DV-8 and VP-Dog, following the
 * self-play practice of ML-Agents / the Hugging Face Deep RL course:
 * - one agent learns at a time while the others are frozen snapshots ("team change");
 * - opponents come from a pool of each agent's last `WINDOW` snapshots; with probability `LATEST_RATIO` the
 *   learner faces another agent's latest snapshot, otherwise any past one (its own older selves included),
 *   which keeps it from overfitting to one current opponent;
 * - an opponent stays fixed for a block of seeds ("swap steps") so a trial measures something stable;
 * - progress is tracked with Elo ratings rather than raw win rates;
 * - agents far below the leader take a second trial each round, so the trailing styles get more chances to learn.
 *
 * Only the referee holds frozen profiles, to run games. Agents receive labels and results back, never an
 * opponent's profile, plan or notes, and nothing an agent writes is shared with another.
 */

export const WINDOW = 5;
export const LATEST_RATIO = 0.5;
export const BLOCKS_PER_TRIAL = 3;
/** Let the event loop answer /api/agents/status during long rating blocks. */
export const YIELD_EVERY = 8;

// The Elo maths lives in the engine so the game server rates online players the same way (see packages/engine/src/elo.ts).
export { ELO_START, expectedScore, kFactor, eloUpdate };

export type PoolEntry = { agent: string; label: string; profile: StrategyProfile };
/** Picks the next opponent for `learner`, whose current snapshot is `learnerLabel`. */
export function sampleOpponent(learner: string, learnerLabel: string, pools: Record<string, readonly Snapshot[]>, random: () => number = Math.random, window = WINDOW, latestRatio = LATEST_RATIO): PoolEntry | null {
  const pick = <T>(items: T[]) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const entry = (agent: string, snapshot: Snapshot): PoolEntry => ({ agent, label: snapshot.label, profile: snapshot.profile });
  const latest = Object.entries(pools).filter(([agent, snapshots]) => agent !== learner && snapshots.length).map(([agent, snapshots]) => entry(agent, snapshots.at(-1)!));
  const past = Object.entries(pools).flatMap(([agent, snapshots]) => snapshots.slice(-window).map(snapshot => entry(agent, snapshot))).filter(item => item.label !== learnerLabel);
  if (latest.length && (!past.length || random() < latestRatio)) return pick(latest);
  if (past.length) return pick(past);
  const own = pools[learner]?.at(-1);
  return own ? entry(learner, own) : null;
}

export type LeagueMember = {
  id: string; name: string;
  active: () => boolean;
  /** True once the agent has finished booting successfully. */
  online: () => boolean;
  start: () => Promise<void>;
  snapshots: () => readonly Snapshot[];
  trialArms: () => Promise<{ ok: true; arms: LeagueArms } | { ok: false; reason: string }>;
  concludeTrial: (experimentId: string, outcome: LeagueOutcome) => Promise<string>;
};
type Harness = {
  compileForSelfPlay: (document: never) => unknown;
  playSelfPlayGame: (options: { content: never; seed: number; strategy: StrategyProfile; seatStrategies?: [StrategyProfile, StrategyProfile]; recordDecisions?: boolean }) => SelfPlayResult;
};
export type LeagueSettings = { rounds: number; seedsPerBlock: number; ecoObserves: boolean };
export type LeagueOptions = {
  /** `ai-agents/league`: ratings and results only, never profiles. */
  root: string;
  members: LeagueMember[];
  harness: () => Promise<Harness>;
  document: () => Promise<unknown>;
  settings: () => LeagueSettings;
  /** Eco-Strat's evidence bus; rating games go out as frozen copies. */
  publish?: (evidence: GameEvidence) => void;
  log?: (message: string) => void;
  random?: () => number;
  blocksPerTrial?: number;
  /** When false, boot does not auto-resume an incomplete checkpoint (tests). Default true. */
  autoResume?: boolean;
};

/** `since` is when the snapshot was first rated; it, not the label, orders an agent's snapshots. */
type Rating = { agent: string; elo: number; games: number; wins: number; losses: number; ties: number; since?: string };
type HeadToHead = { a: string; b: string; aWins: number; bWins: number; ties: number };
type RunEntry = {
  startedAt: string; finishedAt: string; rounds: number; games: number; stopped: boolean;
  /** Process died or the server restarted before the run finished. */
  interrupted?: boolean;
  trialsSkipped?: number; playErrors?: number;
  trials: { agent: string; experimentId: string; result: string }[];
};
/** Persisted mid-run so a Vite/Node restart can continue from the same seed sequence. */
export type ActiveRun = {
  startedAt: string;
  settings: LeagueSettings;
  memberIds: string[];
  round: number;
  phase: 'rating' | 'trial';
  /** Pair keys already rated this round: sorted agent ids joined by `|`. */
  ratedPairs: string[];
  /** Learner slot keys finished this round (`id#slotIndex`). */
  finishedLearners: string[];
  games: number;
  total: number;
  trialsSkipped: number;
  playErrors: number;
  trials: RunEntry['trials'];
  nextSeed: number;
};
type Store = { schema: 1; ratings: Record<string, Rating>; headToHead: Record<string, HeadToHead>; nextSeed: number; games: number; runs: RunEntry[]; activeRun?: ActiveRun | null };

export type LeagueStatus = {
  running: boolean; stopping: boolean; resuming: boolean; phase: 'rating' | 'trial' | null; round: number; rounds: number; learner: string | null;
  games: number; total: number; trialsSkipped: number; playErrors: number; startedAt: string | null; error: string | null;
  table: { agent: string; label: string | null; elo: number | null; games: number; wins: number; losses: number; ties: number }[];
  headToHead: HeadToHead[];
  lastRun: RunEntry | null;
  window: number; latestRatio: number; blocksPerTrial: number; ratedSnapshots: number;
  catchUpGap: number; catchUp: string[];
};

const now = () => new Date().toISOString();
const tick = () => new Promise<void>(done => setImmediate(done));
const round1 = (value: number) => Math.round(value * 10) / 10;
const emptyStore = (): Store => ({ schema: 1, ratings: {}, headToHead: {}, nextSeed: 50_000, games: 0, runs: [], activeRun: null });
const pairKey = (a: string, b: string) => [a, b].sort().join('|');
const emptyOutcome = (): LeagueOutcome => ({ opponents: [], seeds: [], games: 0, invalid: 0, pairs: 0, experimentPoints: 0, controlPoints: 0, experimentWins: 0, controlWins: 0, ties: 0, marginGain: 0 });

/** Games in one run: a rating round-robin plus one paired trial (both arms, both seats) per learner, every round, and one more per catch-up learner. */
export function leagueGameCount(members: number, settings: Pick<LeagueSettings, 'rounds' | 'seedsPerBlock'>, blocksPerTrial = BLOCKS_PER_TRIAL, catchUp = 0) {
  const pairs = members * (members - 1) / 2;
  return settings.rounds * (pairs * settings.seedsPerBlock * 2 + (members + catchUp) * blocksPerTrial * settings.seedsPerBlock * 4);
}

export function trialGamesPerLearner(settings: Pick<LeagueSettings, 'seedsPerBlock'>, blocksPerTrial = BLOCKS_PER_TRIAL) {
  return blocksPerTrial * settings.seedsPerBlock * 4;
}

/** Agents at least this far below the leader get a second trial each round, so the trailing styles learn faster. */
export const CATCH_UP_GAP = 150;
export function catchUpAgents(ratings: readonly { agent: string; elo: number | null }[], gap = CATCH_UP_GAP): string[] {
  const rated = ratings.filter((entry): entry is { agent: string; elo: number } => entry.elo !== null);
  if (rated.length < 2) return [];
  const leader = Math.max(...rated.map(entry => entry.elo));
  return rated.filter(entry => leader - entry.elo >= gap).map(entry => entry.agent);
}

export function createLeague(options: LeagueOptions) {
  const file = join(options.root, 'ratings.json');
  const log = options.log ?? ((message: string) => console.log(`[league] ${message}`));
  const random = options.random ?? Math.random;
  const blocksPerTrial = options.blocksPerTrial ?? BLOCKS_PER_TRIAL;
  let store: Store = emptyStore();
  let loaded = false;
  let state = {
    running: false, stop: false, resuming: false, phase: null as LeagueStatus['phase'], round: 0, rounds: 0, learner: null as string | null,
    games: 0, total: 0, trialsSkipped: 0, playErrors: 0, startedAt: null as string | null, error: null as string | null,
  };
  let done: Promise<void> = Promise.resolve();

  async function load() {
    if (loaded) return;
    try {
      const saved = JSON.parse(await readFile(file, 'utf8')) as Store;
      if (saved?.schema === 1) store = { ...emptyStore(), ...saved, activeRun: saved.activeRun ?? null };
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    loaded = true;
  }
  async function save() {
    await mkdir(options.root, { recursive: true });
    const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    await rename(temp, file);
  }

  function writeCheckpoint(checkpoint: ActiveRun) {
    store.activeRun = checkpoint;
    store.nextSeed = checkpoint.nextSeed;
  }

  async function persistCheckpoint(checkpoint: ActiveRun) {
    writeCheckpoint(checkpoint);
    await save();
  }

  /** The agent's most recently rated snapshot. */
  function latestRating(agent: string): Rating | undefined {
    return Object.values(store.ratings).filter(item => item.agent === agent).sort((a, b) => (a.since ?? '').localeCompare(b.since ?? '')).at(-1);
  }
  /** A new snapshot inherits its agent's latest rating (else 1200), so adoption does not reset progress. */
  function rating(label: string, agent: string): Rating {
    const existing = store.ratings[label];
    if (existing) return existing;
    return (store.ratings[label] = { agent, elo: latestRating(agent)?.elo ?? ELO_START, games: 0, wins: 0, losses: 0, ties: 0, since: now() });
  }
  function rate(a: PoolEntry, b: PoolEntry, scoreA: number) {
    if (a.label === b.label) return;
    const ra = rating(a.label, a.agent), rb = rating(b.label, b.agent);
    const [ea, eb] = eloUpdate(ra.elo, rb.elo, scoreA, kFactor(ra.games), kFactor(rb.games));
    ra.elo = round1(ea); rb.elo = round1(eb); ra.games++; rb.games++;
    if (scoreA === 1) { ra.wins++; rb.losses++; } else if (scoreA === 0) { ra.losses++; rb.wins++; } else { ra.ties++; rb.ties++; }
    store.games++;
    if (a.agent === b.agent) return;
    const [first, second, firstScore] = a.agent < b.agent ? [a.agent, b.agent, scoreA] : [b.agent, a.agent, 1 - scoreA];
    const record = store.headToHead[`${first}|${second}`] ??= { a: first, b: second, aWins: 0, bWins: 0, ties: 0 };
    if (firstScore === 1) record.aWins++; else if (firstScore === 0) record.bWins++; else record.ties++;
  }

  const scoreFor = (result: SelfPlayResult, seat: 0 | 1) => result.report!.winner === seat ? 1 : result.report!.winner === null ? 0.5 : 0;
  const marginFor = (result: SelfPlayResult, seat: 0 | 1) => {
    const report = result.report!, other = (1 - seat) as 0 | 1;
    return report.finalVP[seat] - report.finalVP[other] + (report.servers[seat] - report.servers[other]) / 250;
  };

  async function loop(members: LeagueMember[], settings: LeagueSettings, resume: ActiveRun | null) {
    const run: RunEntry = {
      startedAt: resume?.startedAt ?? now(), finishedAt: '', rounds: resume?.round ?? 0, games: resume?.games ?? 0, stopped: false,
      trialsSkipped: resume?.trialsSkipped ?? 0, playErrors: resume?.playErrors ?? 0, trials: [...(resume?.trials ?? [])],
    };
    let checkpoint: ActiveRun = resume ?? {
      startedAt: run.startedAt, settings, memberIds: members.map(m => m.id), round: 1, phase: 'rating',
      ratedPairs: [], finishedLearners: [], games: 0, total: state.total, trialsSkipped: 0, playErrors: 0, trials: [], nextSeed: store.nextSeed,
    };
    if (resume) store.nextSeed = resume.nextSeed;
    try {
      await load();
      await Promise.all(members.map(member => member.start()));
      const offline = members.filter(member => !member.online());
      if (offline.length) {
        state.error = `League cannot start until every agent is online (${offline.map(m => m.name).join(', ')}).`;
        log(state.error);
        return;
      }
      const harness = await options.harness();
      const content = harness.compileForSelfPlay(await options.document() as never);
      const play = async (seed: number, seats: [StrategyProfile, StrategyProfile]): Promise<SelfPlayResult> => {
        await tick();
        try {
          const result = harness.playSelfPlayGame({ content: content as never, seed, strategy: seats[0], seatStrategies: seats, recordDecisions: false });
          state.games++; run.games++; checkpoint.games = state.games;
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          state.playErrors++; run.playErrors = (run.playErrors ?? 0) + 1; checkpoint.playErrors = state.playErrors;
          state.error = message;
          log(`play failed (continuing): ${message}`);
          state.games++; run.games++; checkpoint.games = state.games;
          return { seed, valid: false, invalidReason: message, report: null, durationMs: 0 };
        }
      };
      const stopped = () => state.stop;
      const latestOf = (member: LeagueMember): PoolEntry | null => {
        const snapshot = member.snapshots().at(-1);
        return snapshot ? { agent: member.id, label: snapshot.label, profile: snapshot.profile } : null;
      };
      const syncCheckpoint = async () => {
        checkpoint = {
          ...checkpoint,
          round: state.round, phase: state.phase ?? checkpoint.phase, games: state.games, total: state.total,
          trialsSkipped: state.trialsSkipped, playErrors: state.playErrors, trials: [...run.trials], nextSeed: store.nextSeed,
        };
        await persistCheckpoint(checkpoint);
      };

      const startRound = resume?.round ?? 1;
      for (let round = startRound; round <= settings.rounds && !stopped(); round++) {
        state.round = round; run.rounds = round;
        const resumingThisRound = !!resume && round === startRound;
        const resumePhase = resume?.phase;
        if (!resumingThisRound || resumePhase === 'rating') {
          state.phase = 'rating'; state.learner = null;
          if (!resumingThisRound || resumePhase !== 'rating') {
            checkpoint.ratedPairs = [];
            checkpoint.finishedLearners = [];
          }
          checkpoint.phase = 'rating'; checkpoint.round = round;
          const latest = members.map(latestOf).filter(entry => !!entry) as PoolEntry[];
          for (let i = 0; i < latest.length && !stopped(); i++) for (let j = i + 1; j < latest.length && !stopped(); j++) {
            const [a, b] = [latest[i], latest[j]];
            const key = pairKey(a.agent, b.agent);
            if (checkpoint.ratedPairs.includes(key)) continue;
            let shared = false;
            for (const seed of Array.from({ length: settings.seedsPerBlock }, () => store.nextSeed++)) for (const seat of [0, 1] as const) {
              if (stopped()) break;
              const result = await play(seed, seat === 0 ? [a.profile, b.profile] : [b.profile, a.profile]);
              if (!result.valid || !result.report) continue;
              rate(a, b, scoreFor(result, seat));
              if (settings.ecoObserves && !shared && options.publish) {
                shared = true;
                try {
                  options.publish({ id: `league-${a.label}-vs-${b.label}-s${seed}`.replace(/[^\w.@-]/g, '-'), source: 'league', recordedAt: now(), seed, durationMs: result.durationMs, valid: true, report: result.report, stratG: null, seats: seat === 0 ? [a.agent, b.agent] : [b.agent, a.agent] });
                } catch (error) { log(`publishing a league game failed (ignored): ${error instanceof Error ? error.message : String(error)}`); }
              }
            }
            if (!stopped()) {
              checkpoint.ratedPairs = [...checkpoint.ratedPairs, key];
              await syncCheckpoint();
            }
          }
        }

        if (stopped()) break;
        state.phase = 'trial';
        checkpoint.phase = 'trial';
        // Rotate who learns first each round; everyone else stays frozen during a trial.
        const order = members.map((_, index) => members[(index + round - 1) % members.length]);
        const behind = catchUpAgents(members.map(member => ({ agent: member.id, elo: memberElo(member) })));
        if (behind.length) log(`catch-up trials this round: ${behind.join(', ')}`);
        const slots = [...order, ...order.filter(member => behind.includes(member.id))];
        for (let slot = 0; slot < slots.length; slot++) {
          if (stopped()) break;
          const learner = slots[slot];
          const slotKey = `${learner.id}#${slot}`;
          if (checkpoint.finishedLearners.includes(slotKey)) continue;
          state.learner = learner.name;
          const asked = await learner.trialArms();
          if (!asked.ok) {
            log(`${learner.name} skipped its trial: ${asked.reason}`);
            state.trialsSkipped++;
            run.trialsSkipped = state.trialsSkipped;
            const planned = trialGamesPerLearner(settings, blocksPerTrial);
            state.total = Math.max(state.games, state.total - planned);
            checkpoint.finishedLearners = [...checkpoint.finishedLearners, slotKey];
            checkpoint.trialsSkipped = state.trialsSkipped;
            checkpoint.total = state.total;
            await syncCheckpoint();
            continue;
          }
          const { arms } = asked;
          const pools = Object.fromEntries(members.map(member => [member.id, member.snapshots()]));
          const outcome = emptyOutcome();
          const control: PoolEntry = { agent: learner.id, label: arms.label, profile: arms.control };
          let gain = 0;
          for (let block = 0; block < blocksPerTrial && !stopped(); block++) {
            const opponent = sampleOpponent(learner.id, arms.label, pools, random);
            if (!opponent) break;
            outcome.opponents.push(opponent.label);
            for (const seed of Array.from({ length: settings.seedsPerBlock }, () => store.nextSeed++)) {
              outcome.seeds.push(seed);
              for (const seat of [0, 1] as const) {
                if (stopped()) break;
                const seats = (mine: StrategyProfile): [StrategyProfile, StrategyProfile] => seat === 0 ? [mine, opponent.profile] : [opponent.profile, mine];
                const base = await play(seed, seats(arms.control));
                const trial = await play(seed, seats(arms.experiment));
                outcome.games += 2;
                if (base.valid && base.report) rate(control, opponent, scoreFor(base, seat));
                if (!base.valid || !base.report || !trial.valid || !trial.report) { outcome.invalid += Number(!base.valid || !base.report) + Number(!trial.valid || !trial.report); continue; }
                const [b, t] = [scoreFor(base, seat), scoreFor(trial, seat)];
                outcome.pairs++; outcome.controlPoints += b; outcome.experimentPoints += t;
                if (t === 1) outcome.experimentWins++; if (b === 1) outcome.controlWins++; if (t === 0.5) outcome.ties++;
                gain += marginFor(trial, seat) - marginFor(base, seat);
              }
            }
          }
          if (stopped()) {
            outcome.marginGain = outcome.pairs ? round1(gain / outcome.pairs) : 0;
            outcome.opponents = [...new Set(outcome.opponents)];
            const result = await learner.concludeTrial(arms.experimentId, outcome);
            run.trials.push({ agent: learner.id, experimentId: arms.experimentId, result });
            log(`stopped during ${learner.name}'s trial; concluded as inconclusive / partial`);
            checkpoint.finishedLearners = [...checkpoint.finishedLearners, slotKey];
            await syncCheckpoint();
            break;
          }
          outcome.marginGain = outcome.pairs ? round1(gain / outcome.pairs) : 0;
          outcome.opponents = [...new Set(outcome.opponents)];
          const result = await learner.concludeTrial(arms.experimentId, outcome);
          run.trials.push({ agent: learner.id, experimentId: arms.experimentId, result });
          checkpoint.finishedLearners = [...checkpoint.finishedLearners, slotKey];
          await syncCheckpoint();
        }
        resume = null;
      }
      run.stopped = stopped();
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      log(`league run failed (gameplay unaffected): ${state.error}`);
    } finally {
      run.finishedAt = now();
      run.trialsSkipped = state.trialsSkipped;
      run.playErrors = state.playErrors;
      store.runs = [...store.runs, run].slice(-20);
      store.activeRun = null;
      await save().catch(() => undefined);
      state = { ...state, running: false, stop: false, resuming: false, phase: null, learner: null };
    }
  }

  function begin(members: LeagueMember[], settings: LeagueSettings, resume: ActiveRun | null, resuming: boolean) {
    const behind = catchUpAgents(members.map(member => ({ agent: member.id, elo: memberElo(member) }))).length;
    const total = resume?.total ?? leagueGameCount(members.length, settings, blocksPerTrial, behind);
    state = {
      running: true, stop: false, resuming, phase: resume?.phase ?? null, round: resume?.round ?? 0, rounds: settings.rounds, learner: null,
      games: resume?.games ?? 0, total, trialsSkipped: resume?.trialsSkipped ?? 0, playErrors: resume?.playErrors ?? 0,
      startedAt: resume?.startedAt ?? now(), error: null,
    };
    done = loop(members, settings, resume);
  }

  function run(): { ok: true } | { ok: false; reason: string } {
    if (state.running) return { ok: false, reason: 'The league is already running.' };
    const members = options.members.filter(member => member.active());
    if (members.length < 2) return { ok: false, reason: 'The league needs at least two agents switched on.' };
    const offline = members.filter(member => !member.online());
    if (offline.length) return { ok: false, reason: `League cannot start until every agent is online (${offline.map(m => m.name).join(', ')}).` };
    begin(members, options.settings(), null, false);
    return { ok: true };
  }
  function stop() { if (state.running) state.stop = true; }

  /** The rating of an agent's latest snapshot, else its newest rated one. */
  function memberElo(member: LeagueMember): number | null {
    const label = member.snapshots().at(-1)?.label ?? null;
    const rated = label ? store.ratings[label] : undefined;
    if (rated) return rated.elo;
    return latestRating(member.id)?.elo ?? null;
  }

  function status(): LeagueStatus {
    const table = options.members.map(member => {
      const label = member.snapshots().at(-1)?.label ?? null;
      // The record counts games against the other agents only, not against the agent's own past snapshots.
      let wins = 0, losses = 0, ties = 0;
      for (const record of Object.values(store.headToHead)) {
        if (record.a === member.id) { wins += record.aWins; losses += record.bWins; ties += record.ties; }
        else if (record.b === member.id) { wins += record.bWins; losses += record.aWins; ties += record.ties; }
      }
      return { agent: member.id, label, elo: memberElo(member), games: wins + losses + ties, wins, losses, ties };
    });
    return {
      running: state.running, stopping: state.running && state.stop, resuming: state.resuming, phase: state.phase, round: state.round, rounds: state.rounds, learner: state.learner,
      games: state.games, total: state.total, trialsSkipped: state.trialsSkipped, playErrors: state.playErrors, startedAt: state.startedAt, error: state.error,
      table, headToHead: Object.values(store.headToHead), lastRun: store.runs.at(-1) ?? null,
      window: WINDOW, latestRatio: LATEST_RATIO, blocksPerTrial, ratedSnapshots: Object.keys(store.ratings).length,
      catchUpGap: CATCH_UP_GAP, catchUp: catchUpAgents(table.filter(row => options.members.find(member => member.id === row.agent)?.active() ?? false)),
    };
  }

  void load().then(async () => {
    if (options.autoResume === false) return;
    const checkpoint = store.activeRun;
    if (!checkpoint || state.running) return;
    const last = store.runs.at(-1);
    if (!last?.interrupted || last.startedAt !== checkpoint.startedAt) {
      store.runs = [...store.runs, {
        startedAt: checkpoint.startedAt, finishedAt: now(), rounds: checkpoint.round, games: checkpoint.games, stopped: false, interrupted: true,
        trialsSkipped: checkpoint.trialsSkipped, playErrors: checkpoint.playErrors, trials: [...checkpoint.trials],
      }].slice(-20);
      await save().catch(() => undefined);
    }
    log(`previous run interrupted at round ${checkpoint.round} (${checkpoint.games} games); auto-resuming`);
    const members = options.members.filter(member => checkpoint.memberIds.includes(member.id) && member.active());
    if (members.length < 2) {
      store.activeRun = null;
      await save().catch(() => undefined);
      log('could not auto-resume: fewer than two active members from the checkpoint');
      return;
    }
    await Promise.all(members.map(member => member.start().catch(() => undefined)));
    const offline = members.filter(member => !member.online());
    if (offline.length) {
      log(`auto-resume waiting failed: ${offline.map(m => m.name).join(', ')} not online; checkpoint kept`);
      return;
    }
    begin(members, checkpoint.settings, checkpoint, true);
  }).catch(() => undefined);

  return { run, stop, status, idle: () => done, running: () => state.running, load };
}
