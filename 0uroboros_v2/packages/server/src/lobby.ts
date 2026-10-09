/** The rooms a server is hosting, keyed by invite code. */
import { randomInt } from "node:crypto";
import type { CompiledContent } from "@0uroboros/engine/authoring/contentModel";
import type { StrategyProfile } from "@0uroboros/engine/ai/strategy";
import { pickOpponent } from "@0uroboros/engine/ai/opponents";
import { RoomSettingsSchema, type RoomMode, type RoomSettings } from "@0uroboros/protocol/messages";
import { Room } from "./room";
import type { Scheduler } from "./scheduler";
import type { ResultRecord, Store } from "./store";

/** No 0/O or 1/I, so a code read aloud survives the trip. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export type LobbyConfig = {
  content: CompiledContent;
  contentRevision: number | null;
  scheduler: Scheduler;
  store: Store;
  /** Overrides the pack's opponents for every table (tests, experiments); unset, `ai` tables play the pack profile the host picked. */
  strategy?: StrategyProfile;
  log?: (entry: Record<string, unknown>) => void;
  /** Most rooms alive at once; `createRoom` fails beyond it. */
  maxRooms?: number;
  /** Called with each saved result (ratings, metrics). */
  onFinish?: (record: ResultRecord, room: Room) => void;
};

export class Lobby {
  readonly rooms = new Map<string, Room>();
  private readonly config: LobbyConfig;
  constructor(config: LobbyConfig) { this.config = config; }

  newCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
      if (!this.rooms.has(code)) return code;
    }
    throw new Error("Could not allocate a room code.");
  }

  createRoom(mode: RoomMode, settings: Partial<RoomSettings> = {}): Room {
    if (this.rooms.size >= (this.config.maxRooms ?? 500)) throw new Error("The server is full; try again shortly.");
    const { opponent: requested, ...resolved } = RoomSettingsSchema.parse(settings);
    const seed = resolved.seed ?? randomInt(1, 2 ** 31 - 1);
    const opponent = mode === "ai" ? pickOpponent(this.config.content.opponents, requested) : null;
    const strategy = this.config.strategy ?? opponent?.profile;
    const room = new Room({
      code: this.newCode(), mode, settings: { ...resolved, seed, ...(opponent ? { opponent: opponent.id } : {}) }, seed,
      content: this.config.content, contentRevision: this.config.contentRevision,
      scheduler: this.config.scheduler, store: this.config.store, log: this.config.log,
      ...(strategy ? { strategy } : {}),
      ...(opponent ? { opponent: opponent.id } : {}),
      onClose: closed => { if (this.rooms.get(closed.code) === closed) this.rooms.delete(closed.code); },
      ...(this.config.onFinish ? { onFinish: this.config.onFinish } : {}),
    });
    this.rooms.set(room.code, room);
    return room;
  }

  get(code: string): Room | null { return this.rooms.get(code.toUpperCase()) ?? null; }

  closeAll() { for (const room of [...this.rooms.values()]) room.close(); }
}
