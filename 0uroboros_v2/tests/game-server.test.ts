import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { PlayerId } from "@0uroboros/engine/game";
import { firstLegalSelection, type RuntimeEvent, type SessionView } from "@0uroboros/engine/runtime";
import { publishedContent, PACK_REVISION } from "@0uroboros/content/document";
import { PROTOCOL_VERSION, type ClientMessage, type Command, type ServerMessage } from "@0uroboros/protocol/messages";
import { Lobby } from "@0uroboros/server/lobby";
import { Room, type Connection } from "@0uroboros/server/room";
import { GameServer } from "@0uroboros/server/gameServer";
import { ManualScheduler } from "@0uroboros/server/scheduler";
import { MemoryStore, SqliteStore } from "@0uroboros/server/store";
import { replayGame } from "@0uroboros/server/replay";

const content = publishedContent();

/** A seat's end of the wire: everything the room sent, and the latest view it carried. */
class FakeConnection implements Connection {
  messages: ServerMessage[] = [];
  send(message: ServerMessage) { this.messages.push(message); }
  get view(): SessionView | null {
    for (let i = this.messages.length - 1; i >= 0; i--) { const m = this.messages[i]; if ("view" in m && m.view) return m.view; }
    return null;
  }
  acks() { return this.messages.filter((m): m is Extract<ServerMessage, { type: "ack" }> => m.type === "ack"); }
  events(): RuntimeEvent[] { return this.messages.flatMap(m => m.type === "event" || m.type === "ack" && m.ok && m.event ? [m.event!] : []); }
  ofType<T extends ServerMessage["type"]>(type: T) { return this.messages.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type); }
  clear() { this.messages = []; }
}

function table(options: { mode?: "pvp" | "ai"; turnSeconds?: number; choiceSeconds?: number; seed?: number; store?: MemoryStore; scheduler?: ManualScheduler } = {}) {
  const scheduler = options.scheduler ?? new ManualScheduler();
  const store = options.store ?? new MemoryStore();
  const lobby = new Lobby({ content, contentRevision: PACK_REVISION, scheduler, store });
  const room = lobby.createRoom(options.mode ?? "pvp", { turnSeconds: options.turnSeconds ?? 0, choiceSeconds: options.choiceSeconds ?? 45, seed: options.seed ?? 7 });
  const a = new FakeConnection(), b = new FakeConnection();
  const seatA = room.join("Ada", a)!;
  const seatB = room.mode === "pvp" ? room.join("Bo", b)! : null;
  return { scheduler, store, lobby, room, a, b, tokens: [seatA.token, seatB?.token ?? ""] as [string, string] };
}

let requestSerial = 0;
const command = (room: Room, seat: PlayerId, cmd: Command) => { const id = `r${++requestSerial}`; room.apply(seat, cmd, id); return id; };
const lastAck = (conn: FakeConnection) => conn.acks().at(-1)!;

/** Places the seat's first affordable non-Crypto card on the first open Node that takes it, through the wire view. */
function placeOne(room: Room, seat: PlayerId, conn: FakeConnection): boolean {
  const view = conn.view!;
  for (const card of view.players[0].hand) {
    if (card.type === "Crypto") continue;
    for (const node of view.openNodes) {
      command(room, seat, { type: "deploy", cardId: card.id, node });
      if (lastAck(conn).ok) return true;
    }
  }
  return false;
}

/** Answers any open choice for whichever human seat owns it. */
function answerChoices(room: Room, conns: [FakeConnection, FakeConnection]) {
  for (let guard = 0; room.session?.state.choice && guard < 50; guard++) {
    const owner = room.session.state.choice.owner;
    command(room, owner, { type: "choose", selection: firstLegalSelection(room.session.state.choice) });
    expect(lastAck(conns[owner]).ok).toBe(true);
  }
}

function playTurn(room: Room, conns: [FakeConnection, FakeConnection]) {
  placeOne(room, 0, conns[0]); placeOne(room, 1, conns[1]);
  command(room, 0, { type: "endTurn" });
  expect(lastAck(conns[0]).ok).toBe(true);
  expect(room.session!.state.turnReady).toEqual([true, false]);
  command(room, 1, { type: "endTurn" });
  expect(lastAck(conns[1]).ok).toBe(true);
  answerChoices(room, conns);
}

function playCycle(room: Room, conns: [FakeConnection, FakeConnection], scheduler: ManualScheduler) {
  const cycle = room.session!.state.cycle;
  while (room.session!.state.phase === "runtime" && room.status === "playing") playTurn(room, conns);
  if (room.status !== "playing") return;
  expect(room.session!.state.phase).toBe("draft");
  command(room, 0, { type: "endDraft" }); command(room, 1, { type: "endDraft" });
  expect(room.session!.state.draftEnded).toBe(true);
  scheduler.advance(2_000);
  expect(room.session!.state.cycle).toBe(cycle + 1);
}

describe("game server rooms", () => {
  it("seats two players, plays three Cycles over the wire and replays the recorded game to the same result", () => {
    const { room, a, b, scheduler, store } = table();
    expect(room.status).toBe("playing");
    expect(a.ofType("roomJoined")[0].seat).toBe(0);
    expect(b.ofType("roomJoined")[0].seat).toBe(1);
    expect(a.ofType("snapshot")).toHaveLength(1);
    expect(b.ofType("snapshot")[0].view.seat).toBe(1);
    // Each seat sees itself at index 0 and only its own hand.
    expect(a.view!.players[0].hand.length).toBe(5);
    expect(b.view!.players[0].hand.length).toBe(5);
    expect(b.view!.players[1].hand.every(card => "hidden" in card)).toBe(true);

    for (let cycle = 0; cycle < 3; cycle++) playCycle(room, [a, b], scheduler);
    expect(room.session!.state.cycle).toBe(4);
    expect(room.status).toBe("playing");

    // Both seats received every Log event, each from its own side of the table, and no event twice.
    const total = room.events.length;
    expect(new Set(room.events.map(e => e.id)).size).toBe(total);
    expect(new Set(a.events().map(e => e.id)).size).toBe(total);
    expect(a.events().length).toBe(total);
    expect(b.events().length).toBe(total);
    const deployA = a.events().find(e => e.kind === "deploy" && e.owner === 0)!;
    const sameEventForB = b.events()[a.events().indexOf(deployA)];
    expect(sameEventForB.owner).toBe(1);
    expect(sameEventForB.text).toMatch(/deployed a face-down card/);
    expect(sameEventForB.cardId).toBeUndefined();
    expect(deployA.cardId).toBeDefined();

    // Views agree on the public score from either side.
    const va = a.view!, vb = b.view!;
    expect(va.players[0].totalVP).toBe(vb.players[1].totalVP);
    expect(va.players[1].totalVP).toBe(vb.players[0].totalVP);

    // The replay rebuilds the same game from seed and command log.
    const replay = room.replay();
    expect(replay.commands.some(c => c.command.type === "system" && c.command.action === "nextCycle")).toBe(true);
    const rebuilt = replayGame(replay, content);
    expect(rebuilt.session.state.cycle).toBe(room.session!.state.cycle);
    expect(rebuilt.events.map(e => e.text)).toEqual(room.events.map(e => e.text));
    expect(rebuilt.session.view(0).players.map(p => p.totalVP)).toEqual(room.session!.view(0).players.map(p => p.totalVP));

    // Finish by concession; the result and replay are stored.
    command(room, 1, { type: "concede" });
    expect(room.status).toBe("finished");
    expect(a.ofType("gameOver")[0].result).toMatchObject({ outcome: "concession", winner: 0 });
    expect(store.results).toHaveLength(1);
    expect(store.loadReplay(room.code)?.commands.length).toBe(replay.commands.length + 1);
  });

  it("rejects illegal and out-of-seat commands with an ack the sender can match", () => {
    const { room, a } = table();
    const id = command(room, 0, { type: "endDraft" });
    const ack = lastAck(a);
    expect(ack).toMatchObject({ requestId: id, ok: false });
    expect(ack.ok === false && ack.message).toMatch(/Draft is not active/);
    expect(room.commands).toHaveLength(0);
    const hand = a.view!.players[0].hand;
    command(room, 0, { type: "deploy", cardId: "not-a-card", node: 0 });
    expect(lastAck(a).ok).toBe(false);
    command(room, 0, { type: "deploy", cardId: hand.find(c => c.type !== "Crypto")!.id, node: a.view!.openNodes[0] });
    expect(lastAck(a).ok).toBe(true);
    expect(room.commands).toHaveLength(1);
  });

  it("pauses on a first disconnect, resumes the seat mid-Draft from its token and forfeits a seat that never returns", () => {
    const { room, a, b, scheduler, tokens } = table();
    while (room.session!.state.phase === "runtime") playTurn(room, [a, b]);
    expect(room.session!.state.phase).toBe("draft");
    const deadline = room.session!.state.draftEndsAt!;
    command(room, 0, { type: "endDraft" });

    room.disconnect(1);
    expect(a.ofType("presence").at(-1)).toMatchObject({ seat: 1, connected: false });
    expect(a.ofType("timers").at(-1)!.timers.pausedUntil).toBe(scheduler.now() + 20_000);
    command(room, 0, { type: "undoEndDraft" });
    expect(lastAck(a).ok).toBe(false);

    scheduler.advance(12_000);
    const b2 = new FakeConnection();
    expect(room.resume(tokens[1], b2)).toBe(1);
    expect(b2.ofType("snapshot")).toHaveLength(1);
    expect(b2.view!.seat).toBe(1);
    expect(b2.view!.phase).toBe("draft");
    expect(b2.view!.draftReady).toEqual([false, true]);
    expect(b2.ofType("snapshot")[0].log.length).toBe(room.events.length);
    expect(room.session!.state.draftEndsAt).toBe(deadline + 12_000);
    expect(a.ofType("timers").at(-1)!.timers.pausedUntil).toBeNull();

    command(room, 1, { type: "endDraft" });
    expect(lastAck(b2).ok).toBe(true);
    scheduler.advance(2_000);
    expect(room.session!.state.cycle).toBe(2);

    room.disconnect(1);
    expect(room.status).toBe("playing");
    scheduler.advance(119_000);
    expect(room.status).toBe("playing");
    scheduler.advance(2_000);
    expect(room.status).toBe("finished");
    expect(a.ofType("gameOver")[0].result).toMatchObject({ outcome: "forfeit", winner: 0 });
    expect(a.events().at(-1)!.text).toMatch(/Bo forfeits: did not reconnect/);
  });

  it("forfeits at once on a third disconnect", () => {
    const { room, a, scheduler, tokens } = table();
    for (let n = 0; n < 2; n++) { room.disconnect(1); scheduler.advance(1_000); room.resume(tokens[1], new FakeConnection()); }
    expect(room.status).toBe("playing");
    room.disconnect(1);
    expect(room.status).toBe("finished");
    expect(a.ofType("gameOver")[0].result.outcome).toBe("forfeit");
  });

  it("runs the turn timer: commits the plan a seat left open, then concedes after two turns with no input", () => {
    const { room, a, b, scheduler } = table({ turnSeconds: 30 });
    expect(a.ofType("timers").at(-1)!.timers.turnEndsAt).toBe(scheduler.now() + 30_000);
    placeOne(room, 0, a);
    command(room, 0, { type: "endTurn" });
    scheduler.advance(30_100);
    answerChoices(room, [a, b]);
    expect(room.session!.state.turn).toBe(2);
    expect(room.commands.some(c => c.command.type === "system" && c.command.action === "autoEndTurn")).toBe(true);
    // Bo's second silent turn counts 1.25x faster.
    const timers = b.ofType("timers").at(-1)!.timers;
    expect(timers.turnEndsAt! - scheduler.now()).toBe(24_000);
    placeOne(room, 0, a);
    command(room, 0, { type: "endTurn" });
    scheduler.advance(24_100);
    answerChoices(room, [a, b]);
    expect(room.status).toBe("finished");
    expect(a.ofType("gameOver")[0].result).toMatchObject({ outcome: "concession", winner: 0 });
  });

  it("plays against the AI seat, which drafts on the server's clock", () => {
    const { room, a, scheduler } = table({ mode: "ai", seed: 3 });
    expect(room.status).toBe("playing");
    expect(a.ofType("lobby").at(-1)!.seats[1]).toMatchObject({ ai: true, name: "AI" });
    let guard = 0;
    while (room.session!.state.phase === "runtime" && guard++ < 10) {
      placeOne(room, 0, a);
      command(room, 0, { type: "endTurn" });
      expect(lastAck(a).ok).toBe(true);
      while (room.session!.state.choice) {
        command(room, 0, { type: "choose", selection: firstLegalSelection(room.session!.state.choice) });
      }
    }
    expect(room.session!.state.phase).toBe("draft");
    command(room, 0, { type: "endDraft" });
    expect(room.session!.state.draftEnded).toBe(false);
    scheduler.advance(95_000);
    expect(room.session!.state.cycle).toBe(2);
    const aiDrafted = room.commands.filter(c => c.command.type === "system" && c.command.action === "aiDraftStep");
    expect(aiDrafted.length).toBeGreaterThan(0);
    const rebuilt = replayGame(room.replay(), content);
    expect(rebuilt.events.map(e => e.text)).toEqual(room.events.map(e => e.text));
  });

  it("hosts 50 tables at once through a Cycle each", () => {
    const scheduler = new ManualScheduler();
    const store = new MemoryStore();
    const lobby = new Lobby({ content, contentRevision: PACK_REVISION, scheduler, store });
    const tables = Array.from({ length: 50 }, (_, i) => {
      const room = lobby.createRoom("pvp", { seed: 100 + i });
      const a = new FakeConnection(), b = new FakeConnection();
      room.join(`A${i}`, a); room.join(`B${i}`, b);
      return { room, a, b };
    });
    expect(new Set(tables.map(t => t.room.code)).size).toBe(50);
    const started = performance.now();
    for (const { room, a, b } of tables) playCycle(room, [a, b], scheduler);
    const elapsed = performance.now() - started;
    expect(tables.every(t => t.room.session!.state.cycle === 2)).toBe(true);
    expect(elapsed).toBeLessThan(20_000);
    for (const { room } of tables) room.close();
    expect(lobby.rooms.size).toBe(0);
  });

  it("persists results and replays through node:sqlite", async () => {
    const { DatabaseSync } = await import("node:sqlite");
    const store = new SqliteStore(new DatabaseSync(":memory:") as never);
    const { room } = table({ store: store as never });
    const scheduler = new ManualScheduler();
    void scheduler;
    command(room, 0, { type: "concede" });
    expect(store.listResults()).toHaveLength(1);
    expect(store.listResults()[0]).toMatchObject({ code: room.code, result: { outcome: "concession", winner: 1 } });
    expect(store.loadReplay(room.code)?.seed).toBe(7);
    store.close();
  });
});

describe("game server over WebSocket", () => {
  const servers: GameServer[] = [];
  afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())); });

  class WireClient {
    readonly inbox: ServerMessage[] = [];
    private waiters: ((message: ServerMessage) => void)[] = [];
    constructor(private readonly socket: WebSocket) {
      socket.on("message", data => { const message = JSON.parse(data.toString()) as ServerMessage; this.inbox.push(message); for (const w of this.waiters.splice(0)) w(message); });
    }
    static async connect(port: number) {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`);
      // Listen before open: the welcome can arrive in the same read as the handshake.
      const client = new WireClient(socket);
      await new Promise<void>((resolve, reject) => { socket.once("open", () => resolve()); socket.once("error", reject); });
      client.send({ type: "hello", protocol: PROTOCOL_VERSION });
      await client.until(m => m.type === "welcome");
      return client;
    }
    send(message: ClientMessage) { this.socket.send(JSON.stringify(message)); }
    async until<T extends ServerMessage>(test: (message: ServerMessage) => boolean, timeoutMs = 5_000): Promise<T> {
      const found = this.inbox.find(test);
      if (found) return found as T;
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for message; inbox: ${this.inbox.map(m => m.type).join(",")}`)), timeoutMs);
        const check = (message: ServerMessage) => { if (test(message)) { clearTimeout(timer); resolve(message as T); } else this.waiters.push(check); };
        this.waiters.push(check);
      });
    }
    get view(): SessionView | null { for (let i = this.inbox.length - 1; i >= 0; i--) { const m = this.inbox[i]; if ("view" in m && m.view) return m.view; } return null; }
    close() { this.socket.close(); }
  }

  async function serve(options: Partial<ConstructorParameters<typeof GameServer>[0]> = {}) {
    const server = new GameServer({ content, contentRevision: PACK_REVISION, scheduler: { now: () => Date.now(), after: (ms, fn) => { const h = setTimeout(fn, ms); return () => clearTimeout(h); } }, store: new MemoryStore(), ...options });
    servers.push(server);
    const port = await server.listen(0, "127.0.0.1");
    return { server, port };
  }

  it("answers /healthz and seats two real sockets through a Runtime turn, surviving a reconnect", async () => {
    const { server, port } = await serve();
    const health = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json() as { ok: boolean; protocol: number };
    expect(health).toMatchObject({ ok: true, protocol: PROTOCOL_VERSION });

    const ada = await WireClient.connect(port), bo = await WireClient.connect(port);
    ada.send({ type: "hello", protocol: PROTOCOL_VERSION });
    ada.send({ type: "createRoom", mode: "pvp", name: "Ada", settings: { seed: 21 } });
    const joined = await ada.until<Extract<ServerMessage, { type: "roomJoined" }>>(m => m.type === "roomJoined");
    expect(joined.seat).toBe(0);
    bo.send({ type: "joinRoom", code: joined.code.toLowerCase(), name: "Bo" });
    const boJoined = await bo.until<Extract<ServerMessage, { type: "roomJoined" }>>(m => m.type === "roomJoined");
    expect(boJoined.seat).toBe(1);
    await ada.until(m => m.type === "snapshot"); await bo.until(m => m.type === "snapshot");
    expect(server.lobby.rooms.size).toBe(1);

    const card = ada.view!.players[0].hand.find(c => c.type !== "Crypto")!;
    ada.send({ type: "command", requestId: "d1", command: { type: "deploy", cardId: card.id, node: ada.view!.openNodes[0] } });
    const ack = await ada.until<Extract<ServerMessage, { type: "ack" }>>(m => m.type === "ack" && m.requestId === "d1");
    expect(ack.ok).toBe(true);
    const seen = await bo.until<Extract<ServerMessage, { type: "event" }>>(m => m.type === "event" && m.event.kind === "deploy");
    expect(seen.event.owner).toBe(1);
    expect(seen.event.text).toMatch(/Ada deployed a face-down card/);

    // Bo drops and comes back with the seat token.
    bo.close();
    await ada.until(m => m.type === "presence" && !m.connected);
    const bo2 = await WireClient.connect(port);
    bo2.send({ type: "resumeSeat", code: boJoined.code, seatToken: boJoined.seatToken });
    const snapshot = await bo2.until<Extract<ServerMessage, { type: "snapshot" }>>(m => m.type === "snapshot");
    expect(snapshot.view.seat).toBe(1);
    expect(snapshot.log.some(e => e.kind === "deploy")).toBe(true);
    await ada.until(m => m.type === "presence" && m.connected);

    bo2.send({ type: "resumeSeat", code: boJoined.code, seatToken: "x".repeat(20) });
    const bad = await bo2.until<Extract<ServerMessage, { type: "error" }>>(m => m.type === "error");
    expect(bad.code).toBe("auth");

    ada.send({ type: "command", requestId: "e1", command: { type: "endTurn" } });
    const turnAck = await ada.until<Extract<ServerMessage, { type: "ack" }>>(m => m.type === "ack" && m.requestId === "e1");
    expect(turnAck.ok && turnAck.event?.text).toMatch(/waiting for Bo/);
    bo2.send({ type: "command", requestId: "e2", command: { type: "endTurn" } });
    const revealed = await ada.until(m => m.type === "event" && m.event.kind === "reveal");
    expect(revealed).toBeTruthy();
    ada.close(); bo2.close();
  });

  it("rejects malformed messages without dropping the socket and refuses full tables", async () => {
    const { port } = await serve();
    const ada = await WireClient.connect(port);
    (ada as unknown as { socket: WebSocket }).socket.send("not json");
    const bad = await ada.until<Extract<ServerMessage, { type: "error" }>>(m => m.type === "error");
    expect(bad.code).toBe("protocol");
    ada.send({ type: "createRoom", mode: "pvp", name: "Ada" });
    const joined = await ada.until<Extract<ServerMessage, { type: "roomJoined" }>>(m => m.type === "roomJoined");
    const bo = await WireClient.connect(port), cy = await WireClient.connect(port);
    bo.send({ type: "joinRoom", code: joined.code, name: "Bo" });
    await bo.until(m => m.type === "snapshot");
    cy.send({ type: "joinRoom", code: joined.code, name: "Cy" });
    const full = await cy.until<Extract<ServerMessage, { type: "error" }>>(m => m.type === "error");
    expect(full.message).toMatch(/full or already playing/);
    cy.send({ type: "joinRoom", code: "ZZZZZZ", name: "Cy" });
    const missing = await cy.until<Extract<ServerMessage, { type: "error" }>>(m => m.type === "error" && /No table/.test(m.message));
    expect(missing.code).toBe("room");
    ada.close(); bo.close(); cy.close();
  });

  it("opens 50 rooms over real sockets and moves each through a deploy", async () => {
    // Every socket here shares 127.0.0.1, so the per-address limit (Phase 6) is lifted for the load test.
    const { server, port } = await serve({ limits: { socketsPerIp: 1000 } });
    const pairs = await Promise.all(Array.from({ length: 50 }, async (_, i) => {
      const a = await WireClient.connect(port), b = await WireClient.connect(port);
      a.send({ type: "createRoom", mode: "pvp", name: `A${i}`, settings: { seed: 500 + i } });
      const joined = await a.until<Extract<ServerMessage, { type: "roomJoined" }>>(m => m.type === "roomJoined");
      b.send({ type: "joinRoom", code: joined.code, name: `B${i}` });
      await a.until(m => m.type === "snapshot"); await b.until(m => m.type === "snapshot");
      return { a, b };
    }));
    expect(server.lobby.rooms.size).toBe(50);
    await Promise.all(pairs.map(async ({ a, b }, i) => {
      const card = a.view!.players[0].hand.find(c => c.type !== "Crypto")!;
      a.send({ type: "command", requestId: `d${i}`, command: { type: "deploy", cardId: card.id, node: a.view!.openNodes[0] } });
      const ack = await a.until<Extract<ServerMessage, { type: "ack" }>>(m => m.type === "ack");
      expect(ack.ok).toBe(true);
      await b.until(m => m.type === "event" && m.event.kind === "deploy");
    }));
    for (const { a, b } of pairs) { a.close(); b.close(); }
  }, 30_000);
});
