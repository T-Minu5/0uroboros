/**
 * Persistence for finished games. `MemoryStore` serves tests and in-process play; `SqliteStore` uses node:sqlite so the
 * hosted server needs no native module. Accounts arrive with the web release (Phase 4) and live beside these tables.
 */
import type { PlayerId } from "@0uroboros/engine/game";
import type { Command, GameResult, RoomMode, RoomSettings } from "@0uroboros/protocol/messages";

/** Something the server did to the table on its own: a timer firing, the AI drafting, a forfeit. */
export type SystemCommand = { type: "system"; action: "expireDraft" | "nextCycle" | "choiceTimeout" | "autoEndTurn" | "inactivityConcede" | "aiDraftStep" | "forfeit" | "abandon"; seat?: PlayerId; reason?: string };
export type CommandRecord = { seq: number; seat: PlayerId | null; at: number; command: Command | SystemCommand };

/** Everything needed to rebuild a game move by move: the seed, the table rules and the ordered commands. */
export type ReplayRecord = {
  code: string; mode: RoomMode; settings: RoomSettings; seed: number; aiSeats: PlayerId[]; seatNames: [string, string];
  contentRevision: number | null; startedAt: number; endedAt: number; commands: CommandRecord[];
};

export type ResultRecord = { code: string; mode: RoomMode; seatNames: [string, string]; aiSeats: PlayerId[]; startedAt: number; endedAt: number; cycles: number; result: GameResult };

export interface Store {
  saveResult(record: ResultRecord): void;
  saveReplay(replay: ReplayRecord): void;
  loadReplay(code: string): ReplayRecord | null;
  listResults(limit?: number): ResultRecord[];
  close(): void;
}

export class MemoryStore implements Store {
  readonly results: ResultRecord[] = [];
  readonly replays = new Map<string, ReplayRecord>();
  saveResult(record: ResultRecord) { this.results.push(record); }
  saveReplay(replay: ReplayRecord) { this.replays.set(replay.code, replay); }
  loadReplay(code: string) { return this.replays.get(code) ?? null; }
  listResults(limit = 50) { return this.results.slice(-limit).reverse(); }
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
    `);
  }
  saveResult(record: ResultRecord) {
    this.db.prepare(`INSERT OR REPLACE INTO results (code, mode, seat_names, ai_seats, started_at, ended_at, cycles, winner, outcome, ended_reason, final_vp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(record.code, record.mode, JSON.stringify(record.seatNames), JSON.stringify(record.aiSeats), record.startedAt, record.endedAt, record.cycles, record.result.winner, record.result.outcome, record.result.endedReason, JSON.stringify(record.result.finalVP));
  }
  saveReplay(replay: ReplayRecord) {
    this.db.prepare(`INSERT OR REPLACE INTO replays (code, started_at, body) VALUES (?, ?, ?)`).run(replay.code, replay.startedAt, JSON.stringify(replay));
  }
  loadReplay(code: string) {
    const row = this.db.prepare(`SELECT body FROM replays WHERE code = ?`).get(code) as { body: string } | undefined;
    return row ? JSON.parse(row.body) as ReplayRecord : null;
  }
  listResults(limit = 50) {
    const rows = this.db.prepare(`SELECT * FROM results ORDER BY ended_at DESC LIMIT ?`).all(limit) as Record<string, unknown>[];
    return rows.map(row => ({
      code: row.code as string, mode: row.mode as RoomMode, seatNames: JSON.parse(row.seat_names as string), aiSeats: JSON.parse(row.ai_seats as string),
      startedAt: row.started_at as number, endedAt: row.ended_at as number, cycles: row.cycles as number,
      result: { winner: row.winner as PlayerId | null, outcome: row.outcome as GameResult["outcome"], endedReason: row.ended_reason as string | null, finalVP: JSON.parse(row.final_vp as string) },
    }));
  }
  close() { this.db.close(); }
}
