/**
 * HTTP + WebSocket front for the Lobby.
 *
 * HTTP:  GET  /healthz                 liveness
 *        POST /auth/magic-link {email} mail a one-time sign-in link
 *        GET  /auth/verify?token=      exchange the link for a session; redirects to the web client with `#session=`
 *        POST /auth/steam {ticket,name} Steam session ticket -> session (desktop build)
 *        POST /auth/apple {identityToken,name} Sign in with Apple -> session (iPad build)
 *        GET  /auth/me                 bearer session -> account
 *        POST /auth/name {name}        rename the signed-in account
 *        POST /auth/sign-out           end the bearer session
 *        GET  /evidence?since=<ms>     finished games with match reports (admin bearer token), for Eco-Strat
 *        GET  /pack/<hash>             a content pack this server has played, immutable; `/pack/current` -> metadata
 *        POST /errors                  a client's crash report, forwarded to the error reporter
 * WS:    one connection per client, at most one seat at a time. `hello` may carry a session token.
 *
 * Limits (Phase 6): per-IP sockets, per-IP HTTP calls on /auth and /errors, per-connection room creation, plus the
 * per-connection message budget. Behind a proxy set `trustProxy` so the client address comes from the proxy headers.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { PROTOCOL_VERSION, parseClientMessage, type AccountSummary, type ClientMessage, type PackInfo, type RoomSettings, type ServerMessage } from "@0uroboros/protocol/messages";
import { Lobby, type LobbyConfig } from "./lobby";
import type { Room } from "./room";
import type { PlayerId } from "@0uroboros/engine/game";
import { Auth, AuthError } from "./auth";
import type { Account, PackRecord, ResultRecord } from "./store";
import { ConcurrencyLimiter, RateLimiter, clientIp } from "./rateLimit";
import { MatchQueue, matchWindow, rateResult, summariseRating } from "./matchmaking";
import { LogReporter, parseClientError, type ErrorReporter } from "./errorReporting";
import { PACK_HASH_PATTERN } from "@0uroboros/content/hash";

export type GameServerConfig = LobbyConfig & {
  /** Messages per connection per 10 s before the server drops the sender. */
  messageBudget?: number;
  /** Sign-in; without it every player is a guest and /auth answers 404. */
  auth?: Auth;
  /** Browser origins allowed to call the HTTP API (the web client); the ws handshake is not origin-restricted. */
  allowedOrigins?: string[];
  /** Where `/auth/verify` sends the browser after sign-in; the session rides in the URL fragment. */
  webOrigin?: string;
  /** Bearer token for /evidence; unset disables the route. */
  adminToken?: string;
  /** The content pack this server plays, as `{hash, revision, document}`; stored so clients can fetch it by hash. */
  pack?: { hash: string; revision: number | null; document: unknown };
  /** Where clients fetch packs by hash (a CDN in front of /pack/); unset, the client uses this server's HTTP twin. */
  packUrl?: string;
  /** Crash reports from the server and from clients (`POST /errors`); defaults to the log. */
  reporter?: ErrorReporter;
  /** Read the client address from Fly/Cloudflare headers. */
  trustProxy?: boolean;
  limits?: Partial<Limits>;
};

export type Limits = {
  /** Open sockets per IP. */
  socketsPerIp: number;
  /** HTTP calls to /auth/* per IP per minute. */
  authPerMinute: number;
  /** Magic links requested per IP per hour. */
  magicLinksPerHour: number;
  /** Client crash reports per IP per minute. */
  errorsPerMinute: number;
  /** Rooms a connection may create (or quick matches it may start) per 10 minutes. */
  roomsPer10Minutes: number;
  /** How often the quick-match queue is swept (ms). */
  matchTickMs: number;
};
export const DEFAULT_LIMITS: Limits = { socketsPerIp: 8, authPerMinute: 30, magicLinksPerHour: 10, errorsPerMinute: 10, roomsPer10Minutes: 12, matchTickMs: 2_000 };

type Client = { socket: WebSocket; ip: string; room: Room | null; seat: PlayerId | null; hello: boolean; account: Account | null; budget: number; budgetAt: number; rooms: number; roomsAt: number; queueName: string; queueSettings: Partial<RoomSettings> };

const MAX_BODY = 4 * 1024;
const PACKS_KEPT = 2;
const summary = (account: Account): AccountSummary => ({ id: account.id, name: account.name, email: account.email });

export class GameServer {
  readonly lobby: Lobby;
  readonly http: Server;
  readonly wss: WebSocketServer;
  private readonly clients = new Set<Client>();
  private readonly config: GameServerConfig;
  private readonly limits: Limits;
  private readonly sockets: ConcurrencyLimiter;
  private readonly authCalls: RateLimiter;
  private readonly magicLinks: RateLimiter;
  private readonly errorReports: RateLimiter;
  private readonly queue: MatchQueue<Client>;
  private cancelMatchTick: (() => void) | null = null;
  readonly reporter: ErrorReporter;

  constructor(config: GameServerConfig) {
    this.config = config;
    this.limits = { ...DEFAULT_LIMITS, ...config.limits };
    const now = () => config.scheduler.now();
    this.sockets = new ConcurrencyLimiter(this.limits.socketsPerIp);
    this.authCalls = new RateLimiter(this.limits.authPerMinute, 60_000, now);
    this.magicLinks = new RateLimiter(this.limits.magicLinksPerHour, 3_600_000, now);
    this.errorReports = new RateLimiter(this.limits.errorsPerMinute, 60_000, now);
    this.queue = new MatchQueue<Client>(now);
    this.reporter = config.reporter ?? new LogReporter(entry => config.log?.(entry));
    this.lobby = new Lobby({ ...config, onFinish: record => this.finished(record) });
    if (config.pack) {
      config.store.savePack({ ...config.pack, publishedAt: now() });
      config.store.prunePacks(PACKS_KEPT);
    }
    this.http = createServer((request, response) => { this.handleHttp(request, response).catch(error => this.fail(response, error)); });
    this.wss = new WebSocketServer({ server: this.http, maxPayload: 64 * 1024 });
    this.wss.on("connection", (socket, request) => this.accept(socket, request));
  }

  /** The pack clients should hold to match this server. */
  packInfo(): PackInfo {
    return { hash: this.config.pack?.hash ?? "", revision: this.config.pack?.revision ?? null, url: this.config.packUrl ?? null };
  }

  private finished(record: ResultRecord) {
    const rated = rateResult(this.config.store, record, this.config.scheduler.now());
    if (rated) this.config.log?.({ event: "rated", code: record.code, elo: rated.map(rating => Math.round(rating.elo)) });
  }

  listen(port: number, host = "0.0.0.0"): Promise<number> {
    return new Promise((resolve, reject) => {
      this.http.once("error", reject);
      this.http.listen(port, host, () => resolve((this.http.address() as AddressInfo).port));
    });
  }

  async close() {
    this.cancelMatchTick?.(); this.cancelMatchTick = null;
    for (const client of this.clients) client.socket.close(1001, "Server shutting down");
    this.lobby.closeAll();
    await new Promise<void>(resolve => this.wss.close(() => resolve()));
    await new Promise<void>(resolve => this.http.close(() => resolve()));
  }

  // --- HTTP ----------------------------------------------------------------------------------------------------------

  private async handleHttp(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://localhost");
    this.cors(request, response);
    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }

    if (url.pathname === "/healthz") return json(response, 200, { ok: true, protocol: PROTOCOL_VERSION, rooms: this.lobby.rooms.size, clients: this.clients.size, queued: this.queue.size, auth: !!this.config.auth, pack: this.packInfo() });

    if (url.pathname.startsWith("/pack/")) {
      const hash = url.pathname.slice("/pack/".length);
      if (hash === "current") return json(response, 200, this.packInfo());
      if (!PACK_HASH_PATTERN.test(hash)) return json(response, 400, { error: "Pack hashes are 16 hex characters." });
      const pack = this.config.store.pack(hash);
      if (!pack) return json(response, 404, { error: "This server does not have that pack." });
      response.writeHead(200, { "content-type": "application/json", "cache-control": "public, max-age=31536000, immutable" });
      response.end(JSON.stringify(exportPack(pack)));
      return;
    }

    const ip = clientIp(request.headers, request.socket.remoteAddress, this.config.trustProxy ?? false);

    if (url.pathname === "/errors") {
      if (request.method !== "POST") return json(response, 405, { error: "POST a crash report." });
      if (!this.errorReports.take(ip)) return json(response, 429, { error: "Too many reports." });
      const report = parseClientError(await readJson(request));
      if (!report) return json(response, 400, { error: "A report needs a message." });
      const error = new Error(report.message);
      // The client's own stack, or none: this server's frames would only mislead.
      error.stack = report.stack ?? `Error: ${report.message}`;
      this.reporter.report(error, { source: "client", tags: { platform: report.platform ?? "unknown", version: report.version ?? "unknown" }, extra: { url: report.url } });
      return json(response, 202, { ok: true });
    }

    if (url.pathname === "/evidence") {
      if (!this.config.adminToken || !sameToken(bearer(request), this.config.adminToken)) return json(response, this.config.adminToken ? 401 : 404, { error: "not available" });
      const since = Number(url.searchParams.get("since") ?? 0);
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200)));
      return json(response, 200, { results: this.config.store.resultsSince(Number.isFinite(since) ? since : 0, limit).map(exportResult) });
    }

    const auth = this.config.auth;
    if (url.pathname.startsWith("/auth/")) {
      if (!auth) return json(response, 404, { error: "Sign-in is not enabled on this server." });
      if (!this.authCalls.take(ip)) return json(response, 429, { error: "Too many requests; try again in a minute." });
      try {
        switch (`${request.method} ${url.pathname}`) {
          case "POST /auth/magic-link": {
            if (!this.magicLinks.take(ip)) return json(response, 429, { error: "Too many sign-in links requested; try again later." });
            const body = await readJson(request) as { email?: unknown };
            await auth.requestLink(typeof body.email === "string" ? body.email : "");
            return json(response, 200, { ok: true, message: "Check your e-mail for the sign-in link." });
          }
          case "GET /auth/verify": {
            const { session, account } = auth.verify(url.searchParams.get("token") ?? "");
            if (this.config.webOrigin && !(request.headers.accept ?? "").includes("application/json")) {
              response.writeHead(302, { location: `${this.config.webOrigin.replace(/\/$/, "")}/#session=${session}`, "cache-control": "no-store" });
              response.end();
              return;
            }
            return json(response, 200, { session, account: summary(account) });
          }
          case "POST /auth/steam": case "POST /auth/apple": {
            const provider = url.pathname.endsWith("steam") ? "steam" : "apple";
            const body = await readJson(request) as { ticket?: unknown; identityToken?: unknown; name?: unknown };
            const credential = provider === "steam" ? body.ticket : body.identityToken;
            const linkTo = auth.authenticate(bearer(request));
            const { session, account } = await auth.signInWith(provider, typeof credential === "string" ? credential : "", typeof body.name === "string" ? body.name : undefined, linkTo);
            return json(response, 200, { session, account: summary(account) });
          }
          case "GET /auth/me": {
            const account = auth.authenticate(bearer(request));
            return account ? json(response, 200, { account: summary(account), rating: summariseRating(this.config.store.rating(account.id)) }) : json(response, 401, { error: "Signed out." });
          }
          case "POST /auth/name": {
            const account = auth.authenticate(bearer(request));
            if (!account) return json(response, 401, { error: "Signed out." });
            const body = await readJson(request) as { name?: unknown };
            const renamed = auth.rename(account, typeof body.name === "string" ? body.name : "");
            for (const client of this.clients) if (client.account?.id === renamed.id) client.account = renamed;
            return json(response, 200, { account: summary(renamed) });
          }
          case "POST /auth/sign-out": {
            const token = bearer(request);
            if (token) auth.signOut(token);
            return json(response, 200, { ok: true });
          }
        }
      } catch (error) {
        if (error instanceof AuthError) return json(response, error.status, { error: error.message });
        throw error;
      }
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("0uroboros game server");
  }

  private cors(request: IncomingMessage, response: ServerResponse) {
    const origin = request.headers.origin;
    const allowed = this.config.allowedOrigins ?? [];
    if (origin && (allowed.includes("*") || allowed.includes(origin))) {
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader("vary", "origin");
      response.setHeader("access-control-allow-headers", "authorization, content-type");
      response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
      response.setHeader("access-control-max-age", "600");
    }
  }

  private fail(response: ServerResponse, error: unknown) {
    this.config.log?.({ event: "http-error", message: error instanceof Error ? error.message : String(error) });
    if (!(error instanceof HttpError)) this.reporter.report(error, { source: "server", tags: { origin: "http" } });
    if (!response.headersSent) json(response, error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : "Request failed." });
    else response.end();
  }

  // --- WebSocket -----------------------------------------------------------------------------------------------------

  private accept(socket: WebSocket, request: IncomingMessage) {
    const ip = clientIp(request.headers, request.socket.remoteAddress, this.config.trustProxy ?? false);
    const send = (message: ServerMessage) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message)); };
    if (!this.sockets.hold(ip)) {
      this.config.log?.({ event: "socket-limit", ip });
      send({ type: "error", code: "rate", message: "Too many connections from your address." });
      socket.close(1008, "connection limit");
      return;
    }
    const now = this.config.scheduler.now();
    const client: Client = { socket, ip, room: null, seat: null, hello: false, account: null, budget: 0, budgetAt: now, rooms: 0, roomsAt: now, queueName: "", queueSettings: {} };
    this.clients.add(client);
    socket.on("message", data => {
      if (!this.withinBudget(client)) { send({ type: "error", code: "rate", message: "Too many messages." }); socket.close(1008, "rate limit"); return; }
      const parsed = parseClientMessage(data as Buffer);
      if ("error" in parsed) { send({ type: "error", code: "protocol", message: parsed.error }); return; }
      try { this.dispatch(client, parsed, send); } catch (error) {
        this.config.log?.({ event: "dispatch-error", message: error instanceof Error ? error.message : String(error) });
        this.reporter.report(error, { source: "server", tags: { origin: "dispatch", message: parsed.type } });
        send({ type: "error", code: "room", message: error instanceof Error ? error.message : "Request failed." });
      }
    });
    socket.on("close", () => {
      this.clients.delete(client);
      this.sockets.release(ip);
      this.queue.leave(client);
      if (client.room && client.seat !== null) client.room.disconnect(client.seat);
      client.room = null; client.seat = null;
    });
    socket.on("error", () => { /* close follows */ });
  }

  private withinBudget(client: Client): boolean {
    const now = this.config.scheduler.now();
    if (now - client.budgetAt >= 10_000) { client.budget = 0; client.budgetAt = now; }
    return ++client.budget <= (this.config.messageBudget ?? 400);
  }

  /** Room creation and quick-match entry share one per-connection allowance. */
  private mayCreateRoom(client: Client): boolean {
    const now = this.config.scheduler.now();
    if (now - client.roomsAt >= 600_000) { client.rooms = 0; client.roomsAt = now; }
    return ++client.rooms <= this.limits.roomsPer10Minutes;
  }

  // --- Quick match ---------------------------------------------------------------------------------------------------

  private ratingOf(client: Client) { return client.account ? this.config.store.rating(client.account.id)?.elo ?? 1200 : 1200; }

  private enqueue(client: Client, send: (message: ServerMessage) => void) {
    const ticket = this.queue.join(client, client.account?.id ?? null, this.ratingOf(client));
    send({ type: "queued", since: ticket.since, rating: Math.round(ticket.rating), window: 100, waiting: this.queue.size });
    this.sweepQueue();
    if (this.queue.size && !this.cancelMatchTick) this.scheduleMatchTick();
  }

  private scheduleMatchTick() {
    this.cancelMatchTick = this.config.scheduler.after(this.limits.matchTickMs, () => {
      this.cancelMatchTick = null;
      this.sweepQueue();
      if (this.queue.size) this.scheduleMatchTick();
    });
  }

  /** Pairs what can be paired and tells everyone still waiting how wide their window has grown. */
  private sweepQueue() {
    for (const [a, b] of this.queue.match()) this.seatPair(a.player, b.player);
    const now = this.config.scheduler.now();
    for (const client of this.clients) {
      const ticket = this.queue.ticket(client);
      if (ticket && now > ticket.since) this.sendTo(client, { type: "queued", since: ticket.since, rating: Math.round(ticket.rating), window: matchWindow(now - ticket.since), waiting: this.queue.size });
    }
  }

  private seatPair(a: Client, b: Client) {
    const connection = (client: Client) => ({ send: (message: ServerMessage) => this.sendTo(client, message) });
    // The longer-waiting player's table rules apply; both must still be unseated and connected.
    for (const client of [a, b]) if (client.room || client.socket.readyState !== client.socket.OPEN) { this.sendTo(client, { type: "error", code: "room", message: "Quick match fell through; try again." }); return; }
    const room = this.lobby.createRoom("pvp", a.queueSettings);
    for (const client of [a, b]) {
      const seated = room.join(this.seatName(client, client.queueName), connection(client), client.account?.id ?? null)!;
      client.room = room; client.seat = seated.seat;
    }
    this.config.log?.({ event: "quick-match", code: room.code, ratings: [this.ratingOf(a), this.ratingOf(b)].map(Math.round) });
  }

  private sendTo(client: Client, message: ServerMessage) { if (client.socket.readyState === client.socket.OPEN) client.socket.send(JSON.stringify(message)); }

  private dispatch(client: Client, message: ClientMessage, send: (message: ServerMessage) => void) {
    const connection = { send };
    if (!client.hello && message.type !== "hello") { send({ type: "error", code: "protocol", message: "Say hello first." }); return; }
    switch (message.type) {
      case "hello":
        client.hello = true;
        client.account = this.config.auth?.authenticate(message.session) ?? null;
        send({ type: "welcome", protocol: PROTOCOL_VERSION, serverTime: this.config.scheduler.now(), account: client.account ? summary(client.account) : null, pack: this.packInfo(), rating: client.account ? summariseRating(this.config.store.rating(client.account.id)) : null });
        if (message.protocol !== PROTOCOL_VERSION) send({ type: "error", code: "protocol", message: `This server speaks protocol ${PROTOCOL_VERSION}; update the game.` });
        return;
      case "ping":
        send({ type: "pong", at: message.at, serverTime: this.config.scheduler.now() });
        return;
      case "createRoom": {
        if (client.room) { send({ type: "error", code: "room", message: "Leave your current room first." }); return; }
        if (this.queue.has(client)) this.queue.leave(client);
        if (!this.mayCreateRoom(client)) { send({ type: "error", code: "rate", message: "You are opening tables too quickly; wait a few minutes." }); return; }
        const room = this.lobby.createRoom(message.mode, message.settings ?? {});
        const seated = room.join(this.seatName(client, message.name), connection, client.account?.id ?? null)!;
        client.room = room; client.seat = seated.seat;
        return;
      }
      case "joinRoom": {
        if (client.room) { send({ type: "error", code: "room", message: "Leave your current room first." }); return; }
        const room = this.lobby.get(message.code);
        if (!room) { send({ type: "error", code: "room", message: "No table has that code." }); return; }
        const seated = room.join(this.seatName(client, message.name), connection, client.account?.id ?? null);
        if (!seated) { send({ type: "error", code: "room", message: "That table is full or already playing." }); return; }
        client.room = room; client.seat = seated.seat;
        return;
      }
      case "resumeSeat": {
        const room = this.lobby.get(message.code);
        const seat = room?.resume(message.seatToken, connection) ?? null;
        if (!room || seat === null) { send({ type: "error", code: "auth", message: "That seat is no longer available." }); return; }
        if (client.room && client.room !== room && client.seat !== null) client.room.disconnect(client.seat);
        client.room = room; client.seat = seat;
        return;
      }
      case "leaveRoom":
        if (client.room && client.seat !== null) client.room.leave(client.seat);
        client.room = null; client.seat = null;
        this.queue.leave(client);
        send({ type: "left" });
        return;
      case "quickMatch":
        if (client.room) { send({ type: "error", code: "room", message: "Leave your current room first." }); return; }
        if (!this.mayCreateRoom(client)) { send({ type: "error", code: "rate", message: "You are starting matches too quickly; wait a few minutes." }); return; }
        client.queueName = message.name; client.queueSettings = message.settings ?? {};
        this.enqueue(client, send);
        return;
      case "cancelQuickMatch":
        this.queue.leave(client);
        send({ type: "left" });
        return;
      case "command":
        if (!client.room || client.seat === null) { send({ type: "ack", requestId: message.requestId, ok: false, message: "You are not seated at a table." }); return; }
        client.room.apply(client.seat, message.command, message.requestId);
        return;
    }
  }

  /** A signed-in player sits under the account's name, so nobody can impersonate another account at the table. */
  private seatName(client: Client, requested: string) { return client.account?.name ?? requested; }
}

class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function bearer(request: IncomingMessage): string | null {
  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() || null : null;
}

function sameToken(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new HttpError(413, "Request too large.")); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new HttpError(400, "Body must be JSON.")); }
    });
    request.on("error", reject);
  });
}

/** A pack as clients fetch it: the stored document plus its hash so the client can verify what it got. */
function exportPack(pack: PackRecord) { return { hash: pack.hash, revision: pack.revision, document: pack.document }; }

/** What /evidence hands to the studio: the result and match report, never account e-mails or seat tokens. */
function exportResult(record: ResultRecord) {
  return {
    code: record.code, mode: record.mode, seatNames: record.seatNames, aiSeats: record.aiSeats, startedAt: record.startedAt, endedAt: record.endedAt,
    cycles: record.cycles, result: record.result, signedIn: (record.accountIds ?? [null, null]).map(id => id !== null), report: record.report ?? null,
  };
}
