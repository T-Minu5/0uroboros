/**
 * Wire protocol between client and game server, version 1.
 *
 * The client never sees `RuntimeSession.state`: it receives `SessionView`s built with `view(seat)` (the viewer always
 * at index 0) and Log events passed through `redactEvent` and, for seat 1, `mirrorEvent`. Commands carry the
 * client's own request id so the sender can match the acknowledgement; every other seat only sees the resulting
 * events. Incoming messages are parsed with zod on the server; outgoing ones are typed here and trusted by the client.
 */
import { z } from "zod";
import type { PlayerId } from "@0uroboros/engine/game";
import type { CycleRecord, RuntimeEvent, SessionView } from "@0uroboros/engine/runtime";

export const PROTOCOL_VERSION = 1;

// --- Game commands: what a seat may ask the session to do -----------------------------------------------------------

const cardId = z.string().min(1).max(80);
const node = z.number().int().min(0).max(4);

export const CommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("deploy"), cardId, node }),
  z.object({ type: z.literal("relocate"), cardId, node }),
  z.object({ type: z.literal("undoPlanning") }),
  z.object({ type: z.literal("endTurn") }),
  z.object({ type: z.literal("undoEndTurn") }),
  z.object({ type: z.literal("choose"), selection: z.array(z.string().min(1).max(120)).max(32) }),
  z.object({ type: z.literal("claimCircuit") }),
  z.object({ type: z.literal("buy"), pileId: z.string().min(1).max(120) }),
  z.object({ type: z.literal("endDraft") }),
  z.object({ type: z.literal("undoEndDraft") }),
  z.object({ type: z.literal("concede") }),
]);
export type Command = z.infer<typeof CommandSchema>;

// --- Lobby -----------------------------------------------------------------------------------------------------------

export const RoomModeSchema = z.enum(["pvp", "ai"]);
export type RoomMode = z.infer<typeof RoomModeSchema>;

const displayName = z.string().trim().min(1).max(24);
const roomCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,8}$/);
const seatToken = z.string().min(16).max(128);

/** Table rules the host may set; everything else comes from the published content pack. */
export const RoomSettingsSchema = z.object({
  /** Seconds a seat has to commit a Runtime turn; 0 disables the turn timer. The Draft is the engine's 90 s. */
  turnSeconds: z.number().int().min(0).max(600).default(0),
  /** Seconds to answer a mandatory choice before the server picks a random legal option. */
  choiceSeconds: z.number().int().min(5).max(300).default(45),
  carryover: z.boolean().default(true),
  priorityPreference: z.enum(["higher", "lower"]).default("higher"),
  /** Seed for the table's shuffles; unset, the server draws one. Recorded in the replay. */
  seed: z.number().int().optional(),
  /** Which of the pack's opponents an `ai` table plays, by id; unset or unknown plays the pack's first. */
  opponent: z.string().trim().min(1).max(80).optional(),
  /** Every Node is No Man's Land for the whole game. */
  noLocations: z.boolean().default(false),
  /** Circuit Rewards that go to the trailing player are never drawn. */
  noTrailingRewards: z.boolean().default(false),
});
export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export const ClientMessageSchema = z.discriminatedUnion("type", [
  /** `session` is an account session token from the sign-in flow (see server auth); guests send none. */
  z.object({ type: z.literal("hello"), protocol: z.number().int(), session: z.string().max(200).optional() }),
  z.object({ type: z.literal("createRoom"), mode: RoomModeSchema, name: displayName, settings: RoomSettingsSchema.partial().optional() }),
  z.object({ type: z.literal("joinRoom"), code: roomCode, name: displayName }),
  z.object({ type: z.literal("resumeSeat"), code: roomCode, seatToken }),
  z.object({ type: z.literal("leaveRoom") }),
  /** Quick match: wait for an opponent of similar rating; the server seats both at a fresh pvp table. */
  z.object({ type: z.literal("quickMatch"), name: displayName, settings: RoomSettingsSchema.partial().optional() }),
  z.object({ type: z.literal("cancelQuickMatch") }),
  z.object({ type: z.literal("command"), requestId: z.string().min(1).max(64), command: CommandSchema }),
  z.object({ type: z.literal("ping"), at: z.number() }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// --- What the server sends -------------------------------------------------------------------------------------------

export type SeatSummary = { name: string; connected: boolean; ai: boolean } | null;
/** The signed-in player, as the client may know it. */
export type AccountSummary = { id: string; name: string; email: string | null };
export type RoomStatus = "waiting" | "playing" | "finished";
/** Which content pack the server plays; a client holding a different `hash` fetches this one from `url`. */
export type PackInfo = { hash: string; revision: number | null; url: string | null };
/** A player's standing from rated online games (Elo, 1200 to start); `games` under 10 is provisional. */
export type RatingSummary = { elo: number; games: number; wins: number; losses: number; ties: number };

/** Server-owned deadlines, as server timestamps (ms). The client shows countdowns against `serverTime`. */
export type Timers = {
  serverTime: number;
  /** When the planning seat must commit; null without a turn timer or outside Runtime. */
  turnEndsAt: number | null;
  /** When the open choice resolves at random; null without an open choice. */
  choiceEndsAt: number | null;
  draftEndsAt: number | null;
  /** While a seat reconnects after its first disconnect (guide 06), timers pause until this time. */
  pausedUntil: number | null;
};

export type GameResult = {
  winner: PlayerId | null;
  endedReason: string | null;
  /** How the game ended for the record: a played-out game, a concession, a forfeit, or abandonment. */
  outcome: "complete" | "concession" | "forfeit" | "abandoned";
  finalVP: [number, number];
};

export type ServerMessage =
  | { type: "welcome"; protocol: number; serverTime: number; account: AccountSummary | null; pack: PackInfo; rating: RatingSummary | null }
  /** The player is in the quick-match queue; `window` is the rating gap the server currently accepts. */
  | { type: "queued"; since: number; rating: number; window: number; waiting: number }
  | { type: "roomJoined"; code: string; seat: PlayerId; seatToken: string; mode: RoomMode; settings: RoomSettings }
  | { type: "lobby"; code: string; status: RoomStatus; seats: [SeatSummary, SeatSummary]; mode: RoomMode; settings: RoomSettings }
  | { type: "left" }
  /** The seat's whole table on join or resume: the view, the Log so far and the Cycle records, all as that seat may see them. */
  | { type: "snapshot"; view: SessionView; log: RuntimeEvent[]; cycles: CycleRecord[]; timers: Timers }
  /** One Log event and the view after it, as this seat may see them. Draft events carry the Cycle records so far. */
  | { type: "event"; event: RuntimeEvent; view: SessionView; timers: Timers; cycles?: CycleRecord[] }
  /** The result of this seat's own command; the event, if any, is also the first of the events that follow. */
  | { type: "ack"; requestId: string; ok: true; event: RuntimeEvent | null; view: SessionView; timers: Timers }
  | { type: "ack"; requestId: string; ok: false; message: string }
  | { type: "timers"; timers: Timers }
  | { type: "presence"; seat: PlayerId; connected: boolean }
  | { type: "gameOver"; result: GameResult; view: SessionView; cycles: CycleRecord[] }
  | { type: "error"; code: "protocol" | "auth" | "room" | "rate"; message: string }
  | { type: "pong"; at: number; serverTime: number };

export const parseClientMessage = (raw: unknown): ClientMessage | { error: string } => {
  const text = typeof raw === "string" ? raw : raw instanceof Uint8Array ? new TextDecoder().decode(raw) : null;
  if (text === null) return { error: "Messages must be text." };
  let json: unknown;
  try { json = JSON.parse(text); } catch { return { error: "Messages must be JSON." }; }
  const parsed = ClientMessageSchema.safeParse(json);
  return parsed.success ? parsed.data : { error: parsed.error.issues.map(issue => `${issue.path.join(".") || "message"}: ${issue.message}`).join("; ") };
};
