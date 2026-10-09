/**
 * Store achievements and rich presence, derived from what the server told us. Ids are the Steam API names
 * (configured on the Steamworks partner site under Stats & Achievements) and double as Game Center ids on iPad.
 * The web platform's store is a no-op, so this is safe to call everywhere.
 */
import type { GameResult } from '@0uroboros/protocol/messages';
import type { LobbyState } from '../net/OnlineClient';
import type { Platform } from './Platform';

export const ACHIEVEMENTS = {
  FIRST_ONLINE_GAME: 'first_online_game',
  FIRST_ONLINE_WIN: 'first_online_win',
  SERVERS_DESTROYED: 'win_by_servers',
  FULL_SIXTEEN: 'full_sixteen_cycles',
  SHUTOUT: 'shutout',
} as const;

/** Which achievements an online result earns for the seat that played it. */
export function achievementsFor(result: GameResult, seat: 0 | 1, mode: LobbyState['mode']): string[] {
  if (mode !== 'pvp' || result.outcome === 'abandoned') return [];
  const earned: string[] = [ACHIEVEMENTS.FIRST_ONLINE_GAME];
  const won = result.winner === seat;
  if (!won) return earned;
  earned.push(ACHIEVEMENTS.FIRST_ONLINE_WIN);
  const reason = result.endedReason ?? '';
  if (/Both Servers destroyed/i.test(reason)) earned.push(ACHIEVEMENTS.SERVERS_DESTROYED);
  if (/Cycle 16 final Draft complete/i.test(reason)) earned.push(ACHIEVEMENTS.FULL_SIXTEEN);
  if (result.outcome === 'complete' && result.finalVP[seat === 0 ? 1 : 0] === 0) earned.push(ACHIEVEMENTS.SHUTOUT);
  return earned;
}

export function awardAchievements(platform: Platform, result: GameResult, seat: 0 | 1, mode: LobbyState['mode']) {
  for (const id of achievementsFor(result, seat, mode)) void platform.store.unlockAchievement(id);
}

/** One line for the friends list: what the player is doing right now. */
export function presenceText(lobby: Pick<LobbyState, 'status' | 'mode'>, cycle?: number): string {
  switch (lobby.status) {
    case 'waiting': return lobby.mode === 'ai' ? 'Starting a game against the AI' : 'Waiting for a friend to join';
    case 'playing': return `${lobby.mode === 'ai' ? 'Playing the AI' : 'In an online match'}${cycle ? ` · Cycle ${cycle}` : ''}`;
    case 'finished': return 'Reviewing a finished match';
    default: return 'In the menu';
  }
}
