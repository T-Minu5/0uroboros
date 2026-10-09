/**
 * Entry point for the hosted game server.
 *
 *   PORT              listen port (default 8787)
 *   HOST              bind address (default 0.0.0.0)
 *   OUROBOROS_DB      SQLite file for results and replays; unset keeps them in memory
 *   OUROBOROS_MAX_ROOMS  rooms alive at once (default 500)
 */
import { PACK_REVISION, publishedContent } from "@0uroboros/content/document";
import { GameServer } from "./gameServer";
import { realScheduler } from "./scheduler";
import { MemoryStore, openSqliteStore } from "./store";

const log = (entry: Record<string, unknown>) => process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);

async function main() {
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "0.0.0.0";
  const store = process.env.OUROBOROS_DB ? await openSqliteStore(process.env.OUROBOROS_DB) : new MemoryStore();
  const server = new GameServer({
    content: publishedContent(), contentRevision: PACK_REVISION, scheduler: realScheduler, store, log,
    maxRooms: Number(process.env.OUROBOROS_MAX_ROOMS ?? 500),
  });
  const bound = await server.listen(port, host);
  log({ event: "listening", host, port: bound, contentRevision: PACK_REVISION, store: process.env.OUROBOROS_DB ? "sqlite" : "memory" });
  const shutdown = async (signal: string) => {
    log({ event: "shutdown", signal });
    await server.close();
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(error => { log({ event: "fatal", message: error instanceof Error ? error.stack ?? error.message : String(error) }); process.exit(1); });
