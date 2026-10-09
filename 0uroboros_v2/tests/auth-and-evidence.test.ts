/**
 * Phase 4: e-mail magic-link sign-in, account-named seats over the wire, and the evidence route that feeds
 * Eco-Strat `online-pvp` games.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { publishedContent, PACK_REVISION } from "@0uroboros/content/document";
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "@0uroboros/protocol/messages";
import { Auth, AuthError, ConsoleMailer, MAGIC_LINKS_PER_EMAIL, MAGIC_LINK_TTL_MS, ResendMailer, SESSION_TTL_MS } from "@0uroboros/server/auth";
import { GameServer } from "@0uroboros/server/gameServer";
import { MemoryStore, SqliteStore, type ResultRecord, type Store } from "@0uroboros/server/store";
import { createOnlineEvidence, evidenceFromOnline, type OnlineResult } from "../server/agents/onlineEvidence";
import type { GameEvidence } from "../server/agents/evidence";
import type { MatchReport } from "@0uroboros/engine/runtime";

const content = publishedContent();
const tokenOf = (link: string) => new URL(link).searchParams.get("token")!;

async function sqlite(): Promise<Store> {
  const { DatabaseSync } = await import("node:sqlite");
  return new SqliteStore(new DatabaseSync(":memory:") as unknown as ConstructorParameters<typeof SqliteStore>[0]);
}

describe("magic-link auth", () => {
  for (const [label, open] of [["memory", async () => new MemoryStore() as Store], ["sqlite", sqlite]] as const) {
    it(`${label}: mails a one-time link, creates the account on first use and keeps the session for 30 days`, async () => {
      const store = await open();
      let now = 1_000_000;
      const mailer = new ConsoleMailer();
      const auth = new Auth({ store, mailer, publicUrl: "https://api.test/", now: () => now });

      await expect(auth.requestLink("not an email")).rejects.toBeInstanceOf(AuthError);
      await auth.requestLink("  Ada@Example.COM ");
      expect(mailer.lastLink).toMatch(/^https:\/\/api\.test\/auth\/verify\?token=[A-Za-z0-9_-]{40,}$/);
      const token = tokenOf(mailer.lastLink!);

      const first = auth.verify(token);
      expect(first.account).toMatchObject({ email: "ada@example.com", name: "Ada" });
      expect(() => auth.verify(token)).toThrow(/expired or was already used/);
      expect(auth.authenticate(first.session)?.id).toBe(first.account.id);
      expect(auth.authenticate("nonsense")).toBeNull();

      // A second sign-in finds the same account; renames stick to it.
      await auth.requestLink("ada@example.com");
      const second = auth.verify(tokenOf(mailer.lastLink!));
      expect(second.account.id).toBe(first.account.id);
      auth.rename(second.account, "  Ada   Lovelace  ");
      expect(auth.authenticate(first.session)?.name).toBe("Ada Lovelace");

      // Links expire; sessions outlive them, then expire too.
      await auth.requestLink("bo@example.com");
      const stale = tokenOf(mailer.lastLink!);
      now += MAGIC_LINK_TTL_MS + 1;
      expect(() => auth.verify(stale)).toThrow(AuthError);
      expect(auth.authenticate(first.session)).not.toBeNull();
      now += SESSION_TTL_MS;
      expect(auth.authenticate(first.session)).toBeNull();

      auth.signOut(second.session);
      expect(auth.authenticate(second.session)).toBeNull();
      store.close();
    });
  }

  it("refuses a fourth live link to the same address and never reveals whether the address exists", async () => {
    const store = new MemoryStore();
    const mailer = new ConsoleMailer();
    const auth = new Auth({ store, mailer, publicUrl: "http://localhost:8787" });
    for (let i = 0; i < MAGIC_LINKS_PER_EMAIL; i++) await auth.requestLink("cy@example.com");
    await expect(auth.requestLink("cy@example.com")).rejects.toMatchObject({ status: 429 });
    // Unknown and known addresses get the same success path.
    await expect(auth.requestLink("nobody@example.com")).resolves.toBeUndefined();
  });

  it("ResendMailer posts the link to the provider and surfaces provider failures", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = new ResendMailer("key", "0uroboros <play@test>", async (url, init) => { calls.push({ url: String(url), init: init! }); return new Response("{}", { status: 200 }); });
    await ok.sendMagicLink("ada@example.com", "https://api.test/auth/verify?token=abc");
    expect(calls[0]!.url).toBe("https://api.resend.com/emails");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer key");
    const body = JSON.parse(calls[0]!.init.body as string) as { to: string[]; text: string };
    expect(body.to).toEqual(["ada@example.com"]);
    expect(body.text).toContain("token=abc");
    const down = new ResendMailer("key", "x", async () => new Response("nope", { status: 503 }));
    await expect(down.sendMagicLink("a@b.co", "l")).rejects.toThrow(/503/);
  });
});

describe("auth over HTTP and the wire", () => {
  const servers: GameServer[] = [];
  afterEach(async () => { await Promise.all(servers.splice(0).map(server => server.close())); });

  async function serve(options: { adminToken?: string; webOrigin?: string } = {}) {
    const store = new MemoryStore();
    const mailer = new ConsoleMailer();
    const server = new GameServer({
      content, contentRevision: PACK_REVISION, scheduler: { now: () => Date.now(), after: (ms, fn) => { const h = setTimeout(fn, ms); return () => clearTimeout(h); } }, store,
      auth: new Auth({ store, mailer, publicUrl: "http://api.test" }), allowedOrigins: ["https://play.test"], ...options,
    });
    servers.push(server);
    const port = await server.listen(0, "127.0.0.1");
    return { server, port, store, mailer, base: `http://127.0.0.1:${port}` };
  }
  const json = (body: unknown, token?: string): RequestInit => ({ method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

  async function connect(port: number, session?: string) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const inbox: ServerMessage[] = [];
    const waiters: ((m: ServerMessage) => void)[] = [];
    socket.on("message", data => { const m = JSON.parse(data.toString()) as ServerMessage; inbox.push(m); for (const w of waiters.splice(0)) w(m); });
    await new Promise<void>((resolve, reject) => { socket.once("open", () => resolve()); socket.once("error", reject); });
    const send = (m: ClientMessage) => socket.send(JSON.stringify(m));
    const until = <T extends ServerMessage>(test: (m: ServerMessage) => boolean) => new Promise<T>((resolve, reject) => {
      const found = inbox.find(test); if (found) return resolve(found as T);
      const timer = setTimeout(() => reject(new Error(`timeout; inbox ${inbox.map(m => m.type)}`)), 5000);
      const check = (m: ServerMessage) => { if (test(m)) { clearTimeout(timer); resolve(m as T); } else waiters.push(check); };
      waiters.push(check);
    });
    send({ type: "hello", protocol: PROTOCOL_VERSION, session });
    const welcome = await until<Extract<ServerMessage, { type: "welcome" }>>(m => m.type === "welcome");
    return { socket, send, until, welcome, close: () => socket.close() };
  }

  it("signs in through the HTTP routes, redirects the browser with the session, and seats the player under the account name", async () => {
    const { port, base, mailer } = await serve({ webOrigin: "https://play.test" });

    // CORS for the web client only.
    const preflight = await fetch(`${base}/auth/magic-link`, { method: "OPTIONS", headers: { origin: "https://play.test" } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("https://play.test");
    const other = await fetch(`${base}/healthz`, { headers: { origin: "https://evil.test" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();

    expect((await fetch(`${base}/auth/magic-link`, json({ email: "bad" }))).status).toBe(400);
    const requested = await fetch(`${base}/auth/magic-link`, json({ email: "ada@example.com" }));
    expect(requested.status).toBe(200);
    const token = tokenOf(mailer.lastLink!);

    // A browser following the link is sent back to the web client with the session in the fragment.
    const redirect = await fetch(`${base}/auth/verify?token=${token}`, { redirect: "manual" });
    expect(redirect.status).toBe(302);
    const location = redirect.headers.get("location")!;
    expect(location).toMatch(/^https:\/\/play\.test\/#session=[A-Za-z0-9_-]+$/);
    const session = location.split("#session=")[1]!;
    expect((await fetch(`${base}/auth/verify?token=${token}`, { redirect: "manual" })).status).toBe(400);

    const me = await (await fetch(`${base}/auth/me`, { headers: { authorization: `Bearer ${session}` } })).json() as { account: { name: string; email: string } };
    expect(me.account).toMatchObject({ name: "Ada", email: "ada@example.com" });
    expect((await fetch(`${base}/auth/me`)).status).toBe(401);
    const renamed = await (await fetch(`${base}/auth/name`, json({ name: "Countess" }, session))).json() as { account: { name: string } };
    expect(renamed.account.name).toBe("Countess");

    // The ws hello carries the session; the seat takes the account's name, not the one the client typed.
    const ada = await connect(port, session);
    expect(ada.welcome.account).toMatchObject({ name: "Countess", email: "ada@example.com" });
    const guest = await connect(port);
    expect(guest.welcome.account).toBeNull();
    ada.send({ type: "createRoom", mode: "pvp", name: "Impostor", settings: { seed: 3 } });
    const joined = await ada.until<Extract<ServerMessage, { type: "roomJoined" }>>(m => m.type === "roomJoined");
    guest.send({ type: "joinRoom", code: joined.code, name: "Bo" });
    const lobby = await guest.until<Extract<ServerMessage, { type: "lobby" }>>(m => m.type === "lobby" && m.seats.every(Boolean));
    expect(lobby.seats.map(seat => seat!.name)).toEqual(["Countess", "Bo"]);

    // Signing out ends the session for HTTP and for the next socket.
    expect((await fetch(`${base}/auth/sign-out`, json({}, session))).status).toBe(200);
    expect((await fetch(`${base}/auth/me`, { headers: { authorization: `Bearer ${session}` } })).status).toBe(401);
    const again = await connect(port, session);
    expect(again.welcome.account).toBeNull();
    ada.close(); guest.close(); again.close();
  });

  it("requires hello before anything else and answers 404 for /auth when sign-in is off", async () => {
    const store = new MemoryStore();
    const server = new GameServer({ content, contentRevision: PACK_REVISION, scheduler: { now: () => Date.now(), after: (ms, fn) => { const h = setTimeout(fn, ms); return () => clearTimeout(h); } }, store });
    servers.push(server);
    const port = await server.listen(0, "127.0.0.1");
    expect((await fetch(`http://127.0.0.1:${port}/auth/me`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${port}/evidence`)).status).toBe(404);
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const first = new Promise<ServerMessage>(resolve => socket.once("message", data => resolve(JSON.parse(data.toString()))));
    await new Promise<void>(resolve => socket.once("open", () => resolve()));
    socket.send(JSON.stringify({ type: "createRoom", mode: "pvp", name: "Ada" } satisfies ClientMessage));
    expect(await first).toMatchObject({ type: "error", code: "protocol" });
    socket.close();
  });

  it("serves finished games with match reports to the admin token only, and never the account e-mails", async () => {
    const { base, store } = await serve({ adminToken: "s3cret" });
    const report = { phase: "gameover", winner: 0, finalVP: [12, 8] } as unknown as MatchReport;
    const record: ResultRecord = { code: "ABCDEF", mode: "pvp", seatNames: ["Ada", "Bo"], aiSeats: [], startedAt: 100, endedAt: 900, cycles: 4, result: { winner: 0, endedReason: "Both Servers destroyed", outcome: "complete", finalVP: [12, 8] }, accountIds: ["acct_1", null], report };
    store.saveResult(record);
    store.saveResult({ ...record, code: "GHJKLM", endedAt: 1500, mode: "ai", aiSeats: [1], report: null });

    expect((await fetch(`${base}/evidence`)).status).toBe(401);
    expect((await fetch(`${base}/evidence`, { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    const all = await (await fetch(`${base}/evidence?since=0`, { headers: { authorization: "Bearer s3cret" } })).json() as { results: OnlineResult[] };
    expect(all.results.map(r => r.code)).toEqual(["ABCDEF", "GHJKLM"]);
    expect(all.results[0]).toMatchObject({ signedIn: [true, false], report: { winner: 0 } });
    expect(JSON.stringify(all)).not.toContain("acct_1");
    const later = await (await fetch(`${base}/evidence?since=900`, { headers: { authorization: "Bearer s3cret" } })).json() as { results: OnlineResult[] };
    expect(later.results.map(r => r.code)).toEqual(["GHJKLM"]);
  });
});

describe("online evidence for Eco-Strat", () => {
  const report = { phase: "gameover", winner: 1, finalVP: [5, 9] } as unknown as MatchReport;
  const result = (code: string, endedAt: number, extra: Partial<OnlineResult> = {}): OnlineResult => ({
    code, mode: "pvp", seatNames: ["Ada", "Bo"], aiSeats: [], startedAt: endedAt - 60_000, endedAt, cycles: 16,
    result: { winner: 1, endedReason: "Cycle 16 final Draft complete.", outcome: "complete", finalVP: [5, 9] }, signedIn: [true, true], report, ...extra,
  });

  it("shapes hosted results as online-pvp evidence and skips AI tables and report-less games", () => {
    expect(evidenceFromOnline(result("AAAAAA", 1000))).toMatchObject({ id: "online-AAAAAA-1000", source: "online-pvp", valid: true, seats: ["human", "human"], durationMs: 60_000 });
    expect(evidenceFromOnline(result("BBBBBB", 2000, { result: { winner: 0, endedReason: "Bo concedes.", outcome: "concession", finalVP: [5, 9] } }))).toMatchObject({ valid: false, invalidReason: "ended by concession: Bo concedes." });
    expect(evidenceFromOnline(result("CCCCCC", 3000, { mode: "ai", aiSeats: [1] }))).toBeNull();
    expect(evidenceFromOnline(result("DDDDDD", 4000, { report: null }))).toBeNull();
  });

  it("pulls from the server with the admin token, publishes each game once and keeps its cursor on disk", async () => {
    const root = await mkdtemp(join(tmpdir(), "online-evidence-"));
    const published: GameEvidence[] = [];
    const served: OnlineResult[][] = [[result("AAAAAA", 1000), result("BBBBBB", 2000)], [result("BBBBBB", 2000), result("CCCCCC", 3000)], []];
    const seen: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push(`${String(url)} ${(init?.headers as Record<string, string>).authorization}`);
      return new Response(JSON.stringify({ results: served.shift() ?? [] }), { status: 200 });
    }) as typeof fetch;
    const bridge = createOnlineEvidence({ url: "https://api.test/", adminToken: "tok", cursorFile: join(root, "cursor.json"), publish: e => published.push(e), fetchImpl });
    expect(await bridge.pull()).toBe(2);
    expect(await bridge.pull()).toBe(1);
    expect(await bridge.pull()).toBe(0);
    expect(published.map(e => e.id)).toEqual(["online-AAAAAA-1000", "online-BBBBBB-2000", "online-CCCCCC-3000"]);
    expect(seen[0]).toBe("https://api.test/evidence?since=0&limit=200 Bearer tok");
    expect(seen[1]).toContain("since=2000");
    expect(JSON.parse(await readFile(join(root, "cursor.json"), "utf8"))).toMatchObject({ since: 3000 });
  });
});
