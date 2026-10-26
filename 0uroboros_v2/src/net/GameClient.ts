/**
 * What the game UI drives. A `LocalClient` wraps a `RuntimeSession` in-process (solo practice, the studio); an
 * `OnlineClient` speaks the wire protocol to the game server. Either way the UI sees one seat at index 0, pulls
 * resolved events through `step()` for its presentation queue and learns about new work through `subscribe`.
 *
 * Commands return the event synchronously from a local table and a Promise from an online one; `settle` runs the
 * continuation in place for the former so the solo client's behaviour is unchanged.
 */
import type { Card } from '@0uroboros/engine/game';
import type { CycleRecord, MatchReport, RuntimeEvent, RuntimeSession, SessionView } from '@0uroboros/engine/runtime';
import type { Timers } from '@0uroboros/protocol/messages';

export type Presented = { event: RuntimeEvent; view: SessionView };
export type Maybe<T> = T | Promise<T>;
export type ClientChange =
  | { kind: 'pending' }
  /** The whole table was replaced (join, reconnect); `log` is the Log so far. */
  | { kind: 'snapshot'; log: RuntimeEvent[] }
  | { kind: 'presence'; seat: 0 | 1; connected: boolean }
  | { kind: 'timers'; timers: Timers }
  | { kind: 'connection'; state: ConnectionState }
  | { kind: 'error'; message: string }
  | { kind: 'gameOver' };
export type ConnectionState = 'online' | 'reconnecting' | 'offline';

export interface GameClient {
  readonly mode: 'local' | 'online';
  /** Both seats' display names, or null when the Log speaks to seat 0 as "You". */
  readonly seatNames: [string, string] | null;
  view(): SessionView | null;
  readonly pendingCount: number;
  step(): Presented | null;
  subscribe(listener: (change: ClientChange) => void): () => void;
  deploy(cardId: string, node: number): Maybe<RuntimeEvent>;
  relocateCard(cardId: string, node: number): Maybe<RuntimeEvent>;
  undoAllPlanning(): Maybe<RuntimeEvent>;
  endTurn(): Maybe<RuntimeEvent | null>;
  undoEndTurn(): Maybe<RuntimeEvent>;
  choose(selection: string | readonly string[]): Maybe<RuntimeEvent>;
  claimCircuitReward(): Maybe<RuntimeEvent>;
  buy(pileId: string): Maybe<RuntimeEvent>;
  endDraft(): Maybe<RuntimeEvent>;
  undoEndDraft(): Maybe<RuntimeEvent>;
  concede(): Maybe<RuntimeEvent>;
  /** Local tables advance the Draft themselves (AI purchases, expiry, next Cycle); online the server does. */
  tickDraft(now: number): RuntimeEvent | null;
  deckList(): Card[];
  cycleHistory(): CycleRecord[];
  matchReport(): MatchReport | null;
  timers(): Timers | null;
  /** Evaluation helpers; local tables only. */
  addEvaluationCard?(definitionId: string, owner: 0 | 1): RuntimeEvent;
  endSessionNow?(): RuntimeEvent;
  close(): void;
}

/** Runs `onValue` at once for a plain value, or when a Promise settles; errors reach `onError` either way. */
export function settle<T>(result: Maybe<T>, onValue: (value: T) => void, onError: (error: unknown) => void): void {
  if (result instanceof Promise) { result.then(onValue, onError); return; }
  try { onValue(result); } catch (error) { onError(error); }
}

/** Calls `fn` and routes a synchronous throw to the error path too, so callers handle both clients the same way. */
export function attempt<T>(fn: () => Maybe<T>, onValue: (value: T) => void, onError: (error: unknown) => void): void {
  let result: Maybe<T>;
  try { result = fn(); } catch (error) { onError(error); return; }
  settle(result, onValue, onError);
}

export class LocalClient implements GameClient {
  readonly mode = 'local' as const;
  readonly seatNames = null;
  readonly session: RuntimeSession;
  private listeners = new Set<(change: ClientChange) => void>();
  constructor(session: RuntimeSession) { this.session = session; }
  view() { return this.session.view(); }
  get pendingCount() { return this.session.pendingCount; }
  step() { return this.session.step(); }
  subscribe(listener: (change: ClientChange) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  deploy(cardId: string, node: number) { return this.session.deploy(cardId, node); }
  relocateCard(cardId: string, node: number) { return this.session.relocateCard(cardId, node); }
  undoAllPlanning() { return this.session.undoAllPlanning(); }
  endTurn() { return this.session.endTurn(); }
  undoEndTurn() { return this.session.undoEndTurn(); }
  choose(selection: string | readonly string[]) { return this.session.choose(selection); }
  claimCircuitReward() { return this.session.claimCircuitReward(); }
  buy(pileId: string) { return this.session.buy(pileId); }
  endDraft() { return this.session.endDraft(); }
  undoEndDraft() { return this.session.undoEndDraft(); }
  concede() { return this.session.concedeForInactivity(); }
  tickDraft(now: number) {
    const state = this.session.state;
    if (state.phase !== 'draft') return null;
    if (state.draftEnded) return this.session.nextCycle();
    if (state.draftEndsAt !== null && now >= state.draftEndsAt) return this.session.expireDraft(now);
    return this.session.opponentDraftStep(now);
  }
  deckList() { return this.session.deckList(0); }
  cycleHistory() { return this.session.cycleHistory(); }
  matchReport() { return this.session.matchReport(); }
  timers() { return null; }
  addEvaluationCard(definitionId: string, owner: 0 | 1) { return this.session.addEvaluationCard(definitionId, owner); }
  endSessionNow() { return this.session.endSessionNow(); }
  close() { this.listeners.clear(); }
}
