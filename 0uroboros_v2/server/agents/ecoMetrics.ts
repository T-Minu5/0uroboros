/**
 * Deterministic economy metrics. Eco-Strat reasons over these numbers; it never computes them.
 * Pure functions over match reports: no I/O, no game code, no randomness.
 */
import type { DecisionRecord, MatchReport, PurchaseRecord } from '@0uroboros/engine/runtime';

type Pair = [number, number];
type Seat = 0 | 1;
const SEATS: Seat[] = [0, 1];
const round = (value: number, digits = 2) => Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : 0;
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const rate = (hits: number, total: number) => total ? round(hits / total) : null;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export type EndedBy = 'destruction' | 'cycle16' | 'other';
/** Final VP margins: below CLOSE_MARGIN is close, above BLOWOUT_MARGIN is a blowout; between is mid. */
export const CLOSE_MARGIN = 12;
export const BLOWOUT_MARGIN = 21;
export const isCloseMargin = (margin: number) => margin < CLOSE_MARGIN;
export const isBlowoutMargin = (margin: number) => margin > BLOWOUT_MARGIN;
/**
 * Reporting targets across a large sample (not hard rules every game must meet).
 * Destruction endings should land in 75–92%: enough decisive Server kills, but not so many
 * that Cycle-16 finishes disappear. Cycle 16 should stay at or under 25%.
 */
export const TARGET_DESTRUCTION_END_RATE_MIN = 0.75;
export const TARGET_DESTRUCTION_END_RATE_MAX = 0.92;
export const TARGET_CYCLE16_MAX_RATE = 0.25;
/**
 * Floor: share of games where **each** player destroyed ≥1 of the **other's** Servers
 * (mutual enemy kills — not “a Server died somewhere” and not a full double-kill).
 */
export const TARGET_BOTH_DESTROYED_RATE = 0.40;
/** @deprecated Prefer TARGET_DESTRUCTION_END_RATE_MIN..MAX; kept as the floor of the band. */
export const TARGET_DESTRUCTION_END_RATE = TARGET_DESTRUCTION_END_RATE_MIN;

/** Unique enemy Servers this seat destroyed (Primary / Backup). */
export const enemyServersDestroyed = (m: Pick<GameMetrics, 'destructions'>, seat: Seat) =>
  new Set(m.destructions.filter(item => item.by === seat && item.victim !== seat).map(item => item.server)).size;
/** Only for games recorded before each destruction carried its VP; matches the default Server VP of those builds. */
const UNRECORDED_DESTRUCTION_VP = { primary: 4, backup: 8 };
export type Archetype = 'economy' | 'aggression' | 'vp' | 'board' | 'balanced' | 'idle';

export type GameMetrics = {
  winner: Seat | null; endedBy: EndedBy; cycles: number; finalVP: Pair; servers: Pair; vpMargin: number;
  destructionVP: Pair; firstDestructionCycle: number | null;
  destructions: { cycle: number; victim: Seat; server: string; by: Seat; source: string; sourceId: string; vp: number }[];
  drain: Pair; restore: Pair; restoreEvents: Pair; wastedRestores: Pair;
  drainBySource: Record<string, Pair>; restoreBySource: Record<string, Pair>;
  /** Share of the damage each seat took that its own healing undid. */
  healOffset: Pair;
  economy: {
    spent: Pair; purchases: Pair; walletByCycle: Pair[]; walletLeftAtDraftEnd: Pair; cryptoGained: Pair; drawn: Pair; actionsGained: Pair; finalDeckSize: Pair;
    byCategory: [Record<string, number>, Record<string, number>]; firstChaosCycle: [number | null, number | null]; firstVpCycle: [number | null, number | null];
  };
  archetype: [Archetype, Archetype];
  locationsWon: Pair;
  locations: { id: string; name: string; winner: Seat | null }[];
  circuit: { cycle: number; rewardId: string; name: string; eligible: number[]; claimed: number[] }[];
  circuitClaims: Pair;
  /**
   * Per-cycle board state for snowball analysis. `circuitClaims` is cumulative through this Cycle;
   * `circuitDifferential` is seat0 − seat1 cumulative Circuit claims; `locationsWon` is that Cycle only.
   */
  timeline: {
    cycle: number; vp: Pair; servers: Pair; wallet: Pair; deckSize: Pair;
    locationsWon: Pair; circuitClaims: Pair; circuitDifferential: number;
  }[];
  /** Printed VP from market purchases (VP cards bought). Separates market from destruction/other VP. */
  marketVp: Pair;
  /** finalVP − destructionVP − marketVp: location/circuit/effect and starter card VP. */
  otherVp: Pair;
  /** End-of-game ScoreBreakdown when the report carries it. */
  finalScore: [{ cardVP: number; destructionVP: number; locationVP: number; circuitVP: number; effectVP: number; total: number }, { cardVP: number; destructionVP: number; locationVP: number; circuitVP: number; effectVP: number; total: number }] | null;
  vpLeadChanges: number; vpLeaderAt: Record<'4' | '8' | '12', Seat | null>; serverLeaderAt8: Seat | null;
  /** Largest VP deficit the eventual winner overcame (0 if it never trailed). */
  winnerMaxDeficit: number;
  /** First Cycle a seat held a cumulative Circuit-claim lead of 2+, or null. */
  circuitLead2At: [number | null, number | null];
  cards: { definitionId: string; name: string; cost: number; type: string; cardClass?: string; bought: Pair; plays: Pair; drain: Pair; restore: Pair; draw: Pair; crypto: Pair; vp: Pair; actions: Pair }[];
  purchaseSimilarity: number;
  ux: { failedOutcomes: Pair; randomResults: number; choices: Pair; events: number; eventsPerCycle: number };
  /** The AI player's behaviour, not the game's rules: `aiRandomPicks` are choices the AI has no strategic rule for. */
  decisions: { deploys: Pair; drafts: Pair; choices: Pair; aiRandomPicks: number; avgDeployOptions: number };
};

export function endedBy(report: MatchReport): EndedBy {
  const reason = report.endedReason ?? '';
  if (/Servers destroyed/i.test(reason)) return 'destruction';
  if (/^Cycle 16 final Draft complete/.test(reason)) return 'cycle16';
  return 'other';
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  const union = new Set([...a, ...b]);
  return union.size ? [...a].filter(item => b.has(item)).length / union.size : 1;
};

function archetypeOf(purchases: PurchaseRecord[]): Archetype {
  if (!purchases.length) return 'idle';
  const spend = (category: string) => sum(purchases.filter(item => item.category === category).map(item => Math.max(1, item.cost)));
  const total = sum(purchases.map(item => Math.max(1, item.cost)));
  const shares = { economy: spend('Crypto') / total, aggression: spend('Chaos') / total, vp: spend('VP') / total, board: spend('Base') / total };
  const [top, share] = Object.entries(shares).sort((a, b) => b[1] - a[1])[0];
  return share >= 0.45 ? top as Archetype : 'balanced';
}

export function gameMetrics(report: MatchReport): GameMetrics {
  const t = report.telemetry;
  const pair = (fn: (seat: Seat) => number): Pair => [fn(0), fn(1)];
  const ownPurchases = (seat: Seat) => report.purchases.filter(item => item.owner === seat);
  const destructions = (t?.destructions ?? []).map(item => ({ cycle: item.cycle, victim: item.victim as Seat, server: item.server, by: item.by as Seat, source: item.source, sourceId: item.sourceId, vp: item.vp ?? UNRECORDED_DESTRUCTION_VP[item.server] }));
  const destructionVP = pair(seat => sum(destructions.filter(item => item.by === seat && item.victim !== seat).map(item => item.vp)));
  const cumulativeClaims: Pair = [0, 0];
  const timeline = report.cycles.map(cycle => {
    for (const seat of SEATS) if (cycle.circuit?.claimed.includes(seat)) cumulativeClaims[seat]++;
    const circuitClaims: Pair = [cumulativeClaims[0], cumulativeClaims[1]];
    return {
      cycle: cycle.cycle, vp: cycle.vp, servers: cycle.servers, wallet: cycle.wallet, deckSize: cycle.deckSize ?? [0, 0] as Pair,
      locationsWon: cycle.locationsWon, circuitClaims, circuitDifferential: circuitClaims[0] - circuitClaims[1],
    };
  });
  const leader = (values: Pair): Seat | null => values[0] === values[1] ? null : values[0] > values[1] ? 0 : 1;
  let vpLeadChanges = 0, previous: Seat | null = null;
  for (const row of timeline) { const now = leader(row.vp); if (now !== null && previous !== null && now !== previous) vpLeadChanges++; if (now !== null) previous = now; }
  const at = (cycle: number) => timeline.find(row => row.cycle === cycle);
  const winner = report.winner as Seat | null;
  const winnerMaxDeficit = winner === null ? 0 : Math.max(0, ...timeline.map(row => row.vp[1 - winner] - row.vp[winner]));
  const circuitLead2At = pair(seat => timeline.find(row => row.circuitClaims[seat] - row.circuitClaims[1 - seat] >= 2)?.cycle ?? null);
  const marketVp = report.marketVp ?? pair(seat => sum(ownPurchases(seat).map(item => item.vp ?? 0)));
  const otherVp = pair(seat => report.finalVP[seat] - destructionVP[seat] - marketVp[seat]);
  const finalScore = report.finalScore
    ? SEATS.map(seat => {
      const score = report.finalScore![seat];
      return { cardVP: score.cardVP, destructionVP: score.destructionVP, locationVP: score.locationVP, circuitVP: score.circuitVP, effectVP: score.effectVP, total: score.total };
    }) as GameMetrics['finalScore']
    : null;
  const decisions: DecisionRecord[] = report.decisions ?? [];
  const draftEnds = decisions.filter((item): item is Extract<DecisionRecord, { kind: 'draft-end' }> => item.kind === 'draft-end');
  const deploys = decisions.filter((item): item is Extract<DecisionRecord, { kind: 'deploy' }> => item.kind === 'deploy');
  const choices = decisions.filter((item): item is Extract<DecisionRecord, { kind: 'choice' }> => item.kind === 'choice');
  const boughtBy = (seat: Seat, id: string) => ownPurchases(seat).filter(item => item.definitionId === id).length;
  const cardIds = new Set([...Object.keys(t?.cards ?? {}), ...report.purchases.map(item => item.definitionId)]);
  const cards = [...cardIds].map(id => {
    const stat = t?.cards[id];
    const purchase = report.purchases.find(item => item.definitionId === id);
    const zero: Pair = [0, 0];
    return {
      definitionId: id, name: stat?.name ?? purchase?.name ?? id, cost: stat?.cost ?? purchase?.cost ?? 0, type: stat?.type ?? purchase?.category ?? 'unknown',
      ...(stat?.cardClass ? { cardClass: stat.cardClass } : {}),
      bought: pair(seat => boughtBy(seat, id)), plays: stat?.plays ?? zero, drain: stat?.drain ?? zero, restore: stat?.restore ?? zero,
      draw: stat?.draw ?? zero, crypto: stat?.crypto ?? zero, vp: stat?.vp ?? zero, actions: stat?.actions ?? zero,
    };
  });
  const firstCycle = (seat: Seat, category: string) => ownPurchases(seat).filter(item => item.category === category).map(item => item.cycle).sort((a, b) => a - b)[0] ?? null;
  const drainTaken = (seat: Seat) => t?.drainDealt[1 - seat] ?? 0;
  const restore = t?.restoreDone ?? [0, 0];
  return {
    winner, endedBy: endedBy(report), cycles: report.cycle, finalVP: report.finalVP, servers: report.servers,
    vpMargin: Math.abs(report.finalVP[0] - report.finalVP[1]), destructionVP,
    firstDestructionCycle: destructions.length ? Math.min(...destructions.map(item => item.cycle)) : null, destructions,
    drain: t?.drainDealt ?? [0, 0], restore, restoreEvents: t?.restoreEvents ?? [0, 0], wastedRestores: t?.wastedRestores ?? [0, 0],
    drainBySource: t?.drainBySource ?? {}, restoreBySource: t?.restoreBySource ?? {},
    healOffset: pair(seat => drainTaken(seat) ? round(restore[seat] / drainTaken(seat)) : 0),
    economy: {
      spent: pair(seat => sum(ownPurchases(seat).map(item => item.cost))), purchases: pair(seat => ownPurchases(seat).length),
      walletByCycle: timeline.map(row => row.wallet),
      walletLeftAtDraftEnd: pair(seat => round(mean(draftEnds.filter(item => item.owner === seat).map(item => item.walletLeft)))),
      cryptoGained: t?.cryptoGained ?? [0, 0], drawn: t?.drawn ?? [0, 0], actionsGained: t?.actionsGained ?? [0, 0],
      finalDeckSize: pair(seat => sum(Object.values(report.decks[seat] ?? {}))),
      byCategory: SEATS.map(seat => ownPurchases(seat).reduce<Record<string, number>>((tally, item) => { tally[item.category] = (tally[item.category] ?? 0) + 1; return tally; }, {})) as [Record<string, number>, Record<string, number>],
      firstChaosCycle: [firstCycle(0, 'Chaos'), firstCycle(1, 'Chaos')], firstVpCycle: [firstCycle(0, 'VP'), firstCycle(1, 'VP')],
    },
    archetype: [archetypeOf(ownPurchases(0)), archetypeOf(ownPurchases(1))],
    locationsWon: pair(seat => sum(report.cycles.map(cycle => cycle.locationsWon[seat]))),
    locations: report.cycles.flatMap(cycle => cycle.locations.map(location => ({ id: location.id, name: location.name, winner: location.winner as Seat | null }))),
    circuit: report.cycles.filter(cycle => cycle.circuit).map(cycle => ({ cycle: cycle.cycle, rewardId: cycle.circuit!.rewardId, name: cycle.circuit!.name, eligible: [...cycle.circuit!.eligible], claimed: [...cycle.circuit!.claimed] })),
    circuitClaims: pair(seat => report.cycles.filter(cycle => cycle.circuit?.claimed.includes(seat)).length),
    timeline, marketVp, otherVp, finalScore, circuitLead2At,
    vpLeadChanges,
    vpLeaderAt: { '4': at(4) ? leader(at(4)!.vp) : null, '8': at(8) ? leader(at(8)!.vp) : null, '12': at(12) ? leader(at(12)!.vp) : null },
    serverLeaderAt8: at(8) ? leader(at(8)!.servers) : null,
    winnerMaxDeficit,
    cards,
    purchaseSimilarity: round(jaccard(new Set(ownPurchases(0).map(item => item.definitionId)), new Set(ownPurchases(1).map(item => item.definitionId)))),
    ux: {
      failedOutcomes: t?.failedOutcomes ?? [0, 0], randomResults: t?.randomResults ?? 0, choices: t?.choices ?? [0, 0],
      events: t?.events ?? 0, eventsPerCycle: round((t?.events ?? 0) / Math.max(1, report.cycles.length)),
    },
    decisions: {
      deploys: pair(seat => deploys.filter(item => item.owner === seat).length),
      drafts: pair(seat => decisions.filter(item => item.kind === 'draft' && item.owner === seat).length),
      choices: pair(seat => choices.filter(item => item.owner === seat).length),
      aiRandomPicks: choices.filter(item => item.method === 'random').length,
      avgDeployOptions: round(mean(deploys.map(item => item.options))),
    },
  };
}

export type CohortMetrics = ReturnType<typeof cohortMetrics>;

/** Aggregates over valid games only; callers pass games from a single build. */
export function cohortMetrics(games: { id: string; report: MatchReport }[]) {
  const rows = games.map(game => ({ id: game.id, report: game.report, m: gameMetrics(game.report) }));
  const n = rows.length;
  const decisive = rows.filter(row => row.m.winner !== null);
  const avg = (fn: (m: GameMetrics) => number) => round(mean(rows.map(row => fn(row.m))));
  const perSeatAvg = (fn: (m: GameMetrics, seat: Seat) => number) => round(mean(rows.flatMap(row => SEATS.map(seat => fn(row.m, seat)))));
  const winnerVs = (fn: (m: GameMetrics, seat: Seat) => number) => {
    const comparable = decisive.filter(row => fn(row.m, row.m.winner!) !== fn(row.m, (1 - row.m.winner!) as Seat));
    return { rate: rate(comparable.filter(row => fn(row.m, row.m.winner!) > fn(row.m, (1 - row.m.winner!) as Seat)).length, comparable.length), games: comparable.length };
  };
  const leaderWins = (key: '4' | '8' | '12') => {
    const known = decisive.filter(row => row.m.vpLeaderAt[key] !== null);
    return { rate: rate(known.filter(row => row.m.vpLeaderAt[key] === row.m.winner).length, known.length), games: known.length };
  };
  const totalDrain = sum(rows.map(row => sum(row.m.drain))), totalRestore = sum(rows.map(row => sum(row.m.restore)));
  const sourceShare = (field: 'drainBySource' | 'restoreBySource', total: number) => Object.fromEntries(['card', 'location', 'circuit'].map(source => [source, total ? round(sum(rows.map(row => sum(row.m[field][source] ?? [0, 0]))) / total) : 0]));

  const circuitRows = rows.flatMap(row => row.m.circuit.map(entry => ({ ...entry, gameWinner: row.m.winner })));
  const rewardIds = [...new Set(circuitRows.map(entry => entry.rewardId))];
  const circuit = rewardIds.map(id => {
    const seen = circuitRows.filter(entry => entry.rewardId === id);
    const claims = seen.flatMap(entry => entry.claimed.map(seat => ({ seat, winner: entry.gameWinner, shared: entry.claimed.length > 1 })));
    const solo = claims.filter(claim => !claim.shared && claim.winner !== null);
    return { id, name: seen[0].name, seen: seen.length, claims: claims.length, soloClaims: solo.length, soloClaimerWonGame: rate(solo.filter(claim => claim.seat === claim.winner).length, solo.length) };
  }).sort((a, b) => b.seen - a.seen);
  const circuitEffects = Object.fromEntries(rewardIds.map(id => {
    const totals = { drain: 0, restore: 0, crypto: 0, vp: 0, draw: 0, actions: 0 };
    for (const row of rows) { const stat = row.report.telemetry?.circuit[id]; if (stat) for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += sum(stat[key]); }
    return [id, totals];
  }));

  const locationRows = rows.flatMap(row => row.m.locations.map(location => ({ ...location, gameWinner: row.m.winner })));
  const locationIds = [...new Set(locationRows.map(row => row.id))];
  const locations = locationIds.map(id => {
    const seen = locationRows.filter(row => row.id === id);
    const decided = seen.filter(row => row.winner !== null && row.gameWinner !== null);
    const effects = { drain: 0, restore: 0, crypto: 0, vp: 0, draw: 0, actions: 0 };
    for (const row of rows) { const stat = row.report.telemetry?.locations[id]; if (stat) for (const key of Object.keys(effects) as (keyof typeof effects)[]) effects[key] += sum(stat[key]); }
    return { id, name: seen[0].name, appearances: seen.length, ties: seen.filter(row => row.winner === null).length, winnerAlsoWonGame: rate(decided.filter(row => row.winner === row.gameWinner).length, decided.length), effectsTotal: effects };
  }).sort((a, b) => b.appearances - a.appearances);

  const cardMap = new Map<string, { definitionId: string; name: string; cost: number; type: string; cardClass?: string; copies: number; buyerGames: number; buyerWins: number; plays: number; drain: number; restore: number; draw: number; crypto: number; vp: number; actions: number }>();
  for (const row of rows) for (const card of row.m.cards) {
    const entry = cardMap.get(card.definitionId) ?? { definitionId: card.definitionId, name: card.name, cost: card.cost, type: card.type, ...(card.cardClass ? { cardClass: card.cardClass } : {}), copies: 0, buyerGames: 0, buyerWins: 0, plays: 0, drain: 0, restore: 0, draw: 0, crypto: 0, vp: 0, actions: 0 };
    entry.copies += sum(card.bought);
    for (const seat of SEATS) if (card.bought[seat] > 0) { entry.buyerGames++; if (row.m.winner === seat) entry.buyerWins++; }
    entry.plays += sum(card.plays); entry.drain += sum(card.drain); entry.restore += sum(card.restore); entry.draw += sum(card.draw); entry.crypto += sum(card.crypto); entry.vp += sum(card.vp); entry.actions += sum(card.actions);
    cardMap.set(card.definitionId, entry);
  }
  const cards = [...cardMap.values()].map(card => ({
    ...card, buyerWinRate: rate(card.buyerWins, card.buyerGames),
    perPlay: card.plays ? { drain: round(card.drain / card.plays), restore: round(card.restore / card.plays), draw: round(card.draw / card.plays), crypto: round(card.crypto / card.plays), actions: round(card.actions / card.plays) } : null,
  })).sort((a, b) => b.copies - a.copies || b.plays - a.plays);

  const purchases = rows.flatMap(row => row.report.purchases);
  const categoryCounts = purchases.reduce<Record<string, number>>((tally, item) => { tally[item.category] = (tally[item.category] ?? 0) + 1; return tally; }, {});
  const boughtCounts = purchases.reduce<Record<string, number>>((tally, item) => { tally[item.name] = (tally[item.name] ?? 0) + 1; return tally; }, {});
  const topBought = Object.entries(boughtCounts).sort((a, b) => b[1] - a[1]);
  const seatSets = rows.flatMap(row => SEATS.map(seat => new Set(row.report.purchases.filter(item => item.owner === seat).map(item => item.definitionId))));
  const crossGame: number[] = [];
  for (let i = 0; i < seatSets.length; i++) for (let j = i + 1; j < seatSets.length; j++) crossGame.push(jaccard(seatSets[i], seatSets[j]));
  const archetypes = rows.flatMap(row => SEATS.map(seat => ({ archetype: row.m.archetype[seat], won: row.m.winner === seat, decisive: row.m.winner !== null })));
  const archetypeStats = [...new Set(archetypes.map(item => item.archetype))].map(archetype => {
    const own = archetypes.filter(item => item.archetype === archetype);
    return { archetype, seats: own.length, winRate: rate(own.filter(item => item.won).length, own.filter(item => item.decisive).length) };
  });
  const marginsOf = (subset: typeof rows) => {
    const margins = subset.map(row => row.m.vpMargin).sort((a, b) => a - b);
    const close = margins.filter(isCloseMargin).length, blowout = margins.filter(isBlowoutMargin).length;
    return {
      games: margins.length, avgMargin: round(mean(margins)), medianMargin: margins.length ? margins[Math.floor((margins.length - 1) / 2)] : 0,
      close, competitive: margins.length - close - blowout, blowout, closeShare: rate(close, margins.length), blowoutShare: rate(blowout, margins.length),
    };
  };
  const loserOf = (row: (typeof rows)[number]) => (1 - row.m.winner!) as Seat;
  const phaseWallet = (from: number, to: number) => round(mean(rows.flatMap(row => row.m.timeline.filter(entry => entry.cycle >= from && entry.cycle <= to).flatMap(entry => entry.wallet))));

  return {
    games: n, decisive: decisive.length, ties: n - decisive.length,
    endedBy: { destruction: rows.filter(row => row.m.endedBy === 'destruction').length, cycle16: rows.filter(row => row.m.endedBy === 'cycle16').length, other: rows.filter(row => row.m.endedBy === 'other').length },
    cycles: {
      avg: avg(m => m.cycles), min: n ? Math.min(...rows.map(row => row.m.cycles)) : 0, max: n ? Math.max(...rows.map(row => row.m.cycles)) : 0,
      /** The Cycle games ended by Server destruction finished in. */
      destructionEnd: (() => { const ends = rows.filter(row => row.m.endedBy === 'destruction').map(row => row.m.cycles); return { games: ends.length, avg: round(mean(ends)), cycles11to14: ends.filter(cycle => cycle >= 11 && cycle <= 14).length, before11: ends.filter(cycle => cycle < 11).length }; })(),
    },
    seatWins: [decisive.filter(row => row.m.winner === 0).length, decisive.filter(row => row.m.winner === 1).length] as Pair,
    vp: { avgWinner: round(mean(decisive.map(row => row.m.finalVP[row.m.winner!]))), avgLoser: round(mean(decisive.map(row => row.m.finalVP[1 - row.m.winner!]))), avgMargin: avg(m => m.vpMargin), destructionVPShare: round(sum(rows.map(row => sum(row.m.destructionVP))) / Math.max(1, sum(rows.map(row => sum(row.m.finalVP))))),
      /** Close games (margin < CLOSE_MARGIN) versus blowouts (margin > BLOWOUT_MARGIN), overall and by how the game ended. */
      margins: { ...marginsOf(rows), byEnding: { destruction: marginsOf(rows.filter(row => row.m.endedBy === 'destruction')), cycle16: marginsOf(rows.filter(row => row.m.endedBy === 'cycle16')) } },
      /** Where the winner's lead came from: Server-destruction VP versus every other VP source. */
      winnerLead: {
        fromDestruction: round(mean(decisive.map(row => row.m.destructionVP[row.m.winner!] - row.m.destructionVP[loserOf(row)]))),
        fromOther: round(mean(decisive.map(row => (row.m.finalVP[row.m.winner!] - row.m.destructionVP[row.m.winner!]) - (row.m.finalVP[loserOf(row)] - row.m.destructionVP[loserOf(row)])))),
      },
      /** Games where both players destroyed at least one enemy Server. */
      bothDestroyed: rows.filter(row => row.m.destructionVP[0] > 0 && row.m.destructionVP[1] > 0).length,
      /**
       * How the winner finished the race: full kill (both enemy Servers) versus winning without
       * that — e.g. one Server plus enough other VP, or a pure Cycle-16 VP win.
       */
      winnerKill: (() => {
        const destroyedBoth = decisive.filter(row => enemyServersDestroyed(row.m, row.m.winner!) >= 2);
        const destroyedOne = decisive.filter(row => enemyServersDestroyed(row.m, row.m.winner!) === 1);
        const destroyedNone = decisive.filter(row => enemyServersDestroyed(row.m, row.m.winner!) === 0);
        return {
          games: decisive.length,
          destroyedBothServers: destroyedBoth.length,
          destroyedBothServersShare: rate(destroyedBoth.length, decisive.length),
          didNotDestroyBothServers: destroyedOne.length + destroyedNone.length,
          didNotDestroyBothServersShare: rate(destroyedOne.length + destroyedNone.length, decisive.length),
          destroyedOneServer: destroyedOne.length,
          destroyedNoServers: destroyedNone.length,
        };
      })(),
    },
    damage: {
      avgDrainPerSeat: perSeatAvg((m, seat) => m.drain[seat]), avgRestorePerSeat: perSeatAvg((m, seat) => m.restore[seat]),
      restoreToDrain: totalDrain ? round(totalRestore / totalDrain) : 0,
      wastedRestoreRate: rate(sum(rows.map(row => sum(row.m.wastedRestores))), sum(rows.map(row => sum(row.m.restoreEvents)))),
      avgHealOffset: perSeatAvg((m, seat) => m.healOffset[seat]),
      drainBySource: sourceShare('drainBySource', totalDrain), restoreBySource: sourceShare('restoreBySource', totalRestore),
      destructionsPerGame: avg(m => m.destructions.length), avgFirstDestructionCycle: round(mean(rows.map(row => row.m.firstDestructionCycle).filter((value): value is number => value !== null))),
      winnerDrainedMore: winnerVs((m, seat) => m.drain[seat]), winnerRestoredMore: winnerVs((m, seat) => m.restore[seat]),
    },
    circuit: { claimsPerGame: avg(m => sum(m.circuitClaims)), winnerClaimedMore: winnerVs((m, seat) => m.circuitClaims[seat]), rewards: circuit, effectsTotal: circuitEffects },
    locations: { winnerWonMoreLocations: winnerVs((m, seat) => m.locationsWon[seat]), list: locations },
    vpSources: {
      avgDestructionVp: perSeatAvg((m, seat) => m.destructionVP[seat]),
      avgMarketVp: perSeatAvg((m, seat) => m.marketVp[seat]),
      avgOtherVp: perSeatAvg((m, seat) => m.otherVp[seat]),
      destructionShare: round(sum(rows.map(row => sum(row.m.destructionVP))) / Math.max(1, sum(rows.map(row => sum(row.m.finalVP))))),
      marketShare: round(sum(rows.map(row => sum(row.m.marketVp))) / Math.max(1, sum(rows.map(row => sum(row.m.finalVP))))),
      winnerMarketVpMore: winnerVs((m, seat) => m.marketVp[seat]),
    },
    snowball: {
      vpLeaderWins: { at4: leaderWins('4'), at8: leaderWins('8'), at12: leaderWins('12') },
      serverLeaderAt8Wins: (() => { const known = decisive.filter(row => row.m.serverLeaderAt8 !== null); return { rate: rate(known.filter(row => row.m.serverLeaderAt8 === row.m.winner).length, known.length), games: known.length }; })(),
      avgLeadChanges: avg(m => m.vpLeadChanges), comebacks5vp: decisive.filter(row => row.m.winnerMaxDeficit >= 5).length,
      /**
       * When a seat first holds a 2+ Circuit-claim lead: do they keep claiming Circuits, win more Locations
       * afterward, and win the game? Tests whether Circuit lead snowballs.
       */
      circuitLead2Plus: (() => {
        type Lead = { row: (typeof rows)[number]; seat: Seat; at: number };
        const leads: Lead[] = [];
        for (const row of rows) for (const seat of SEATS) {
          const at = row.m.circuitLead2At[seat];
          if (at !== null) leads.push({ row, seat, at });
        }
        const after = (lead: Lead) => lead.row.m.timeline.filter(entry => entry.cycle > lead.at);
        const laterCircuits = (lead: Lead) => {
          const start = lead.row.m.timeline.find(entry => entry.cycle === lead.at)?.circuitClaims ?? [0, 0];
          const end = lead.row.m.timeline.at(-1)?.circuitClaims ?? start;
          return { leader: end[lead.seat] - start[lead.seat], trailer: end[1 - lead.seat] - start[1 - lead.seat] };
        };
        const laterLocations = (lead: Lead) => {
          const rowsAfter = after(lead);
          return {
            leader: sum(rowsAfter.map(entry => entry.locationsWon[lead.seat])),
            trailer: sum(rowsAfter.map(entry => entry.locationsWon[1 - lead.seat])),
          };
        };
        const decisiveLeads = leads.filter(lead => lead.row.m.winner !== null);
        return {
          games: new Set(leads.map(lead => lead.row.id)).size,
          seats: leads.length,
          avgCycleReached: round(mean(leads.map(lead => lead.at))),
          keptCircuitLead: rate(leads.filter(lead => {
            const end = lead.row.m.timeline.at(-1)?.circuitClaims ?? [0, 0];
            return end[lead.seat] - end[1 - lead.seat] >= 2;
          }).length, leads.length),
          gainedMoreCircuitsAfter: rate(leads.filter(lead => {
            const next = laterCircuits(lead);
            return next.leader > next.trailer;
          }).length, leads.length),
          wonMoreLocationsAfter: rate(leads.filter(lead => {
            const next = laterLocations(lead);
            return next.leader > next.trailer;
          }).length, leads.length),
          leaderWonGame: rate(decisiveLeads.filter(lead => lead.row.m.winner === lead.seat).length, decisiveLeads.length),
        };
      })(),
    },
    economy: {
      avgSpentPerSeat: perSeatAvg((m, seat) => m.economy.spent[seat]), avgPurchasesPerSeat: perSeatAvg((m, seat) => m.economy.purchases[seat]),
      avgWallet: { cycles1to4: phaseWallet(1, 4), cycles5to10: phaseWallet(5, 10), cycles11to16: phaseWallet(11, 16) },
      avgWalletLeftAtDraftEnd: perSeatAvg((m, seat) => m.economy.walletLeftAtDraftEnd[seat]),
      avgCryptoGainedPerSeat: perSeatAvg((m, seat) => m.economy.cryptoGained[seat]), avgDrawnPerSeat: perSeatAvg((m, seat) => m.economy.drawn[seat]),
      avgFinalDeckSize: perSeatAvg((m, seat) => m.economy.finalDeckSize[seat]),
      categoryShare: Object.fromEntries(Object.entries(categoryCounts).map(([key, value]) => [key, round(value / Math.max(1, purchases.length))])),
      winnerSpentMore: winnerVs((m, seat) => m.economy.spent[seat]),
    },
    diversity: {
      distinctCardsBought: Object.keys(boughtCounts).length, topThreeShare: round(sum(topBought.slice(0, 3).map(entry => entry[1])) / Math.max(1, purchases.length)),
      topBought: topBought.slice(0, 10).map(([name, count]) => ({ name, count })),
      sameGameSimilarity: avg(m => m.purchaseSimilarity), crossGameSimilarity: round(mean(crossGame)), archetypes: archetypeStats,
    },
    cards,
    ux: { failedOutcomesPerGame: avg(m => sum(m.ux.failedOutcomes)), randomResultsPerGame: avg(m => m.ux.randomResults), choicesPerGame: avg(m => sum(m.ux.choices)), eventsPerCycle: avg(m => m.ux.eventsPerCycle) },
    /** AI behaviour (Strat-G), not game rules. */
    aiPlayer: { avgDeployOptions: avg(m => m.decisions.avgDeployOptions), choicesPickedAtRandomByAiPerGame: avg(m => m.decisions.aiRandomPicks) },
  };
}

export type ArchetypeResults = ReturnType<typeof archetypeResults>;
export type ArchetypeTargets = { labels: Record<string, string>; vpOf: (definitionId: string) => number; vpBought: number; damage: number };

/**
 * League games by the deck archetype in each seat: win rates, head-to-head records, and how often each one hit the
 * designer's timing targets (total Server damage dealt, VP bought from the market) and by which Cycle.
 */
export function archetypeResults(games: { id: string; report: MatchReport; seats: readonly [string, string] }[], targets: ArchetypeTargets) {
  const rows = games.map(game => ({ ...game, m: gameMetrics(game.report) }));
  const labelOf = (agent: string) => targets.labels[agent] ?? agent;
  const agents = [...new Set(rows.flatMap(row => row.seats))];
  const reachedBy = (steps: { cycle: number; amount: number }[], target: number) => {
    let total = 0;
    for (const step of steps) { total += step.amount; if (total >= target) return step.cycle; }
    return null;
  };
  const summary = (cycles: (number | null)[]) => { const hit = cycles.filter((cycle): cycle is number => cycle !== null); return { games: hit.length, avgCycle: hit.length ? round(mean(hit), 1) : null }; };
  const agentsOut = agents.map(agent => {
    const seats = rows.flatMap(row => SEATS.filter(seat => row.seats[seat] === agent).map(seat => ({ row, seat, other: (1 - seat) as Seat })));
    const record = (subset: typeof seats) => {
      const wins = subset.filter(entry => entry.row.m.winner === entry.seat).length, ties = subset.filter(entry => entry.row.m.winner === null).length;
      return { games: subset.length, wins, losses: subset.length - wins - ties, ties, winRate: rate(wins, subset.length - ties) };
    };
    const damage = seats.map(entry => reachedBy((entry.row.report.telemetry?.perCycle ?? []).map(cycle => ({ cycle: cycle.cycle, amount: cycle.drain[entry.seat] })), targets.damage));
    const bought = seats.map(entry => {
      const steps = entry.row.report.purchases.filter(item => item.owner === entry.seat && item.category === 'VP').sort((a, b) => a.cycle - b.cycle).map(item => ({ cycle: item.cycle, amount: targets.vpOf(item.definitionId) }));
      return { total: sum(steps.map(step => step.amount)), reached: reachedBy(steps, targets.vpBought) };
    });
    const killedBoth = seats.map(entry => {
      const kills = entry.row.m.destructions.filter(item => item.by === entry.seat && item.victim === entry.other);
      return kills.length >= 2 ? Math.max(...kills.map(item => item.cycle)) : null;
    });
    const opponents = [...new Set(seats.map(entry => entry.row.seats[entry.other]))];
    return {
      agent, archetype: labelOf(agent), ...record(seats),
      avgFinalVP: round(mean(seats.map(entry => entry.row.m.finalVP[entry.seat]))),
      avgDrainDealt: round(mean(seats.map(entry => entry.row.m.drain[entry.seat]))),
      avgVpBought: round(mean(bought.map(entry => entry.total))),
      reachedDamageTarget: summary(damage), reachedVpBoughtTarget: summary(bought.map(entry => entry.reached)),
      destroyedBothServers: summary(killedBoth),
      lostAfterDestroyingBoth: seats.filter((entry, index) => killedBoth[index] !== null && entry.row.m.winner === entry.other).length,
      byOpponent: opponents.map(opponent => ({ opponent: labelOf(opponent), ...record(seats.filter(entry => entry.row.seats[entry.other] === opponent)) })),
    };
  }).sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1));
  return { games: rows.length, targets: { damage: targets.damage, vpBought: targets.vpBought }, agents: agentsOut };
}

export type CatalogCard = { id: string; name: string; pool: string; cost: number };
/** Why a card goes unbought: the first four are the game's dynamics, `ai-rule` is the AI player, `card` is the card itself. */
export type NeglectCause = 'exposure' | 'price' | 'timing' | 'band' | 'ai-rule' | 'card' | 'unclear';
export const NEGLECT_BLAME: Record<NeglectCause, 'game dynamic' | 'AI player' | 'the card' | 'unclear'> = {
  exposure: 'game dynamic', price: 'game dynamic', timing: 'game dynamic', band: 'game dynamic', 'ai-rule': 'AI player', card: 'the card', unclear: 'unclear',
};
export type CardDemand = ReturnType<typeof cardDemand>;
type Band = 'early' | 'mid' | 'late';
const BANDS: Band[] = ['early', 'mid', 'late'];
const BAND_LABEL: Record<Band, string> = { early: 'Cycles 1-4', mid: 'Cycles 5-10', late: 'Cycles 11-16' };
const bandOf = (cycle: number): Band => cycle <= 4 ? 'early' : cycle <= 10 ? 'mid' : 'late';
const percent = (value: number) => `${Math.round(value * 100)}%`;
/** Fewer affordable offers than this and a card's pick rate means nothing. */
const MIN_OFFERS = 6;

/**
 * Market demand per card: how often it was offered, affordable at the start of a Draft, and bought.
 * Cards that are affordable but almost never bought are diagnosed: is it the game (rarely offered,
 * priced above typical budgets, offered when nobody buys its kind, a whole price band ignored), the
 * AI player (its rules refuse the card), or the card itself (same-cost peers get bought instead)?
 */
export function cardDemand(games: { id: string; report: MatchReport }[], catalog: CatalogCard[] = []) {
  const withMarket = games.filter(game => game.report.cycles.some(cycle => cycle.market?.length));
  type Stat = {
    id: string; name: string; category: string; cost: number; gamesOffered: number; offers: number; affordable: number; picks: number; copies: number;
    budgetSum: number; buyerGames: number; buyerWins: number; byBand: Record<Band, { affordable: number; picks: number }>;
    aiSeen: number; aiRefused: number; aiGapSum: number; aiScored: number;
  };
  const stats = new Map<string, Stat>();
  const statOf = (id: string, name: string, category: string, cost: number) => {
    let stat = stats.get(id);
    if (!stat) stats.set(id, stat = { id, name, category, cost, gamesOffered: 0, offers: 0, affordable: 0, picks: 0, copies: 0, budgetSum: 0, buyerGames: 0, buyerWins: 0, byBand: { early: { affordable: 0, picks: 0 }, mid: { affordable: 0, picks: 0 }, late: { affordable: 0, picks: 0 } }, aiSeen: 0, aiRefused: 0, aiGapSum: 0, aiScored: 0 });
    return stat;
  };
  for (const { report } of withMarket) {
    const firstDraft = new Map<string, Extract<DecisionRecord, { kind: 'draft' }>>();
    for (const decision of report.decisions ?? []) if (decision.kind === 'draft' && !firstDraft.has(`${decision.cycle}:${decision.owner}`)) firstDraft.set(`${decision.cycle}:${decision.owner}`, decision);
    const offeredHere = new Set<string>();
    for (const cycle of report.cycles) {
      for (const pile of cycle.market ?? []) {
        const stat = statOf(pile.id, pile.name, pile.category, pile.cost);
        offeredHere.add(pile.id);
        for (const seat of SEATS) {
          if (pile.stock[seat] <= 0) continue;
          stat.offers++; stat.budgetSum += cycle.wallet[seat];
          const bought = report.purchases.some(item => item.cycle === cycle.cycle && item.owner === seat && item.definitionId === pile.id);
          if (cycle.wallet[seat] < pile.cost && !bought) continue;
          const band = stat.byBand[bandOf(cycle.cycle)];
          stat.affordable++; band.affordable++;
          if (bought) { stat.picks++; band.picks++; }
          const decision = firstDraft.get(`${cycle.cycle}:${seat}`);
          const seen = decision?.offered?.find(item => item.id === pile.id);
          if (!decision?.offered || !seen) continue;
          stat.aiSeen++;
          if (seen.score === null) { stat.aiRefused++; continue; }
          const best = Math.max(...decision.offered.map(item => item.score ?? -Infinity));
          stat.aiScored++; stat.aiGapSum += best - seen.score;
        }
      }
    }
    for (const id of offeredHere) stats.get(id)!.gamesOffered++;
    for (const seat of SEATS) {
      const ids = new Set(report.purchases.filter(item => item.owner === seat).map(item => item.definitionId));
      for (const id of ids) { const stat = stats.get(id); if (stat) { stat.buyerGames++; if (report.winner === seat) stat.buyerWins++; } }
    }
    for (const purchase of report.purchases) { const stat = stats.get(purchase.definitionId); if (stat) stat.copies++; }
  }

  const all = [...stats.values()];
  const pickRate = (picks: number, affordable: number) => affordable ? picks / affordable : 0;
  const categoryBand = (category: string, band: Band) => {
    const own = all.filter(stat => stat.category === category);
    return pickRate(sum(own.map(stat => stat.byBand[band].picks)), sum(own.map(stat => stat.byBand[band].affordable)));
  };
  const categoryRate = (category: string) => { const own = all.filter(stat => stat.category === category); return pickRate(sum(own.map(stat => stat.picks)), sum(own.map(stat => stat.affordable))); };
  const peersOf = (stat: Stat) => {
    const peers = all.filter(other => other.id !== stat.id && other.category === stat.category && Math.abs(other.cost - stat.cost) <= 1);
    const affordable = sum(peers.map(peer => peer.affordable));
    return { affordable, rate: pickRate(sum(peers.map(peer => peer.picks)), affordable), favourites: peers.filter(peer => peer.affordable >= 3).sort((a, b) => pickRate(b.picks, b.affordable) - pickRate(a.picks, a.affordable)).slice(0, 2).map(peer => peer.name) };
  };

  function diagnose(stat: Stat): { cause: NeglectCause; reason: string } {
    const rate = pickRate(stat.picks, stat.affordable);
    const budget = round(stat.budgetSum / Math.max(1, stat.offers), 1);
    if (stat.affordable / stat.offers < 0.3) return { cause: 'price', reason: `Usually unaffordable: a seat could pay its cost of ${stat.cost} in only ${percent(stat.affordable / stat.offers)} of ${stat.offers} offers (average budget then ${budget} Crypto).` };
    if (stat.aiSeen >= 3 && stat.aiRefused / stat.aiSeen >= 0.5) return { cause: 'ai-rule', reason: `The AI's rules refuse it outright (${stat.aiRefused} of ${stat.aiSeen} times it was affordable), so its neglect says nothing about the card yet.` };
    const band = [...BANDS].sort((a, b) => stat.byBand[b].affordable - stat.byBand[a].affordable)[0];
    const bandShare = stat.byBand[band].affordable / stat.affordable, bandRate = categoryBand(stat.category, band);
    if (bandShare >= 0.7 && bandRate <= 0.05 && categoryRate(stat.category) >= 0.1) return { cause: 'timing', reason: `Mostly affordable in ${BAND_LABEL[band]}, when ${stat.category} cards are almost never bought (${percent(bandRate)} pick rate), so it is offered at the wrong time.` };
    const peers = peersOf(stat);
    const gap = stat.aiScored ? ` The AI scored it ${round(stat.aiGapSum / stat.aiScored, 1)} below its best option on average.` : '';
    if (peers.affordable >= MIN_OFFERS && peers.rate >= 0.1 && peers.rate >= 3 * Math.max(rate, 0.01)) return { cause: 'card', reason: `Passed over for its peers: picked ${stat.picks} of ${stat.affordable} times it was affordable, while ${stat.category} cards costing ${stat.cost - 1}-${stat.cost + 1} were picked ${percent(peers.rate)} of the time${peers.favourites.length ? ` (e.g. ${peers.favourites.join(', ')})` : ''}.${gap}` };
    if (peers.affordable >= MIN_OFFERS && peers.rate <= 0.05) return { cause: 'band', reason: `Its whole price band is ignored: ${stat.category} cards costing ${stat.cost - 1}-${stat.cost + 1} were picked only ${percent(peers.rate)} of the time they were affordable.` };
    return { cause: 'unclear', reason: `Picked ${stat.picks} of ${stat.affordable} times it was affordable; ${peers.affordable < MIN_OFFERS ? `no ${stat.category} card at a similar cost was offered often enough to compare it with` : 'no single cause stands out'}.${gap}` };
  }

  const neglected = all.filter(stat => stat.offers >= MIN_OFFERS && (stat.affordable >= MIN_OFFERS ? pickRate(stat.picks, stat.affordable) <= 0.05 : stat.picks === 0))
    .sort((a, b) => b.affordable - a.affordable || b.offers - a.offers)
    .map(stat => { const { cause, reason } = diagnose(stat); return { id: stat.id, name: stat.name, category: stat.category, cost: stat.cost, gamesOffered: stat.gamesOffered, offers: stat.offers, affordable: stat.affordable, picks: stat.picks, cause, blame: NEGLECT_BLAME[cause], reason }; });
  const offeredIds = new Set(all.map(stat => stat.id));
  return {
    games: games.length, gamesWithMarketData: withMarket.length,
    /** Seat-Drafts are counted per seat: one Draft offers each card to both players. */
    cards: all.map(stat => ({ id: stat.id, name: stat.name, category: stat.category, cost: stat.cost, gamesOffered: stat.gamesOffered, offers: stat.offers, affordable: stat.affordable, picks: stat.picks, pickRate: round(pickRate(stat.picks, stat.affordable)), buyerWinRate: rate(stat.buyerWins, stat.buyerGames), aiRefused: stat.aiRefused, aiScoreGap: stat.aiScored ? round(stat.aiGapSum / stat.aiScored, 1) : null }))
      .sort((a, b) => b.offers - a.offers),
    neglected,
    rarelyOffered: all.filter(stat => stat.offers < MIN_OFFERS && stat.picks === 0).map(stat => stat.name),
    neverOffered: withMarket.length ? catalog.filter(card => !offeredIds.has(card.id)).map(card => card.name) : [],
    autoPicks: all.filter(stat => stat.affordable >= MIN_OFFERS && pickRate(stat.picks, stat.affordable) >= 0.5)
      .sort((a, b) => pickRate(b.picks, b.affordable) - pickRate(a.picks, a.affordable)).slice(0, 6)
      .map(stat => ({ name: stat.name, category: stat.category, cost: stat.cost, affordable: stat.affordable, picks: stat.picks, pickRate: round(pickRate(stat.picks, stat.affordable)), buyerWinRate: rate(stat.buyerWins, stat.buyerGames) })),
  };
}
