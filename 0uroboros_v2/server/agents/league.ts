import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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

export const ELO_START = 1200;
export const WINDOW = 5;
export const LATEST_RATIO = 0.5;
export const BLOCKS_PER_TRIAL = 3;
const PROVISIONAL_GAMES = 30;

export const expectedScore = (rating: number, opponent: number) => 1 / (1 + 10 ** ((opponent - rating) / 400));
/** K = 32 while a snapshot's rating is provisional (first 30 games), then 16. */
export const kFactor = (games: number) => games < PROVISIONAL_GAMES ? 32 : 16;
/** New ratings after one game; `scoreA` is 1 for a win by A, ½ for a tie, 0 for a loss. */
export function eloUpdate(ratingA: number, ratingB: number, scoreA: number, kA = 16, kB = kA): [number, number] {
  const expectedA = expectedScore(ratingA, ratingB);
  return [ratingA + kA * (scoreA - expectedA), ratingB + kB * ((1 - scoreA) - (1 - expectedA))];
}

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
};

/** `since` is when the snapshot was first rated; it, not the label, orders an agent's snapshots. */
type Rating = { agent: string; elo: number; games: number; wins: number; losses: number; ties: number; since?: string };
type HeadToHead = { a: string; b: string; aWins: number; bWins: number; ties: number };
type RunEntry = { startedAt: string; finishedAt: string; rounds: number; games: number; stopped: boolean; trials: { agent: string; experimentId: string; result: string }[] };
type Store = { schema: 1; ratings: Record<string, Rating>; headToHead: Record<string, HeadToHead>; nextSeed: number; games: number; runs: RunEntry[] };

export type LeagueStatus = {
  running: boolean; stopping: boolean; phase: 'rating' | 'trial' | null; round: number; rounds: number; learner: string | null;
  games: number; total: number; startedAt: string | null; error: string | null;
  table: { agent: string; label: string | null; elo: number | null; games: number; wins: number; losses: number; ties: number }[];
  headToHead: HeadToHead[];
  lastRun: RunEntry | null;
  window: number; latestRatio: number; blocksPerTrial: number; ratedSnapshots: number;
  catchUpGap: number; catchUp: string[];
};

const now = () => new Date().toISOString();
const tick = () => new Promise<void>(done => setImmediate(done));
const round1 = (value: number) => Math.round(value * 10) / 10;
const emptyStore = (): Store => ({ schema: 1, ratings: {}, headToHead: {}, nextSeed: 50_000, games: 0, runs: [] });

/** Games in one run: a rating round-robin plus one paired trial (both arms, both seats) per learner, every round, and one more per catch-up learner. */
export function leagueGameCount(members: number, settings: Pick<LeagueSettings, 'rounds' | 'seedsPerBlock'>, blocksPerTrial = BLOCKS_PER_TRIAL, catchUp = 0) {
  const pairs = members * (members - 1) / 2;
  return settings.rounds * (pairs * settings.seedsPerBlock * 2 + (members + catchUp) * blocksPerTrial * settings.seedsPerBlock * 4);
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
  let state = { running: false, stop: false, phase: null as LeagueStatus['phase'], round: 0, rounds: 0, learner: null as string | null, games: 0, total: 0, startedAt: null as string | null, error: null as string | null };
  let done: Promise<void> = Promise.resolve();

  async function load() {
    if (loaded) return;
    try {
      const saved = JSON.parse(await readFile(file, 'utf8')) as Store;
      if (saved?.schema === 1) store = { ...emptyStore(), ...saved };
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    loaded = true;
  }
  async function save() {
    await mkdir(options.root, { recursive: true });
    const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(temp, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    await rename(temp, file);
  }
  void load().catch(() => undefined);

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
  const seedsFor = (count: number) => Array.from({ length: count }, () => store.nextSeed++);

  async function loop(members: LeagueMember[], settings: LeagueSettings) {
    const run: RunEntry = { startedAt: now(), finishedAt: '', rounds: 0, games: 0, stopped: false, trials: [] };
    try {
      await load();
      await Promise.all(members.map(member => member.start()));
      const harness = await options.harness();
      const content = harness.compileForSelfPlay(await options.document() as never);
      const play = async (seed: number, seats: [StrategyProfile, StrategyProfile]) => {
        await tick();
        const result = harness.playSelfPlayGame({ content: content as never, seed, strategy: seats[0], seatStrategies: seats, recordDecisions: false });
        state.games++; run.games++;
        return result;
      };
      const stopped = () => state.stop;
      const latestOf = (member: LeagueMember): PoolEntry | null => {
        const snapshot = member.snapshots().at(-1);
        return snapshot ? { agent: member.id, label: snapshot.label, profile: snapshot.profile } : null;
      };

      for (let round = 1; round <= settings.rounds && !stopped(); round++) {
        state.round = round; run.rounds = round;
        state.phase = 'rating'; state.learner = null;
        const latest = members.map(latestOf).filter(entry => !!entry) as PoolEntry[];
        for (let i = 0; i < latest.length && !stopped(); i++) for (let j = i + 1; j < latest.length && !stopped(); j++) {
          const [a, b] = [latest[i], latest[j]];
          let shared = false;
          for (const seed of seedsFor(settings.seedsPerBlock)) for (const seat of [0, 1] as const) {
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
        }
        await save();

        state.phase = 'trial';
        // Rotate who learns first each round; everyone else stays frozen during a trial.
        const order = members.map((_, index) => members[(index + round - 1) % members.length]);
        const behind = catchUpAgents(members.map(member => ({ agent: member.id, elo: memberElo(member) })));
        if (behind.length) log(`catch-up trials this round: ${behind.join(', ')}`);
        for (const learner of [...order, ...order.filter(member => behind.includes(member.id))]) {
          if (stopped()) break;
          state.learner = learner.name;
          const asked = await learner.trialArms();
          if (!asked.ok) { log(`${learner.name} skipped its trial: ${asked.reason}`); continue; }
          const { arms } = asked;
          const pools = Object.fromEntries(members.map(member => [member.id, member.snapshots()]));
          const outcome: LeagueOutcome = { opponents: [], seeds: [], games: 0, invalid: 0, pairs: 0, experimentPoints: 0, controlPoints: 0, experimentWins: 0, controlWins: 0, ties: 0, marginGain: 0 };
          const control: PoolEntry = { agent: learner.id, label: arms.label, profile: arms.control };
          let gain = 0;
          for (let block = 0; block < blocksPerTrial && !stopped(); block++) {
            const opponent = sampleOpponent(learner.id, arms.label, pools, random);
            if (!opponent) break;
            outcome.opponents.push(opponent.label);
            for (const seed of seedsFor(settings.seedsPerBlock)) {
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
          if (stopped()) { log(`stopped during ${learner.name}'s trial; its partial results were discarded`); break; }
          outcome.marginGain = outcome.pairs ? round1(gain / outcome.pairs) : 0;
          outcome.opponents = [...new Set(outcome.opponents)];
          const result = await learner.concludeTrial(arms.experimentId, outcome);
          run.trials.push({ agent: learner.id, experimentId: arms.experimentId, result });
          await save();
        }
      }
      run.stopped = stopped();
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      log(`league run failed (gameplay unaffected): ${state.error}`);
    } finally {
      run.finishedAt = now();
      store.runs = [...store.runs, run].slice(-20);
      await save().catch(() => undefined);
      state = { ...state, running: false, stop: false, phase: null, learner: null };
    }
  }

  function run(): { ok: true } | { ok: false; reason: string } {
    if (state.running) return { ok: false, reason: 'The league is already running.' };
    const members = options.members.filter(member => member.active());
    if (members.length < 2) return { ok: false, reason: 'The league needs at least two agents switched on.' };
    const settings = options.settings();
    const behind = catchUpAgents(members.map(member => ({ agent: member.id, elo: memberElo(member) }))).length;
    state = { running: true, stop: false, phase: null, round: 0, rounds: settings.rounds, learner: null, games: 0, total: leagueGameCount(members.length, settings, blocksPerTrial, behind), startedAt: now(), error: null };
    done = loop(members, settings);
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
      running: state.running, stopping: state.running && state.stop, phase: state.phase, round: state.round, rounds: state.rounds, learner: state.learner,
      games: state.games, total: state.total, startedAt: state.startedAt, error: state.error,
      table, headToHead: Object.values(store.headToHead), lastRun: store.runs.at(-1) ?? null,
      window: WINDOW, latestRatio: LATEST_RATIO, blocksPerTrial, ratedSnapshots: Object.keys(store.ratings).length,
      catchUpGap: CATCH_UP_GAP, catchUp: catchUpAgents(table.filter(row => options.members.find(member => member.id === row.agent)?.active() ?? false)),
    };
  }

  return { run, stop, status, idle: () => done, running: () => state.running };
}
