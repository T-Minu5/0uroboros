/**
 * Quick match and player ratings.
 *
 * Ratings: every finished pvp game between two signed-in players moves both accounts' Elo (the league's maths from
 * the engine, K = 32 for the first ten games then 16). Concessions and forfeits count as losses; abandoned games and
 * games against the AI or a guest are unrated.
 *
 * Queue: a waiting player accepts opponents within `window(waited)` rating points, 100 at first and 50 more for every
 * 10 s waited, up to 1000, so a lone player with an odd rating is still matched within a few minutes. Guests queue
 * at the starting rating. The queue is polled on the scheduler every `tickMs` and on every join.
 */
import { ELO_START, eloUpdate, kFactor } from "@0uroboros/engine/elo";
import type { RatingSummary } from "@0uroboros/protocol/messages";
import type { Rating, ResultRecord, Store } from "./store";

export const PROVISIONAL_GAMES = 10;

export const summariseRating = (rating: Rating | null): RatingSummary | null =>
  rating ? { elo: Math.round(rating.elo), games: rating.games, wins: rating.wins, losses: rating.losses, ties: rating.ties } : null;

const fresh = (accountId: string, now: number): Rating => ({ accountId, elo: ELO_START, games: 0, wins: 0, losses: 0, ties: 0, updatedAt: now });

/** Applies a finished game to both accounts' ratings; returns the new ratings, or null when the game was unrated. */
export function rateResult(store: Store, record: ResultRecord, now: number): [Rating, Rating] | null {
  const [a, b] = record.accountIds ?? [null, null];
  if (record.mode !== "pvp" || !a || !b || a === b || record.result.outcome === "abandoned") return null;
  const ratingA = store.rating(a) ?? fresh(a, now), ratingB = store.rating(b) ?? fresh(b, now);
  const scoreA = record.result.winner === null ? 0.5 : record.result.winner === 0 ? 1 : 0;
  const [eloA, eloB] = eloUpdate(ratingA.elo, ratingB.elo, scoreA, kFactor(ratingA.games, PROVISIONAL_GAMES), kFactor(ratingB.games, PROVISIONAL_GAMES));
  const next = (rating: Rating, elo: number, score: number): Rating => ({
    ...rating, elo, games: rating.games + 1, wins: rating.wins + (score === 1 ? 1 : 0), losses: rating.losses + (score === 0 ? 1 : 0), ties: rating.ties + (score === 0.5 ? 1 : 0), updatedAt: now,
  });
  const updated: [Rating, Rating] = [next(ratingA, eloA, scoreA), next(ratingB, eloB, 1 - scoreA)];
  store.saveRating(updated[0]); store.saveRating(updated[1]);
  return updated;
}

export type Ticket<T> = { player: T; accountId: string | null; rating: number; since: number };

export const matchWindow = (waitedMs: number) => Math.min(1000, 100 + 50 * Math.floor(waitedMs / 10_000));

export class MatchQueue<T> {
  private readonly tickets: Ticket<T>[] = [];
  constructor(private readonly now: () => number) {}

  get size() { return this.tickets.length; }

  /** Joins the queue (or refreshes the entry); returns the ticket. */
  join(player: T, accountId: string | null, rating: number): Ticket<T> {
    this.leave(player);
    const ticket = { player, accountId, rating, since: this.now() };
    this.tickets.push(ticket);
    return ticket;
  }
  leave(player: T) {
    const index = this.tickets.findIndex(ticket => ticket.player === player);
    if (index >= 0) this.tickets.splice(index, 1);
  }
  has(player: T) { return this.tickets.some(ticket => ticket.player === player); }
  ticket(player: T) { return this.tickets.find(ticket => ticket.player === player) ?? null; }

  /** Pairs the longest-waiting player with the closest acceptable opponent, repeatedly; returns the pairs made. */
  match(): [Ticket<T>, Ticket<T>][] {
    const pairs: [Ticket<T>, Ticket<T>][] = [];
    const at = this.now();
    let progress = true;
    while (progress && this.tickets.length >= 2) {
      progress = false;
      for (const seeker of [...this.tickets]) {
        let best: Ticket<T> | null = null;
        for (const other of this.tickets) {
          if (other === seeker || (seeker.accountId !== null && other.accountId === seeker.accountId)) continue;
          const gap = Math.abs(other.rating - seeker.rating);
          if (gap > matchWindow(at - seeker.since) || gap > matchWindow(at - other.since)) continue;
          if (!best || gap < Math.abs(best.rating - seeker.rating)) best = other;
        }
        if (best) { this.leave(seeker.player); this.leave(best.player); pairs.push([seeker, best]); progress = true; break; }
      }
    }
    return pairs;
  }
}
