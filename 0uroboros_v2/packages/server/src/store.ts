/**
 * Persistence for finished games and player accounts. `MemoryStore` serves tests and in-process play; `SqliteStore`
 * uses node:sqlite so the hosted server needs no native module.
 *
 * Accounts are keyed by e-mail (web magic link) and later by Steam id / Apple id, all mapping to one internal id.
 * Only hashes of magic-link and session tokens are stored.
 */
import type { PlayerId } from "@0uroboros/engine/game";
import type { MatchReport } from "@0uroboros/engine/runtime";
import type { Command, GameResult, RoomMode, RoomSettings } from "@0uroboros/protocol/messages";

/** Something the server did to the table on its own: a timer firing, the AI drafting, a forfeit. */
export type SystemCommand = { type: "system"; action: "expireDraft" | "nextCycle" | "choiceTimeout" | "autoEndTurn" | "inactivityConcede" | "aiDraftStep" | "forfeit" | "abandon"; seat?: PlayerId; reason?: string };
export type CommandRecord = { seq: number; seat: PlayerId | null; at: number; command: Command | SystemCommand };

/** Everything needed to rebuild a game move by move: the seed, the table rules and the ordered commands. */
export type ReplayRecord = {
  code: string; mode: RoomMode; settings: RoomSettings; seed: number; aiSeats: PlayerId[]; seatNames: [string, string];
  contentRevision: number | null; startedAt: number; endedAt: number; commands: CommandRecord[];
};

export type ResultRecord = {
  code: string; mode: RoomMode; seatNames: [string, string]; aiSeats: PlayerId[]; startedAt: number; endedAt: number; cycles: number; result: GameResult;
  /** Account ids in each seat; null for guests and the AI. */
  accountIds?: [string | null, string | null];
  /** The engine's match report, the evidence Eco-Strat reads. Null when the game never reached a report. */
  report?: MatchReport | null;
};

export type Account = { id: string; email: string | null; name: string; createdAt: number };
export type IdentityProvider = "steam" | "apple";

export interface Store {
  saveResult(record: ResultRecord): void;
  saveReplay(replay: ReplayRecord): void;
  loadReplay(code: string): ReplayRecord | null;
  listResults(limit?: number): ResultRecord[];
  /** Results that ended after `since` (ms), oldest first, for evidence export. */
  resultsSince(since: number, limit?: number): ResultRecord[];

  accountByEmail(email: string): Account | null;
  accountById(id: string): Account | null;
  createAccount(account: Account): void;
  renameAccount(id: string, name: string): void;
  /** External identities (Steam id, Apple subject) that map onto an account. */
  accountByIdentity(provider: IdentityProvider, subject: string): Account | null;
  linkIdentity(provider: IdentityProvider, subject: string, accountId: string): void;

  saveMagicToken(tokenHash: string, email: string, expiresAt: number): void;
  /** Returns the e-mail the token was issued to and deletes it; null when unknown or expired. */
  consumeMagicToken(tokenHash: string, now: number): string | null;
  /** Magic links issued to this e-mail that are still live, for rate limiting. */
  liveMagicTokens(email: string, now: number): number;

  saveSession(tokenHash: string, accountId: string, expiresAt: number): void;
  sessionAccount(tokenHash: string, now: number): Account | null;
  deleteSession(tokenHash: string): void;

  close(): void;
}

export class MemoryStore implements Store {
  readonly results: ResultRecord[] = [];
  readonly replays = new Map<string, ReplayRecord>();
  readonly accounts = new Map<string, Account>();
  private readonly identities = new Map<string, string>();
  private readonly magic = new Map<string, { email: string; expiresAt: number }>();
  private readonly sessions = new Map<string, { accountId: string; expiresAt: number }>();

  saveResult(record: ResultRecord) { this.results.push(record); }
  saveReplay(replay: ReplayRecord) { this.replays.set(replay.code, replay); }
  loadReplay(code: string) { return this.replays.get(code) ?? null; }
  listResults(limit = 50) { return this.results.slice(-limit).reverse(); }
  resultsSince(since: number, limit = 200) { return this.results.filter(record => record.endedAt > since).slice(0, limit); }

  accountByEmail(email: string) { for (const account of this.accounts.values()) if (account.email === email) return account; return null; }
  accountById(id: string) { return this.accounts.get(id) ?? null; }
  createAccount(account: Account) { this.accounts.set(account.id, account); }
  renameAccount(id: string, name: string) { const account = this.accounts.get(id); if (account) this.accounts.set(id, { ...account, name }); }
  accountByIdentity(provider: IdentityProvider, subject: string) { const id = this.identities.get(`${provider}:${subject}`); return id ? this.accounts.get(id) ?? null : null; }
  linkIdentity(provider: IdentityProvider, subject: string, accountId: string) { this.identities.set(`${provider}:${subject}`, accountId); }

  saveMagicToken(tokenHash: string, email: string, expiresAt: number) { this.magic.set(tokenHash, { email, expiresAt }); }
  consumeMagicToken(tokenHash: string, now: number) {
    const entry = this.magic.get(tokenHash);
    this.magic.delete(tokenHash);
    return entry && entry.expiresAt > now ? entry.email : null;
  }
  liveMagicTokens(email: string, now: number) { let count = 0; for (const entry of this.magic.values()) if (entry.email === email && entry.expiresAt > now) count++; return count; }

  saveSession(tokenHash: string, accountId: string, expiresAt: number) { this.sessions.set(tokenHash, { accountId, expiresAt }); }
  sessionAccount(tokenHash: string, now: number) {
    const session = this.sessions.get(tokenHash);
    if (!session) return null;
    if (session.expiresAt <= now) { this.sessions.delete(tokenHash); return null; }
    return this.accounts.get(session.accountId) ?? null;
  }
  deleteSession(tokenHash: string) { this.sessions.delete(tokenHash); }
  close() { /* nothing to release */ }
}

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): { run(...params: unknown[]): unknown; get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] };
  close(): void;
};

/** `node:sqlite` is loaded lazily so the module imports cleanly where it is unavailable (the browser, older Node). */
export async function openSqliteStore(file: string): Promise<Store> {
  const { DatabaseSync } = await import("node:sqlite") as unknown as { DatabaseSync: new (file: string) => SqliteDatabase };
  return new SqliteStore(new DatabaseSync(file));
}

export class SqliteStore implements Store {
  private readonly db: SqliteDatabase;
  constructor(db: SqliteDatabase) {
    this.db = db;
    db.exec(`
      CREATE TABLE IF NOT EXISTS results (
        code TEXT PRIMARY KEY, mode TEXT NOT NULL, seat_names TEXT NOT NULL, ai_seats TEXT NOT NULL,
        started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL, cycles INTEGER NOT NULL,
        winner INTEGER, outcome TEXT NOT NULL, ended_reason TEXT, final_vp TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS replays (code TEXT PRIMARY KEY, started_at INTEGER NOT NULL, body TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS results_ended_at ON results (ended_at);
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, email TEXT UNIQUE, name TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS magic_tokens (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS magic_tokens_email ON magic_tokens (email);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS identities (provider TEXT NOT NULL, subject TEXT NOT NULL, account_id TEXT NOT NULL, PRIMARY KEY (provider, subject));
    `);
    // Columns added after the first release; SQLite has no ADD COLUMN IF NOT EXISTS.
    for (const column of ["account_ids TEXT", "report TEXT"]) {
      try { db.exec(`ALTER TABLE results ADD COLUMN ${column}`); } catch { /* already present */ }
    }
  }
  saveResult(record: ResultRecord) {
    this.db.prepare(`INSERT OR REPLACE INTO results (code, mode, seat_names, ai_seats, started_at, ended_at, cycles, winner, outcome, ended_reason, final_vp, account_ids, report) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(record.code, record.mode, JSON.stringify(record.seatNames), JSON.stringify(record.aiSeats), record.startedAt, record.endedAt, record.cycles, record.result.winner, record.result.outcome, record.result.endedReason, JSON.stringify(record.result.finalVP),
        JSON.stringify(record.accountIds ?? [null, null]), record.report ? JSON.stringify(record.report) : null);
  }
  saveReplay(replay: ReplayRecord) {
    this.db.prepare(`INSERT OR REPLACE INTO replays (code, started_at, body) VALUES (?, ?, ?)`).run(replay.code, replay.startedAt, JSON.stringify(replay));
  }
  loadReplay(code: string) {
    const row = this.db.prepare(`SELECT body FROM replays WHERE code = ?`).get(code) as { body: string } | undefined;
    return row ? JSON.parse(row.body) as ReplayRecord : null;
  }
  listResults(limit = 50) {
    return (this.db.prepare(`SELECT * FROM results ORDER BY ended_at DESC LIMIT ?`).all(limit) as Record<string, unknown>[]).map(rowToResult);
  }
  resultsSince(since: number, limit = 200) {
    return (this.db.prepare(`SELECT * FROM results WHERE ended_at > ? ORDER BY ended_at ASC LIMIT ?`).all(since, limit) as Record<string, unknown>[]).map(rowToResult);
  }

  accountByEmail(email: string) { return rowToAccount(this.db.prepare(`SELECT * FROM accounts WHERE email = ?`).get(email)); }
  accountById(id: string) { return rowToAccount(this.db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(id)); }
  createAccount(account: Account) { this.db.prepare(`INSERT INTO accounts (id, email, name, created_at) VALUES (?, ?, ?, ?)`).run(account.id, account.email, account.name, account.createdAt); }
  renameAccount(id: string, name: string) { this.db.prepare(`UPDATE accounts SET name = ? WHERE id = ?`).run(name, id); }
  accountByIdentity(provider: IdentityProvider, subject: string) {
    return rowToAccount(this.db.prepare(`SELECT a.* FROM identities i JOIN accounts a ON a.id = i.account_id WHERE i.provider = ? AND i.subject = ?`).get(provider, subject));
  }
  linkIdentity(provider: IdentityProvider, subject: string, accountId: string) { this.db.prepare(`INSERT OR REPLACE INTO identities (provider, subject, account_id) VALUES (?, ?, ?)`).run(provider, subject, accountId); }

  saveMagicToken(tokenHash: string, email: string, expiresAt: number) { this.db.prepare(`INSERT INTO magic_tokens (token_hash, email, expires_at) VALUES (?, ?, ?)`).run(tokenHash, email, expiresAt); }
  consumeMagicToken(tokenHash: string, now: number) {
    const row = this.db.prepare(`SELECT email, expires_at FROM magic_tokens WHERE token_hash = ?`).get(tokenHash) as { email: string; expires_at: number } | undefined;
    this.db.prepare(`DELETE FROM magic_tokens WHERE token_hash = ? OR expires_at <= ?`).run(tokenHash, now);
    return row && row.expires_at > now ? row.email : null;
  }
  liveMagicTokens(email: string, now: number) {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM magic_tokens WHERE email = ? AND expires_at > ?`).get(email, now) as { n: number }).n;
  }

  saveSession(tokenHash: string, accountId: string, expiresAt: number) { this.db.prepare(`INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)`).run(tokenHash, accountId, expiresAt); }
  sessionAccount(tokenHash: string, now: number) {
    const row = this.db.prepare(`SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?`).get(tokenHash, now);
    return rowToAccount(row);
  }
  deleteSession(tokenHash: string) { this.db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(tokenHash); }
  close() { this.db.close(); }
}

function rowToResult(row: Record<string, unknown>): ResultRecord {
  return {
    code: row.code as string, mode: row.mode as RoomMode, seatNames: JSON.parse(row.seat_names as string), aiSeats: JSON.parse(row.ai_seats as string),
    startedAt: row.started_at as number, endedAt: row.ended_at as number, cycles: row.cycles as number,
    result: { winner: row.winner as PlayerId | null, outcome: row.outcome as GameResult["outcome"], endedReason: row.ended_reason as string | null, finalVP: JSON.parse(row.final_vp as string) },
    accountIds: row.account_ids ? JSON.parse(row.account_ids as string) : [null, null],
    report: row.report ? JSON.parse(row.report as string) as MatchReport : null,
  };
}
function rowToAccount(row: unknown): Account | null {
  if (!row) return null;
  const r = row as Record<string, unknown>;
  return { id: r.id as string, email: (r.email as string | null) ?? null, name: r.name as string, createdAt: r.created_at as number };
}
