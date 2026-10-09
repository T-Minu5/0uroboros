/**
 * Fixed-window counters keyed by string (an IP, an account), on the injected clock so tests can drive them.
 * `take(key)` returns false once the window's budget is spent; `hold`/`release` track concurrent things like sockets.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { count: number; startedAt: number }>();
  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number) {}
  take(key: string, cost = 1): boolean {
    const at = this.now();
    let window = this.windows.get(key);
    if (!window || at - window.startedAt >= this.windowMs) { window = { count: 0, startedAt: at }; this.windows.set(key, window); }
    if (window.count + cost > this.limit) return false;
    window.count += cost;
    if (this.windows.size > 10_000) this.sweep(at);
    return true;
  }
  private sweep(at: number) { for (const [key, window] of this.windows) if (at - window.startedAt >= this.windowMs) this.windows.delete(key); }
}

export class ConcurrencyLimiter {
  private readonly held = new Map<string, number>();
  constructor(private readonly limit: number) {}
  hold(key: string): boolean {
    const current = this.held.get(key) ?? 0;
    if (current >= this.limit) return false;
    this.held.set(key, current + 1);
    return true;
  }
  release(key: string) {
    const current = this.held.get(key) ?? 0;
    if (current <= 1) this.held.delete(key); else this.held.set(key, current - 1);
  }
  count(key: string) { return this.held.get(key) ?? 0; }
}

/** The caller's address; behind Fly/Cloudflare the proxy's header is the truth, locally the socket is. */
export function clientIp(headers: Record<string, string | string[] | undefined>, remoteAddress: string | undefined, trustProxy: boolean): string {
  if (trustProxy) {
    const fly = headers["fly-client-ip"], cf = headers["cf-connecting-ip"], forwarded = headers["x-forwarded-for"];
    const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();
    const ip = first(fly) ?? first(cf) ?? first(forwarded);
    if (ip) return ip;
  }
  return remoteAddress ?? "unknown";
}
