/**
 * HTTP + WebSocket front for the Lobby. `/healthz` reports liveness; everything else is one ws connection per client,
 * which may sit in at most one seat at a time.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { PROTOCOL_VERSION, parseClientMessage, type ClientMessage, type ServerMessage } from "@0uroboros/protocol/messages";
import { Lobby, type LobbyConfig } from "./lobby";
import type { Room } from "./room";
import type { PlayerId } from "@0uroboros/engine/game";

export type GameServerConfig = LobbyConfig & {
  /** Messages per connection per 10 s before the server drops the sender. */
  messageBudget?: number;
};

type Client = { socket: WebSocket; room: Room | null; seat: PlayerId | null; hello: boolean; budget: number; budgetAt: number };

export class GameServer {
  readonly lobby: Lobby;
  readonly http: Server;
  readonly wss: WebSocketServer;
  private readonly clients = new Set<Client>();
  private readonly config: GameServerConfig;

  constructor(config: GameServerConfig) {
    this.config = config;
    this.lobby = new Lobby(config);
    this.http = createServer((request, response) => this.handleHttp(request, response));
    this.wss = new WebSocketServer({ server: this.http, maxPayload: 64 * 1024 });
    this.wss.on("connection", socket => this.accept(socket));
  }

  listen(port: number, host = "0.0.0.0"): Promise<number> {
    return new Promise((resolve, reject) => {
      this.http.once("error", reject);
      this.http.listen(port, host, () => resolve((this.http.address() as AddressInfo).port));
    });
  }

  async close() {
    for (const client of this.clients) client.socket.close(1001, "Server shutting down");
    this.lobby.closeAll();
    await new Promise<void>(resolve => this.wss.close(() => resolve()));
    await new Promise<void>(resolve => this.http.close(() => resolve()));
  }

  private handleHttp(request: IncomingMessage, response: ServerResponse) {
    if (request.url === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, rooms: this.lobby.rooms.size, clients: this.clients.size }));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("0uroboros game server");
  }

  private accept(socket: WebSocket) {
    const client: Client = { socket, room: null, seat: null, hello: false, budget: 0, budgetAt: this.config.scheduler.now() };
    this.clients.add(client);
    const send = (message: ServerMessage) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message)); };
    send({ type: "welcome", protocol: PROTOCOL_VERSION, serverTime: this.config.scheduler.now() });
    socket.on("message", data => {
      if (!this.withinBudget(client)) { send({ type: "error", code: "rate", message: "Too many messages." }); socket.close(1008, "rate limit"); return; }
      const parsed = parseClientMessage(data as Buffer);
      if ("error" in parsed) { send({ type: "error", code: "protocol", message: parsed.error }); return; }
      try { this.dispatch(client, parsed, send); } catch (error) {
        this.config.log?.({ event: "dispatch-error", message: error instanceof Error ? error.message : String(error) });
        send({ type: "error", code: "room", message: error instanceof Error ? error.message : "Request failed." });
      }
    });
    socket.on("close", () => {
      this.clients.delete(client);
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

  private dispatch(client: Client, message: ClientMessage, send: (message: ServerMessage) => void) {
    const connection = { send };
    switch (message.type) {
      case "hello":
        client.hello = true;
        if (message.protocol !== PROTOCOL_VERSION) send({ type: "error", code: "protocol", message: `This server speaks protocol ${PROTOCOL_VERSION}; update the game.` });
        return;
      case "ping":
        send({ type: "pong", at: message.at, serverTime: this.config.scheduler.now() });
        return;
      case "createRoom": {
        if (client.room) { send({ type: "error", code: "room", message: "Leave your current room first." }); return; }
        const room = this.lobby.createRoom(message.mode, message.settings ?? {});
        const seated = room.join(message.name, connection)!;
        client.room = room; client.seat = seated.seat;
        return;
      }
      case "joinRoom": {
        if (client.room) { send({ type: "error", code: "room", message: "Leave your current room first." }); return; }
        const room = this.lobby.get(message.code);
        if (!room) { send({ type: "error", code: "room", message: "No table has that code." }); return; }
        const seated = room.join(message.name, connection);
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
        send({ type: "left" });
        return;
      case "command":
        if (!client.room || client.seat === null) { send({ type: "ack", requestId: message.requestId, ok: false, message: "You are not seated at a table." }); return; }
        client.room.apply(client.seat, message.command, message.requestId);
        return;
    }
  }
}
