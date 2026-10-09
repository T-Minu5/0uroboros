/**
 * The game client's end of the wire protocol. One WebSocket, one seat. Views arrive already mirrored for seat 1, so
 * the UI never learns which physical seat it holds beyond `seat`.
 *
 * Events the server pushes queue up for the UI's presentation pump in arrival order. A command's acknowledgement
 * resolves at once with the newest view; anything still queued ahead of it is rebased onto that view.
 */
import type { Card } from '@0uroboros/engine/game';
import type { CycleRecord, RuntimeEvent, SessionView } from '@0uroboros/engine/runtime';
import { PROTOCOL_VERSION, type ClientMessage, type Command, type GameResult, type RoomMode, type RoomSettings, type SeatSummary, type ServerMessage, type Timers } from '@0uroboros/protocol/messages';
import type { ClientChange, ConnectionState, GameClient, Presented } from './GameClient';

export type LobbyState = {
  status: 'idle' | 'connecting' | 'waiting' | 'playing' | 'finished';
  connection: ConnectionState;
  code: string | null;
  seat: 0 | 1 | null;
  seats: [SeatSummary, SeatSummary];
  mode: RoomMode | null;
  settings: RoomSettings | null;
  result: GameResult | null;
  error: string | null;
};

type QueueItem = Presented;
type Pending = { resolve: (event: RuntimeEvent | null) => void; reject: (error: Error) => void };

const SEAT_KEY = 'ouroboros.onlineSeat';
export type SavedSeat = { url: string; code: string; seatToken: string; seat: 0 | 1; name: string };
export const savedSeat = (): SavedSeat | null => { try { return JSON.parse(sessionStorage.getItem(SEAT_KEY) ?? 'null'); } catch { return null; } };
const saveSeat = (seat: SavedSeat | null) => { if (seat) sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat)); else sessionStorage.removeItem(SEAT_KEY); };

/** Where the game server lives: the build's `VITE_GAME_SERVER_URL`, else the page host on the server's default port. */
export function defaultServerUrl(): string {
  const configured = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_GAME_SERVER_URL;
  if (configured) return configured;
  const secure = location.protocol === 'https:';
  return `${secure ? 'wss' : 'ws'}://${location.hostname}:8787`;
}

export class OnlineClient implements GameClient {
  readonly mode = 'online' as const;
  readonly url: string;
  seatNames: [string, string] | null = null;
  lobby: LobbyState = { status: 'idle', connection: 'offline', code: null, seat: null, seats: [null, null], mode: null, settings: null, result: null, error: null };
  private socket: WebSocket | null = null;
  private current: SessionView | null = null;
  private queue: QueueItem[] = [];
  private log: RuntimeEvent[] = [];
  private cycles: CycleRecord[] = [];
  private serverTimers: Timers | null = null;
  private pending = new Map<string, Pending>();
  private listeners = new Set<(change: ClientChange) => void>();
  private lobbyListeners = new Set<(lobby: LobbyState) => void>();
  private requestSerial = 0;
  private seatToken: string | null = null;
  private name = '';
  private reconnectAttempt = 0;
  private reconnectTimer: number | null = null;
  private closed = false;
  /** Server clock minus ours, so deadlines can be shown against local time. */
  clockOffset = 0;

  constructor(url = defaultServerUrl()) { this.url = url; }

  // --- Lobby ---------------------------------------------------------------------------------------------------------

  onLobby(listener: (lobby: LobbyState) => void) { this.lobbyListeners.add(listener); listener(this.lobby); return () => { this.lobbyListeners.delete(listener); }; }
  private setLobby(patch: Partial<LobbyState>) { this.lobby = { ...this.lobby, ...patch }; for (const listener of this.lobbyListeners) listener(this.lobby); }

  /** Opens the socket (or reuses it) and resolves once the server has said hello. */
  connect(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return Promise.resolve();
    this.setLobby({ status: this.lobby.status === 'idle' ? 'connecting' : this.lobby.status, error: null });
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      let settled = false;
      socket.addEventListener('open', () => { this.send({ type: 'hello', protocol: PROTOCOL_VERSION }); });
      socket.addEventListener('message', raw => {
        const message = JSON.parse(String(raw.data)) as ServerMessage;
        if (message.type === 'welcome' && !settled) {
          settled = true; this.reconnectAttempt = 0;
          this.clockOffset = message.serverTime - Date.now();
          this.setLobby({ connection: 'online', status: this.lobby.status === 'connecting' ? 'idle' : this.lobby.status });
          this.emit({ kind: 'connection', state: 'online' });
          resolve();
        }
        this.receive(message);
      });
      socket.addEventListener('close', () => {
        if (this.socket !== socket) return;
        this.socket = null;
        for (const request of this.pending.values()) request.reject(new Error('Connection lost.'));
        this.pending.clear();
        if (!settled) { settled = true; this.setLobby({ connection: 'offline', status: 'idle', error: 'The game server is not reachable.' }); reject(new Error('The game server is not reachable.')); return; }
        if (this.closed || !this.seatToken || this.lobby.status === 'finished') { this.setLobby({ connection: 'offline' }); this.emit({ kind: 'connection', state: 'offline' }); return; }
        this.setLobby({ connection: 'reconnecting' });
        this.emit({ kind: 'connection', state: 'reconnecting' });
        this.scheduleReconnect();
      });
      socket.addEventListener('error', () => { /* close follows */ });
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(20_000, 1_000 * 2 ** this.reconnectAttempt++);
    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
        if (this.lobby.code && this.seatToken) this.send({ type: 'resumeSeat', code: this.lobby.code, seatToken: this.seatToken });
      } catch { this.scheduleReconnect(); }
    }, delay);
  }

  async createRoom(mode: RoomMode, name: string, settings: Partial<RoomSettings> = {}) {
    await this.connect();
    this.name = name;
    this.send({ type: 'createRoom', mode, name, settings });
  }
  async joinRoom(code: string, name: string) {
    await this.connect();
    this.name = name;
    this.send({ type: 'joinRoom', code: code.trim().toUpperCase(), name });
  }
  /** Reclaims a seat saved from an earlier page, e.g. after a reload. */
  async resume(saved: SavedSeat) {
    await this.connect();
    this.name = saved.name; this.seatToken = saved.seatToken;
    this.setLobby({ code: saved.code, seat: saved.seat });
    this.send({ type: 'resumeSeat', code: saved.code, seatToken: saved.seatToken });
  }
  leave() {
    if (this.socket?.readyState === WebSocket.OPEN) this.send({ type: 'leaveRoom' });
    this.seatToken = null; saveSeat(null);
    this.current = null; this.queue = []; this.log = []; this.cycles = []; this.seatNames = null;
    this.setLobby({ status: this.socket ? 'idle' : this.lobby.status, code: null, seat: null, seats: [null, null], result: null, error: null });
  }

  // --- Receiving -----------------------------------------------------------------------------------------------------

  private receive(message: ServerMessage) {
    switch (message.type) {
      case 'welcome': case 'pong': return;
      case 'roomJoined': {
        this.seatToken = message.seatToken;
        this.setLobby({ code: message.code, seat: message.seat, mode: message.mode, settings: message.settings, error: null, status: this.lobby.status === 'idle' || this.lobby.status === 'connecting' ? 'waiting' : this.lobby.status });
        saveSeat({ url: this.url, code: message.code, seatToken: message.seatToken, seat: message.seat, name: this.name });
        return;
      }
      case 'lobby': {
        const names = message.seats.map(seat => seat?.name ?? '') as [string, string];
        const seat = this.lobby.seat ?? 0;
        this.seatNames = message.seats.every(Boolean) ? (seat === 0 ? names : [names[1], names[0]]) : null;
        this.setLobby({ status: message.status, seats: seat === 0 ? message.seats : [message.seats[1], message.seats[0]], mode: message.mode, settings: message.settings });
        return;
      }
      case 'snapshot':
        this.current = message.view; this.queue = []; this.log = [...message.log]; this.cycles = message.cycles; this.serverTimers = message.timers;
        // The listener gets its own copy: this.log keeps growing as events arrive.
        this.emit({ kind: 'snapshot', log: [...message.log] });
        return;
      case 'event':
        this.queue.push({ event: message.event, view: message.view });
        this.log.push(message.event);
        if (message.cycles) this.cycles = message.cycles;
        this.serverTimers = message.timers;
        this.emit({ kind: 'pending' });
        return;
      case 'ack': {
        const request = this.pending.get(message.requestId);
        this.pending.delete(message.requestId);
        if (!message.ok) { request?.reject(new Error(message.message)); return; }
        this.serverTimers = message.timers;
        if (message.event) this.log.push(message.event);
        // The ack's view is the newest; events still queued ahead of it are older and now show against it, so the
        // table never steps backwards once the command's continuation has run.
        for (const item of this.queue) item.view = message.view;
        this.current = message.view;
        request?.resolve(message.event);
        if (this.queue.length) this.emit({ kind: 'pending' });
        return;
      }
      case 'timers': this.serverTimers = message.timers; this.emit({ kind: 'timers', timers: message.timers }); return;
      case 'presence': {
        const seat = this.lobby.seat ?? 0;
        const relative = (message.seat === seat ? 0 : 1) as 0 | 1;
        const seats = [...this.lobby.seats] as [SeatSummary, SeatSummary];
        if (seats[relative]) seats[relative] = { ...seats[relative]!, connected: message.connected };
        this.setLobby({ seats });
        this.emit({ kind: 'presence', seat: relative, connected: message.connected });
        return;
      }
      case 'gameOver':
        this.cycles = message.cycles;
        this.setLobby({ status: 'finished', result: message.result });
        saveSeat(null);
        this.emit({ kind: 'gameOver' });
        return;
      case 'left': this.setLobby({ status: 'idle', code: null, seat: null, seats: [null, null] }); return;
      case 'error':
        if (message.code === 'auth') { this.seatToken = null; saveSeat(null); this.setLobby({ status: 'idle', code: null, seat: null }); }
        this.setLobby({ error: message.message });
        this.emit({ kind: 'error', message: message.message });
        return;
    }
  }

  private emit(change: ClientChange) { for (const listener of this.listeners) listener(change); }

  private send(message: ClientMessage) { this.socket?.send(JSON.stringify(message)); }

  private command(command: Command): Promise<RuntimeEvent | null> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) { reject(new Error('Not connected to the game server.')); return; }
      const requestId = `c${++this.requestSerial}`;
      this.pending.set(requestId, { resolve, reject });
      this.send({ type: 'command', requestId, command });
    });
  }
  private must(command: Command): Promise<RuntimeEvent> {
    return this.command(command).then(event => { if (!event) throw new Error('The server returned no event.'); return event; });
  }

  // --- GameClient ----------------------------------------------------------------------------------------------------

  view() { return this.current; }
  get pendingCount() { return this.queue.length; }
  step(): Presented | null {
    const item = this.queue.shift();
    if (!item) return null;
    this.current = item.view;
    return item;
  }
  subscribe(listener: (change: ClientChange) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  deploy(cardId: string, node: number) { return this.must({ type: 'deploy', cardId, node }); }
  relocateCard(cardId: string, node: number) { return this.must({ type: 'relocate', cardId, node }); }
  undoAllPlanning() { return this.must({ type: 'undoPlanning' }); }
  endTurn() { return this.command({ type: 'endTurn' }); }
  undoEndTurn() { return this.must({ type: 'undoEndTurn' }); }
  choose(selection: string | string[]) { return this.must({ type: 'choose', selection: typeof selection === 'string' ? [selection] : selection }); }
  claimCircuitReward() { return this.must({ type: 'claimCircuit' }); }
  buy(pileId: string) { return this.must({ type: 'buy', pileId }); }
  endDraft() { return this.must({ type: 'endDraft' }); }
  undoEndDraft() { return this.must({ type: 'undoEndDraft' }); }
  concede() { return this.must({ type: 'concede' }); }
  tickDraft() { return null; }
  deckList(): Card[] { return []; }
  cycleHistory() { return this.cycles; }
  matchReport() { return null; }
  timers() { return this.serverTimers; }
  logSoFar() { return this.log; }
  close() {
    this.closed = true;
    if (this.reconnectTimer !== null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.socket?.close();
    this.socket = null;
    this.listeners.clear(); this.lobbyListeners.clear();
  }
}
