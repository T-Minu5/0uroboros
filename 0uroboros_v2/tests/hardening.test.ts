/**
 * Phase 6: rate limits, quick match with Elo ratings, error reporting, and content pack rollout by hash.
 */
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { PACK_HASH, PACK_REVISION, publishedContent, publishedRawDocument } from "@0uroboros/content/document";
import { PACK_HASH_PATTERN, canonicalJson, packHash } from "@0uroboros/content/hash";
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "@0uroboros/protocol/messages";
import { Auth, ConsoleMailer } from "@0uroboros/server/auth";
import { GameServer } from "@0uroboros/server/gameServer";
import { ManualScheduler } from "@0uroboros/server/scheduler";
import { MemoryStore, SqliteStore, type ResultRecord, type Store } from "@0uroboros/server/store";
import { ConcurrencyLimiter, RateLimiter, clientIp } from "@0uroboros/server/rateLimit";
import { MatchQueue, PROVISIONAL_GAMES, matchWindow, rateResult } from "@0uroboros/server/matchmaking";
import { LogReporter, SentryReporter, parseClientError, parseDsn, type ErrorContext } from "@0uroboros/server/errorReporting";
import { ELO_START, eloUpdate } from "@0uroboros/engine/elo";
import { eloUpdate as leagueElo } from "../server/agents/league";
import { bundledPackHash, compileRawPack, packUrl, resolvePack } from "../src/contentPack/packByHash";

const content = publishedContent();

// --- Pack hash -------------------------------------------------------------------------------------------------------

describe("pack hash", () => {
  it("is stable across key order and undefined fields, and matches the published constant", () => {
    expect(canonicalJson({ b: 1, a: [{ d: null, c: "x" }], e: undefined })).toBe('{"a":[{"c":"x","d":null}],"b":1}');
    expect(packHash({ a: 1, b: 2 })).toBe(packHash({ b: 2, a: 1 }));
    expect(packHash({ a: 1 })).not.toBe(packHash({ a: 2 }));
    expect(PACK_HASH).toMatch(PACK_HASH_PATTERN);
    expect(packHash(publishedRawDocument())).toBe(PACK_HASH);
  });
});

// --- Limits ----------------------------------------------------------------------------------------------------------

describe("rate limits", () => {
  it("counts per key per window and resets when the window passes", () => {
    let now = 0;
    const limiter = new RateLimiter(3, 1000, () => now);
    expect([limiter.take("a"), limiter.take("a"), limiter.take("a"), limiter.take("a")]).toEqual([true, true, true, false]);
    expect(limiter.take("b")).toBe(true);
    now = 999; expect(limiter.take("a")).toBe(false);
    now = 1000; expect(limiter.take("a")).toBe(true);
  });
  it("tracks concurrent holds", () => {
    const sockets = new ConcurrencyLimiter(2);
    expect([sockets.hold("ip"), sockets.hold("ip"), sockets.hold("ip")]).toEqual([true, true, false]);
    sockets.release("ip");
    expect(sockets.hold("ip")).toBe(true);
    sockets.release("ip"); sockets.release("ip"); sockets.release("ip");
    expect(sockets.count("ip")).toBe(0);
  });
  it("reads the client address from proxy headers only when trusted", () => {
    const headers = { "fly-client-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1, 10.0.0.1" };
    expect(clientIp(headers, "10.0.0.2", true)).toBe("203.0.113.9");
    expect(clientIp({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }, "10.0.0.2", true)).toBe("198.51.100.1");
    expect(clientIp(headers, "10.0.0.2", false)).toBe("10.0.0.2");
    expect(clientIp({}, undefined, true)).toBe("unknown");
  });
});

// --- Matchmaking -----------------------------------------------------------------------------------------------------

const pvp = (a: string | null, b: string | null, winner: 0 | 1 | null, outcome: ResultRecord["result"]["outcome"] = "complete"): ResultRecord => ({
  code: "T", mode: "pvp", seatNames: ["A", "B"], aiSeats: [], startedAt: 0, endedAt: 1, cycles: 3, result: { winner, endedReason: null, outcome, finalVP: [10, 5] }, accountIds: [a, b], report: null,
});

describe("ratings", () => {
  it("shares the league's Elo maths", () => { expect(eloUpdate(1200, 1200, 1, 32)).toEqual(leagueElo(1200, 1200, 1, 32)); });

  for (const [label, open] of [["memory", async () => new MemoryStore() as Store], ["sqlite", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    return new SqliteStore(new DatabaseSync(":memory:") as unknown as ConstructorParameters<typeof SqliteStore>[0]) as Store;
  }]] as const) {
    it(`${label}: rates pvp games between signed-in players and skips everything else`, async () => {
      const store = await open();
      expect(rateResult(store, pvp("a", null, 0), 1)).toBeNull();
      expect(rateResult(store, { ...pvp("a", "b", 0), mode: "ai" }, 1)).toBeNull();
      expect(rateResult(store, pvp("a", "b", null, "abandoned"), 1)).toBeNull();
      expect(rateResult(store, pvp("a", "a", 0), 1)).toBeNull();

      const [a, b] = rateResult(store, pvp("a", "b", 0), 5)!;
      expect(a.elo).toBe(ELO_START + 16); expect(b.elo).toBe(ELO_START - 16);
      expect(a).toMatchObject({ games: 1, wins: 1, losses: 0, ties: 0, updatedAt: 5 });
      expect(store.rating("b")).toMatchObject({ games: 1, wins: 0, losses: 1 });
      // A concession is a loss for the conceding seat, a tie splits the points, and K drops after the provisional games.
      rateResult(store, pvp("a", "b", 1, "concession"), 6);
      expect(store.rating("b")!.wins).toBe(1);
      const before = store.rating("a")!.elo;
      rateResult(store, pvp("a", "b", null), 7);
      expect(store.rating("a")!.ties).toBe(1);
      expect(Math.abs(store.rating("a")!.elo - before)).toBeLessThan(1);
      for (let i = 0; i < PROVISIONAL_GAMES; i++) rateResult(store, pvp("a", "b", 0), 10 + i);
      const settled = store.rating("a")!.elo;
      rateResult(store, pvp("a", "c", 1), 100);
      expect(settled - store.rating("a")!.elo).toBeLessThan(16.01);
    });
  }
});

describe("quick-match queue", () => {
  it("pairs the closest ratings inside a window that widens with waiting, never an account with itself", () => {
    let now = 0;
    const queue = new MatchQueue<string>(() => now);
    expect(matchWindow(0)).toBe(100); expect(matchWindow(30_000)).toBe(250); expect(matchWindow(10 * 60_000)).toBe(1000);
    queue.join("ada", "acc-a", 1200);
    queue.join("bo", "acc-b", 1500);
    expect(queue.match()).toEqual([]);
    queue.join("cy", null, 1250);
    queue.join("ada-phone", "acc-a", 1200);
    const [pair] = queue.match();
    expect([pair[0].player, pair[1].player].sort()).toEqual(["ada", "cy"]);
    expect(queue.size).toBe(2);
    // ada's other device and bo are 300 apart: matched once both have waited 40 s.
    now = 39_000; expect(queue.match()).toEqual([]);
    now = 40_000; expect(queue.match().length).toBe(1);
    expect(queue.size).toBe(0);
    queue.join("solo", null, 1200); queue.leave("solo"); expect(queue.has("solo")).toBe(false);
  });
});

// --- Error reporting -------------------------------------------------------------------------------------------------

describe("error reporting", () => {
  it("posts a Sentry envelope with the DSN's key, release and tags", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return new Response("", { status: 200 }); }) as typeof fetch;
    expect(parseDsn("https://abc@o1.ingest.sentry.io/42")).toEqual({ endpoint: "https://o1.ingest.sentry.io/api/42/envelope/", auth: "Sentry sentry_version=7, sentry_client=ouroboros-server/1, sentry_key=abc" });
    expect(() => parseDsn("https://sentry.io/")).toThrow();
    const reporter = new SentryReporter({ dsn: "https://abc@o1.ingest.sentry.io/42", release: "1.2.3", environment: "test", fetchImpl, now: () => 0 });
    const error = new Error("boom"); error.stack = "Error: boom\n    at play (/app/room.ts:10:5)\n    at <anonymous>";
    reporter.report(error, { source: "client", tags: { platform: "ipad" }, extra: { url: "app://game/" } });
    await reporter.flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://o1.ingest.sentry.io/api/42/envelope/");
    expect((calls[0].init.headers as Record<string, string>)["x-sentry-auth"]).toContain("sentry_key=abc");
    const [header, item, body] = String(calls[0].init.body).trim().split("\n").map(line => JSON.parse(line));
    expect(header.event_id).toMatch(/^[0-9a-f]{32}$/);
    expect(item).toEqual({ type: "event" });
    expect(body).toMatchObject({ release: "1.2.3", environment: "test", level: "error", tags: { source: "client", platform: "ipad" }, extra: { url: "app://game/" } });
    expect(body.exception.values[0]).toMatchObject({ value: "boom", stacktrace: { frames: [{ function: "play", filename: "/app/room.ts", lineno: 10, colno: 5 }] } });
  });
  it("logs when no DSN is configured and clamps client reports", () => {
    const entries: Record<string, unknown>[] = [];
    new LogReporter(entry => entries.push(entry)).report("plain string", { source: "server", tags: { origin: "test" } });
    expect(entries[0]).toMatchObject({ event: "error-report", source: "server", message: "plain string", origin: "test" });
    expect(parseClientError(null)).toBeNull();
    expect(parseClientError({ message: "   " })).toBeNull();
    expect(parseClientError({ message: "x".repeat(600), stack: "y".repeat(3000), platform: 7 })).toMatchObject({ message: "x".repeat(500), stack: "y".repeat(2000), platform: undefined });
  });
});

// --- Over the wire ---------------------------------------------------------------------------------------------------

describe("game server hardening", () => {
  const servers: GameServer[] = [];
  afterEach(async () => { for (const server of servers.splice(0)) await server.close(); });

  const reports: { error: unknown; context: ErrorContext }[] = [];
  const reporter = { report: (error: unknown, context: ErrorContext) => { reports.push({ error, context }); }, flush: async () => undefined };

  async function serve(options: Partial<ConstructorParameters<typeof GameServer>[0]> = {}) {
    const store = (options.store as Store | undefined) ?? new MemoryStore();
    const scheduler = new ManualScheduler();
    const server = new GameServer({
      content, contentRevision: PACK_REVISION, scheduler, store, reporter,
      pack: { hash: PACK_HASH, revision: PACK_REVISION, document: publishedRawDocument() },
      auth: new Auth({ store, mailer: new ConsoleMailer(), publicUrl: "http://api.test", now: () => scheduler.now() }),
      ...options,
    });
    servers.push(server);
    const port = await server.listen(0, "127.0.0.1");
    return { server, port, store, scheduler, base: `http://127.0.0.1:${port}` };
  }

  async function connect(port: number, headers: Record<string, string> = {}) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, { headers });
    const inbox: ServerMessage[] = [];
    const waiters: ((m: ServerMessage) => void)[] = [];
    socket.on("message", data => { const m = JSON.parse(data.toString()) as ServerMessage; inbox.push(m); for (const w of waiters.splice(0)) w(m); });
    const closed = new Promise<number>(resolve => socket.once("close", code => resolve(code)));
    await new Promise<void>((resolve, reject) => { socket.once("open", () => resolve()); socket.once("error", reject); });
    const send = (m: ClientMessage) => socket.send(JSON.stringify(m));
    const until = <T extends ServerMessage>(test: (m: ServerMessage) => boolean) => new Promise<T>((resolve, reject) => {
      const found = inbox.find(test); if (found) return resolve(found as T);
      const timer = setTimeout(() => reject(new Error(`timeout; inbox ${inbox.map(m => m.type)}`)), 5000);
      const check = (m: ServerMessage) => { if (test(m)) { clearTimeout(timer); resolve(m as T); } else waiters.push(check); };
      waiters.push(check);
    });
    return { socket, inbox, send, until, closed, close: () => socket.close() };
  }

  it("announces the pack in welcome and serves it immutably by hash", async () => {
    const { port, base } = await serve({ packUrl: "https://cdn.test/pack" });
    const client = await connect(port);
    client.send({ type: "hello", protocol: PROTOCOL_VERSION });
    const welcome = await client.until<Extract<ServerMessage, { type: "welcome" }>>(m => m.type === "welcome");
    expect(welcome.pack).toEqual({ hash: PACK_HASH, revision: PACK_REVISION, url: "https://cdn.test/pack" });
    expect(welcome.rating).toBeNull();
    client.close();

    expect(await (await fetch(`${base}/pack/current`)).json()).toEqual(welcome.pack);
    const pack = await fetch(`${base}/pack/${PACK_HASH}`);
    expect(pack.headers.get("cache-control")).toContain("immutable");
    const body = await pack.json() as { hash: string; revision: number; document: unknown };
    expect(body.hash).toBe(PACK_HASH);
    expect(packHash(body.document)).toBe(PACK_HASH);
    expect((await fetch(`${base}/pack/${"0".repeat(16)}`)).status).toBe(404);
    expect((await fetch(`${base}/pack/not-a-hash`)).status).toBe(400);
    expect(((await (await fetch(`${base}/healthz`)).json()) as { pack: { hash: string } }).pack.hash).toBe(PACK_HASH);
  });

  it("keeps the current and previous pack in the store, dropping older ones", async () => {
    const store = new MemoryStore();
    const older = { hash: packHash({ v: 1 }), revision: 1, document: { v: 1 } };
    const previous = { hash: packHash({ v: 2 }), revision: 2, document: { v: 2 } };
    store.savePack({ ...older, publishedAt: 1 }); store.savePack({ ...previous, publishedAt: 2 });
    const { base } = await serve({ store });
    expect(store.listPacks().map(pack => pack.revision)).toEqual([PACK_REVISION, 2]);
    expect((await fetch(`${base}/pack/${previous.hash}`)).status).toBe(200);
    expect((await fetch(`${base}/pack/${older.hash}`)).status).toBe(404);
  });

  it("limits sockets per address, auth calls per minute and room creation per connection", async () => {
    const { port, base, scheduler } = await serve({ limits: { socketsPerIp: 2, authPerMinute: 2, roomsPer10Minutes: 1 } });
    const a = await connect(port), b = await connect(port);
    const c = await connect(port);
    expect(await c.closed).toBe(1008);
    expect(c.inbox.at(-1)).toMatchObject({ type: "error", code: "rate" });
    // Another address is not affected when the proxy header is trusted.
    const { port: proxied } = await serve({ trustProxy: true, limits: { socketsPerIp: 1 } });
    const p1 = await connect(proxied, { "fly-client-ip": "203.0.113.1" }), p2 = await connect(proxied, { "fly-client-ip": "203.0.113.2" });
    p1.send({ type: "hello", protocol: PROTOCOL_VERSION }); p2.send({ type: "hello", protocol: PROTOCOL_VERSION });
    await p1.until(m => m.type === "welcome"); await p2.until(m => m.type === "welcome");
    p1.close(); p2.close();

    a.send({ type: "hello", protocol: PROTOCOL_VERSION });
    await a.until(m => m.type === "welcome");
    a.send({ type: "createRoom", mode: "pvp", name: "Ada" });
    await a.until(m => m.type === "roomJoined");
    a.send({ type: "leaveRoom" });
    await a.until(m => m.type === "left");
    a.send({ type: "createRoom", mode: "pvp", name: "Ada" });
    expect(await a.until(m => m.type === "error")).toMatchObject({ code: "rate" });
    a.close(); b.close();

    const post = (body: unknown) => fetch(`${base}/auth/magic-link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await post({ email: "ada@example.com" })).status).toBe(200);
    expect((await post({ email: "ada@example.com" })).status).toBe(200);
    expect((await post({ email: "ada@example.com" })).status).toBe(429);
    scheduler.advance(60_000);
    expect((await post({ email: "ada@example.com" })).status).toBe(200);
  });

  it("accepts client crash reports, forwards them to the reporter and rate limits them", async () => {
    reports.length = 0;
    const { base } = await serve({ limits: { errorsPerMinute: 2 } });
    const post = (body: unknown) => fetch(`${base}/errors`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await post({ message: "Cannot read properties of undefined", stack: "TypeError: x\n    at f (app://game/assets/index.js:1:2)", platform: "desktop", version: "0.1.0", url: "app://game/" })).status).toBe(202);
    expect((await post({ nope: true })).status).toBe(400);
    expect((await post({ message: "second" })).status).toBe(429);
    expect((await fetch(`${base}/errors`)).status).toBe(405);
    expect(reports).toHaveLength(1);
    expect(reports[0].context).toMatchObject({ source: "client", tags: { platform: "desktop", version: "0.1.0" }, extra: { url: "app://game/" } });
    expect((reports[0].error as Error).message).toBe("Cannot read properties of undefined");
  });

  it("quick-matches two players into one pvp table, reports queue progress, and rates the finished game", async () => {
    const { port, base, scheduler, store } = await serve();
    // Two signed-in players (sessions live in the shared store), so the game is rated.
    const mailer = new ConsoleMailer();
    const signIn = async (email: string) => {
      const a = new Auth({ store, mailer, publicUrl: "http://api.test", now: () => scheduler.now() });
      await a.requestLink(email);
      return a.verify(new URL(mailer.lastLink!).searchParams.get("token")!).session;
    };
    const adaSession = await signIn("ada@example.com"), boSession = await signIn("bo@example.com");

    const ada = await connect(port), bo = await connect(port), guest = await connect(port);
    ada.send({ type: "hello", protocol: PROTOCOL_VERSION, session: adaSession });
    bo.send({ type: "hello", protocol: PROTOCOL_VERSION, session: boSession });
    guest.send({ type: "hello", protocol: PROTOCOL_VERSION });
    for (const c of [ada, bo, guest]) await c.until(m => m.type === "welcome");

    ada.send({ type: "quickMatch", name: "Ada", settings: { turnSeconds: 30 } });
    const queued = await ada.until<Extract<ServerMessage, { type: "queued" }>>(m => m.type === "queued");
    expect(queued).toMatchObject({ rating: 1200, window: 100, waiting: 1 });
    expect(((await (await fetch(`${base}/healthz`)).json()) as { queued: number }).queued).toBe(1);

    // Cancelling leaves the queue; a second quick match re-enters it.
    ada.send({ type: "cancelQuickMatch" });
    await ada.until(m => m.type === "left");
    ada.send({ type: "quickMatch", name: "Ada", settings: { turnSeconds: 30 } });
    await ada.until(m => m.type === "queued" && m !== queued);

    // Waiting widens the window; the server tells the player.
    scheduler.advance(10_000);
    await ada.until(m => m.type === "queued" && m.window === 150);

    bo.send({ type: "quickMatch", name: "Bo" });
    const adaSeat = await ada.until<Extract<ServerMessage, { type: "roomJoined" }>>(m => m.type === "roomJoined");
    const boSeat = await bo.until<Extract<ServerMessage, { type: "roomJoined" }>>(m => m.type === "roomJoined");
    expect(adaSeat.code).toBe(boSeat.code);
    expect(adaSeat.mode).toBe("pvp");
    expect(adaSeat.settings.turnSeconds).toBe(30);
    expect(new Set([adaSeat.seat, boSeat.seat])).toEqual(new Set([0, 1]));
    const lobby = await ada.until<Extract<ServerMessage, { type: "lobby" }>>(m => m.type === "lobby" && m.status === "playing");
    expect(lobby.seats.map(seat => seat?.name).sort()).toEqual(["Ada", "Bo"]);

    // Bo concedes; the game is rated for both accounts and the next welcome carries the rating.
    bo.send({ type: "command", requestId: "c1", command: { type: "concede" } });
    const over = await ada.until<Extract<ServerMessage, { type: "gameOver" }>>(m => m.type === "gameOver");
    expect(over.result.outcome).toBe("concession");
    const adaRating = store.rating(store.accountByEmail("ada@example.com")!.id)!;
    expect(adaRating).toMatchObject({ games: 1, wins: 1 });
    expect(adaRating.elo).toBeGreaterThan(1200);
    ada.close(); bo.close();
    const again = await connect(port);
    again.send({ type: "hello", protocol: PROTOCOL_VERSION, session: adaSession });
    const welcome = await again.until<Extract<ServerMessage, { type: "welcome" }>>(m => m.type === "welcome");
    expect(welcome.rating).toMatchObject({ elo: 1216, games: 1, wins: 1, losses: 0, ties: 0 });
    const me = await (await fetch(`${base}/auth/me`, { headers: { authorization: `Bearer ${adaSession}` } })).json() as { rating: { elo: number } };
    expect(me.rating.elo).toBe(1216);
    again.close(); guest.close();
  });
});

// --- Client side -----------------------------------------------------------------------------------------------------

describe("client pack rollout", () => {
  const info = (hash: string, url: string | null = null) => ({ hash, revision: 9, url });

  it("keeps the bundled pack when hashes agree and fetches, verifies and compiles the server's pack otherwise", async () => {
    expect(bundledPackHash).toBe(PACK_HASH);
    expect(await resolvePack(info(PACK_HASH), "wss://game.test")).toBeNull();
    expect(await resolvePack(info(""), "wss://game.test")).toBeNull();
    await expect(resolvePack(info("zz"), "wss://game.test")).rejects.toThrow(/malformed/);
    expect(packUrl(info("a".repeat(16)), "wss://game.test/")).toBe("https://game.test/pack/" + "a".repeat(16));
    expect(packUrl(info("a".repeat(16), "https://cdn.test/pack/"), "wss://game.test")).toBe("https://cdn.test/pack/" + "a".repeat(16));

    // A pack whose only difference is one card's name: a different hash, the same shape.
    const raw = structuredClone(publishedRawDocument()) as { cards: { name: string }[] };
    raw.cards[0].name = `${raw.cards[0].name} (rolled out)`;
    const hash = packHash(raw);
    expect(hash).not.toBe(PACK_HASH);
    const requested: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => { requested.push(String(url)); return Response.json({ hash, revision: 9, document: raw }); }) as typeof fetch;
    const pack = await resolvePack(info(hash, "https://cdn.test/pack"), "wss://game.test", fetchImpl);
    expect(requested).toEqual([`https://cdn.test/pack/${hash}`]);
    expect(pack).toMatchObject({ hash, source: "network" });
    expect(pack!.compiled.cards.length).toBe(content.cards.length);
    expect(pack!.compiled.cards.some(card => card.name.endsWith("(rolled out)"))).toBe(true);

    // Tampered or mismatched bodies are refused; a 404 is reported with the status.
    expect(() => compileRawPack(publishedRawDocument(), hash)).toThrow(/did not match its hash/);
    expect(() => compileRawPack({ ...raw, revision: 1 }, packHash({ ...raw, revision: 1 }))).toThrow(/invalid/);
    const missing = (async () => new Response("", { status: 404 })) as typeof fetch;
    await expect(resolvePack(info(hash), "wss://game.test", missing)).rejects.toThrow(/404/);
  });
});
