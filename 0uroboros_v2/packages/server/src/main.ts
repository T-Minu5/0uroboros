/**
 * Entry point for the hosted game server.
 *
 *   PORT                  listen port (default 8787)
 *   HOST                  bind address (default 0.0.0.0)
 *   OUROBOROS_DB          SQLite file for results, replays and accounts; unset keeps them in memory
 *   OUROBOROS_MAX_ROOMS   rooms alive at once (default 500)
 *   OUROBOROS_PUBLIC_URL  how browsers reach this server, e.g. https://api.0uroboros.example (magic links point here)
 *   OUROBOROS_WEB_ORIGIN  the web client's origin, e.g. https://0uroboros.example; allowed for CORS and the sign-in redirect.
 *                         Comma-separate extra allowed origins (the first is the redirect target).
 *   OUROBOROS_AUTH        "on" to enable e-mail sign-in (default on when OUROBOROS_PUBLIC_URL is set)
 *   RESEND_API_KEY        mail provider key; unset logs magic links to stdout instead of mailing them (dev only)
 *   MAIL_FROM             sender address for magic links, e.g. "0uroboros <play@0uroboros.example>"
 *   OUROBOROS_ADMIN_TOKEN bearer token for /evidence (the studio's Eco-Strat pull); unset disables the route
 *   STEAM_WEB_API_KEY, STEAM_APP_ID   enable /auth/steam (desktop build)
 *   APPLE_AUDIENCES       comma-separated bundle / Services ids; enables /auth/apple (iPad build)
 *   SENTRY_DSN            error reporting for the server and for client crash reports posted to /errors; unset logs them
 *   OUROBOROS_RELEASE     release label on error reports (CI sets it to the git sha)
 *   OUROBOROS_PACK_URL    CDN base for content packs by hash (e.g. https://cdn.0uroboros.example/pack); unset, /pack/ here
 *   OUROBOROS_TRUST_PROXY "off" to read client addresses from the socket instead of Fly/Cloudflare headers (default on)
 */
import { PACK_HASH, PACK_REVISION, publishedContent, publishedRawDocument } from "@0uroboros/content/document";
import { AppleVerifier, Auth, ConsoleMailer, ResendMailer, SteamVerifier } from "./auth";
import { createReporter, watchProcess } from "./errorReporting";
import { GameServer } from "./gameServer";
import { realScheduler } from "./scheduler";
import { MemoryStore, openSqliteStore } from "./store";

const log = (entry: Record<string, unknown>) => process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`);

async function main() {
  const env = process.env;
  const port = Number(env.PORT ?? 8787);
  const host = env.HOST ?? "0.0.0.0";
  const store = env.OUROBOROS_DB ? await openSqliteStore(env.OUROBOROS_DB) : new MemoryStore();
  const origins = (env.OUROBOROS_WEB_ORIGIN ?? "").split(",").map(origin => origin.trim()).filter(Boolean);
  const publicUrl = env.OUROBOROS_PUBLIC_URL ?? `http://localhost:${port}`;
  const authOn = env.OUROBOROS_AUTH ? env.OUROBOROS_AUTH !== "off" : !!env.OUROBOROS_PUBLIC_URL;
  const mailer = env.RESEND_API_KEY ? new ResendMailer(env.RESEND_API_KEY, env.MAIL_FROM ?? "0uroboros <onboarding@resend.dev>") : new ConsoleMailer(log);
  if (authOn && !env.RESEND_API_KEY) log({ event: "warning", message: "RESEND_API_KEY unset: magic links are logged, not mailed" });
  const reporter = createReporter({ dsn: env.SENTRY_DSN, release: env.OUROBOROS_RELEASE, environment: env.FLY_APP_NAME ? "production" : "development", log });
  watchProcess(reporter);
  const server = new GameServer({
    content: publishedContent(), contentRevision: PACK_REVISION, scheduler: realScheduler, store, log,
    maxRooms: Number(env.OUROBOROS_MAX_ROOMS ?? 500),
    auth: authOn ? new Auth({ store, mailer, publicUrl, identities: {
      ...(env.STEAM_WEB_API_KEY && env.STEAM_APP_ID ? { steam: new SteamVerifier(env.STEAM_WEB_API_KEY, env.STEAM_APP_ID) } : {}),
      ...(env.APPLE_AUDIENCES ? { apple: new AppleVerifier(env.APPLE_AUDIENCES.split(",").map(a => a.trim()).filter(Boolean)) } : {}),
    } }) : undefined,
    allowedOrigins: origins.length ? origins : ["*"],
    webOrigin: origins[0],
    adminToken: env.OUROBOROS_ADMIN_TOKEN,
    pack: { hash: PACK_HASH, revision: PACK_REVISION, document: publishedRawDocument() },
    packUrl: env.OUROBOROS_PACK_URL,
    reporter,
    trustProxy: env.OUROBOROS_TRUST_PROXY !== "off",
  });
  const bound = await server.listen(port, host);
  log({ event: "listening", host, port: bound, contentRevision: PACK_REVISION, packHash: PACK_HASH, errors: env.SENTRY_DSN ? "sentry" : "log", store: env.OUROBOROS_DB ? "sqlite" : "memory", auth: authOn, mail: env.RESEND_API_KEY ? "resend" : "console", evidence: !!env.OUROBOROS_ADMIN_TOKEN, steam: !!(env.STEAM_WEB_API_KEY && env.STEAM_APP_ID), apple: !!env.APPLE_AUDIENCES });
  const shutdown = async (signal: string) => {
    log({ event: "shutdown", signal });
    await server.close();
    await reporter.flush();
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(error => { log({ event: "fatal", message: error instanceof Error ? error.stack ?? error.message : String(error) }); process.exit(1); });
