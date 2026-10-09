/**
 * The browser platform: e-mail magic-link sign-in against the game server's /auth routes, sessions in localStorage,
 * reload-to-update, no store.
 */
import type { AccountSummary } from '@0uroboros/protocol/messages';
import type { AuthProvider, Platform, Session, StoreProvider, UpdateProvider } from './Platform';

const SESSION_KEY = 'ouroboros.session';

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};

/** Where the game server lives: the build's `VITE_GAME_SERVER_URL`, else the page host on the server's default port. */
export function webServerUrl(): string {
  if (env.VITE_GAME_SERVER_URL) return env.VITE_GAME_SERVER_URL;
  const secure = location.protocol === 'https:';
  return `${secure ? 'wss' : 'ws'}://${location.hostname}:8787`;
}
export const httpTwin = (wsUrl: string) => wsUrl.replace(/^ws(s?):/, 'http$1:').replace(/\/$/, '');

const storage = {
  get: (key: string) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
  remove: (key: string) => { try { localStorage.removeItem(key); } catch { /* private mode */ } },
};

export class WebAuth implements AuthProvider {
  readonly methods = ['email'] as const satisfies AuthProvider['methods'];
  private current: Session | null;
  private listeners = new Set<(session: Session | null) => void>();
  constructor(private readonly httpUrl: string) {
    this.current = readSession();
  }
  session() { return this.current; }
  onChange(listener: (session: Session | null) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private set(session: Session | null) {
    this.current = session;
    if (session) storage.set(SESSION_KEY, JSON.stringify(session)); else storage.remove(SESSION_KEY);
    for (const listener of this.listeners) listener(session);
  }

  async requestMagicLink(email: string) {
    const body = await this.call('POST', '/auth/magic-link', { email }) as { message?: string };
    return body.message ?? 'Check your e-mail for the sign-in link.';
  }

  /** The magic link redirects back to the client with `#session=<token>`; exchange it for the account and store it. */
  async completeSignIn() {
    const match = /[#&]session=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (match) {
      history.replaceState(null, '', location.pathname + location.search);
      const account = await this.me(match[1]!);
      if (account) { this.set({ token: match[1]!, account }); return true; }
      return false;
    }
    // Validate a stored session once per page load; a revoked or expired one signs the player out.
    if (this.current) {
      const account = await this.me(this.current.token).catch(() => this.current!.account);
      if (!account) this.set(null); else if (account.name !== this.current.account.name) this.set({ token: this.current.token, account });
    }
    return false;
  }

  async rename(name: string) {
    if (!this.current) throw new Error('Sign in first.');
    const body = await this.call('POST', '/auth/name', { name }, this.current.token) as { account: AccountSummary };
    const session = { token: this.current.token, account: body.account };
    this.set(session);
    return session;
  }

  async signOut() {
    const token = this.current?.token;
    this.set(null);
    if (token) await this.call('POST', '/auth/sign-out', {}, token).catch(() => undefined);
  }

  private async me(token: string): Promise<AccountSummary | null> {
    const response = await fetch(`${this.httpUrl}/auth/me`, { headers: { authorization: `Bearer ${token}` } });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(`Sign-in check failed (${response.status}).`);
    return ((await response.json()) as { account: AccountSummary }).account;
  }

  private async call(method: string, path: string, body: unknown, token?: string): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.httpUrl}${path}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    } catch { throw new Error('The game server is not reachable.'); }
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
    return data;
  }
}

function readSession(): Session | null {
  try {
    const parsed = JSON.parse(storage.get(SESSION_KEY) ?? 'null') as Session | null;
    return parsed && typeof parsed.token === 'string' && parsed.account ? parsed : null;
  } catch { return null; }
}

const webUpdates: UpdateProvider = {
  version: env.VITE_APP_VERSION ?? 'dev',
  async check() { return { available: false }; },
};
const noStore: StoreProvider = { name: 'none', async unlockAchievement() { /* no store */ }, async setPresence() { /* no store */ } };

export function createWebPlatform(serverUrl = webServerUrl()): Platform {
  const serverHttpUrl = httpTwin(serverUrl);
  return {
    kind: 'web',
    input: matchMedia('(pointer: coarse)').matches ? 'touch' : 'pointer',
    serverUrl, serverHttpUrl,
    auth: new WebAuth(serverHttpUrl),
    updates: webUpdates,
    store: noStore,
    storage,
    openExternal: url => { window.open(url, '_blank', 'noopener'); },
  };
}
