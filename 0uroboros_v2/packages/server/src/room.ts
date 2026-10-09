/**
 * One table. The Room owns the authoritative `RuntimeSession`, the seats and their connections, every timer (Draft,
 * turn, choice, reconnect grace) and the command log that becomes the replay. It knows nothing about sockets: a
 * `Connection` is anything with `send`.
 *
 * Disconnects follow guide 06: the first pauses the affected timers for up to 20 s (the opponent sees Waiting) and the
 * seat forfeits if it does not return; the second pauses nothing; the third forfeits at once. Two Runtime turns with
 * no input concede automatically, and a timed-out mandatory choice resolves to a random legal option.
 */
import { randomBytes } from "node:crypto";
import type { PlayerId } from "@0uroboros/engine/game";
import type { CompiledContent } from "@0uroboros/engine/authoring/contentModel";
import { createSession, mirrorEvent, redactEvent, seededRandom, type RuntimeEvent, type RuntimeSession, type SessionView } from "@0uroboros/engine/runtime";
import type { StrategyProfile } from "@0uroboros/engine/ai/strategy";
import type { Command, GameResult, RoomMode, RoomSettings, RoomStatus, SeatSummary, ServerMessage, Timers } from "@0uroboros/protocol/messages";
import type { Scheduler } from "./scheduler";
import type { CommandRecord, ReplayRecord, Store, SystemCommand } from "./store";

export type Connection = { send(message: ServerMessage): void };

export type RoomConfig = {
  code: string;
  mode: RoomMode;
  settings: RoomSettings;
  seed: number;
  content: CompiledContent;
  contentRevision: number | null;
  scheduler: Scheduler;
  store: Store;
  /** The AI seat's plan of play; unset, the engine's current default. */
  strategy?: StrategyProfile;
  log?: (entry: Record<string, unknown>) => void;
  /** Called once the room has nothing left to do, so the registry can drop it. */
  onClose?: (room: Room) => void;
};

type Seat = {
  name: string;
  token: string;
  ai: boolean;
  connection: Connection | null;
  disconnects: number;
  /** Consecutive Runtime turns this seat let the timer commit for it without any input. */
  idleTurns: number;
  /** Whether the seat sent any successful command during the current Runtime turn. */
  inputThisTurn: boolean;
  cancelGrace: (() => void) | null;
};

const GRACE_FIRST_MS = 20_000;
/** A second disconnect pauses nothing, but a seat that never returns still has to lose eventually. */
const GRACE_LATER_MS = 120_000;
const BOTH_GONE_MS = 60_000;
const DRAFT_TO_CYCLE_MS = 1_500;
const AI_DRAFT_TICK_MS = 1_400;
const FINISHED_TTL_MS = 5 * 60_000;
const AI_NAME = "AI";

export const newSeatToken = () => randomBytes(24).toString("base64url");

export class Room {
  readonly code: string;
  readonly mode: RoomMode;
  readonly settings: RoomSettings;
  status: RoomStatus = "waiting";
  readonly seats: [Seat | null, Seat | null] = [null, null];
  session: RuntimeSession | null = null;
  readonly commands: CommandRecord[] = [];
  readonly events: RuntimeEvent[] = [];
  result: GameResult | null = null;
  startedAt = 0;
  private readonly config: RoomConfig;
  private cancelTurn: (() => void) | null = null;
  private cancelChoice: (() => void) | null = null;
  private cancelDraft: (() => void) | null = null;
  private cancelAiDraft: (() => void) | null = null;
  private cancelNextCycle: (() => void) | null = null;
  private cancelBothGone: (() => void) | null = null;
  private cancelDispose: (() => void) | null = null;
  private turnEndsAt: number | null = null;
  private choiceEndsAt: number | null = null;
  private pausedUntil: number | null = null;
  /** Timer remainders parked while the table is paused. */
  private parked: { turn: number | null; choice: number | null; draftAt: number } | null = null;
  private armedTurn = "";
  private seq = 0;

  constructor(config: RoomConfig) {
    this.config = config;
    this.code = config.code;
    this.mode = config.mode;
    this.settings = config.settings;
    if (config.mode === "ai") this.seats[1] = this.makeSeat(AI_NAME, true);
  }

  private get now() { return this.config.scheduler.now(); }
  private log(entry: Record<string, unknown>) { this.config.log?.({ room: this.code, at: this.now, ...entry }); }
  private makeSeat(name: string, ai: boolean): Seat {
    return { name, token: ai ? "" : newSeatToken(), ai, connection: null, disconnects: 0, idleTurns: 0, inputThisTurn: false, cancelGrace: null };
  }
  private humanSeats(): PlayerId[] { return ([0, 1] as PlayerId[]).filter(seat => this.seats[seat] && !this.seats[seat]!.ai); }
  private aiSeats(): PlayerId[] { return ([0, 1] as PlayerId[]).filter(seat => this.seats[seat]?.ai); }
  private connectedHumans(): PlayerId[] { return this.humanSeats().filter(seat => this.seats[seat]!.connection); }

  // --- Lobby ---------------------------------------------------------------------------------------------------------

  /** Seats a new player; returns the seat and its token, or null when the table is full or already playing. */
  join(name: string, connection: Connection): { seat: PlayerId; token: string } | null {
    if (this.status !== "waiting") return null;
    const seat = ([0, 1] as PlayerId[]).find(index => this.seats[index] === null);
    if (seat === undefined) return null;
    const state = this.makeSeat(name, false);
    state.connection = connection;
    this.seats[seat] = state;
    this.log({ event: "join", seat, name });
    connection.send({ type: "roomJoined", code: this.code, seat, seatToken: state.token, mode: this.mode, settings: this.settings });
    this.broadcastLobby();
    if (this.seats.every(Boolean)) this.start();
    return { seat, token: state.token };
  }

  /** Reattaches a connection to the seat its token names; the seat gets a full snapshot. */
  resume(token: string, connection: Connection): PlayerId | null {
    const seat = ([0, 1] as PlayerId[]).find(index => this.seats[index]?.token && this.seats[index]!.token === token);
    if (seat === undefined) return null;
    const state = this.seats[seat]!;
    if (state.connection && state.connection !== connection) state.connection.send({ type: "left" });
    state.connection = connection;
    this.log({ event: "resume", seat });
    connection.send({ type: "roomJoined", code: this.code, seat, seatToken: state.token, mode: this.mode, settings: this.settings });
    this.broadcastLobby();
    this.broadcast({ type: "presence", seat, connected: true }, seat);
    if (state.cancelGrace) { state.cancelGrace(); state.cancelGrace = null; }
    if (this.cancelBothGone) { this.cancelBothGone(); this.cancelBothGone = null; }
    if (this.pausedUntil !== null) this.resumeTimers();
    if (this.session) this.sendSnapshot(seat);
    return seat;
  }

  /** The connection for `seat` went away. Before the game starts the seat is simply freed. */
  disconnect(seat: PlayerId) {
    const state = this.seats[seat];
    if (!state || state.ai) return;
    state.connection = null;
    if (this.status === "waiting") {
      this.seats[seat] = null;
      this.broadcastLobby();
      if (!this.humanSeats().length) this.close();
      return;
    }
    if (this.status === "finished") { if (!this.connectedHumans().length) this.close(); return; }
    state.disconnects++;
    this.log({ event: "disconnect", seat, count: state.disconnects });
    this.broadcast({ type: "presence", seat, connected: false }, seat);
    if (state.disconnects >= 3) { this.forfeit(seat, "left the table a third time"); return; }
    const grace = state.disconnects === 1 ? GRACE_FIRST_MS : GRACE_LATER_MS;
    if (state.disconnects === 1) this.pauseTimers(grace);
    state.cancelGrace = this.config.scheduler.after(grace, () => { state.cancelGrace = null; this.forfeit(seat, "did not reconnect"); });
    if (!this.connectedHumans().length) {
      this.cancelBothGone?.();
      this.cancelBothGone = this.config.scheduler.after(BOTH_GONE_MS, () => this.abandon());
    }
  }

  /** A seat leaves on purpose: a concession while playing, otherwise the seat is freed. */
  leave(seat: PlayerId) {
    if (this.status === "playing") { this.apply(seat, { type: "concede" }); this.seats[seat]!.connection = null; if (!this.connectedHumans().length) this.close(); return; }
    const state = this.seats[seat];
    if (state) state.connection = null;
    this.disconnect(seat);
  }

  lobbyMessage(): ServerMessage {
    const summary = (seat: Seat | null): SeatSummary => seat ? { name: seat.name, connected: seat.ai || !!seat.connection, ai: seat.ai } : null;
    return { type: "lobby", code: this.code, status: this.status, seats: [summary(this.seats[0]), summary(this.seats[1])], mode: this.mode, settings: this.settings };
  }
  private broadcastLobby() { this.broadcast(this.lobbyMessage()); }

  // --- Game ----------------------------------------------------------------------------------------------------------

  private start() {
    const names = [this.seats[0]!.name, this.seats[1]!.name] as [string, string];
    const aiSeats = this.aiSeats();
    this.session = createSession({
      content: this.config.content, strategicMarket: true, evaluationContent: true,
      carryover: this.settings.carryover, priorityPreference: this.settings.priorityPreference,
      random: seededRandom(this.config.seed), aiSeats, seatNames: names, recordDecisions: false,
      ...(this.config.strategy ? { strategy: this.config.strategy } : {}),
      now: () => this.now,
    });
    this.status = "playing";
    this.startedAt = this.now;
    this.log({ event: "start", seed: this.config.seed, names, aiSeats });
    this.broadcastLobby();
    for (const seat of this.humanSeats()) this.sendSnapshot(seat);
    this.afterChange();
  }

  /** Runs one command for `seat`; the acting seat gets the ack, every seat gets the events that follow. */
  apply(seat: PlayerId, command: Command, requestId?: string): boolean {
    const session = this.session, state = this.seats[seat];
    const reply = (message: ServerMessage) => state?.connection?.send(message);
    if (!session || this.status !== "playing" || !state || state.ai) {
      if (requestId) reply({ type: "ack", requestId, ok: false, message: "No game is in progress for this seat." });
      return false;
    }
    if (this.pausedUntil !== null && command.type !== "concede") {
      if (requestId) reply({ type: "ack", requestId, ok: false, message: "The table is paused while the other player reconnects." });
      return false;
    }
    let event: RuntimeEvent | null;
    try {
      event = this.run(session, seat, command);
    } catch (error) {
      if (requestId) reply({ type: "ack", requestId, ok: false, message: error instanceof Error ? error.message : String(error) });
      return false;
    }
    this.record(seat, command);
    if (session.state.phase === "runtime") state.inputThisTurn = true;
    if (command.type === "concede") this.result = this.resultFrom("concession");
    if (event) this.events.push(event);
    if (requestId) reply({ type: "ack", requestId, ok: true, event: event ? this.forSeat(event, seat) : null, view: session.view(seat), timers: this.timers() });
    if (event) this.broadcast(null, seat, other => ({ type: "event", event: this.forSeat(event!, other), view: session.view(other), timers: this.timers() }));
    this.afterChange();
    return true;
  }

  private run(session: RuntimeSession, seat: PlayerId, command: Command): RuntimeEvent | null {
    switch (command.type) {
      case "deploy": return session.deploy(command.cardId, command.node, seat);
      case "relocate": return session.relocateCard(command.cardId, command.node, seat);
      case "undoPlanning": return session.undoAllPlanning(seat);
      case "endTurn": return session.endTurn(seat);
      case "undoEndTurn": return session.undoEndTurn(seat);
      case "choose": return session.choose(command.selection, seat);
      case "claimCircuit": return session.claimCircuitReward(seat, this.now);
      case "buy": return session.buy(command.pileId, this.now, seat);
      case "endDraft": return session.endDraft(seat);
      case "undoEndDraft": return session.undoEndDraft(seat, this.now);
      case "concede": return session.resign(seat);
    }
  }

  private record(seat: PlayerId | null, command: Command | SystemCommand) {
    this.commands.push({ seq: ++this.seq, seat, at: this.now, command });
  }

  /** A server-initiated change: records it, runs it, broadcasts what it produced. */
  private system(action: SystemCommand["action"], run: () => RuntimeEvent | null, seat?: PlayerId, reason?: string) {
    const session = this.session;
    if (!session || this.status !== "playing") return;
    let event: RuntimeEvent | null;
    try { event = run(); } catch (error) { this.log({ event: "system-error", action, message: error instanceof Error ? error.message : String(error) }); return; }
    // A silent Draft tick or an already-ended Draft changed nothing; a silent auto-commit did (the reveal is queued).
    if (!event && action !== "autoEndTurn") return;
    this.record(null, { type: "system", action, ...(seat !== undefined ? { seat } : {}), ...(reason ? { reason } : {}) });
    if (event) {
      this.events.push(event);
      this.broadcast(null, undefined, other => ({ type: "event", event: this.forSeat(event!, other), view: session.view(other), timers: this.timers() }));
    }
    this.afterChange();
  }

  /** Resolves everything the engine can on its own, then re-arms the timers for wherever the table stands. */
  private afterChange() {
    const session = this.session;
    if (!session || this.status !== "playing") return;
    for (let guard = 0; !session.state.choice && session.pendingCount; guard++) {
      if (guard > 10_000) throw new Error(`Room ${this.code}: resolution failed to terminate.`);
      const { event } = session.step()!;
      this.events.push(event);
      this.broadcast(null, undefined, other => ({ type: "event", event: this.forSeat(event, other), view: session.view(other), timers: this.timers() }));
    }
    if (session.state.phase === "gameover") { this.finish(); return; }
    this.armTimers();
  }

  private armTimers() {
    const session = this.session!, state = session.state, now = this.now;
    if (this.pausedUntil !== null) return;
    // Mandatory choice: a random legal option when the owner does not answer.
    const humanChoice = state.choice && !this.aiSeats().includes(state.choice.owner) ? state.choice : null;
    if (humanChoice) {
      if (this.choiceEndsAt === null) {
        this.choiceEndsAt = now + this.settings.choiceSeconds * 1000;
        this.cancelChoice = this.config.scheduler.after(this.choiceEndsAt - now, () => {
          this.cancelChoice = null; this.choiceEndsAt = null;
          this.system("choiceTimeout", () => session.resolveChoiceTimeout(), humanChoice.owner);
        });
        this.broadcast({ type: "timers", timers: this.timers() });
      }
    } else if (this.choiceEndsAt !== null) { this.cancelChoice?.(); this.cancelChoice = null; this.choiceEndsAt = null; }

    // Runtime turn timer, one deadline for the table; it counts 1.25x faster after a no-input turn.
    const turnKey = state.phase === "runtime" ? `${state.cycle}:${state.turn}` : "";
    if (turnKey && turnKey !== this.armedTurn) {
      this.armedTurn = turnKey;
      for (const seat of this.humanSeats()) this.seats[seat]!.inputThisTurn = false;
      this.cancelTurn?.(); this.cancelTurn = null; this.turnEndsAt = null;
      if (this.settings.turnSeconds > 0) {
        const idle = this.humanSeats().some(seat => this.seats[seat]!.idleTurns > 0);
        this.turnEndsAt = now + Math.round(this.settings.turnSeconds * 1000 / (idle ? 1.25 : 1));
        this.cancelTurn = this.config.scheduler.after(this.turnEndsAt - now, () => this.turnExpired());
        this.broadcast({ type: "timers", timers: this.timers() });
      }
    } else if (!turnKey && this.cancelTurn) { this.cancelTurn(); this.cancelTurn = null; this.turnEndsAt = null; this.armedTurn = ""; }

    // Draft: the engine's deadline, the AI seat's purchases, and the step into the next Cycle.
    if (state.phase === "draft") {
      if (!this.cancelDraft && state.draftEndsAt !== null && !state.draftEnded) {
        this.cancelDraft = this.config.scheduler.after(state.draftEndsAt - now + 20, () => { this.cancelDraft = null; this.system("expireDraft", () => session.expireDraft(this.now)); });
      }
      const aiSeats = this.aiSeats().filter(seat => !state.draftReady[seat]);
      if (aiSeats.length && !this.cancelAiDraft && !state.draftEnded) {
        this.cancelAiDraft = this.config.scheduler.after(AI_DRAFT_TICK_MS, () => {
          this.cancelAiDraft = null;
          for (const seat of aiSeats) this.system("aiDraftStep", () => session.opponentDraftStep(this.now, seat), seat);
          if (this.session?.state.phase === "draft") this.armTimers();
        });
      }
      if (state.draftEnded && !this.cancelNextCycle) {
        this.cancelDraft?.(); this.cancelDraft = null;
        this.cancelNextCycle = this.config.scheduler.after(DRAFT_TO_CYCLE_MS, () => { this.cancelNextCycle = null; this.system("nextCycle", () => session.nextCycle()); });
      }
    } else {
      this.cancelDraft?.(); this.cancelDraft = null;
      this.cancelAiDraft?.(); this.cancelAiDraft = null;
      this.cancelNextCycle?.(); this.cancelNextCycle = null;
    }
  }

  private turnExpired() {
    this.cancelTurn = null; this.turnEndsAt = null;
    const session = this.session;
    if (!session || session.state.phase !== "runtime" || session.state.choice) return;
    for (const seat of this.humanSeats()) {
      const state = this.seats[seat]!;
      if (session.state.turnReady[seat]) continue;
      state.idleTurns = state.inputThisTurn ? 0 : state.idleTurns + 1;
      if (state.idleTurns >= 2) {
        this.result = this.resultFrom("concession");
        this.system("inactivityConcede", () => session.concedeForInactivity(seat), seat, "two Runtime turns without input");
        return;
      }
      this.system("autoEndTurn", () => session.endTurn(seat), seat);
      if (this.session?.state.phase !== "runtime") return;
    }
  }

  // --- Pause, forfeit, finish ----------------------------------------------------------------------------------------

  private pauseTimers(ms: number) {
    if (this.pausedUntil !== null || !this.session) return;
    const now = this.now;
    this.pausedUntil = now + ms;
    this.parked = {
      turn: this.turnEndsAt !== null ? this.turnEndsAt - now : null,
      choice: this.choiceEndsAt !== null ? this.choiceEndsAt - now : null,
      draftAt: now,
    };
    this.cancelTurn?.(); this.cancelTurn = null;
    this.cancelChoice?.(); this.cancelChoice = null;
    this.cancelDraft?.(); this.cancelDraft = null;
    this.cancelAiDraft?.(); this.cancelAiDraft = null;
    this.cancelNextCycle?.(); this.cancelNextCycle = null;
    this.broadcast({ type: "timers", timers: this.timers() });
  }

  private resumeTimers() {
    const session = this.session, parked = this.parked, now = this.now;
    this.pausedUntil = null; this.parked = null;
    if (!session || !parked) return;
    const paused = now - parked.draftAt;
    session.extendDraft(paused);
    if (parked.turn !== null) {
      this.turnEndsAt = now + parked.turn;
      this.cancelTurn = this.config.scheduler.after(parked.turn, () => this.turnExpired());
    }
    if (parked.choice !== null) {
      const owner = session.state.choice?.owner;
      this.choiceEndsAt = now + parked.choice;
      this.cancelChoice = this.config.scheduler.after(parked.choice, () => { this.cancelChoice = null; this.choiceEndsAt = null; this.system("choiceTimeout", () => session.resolveChoiceTimeout(), owner); });
    }
    this.armTimers();
    this.broadcast({ type: "timers", timers: this.timers() });
  }

  private forfeit(seat: PlayerId, why: string) {
    const session = this.session;
    if (!session || this.status !== "playing") return;
    this.result = this.resultFrom("forfeit");
    this.log({ event: "forfeit", seat, why });
    this.system("forfeit", () => session.resign(seat, `${this.seats[seat]!.name} forfeits: ${why}.`), seat, why);
  }

  private abandon() {
    this.cancelBothGone = null;
    if (this.status !== "playing" || !this.session) return;
    this.result = this.resultFrom("abandoned");
    this.log({ event: "abandon" });
    this.system("abandon", () => this.session!.endSessionNow());
  }

  private resultFrom(outcome: GameResult["outcome"]): GameResult {
    const session = this.session!;
    const report = session.matchReport();
    return { winner: report.winner, endedReason: report.endedReason, outcome, finalVP: report.finalVP };
  }

  private finish() {
    const session = this.session!;
    this.status = "finished";
    const result = this.result && this.result.outcome !== "complete" ? { ...this.result, ...this.resultFrom(this.result.outcome) } : this.resultFrom("complete");
    if (result.outcome === "abandoned") result.winner = null;
    this.result = result;
    for (const cancel of [this.cancelTurn, this.cancelChoice, this.cancelDraft, this.cancelAiDraft, this.cancelNextCycle, this.cancelBothGone]) cancel?.();
    this.cancelTurn = this.cancelChoice = this.cancelDraft = this.cancelAiDraft = this.cancelNextCycle = this.cancelBothGone = null;
    for (const seat of this.seats) if (seat?.cancelGrace) { seat.cancelGrace(); seat.cancelGrace = null; }
    const names = [this.seats[0]!.name, this.seats[1]!.name] as [string, string];
    const aiSeats = this.aiSeats();
    this.log({ event: "finish", ...result });
    try {
      this.config.store.saveResult({ code: this.code, mode: this.mode, seatNames: names, aiSeats, startedAt: this.startedAt, endedAt: this.now, cycles: session.state.cycle, result });
      this.config.store.saveReplay(this.replay());
    } catch (error) { this.log({ event: "store-error", message: error instanceof Error ? error.message : String(error) }); }
    for (const seat of this.humanSeats()) this.seats[seat]!.connection?.send({ type: "gameOver", result, view: session.view(seat) });
    this.broadcastLobby();
    this.cancelDispose = this.config.scheduler.after(FINISHED_TTL_MS, () => this.close());
  }

  /** Everything needed to rebuild this game move by move. */
  replay(): ReplayRecord {
    const names = [this.seats[0]?.name ?? "", this.seats[1]?.name ?? ""] as [string, string];
    return {
      code: this.code, mode: this.mode, settings: this.settings, seed: this.config.seed,
      aiSeats: this.aiSeats(), seatNames: names,
      contentRevision: this.config.contentRevision, startedAt: this.startedAt, endedAt: this.now, commands: [...this.commands],
    };
  }

  close() {
    for (const cancel of [this.cancelTurn, this.cancelChoice, this.cancelDraft, this.cancelAiDraft, this.cancelNextCycle, this.cancelBothGone, this.cancelDispose]) cancel?.();
    for (const seat of this.seats) seat?.cancelGrace?.();
    this.config.onClose?.(this);
  }

  // --- Sending -------------------------------------------------------------------------------------------------------

  timers(): Timers {
    const state = this.session?.state;
    return { serverTime: this.now, turnEndsAt: this.turnEndsAt, choiceEndsAt: this.choiceEndsAt, draftEndsAt: state?.phase === "draft" && !state.draftEnded ? state.draftEndsAt : null, pausedUntil: this.pausedUntil };
  }

  /** The event as `seat` may see it: redacted to what it knows and, for seat 1, mirrored. */
  private forSeat(event: RuntimeEvent, seat: PlayerId): RuntimeEvent {
    const redacted = redactEvent(event, seat);
    return seat === 1 ? mirrorEvent(redacted) : redacted;
  }

  viewFor(seat: PlayerId): SessionView | null { return this.session?.view(seat) ?? null; }

  private sendSnapshot(seat: PlayerId) {
    const session = this.session, connection = this.seats[seat]?.connection;
    if (!session || !connection) return;
    connection.send({ type: "snapshot", view: session.view(seat), log: this.events.map(event => this.forSeat(event, seat)), timers: this.timers() });
    if (this.status === "finished" && this.result) connection.send({ type: "gameOver", result: this.result, view: session.view(seat) });
  }

  /** Sends `message` (or `build(seat)`) to every connected human seat except `except`. */
  private broadcast(message: ServerMessage | null, except?: PlayerId, build?: (seat: PlayerId) => ServerMessage) {
    for (const seat of this.connectedHumans()) {
      if (seat === except) continue;
      const payload = message ?? build!(seat);
      this.seats[seat]!.connection!.send(payload);
    }
  }
}
