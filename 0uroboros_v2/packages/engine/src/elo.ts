/**
 * Elo rating maths shared by the strategist league (snapshots) and the game server (player ratings for quick match).
 */
export const ELO_START = 1200;

export const expectedScore = (rating: number, opponent: number) => 1 / (1 + 10 ** ((opponent - rating) / 400));

/** K = 32 while a rating is provisional (first `provisionalGames`), then 16. */
export const kFactor = (games: number, provisionalGames = 30) => games < provisionalGames ? 32 : 16;

/** New ratings after one game; `scoreA` is 1 for a win by A, ½ for a tie, 0 for a loss. */
export function eloUpdate(ratingA: number, ratingB: number, scoreA: number, kA = 16, kB = kA): [number, number] {
  const expectedA = expectedScore(ratingA, ratingB);
  return [ratingA + kA * (scoreA - expectedA), ratingB + kB * ((1 - scoreA) - (1 - expectedA))];
}
