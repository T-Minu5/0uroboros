/**
 * Error reporting for the hosted server and, through `POST /errors`, for game clients.
 *
 * `SentryReporter` speaks Sentry's envelope protocol directly over fetch (no SDK, no native code): one event per
 * envelope, tagged with `source` (server | client) and the platform. Without a DSN the `LogReporter` writes the same
 * event to the structured log, which is what the Fly dashboard shows. Both are fire-and-forget and never throw.
 */
import { randomUUID } from "node:crypto";

export type ErrorContext = { source: "server" | "client"; tags?: Record<string, string>; extra?: Record<string, unknown> };
export type ErrorEvent = { message: string; stack?: string; level: "error" | "warning" };

export interface ErrorReporter {
  report(error: unknown, context: ErrorContext): void;
  /** Resolves once queued reports have been sent (shutdown, tests). */
  flush(): Promise<void>;
}

export const describeError = (error: unknown): ErrorEvent =>
  error instanceof Error ? { message: error.message, stack: error.stack, level: "error" } : { message: typeof error === "string" ? error : JSON.stringify(error), level: "error" };

export class LogReporter implements ErrorReporter {
  constructor(private readonly log: (entry: Record<string, unknown>) => void) {}
  report(error: unknown, context: ErrorContext) {
    const event = describeError(error);
    this.log({ event: "error-report", source: context.source, message: event.message, stack: event.stack, ...context.tags, extra: context.extra });
  }
  flush() { return Promise.resolve(); }
}

export type SentryConfig = { dsn: string; release?: string; environment?: string; fetchImpl?: typeof fetch; now?: () => number; log?: (entry: Record<string, unknown>) => void };

/** `https://<key>@<host>/<project>` -> the envelope endpoint and auth header. */
export function parseDsn(dsn: string): { endpoint: string; auth: string } {
  const url = new URL(dsn);
  const project = url.pathname.replace(/^\/+/, "");
  if (!url.username || !project) throw new Error("Sentry DSN needs a public key and a project id.");
  return { endpoint: `${url.protocol}//${url.host}/api/${project}/envelope/`, auth: `Sentry sentry_version=7, sentry_client=ouroboros-server/1, sentry_key=${url.username}` };
}

export class SentryReporter implements ErrorReporter {
  private readonly endpoint: string;
  private readonly auth: string;
  private readonly inflight = new Set<Promise<unknown>>();
  constructor(private readonly config: SentryConfig) {
    const parsed = parseDsn(config.dsn);
    this.endpoint = parsed.endpoint; this.auth = parsed.auth;
  }

  report(error: unknown, context: ErrorContext) {
    const event = describeError(error);
    const at = new Date(this.config.now?.() ?? Date.now()).toISOString();
    const eventId = randomUUID().replace(/-/g, "");
    const body = {
      event_id: eventId, timestamp: at, platform: "javascript", level: event.level, release: this.config.release, environment: this.config.environment,
      tags: { source: context.source, ...context.tags }, extra: context.extra,
      exception: { values: [{ type: "Error", value: event.message, stacktrace: event.stack ? { frames: framesFrom(event.stack) } : undefined }] },
    };
    const envelope = `${JSON.stringify({ event_id: eventId, sent_at: at })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(body)}\n`;
    const request = (this.config.fetchImpl ?? fetch)(this.endpoint, { method: "POST", headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": this.auth }, body: envelope })
      .then(response => { if (!response.ok) this.config.log?.({ event: "sentry-rejected", status: response.status }); })
      .catch(cause => this.config.log?.({ event: "sentry-unreachable", message: cause instanceof Error ? cause.message : String(cause) }));
    this.inflight.add(request);
    void request.finally(() => this.inflight.delete(request));
  }

  async flush() { await Promise.all([...this.inflight]); }
}

/** V8 stack lines -> Sentry frames (innermost last, as Sentry expects). */
function framesFrom(stack: string) {
  const frames = [];
  for (const line of stack.split("\n").slice(1)) {
    const match = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (match) frames.push({ function: match[1] ?? "<anonymous>", filename: match[2], lineno: Number(match[3]), colno: Number(match[4]) });
  }
  return frames.reverse();
}

/** Picks Sentry when a DSN is configured, the log otherwise. */
export function createReporter(options: { dsn?: string; release?: string; environment?: string; log: (entry: Record<string, unknown>) => void }): ErrorReporter {
  return options.dsn ? new SentryReporter({ dsn: options.dsn, release: options.release, environment: options.environment, log: options.log }) : new LogReporter(options.log);
}

/** Wires process-level failures to the reporter; returns a function that detaches again. */
export function watchProcess(reporter: ErrorReporter): () => void {
  const onException = (error: unknown) => reporter.report(error, { source: "server", tags: { origin: "uncaughtException" } });
  const onRejection = (reason: unknown) => reporter.report(reason, { source: "server", tags: { origin: "unhandledRejection" } });
  process.on("uncaughtException", onException);
  process.on("unhandledRejection", onRejection);
  return () => { process.off("uncaughtException", onException); process.off("unhandledRejection", onRejection); };
}

/** What a client may send to `POST /errors`; everything is clamped so the route cannot be used to stuff the log. */
export type ClientErrorReport = { message: string; stack?: string; url?: string; platform?: string; version?: string };
export function parseClientError(body: unknown): ClientErrorReport | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.message !== "string" || !b.message.trim()) return null;
  const clamp = (value: unknown, max: number) => (typeof value === "string" ? value.slice(0, max) : undefined);
  return { message: b.message.slice(0, 500), stack: clamp(b.stack, 2000), url: clamp(b.url, 300), platform: clamp(b.platform, 20), version: clamp(b.version, 40) };
}
