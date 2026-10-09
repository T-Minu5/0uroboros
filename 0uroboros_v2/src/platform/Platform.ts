/**
 * What the game client needs from the thing that hosts it. The web page, the Electron desktop app (Steam) and the
 * Capacitor iPad app each provide one; the game code only ever talks to this interface, so it stays platform-neutral.
 *
 * A wrapper does not implement all of this itself: it exposes a small `HostBridge` as `window.ouroborosHost` from its
 * preload / native bridge before the page scripts run, and `src/platform/host.ts` builds the Platform from it (the
 * e-mail sign-in and session handling are shared with the web). `src/platform/index.ts` falls back to the web.
 */
import type { AccountSummary } from '@0uroboros/protocol/messages';

export type PlatformKind = 'web' | 'desktop' | 'ipad';

export type Session = { token: string; account: AccountSummary };

/** Sign-in. Each identity provider ends in the same session token the game server understands. */
export interface AuthProvider {
  /** Which identities this host can offer: e-mail magic link on the web, Steam on desktop, Apple on iPad. */
  readonly methods: ('email' | 'steam' | 'apple')[];
  session(): Session | null;
  onChange(listener: (session: Session | null) => void): () => void;
  /** E-mail magic link: asks the server to mail one. Resolves with the message to show. */
  requestMagicLink(email: string): Promise<string>;
  /** Steam / Apple: performs the host's native sign-in and exchanges it for a session. */
  signInNative?(): Promise<Session>;
  /** Picks up a session delivered out of band (the magic link's redirect, a deep link). Returns true when one was found. */
  completeSignIn(): Promise<boolean>;
  rename(name: string): Promise<Session>;
  signOut(): Promise<void>;
}

/** App updates: the web reloads, desktop uses electron-updater or Steam, iPad uses the App Store. */
export interface UpdateProvider {
  /** Human-readable version of the running build. */
  readonly version: string;
  check(): Promise<{ available: boolean; version?: string }>;
  /** Applies a downloaded update (restarts the app) where the host supports it. */
  apply?(): Promise<void>;
}

/** Store hooks: achievements and rich presence on Steam, Game Center on iPad; no-ops elsewhere. */
export interface StoreProvider {
  readonly name: 'none' | 'steam' | 'app-store';
  unlockAchievement(id: string): Promise<void>;
  setPresence(text: string): Promise<void>;
}

export interface Platform {
  readonly kind: PlatformKind;
  /** Pointer model the host expects; the game keeps touch-sized targets everywhere but can relax hover-only affordances. */
  readonly input: 'pointer' | 'touch';
  /** How the game reaches the server: the ws(s) URL and its http(s) twin. */
  readonly serverUrl: string;
  readonly serverHttpUrl: string;
  readonly auth: AuthProvider;
  readonly updates: UpdateProvider;
  readonly store: StoreProvider;
  /** Small persistent values (name, seat, session). Web: localStorage; wrappers may use their own secure storage. */
  readonly storage: { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void };
  openExternal(url: string): void;
}

/** A native credential the host obtained; the server exchanges it for a session (`/auth/steam`, `/auth/apple`). */
export type NativeCredential = { provider: 'steam'; ticket: string; name?: string } | { provider: 'apple'; identityToken: string; name?: string };

/** The minimum a wrapper (Electron preload, Capacitor plugin) exposes; everything else is built on top in TypeScript. */
export interface HostBridge {
  readonly kind: Exclude<PlatformKind, 'web'>;
  readonly version: string;
  /** Overrides the built-in server URL (ws/wss) when the host knows better, e.g. a Steam launch option. */
  readonly serverUrl?: string;
  /** Native identity available on this host, if any. */
  readonly nativeAuth: 'steam' | 'apple' | null;
  nativeCredential(): Promise<NativeCredential>;
  openExternal(url: string): Promise<void>;
  checkForUpdate(): Promise<{ available: boolean; version?: string }>;
  applyUpdate?(): Promise<void>;
  readonly storeName: StoreProvider['name'];
  unlockAchievement(id: string): Promise<void>;
  setPresence(text: string): Promise<void>;
}

declare global {
  interface Window { ouroborosHost?: HostBridge }
}
