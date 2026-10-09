/**
 * Accounts and sign-in. The web release signs players in with an e-mail magic link; Steam and Apple identities arrive
 * with the desktop and iPad builds and map onto the same accounts.
 *
 *   request link  ->  token (random, 15 min) mailed as `${publicUrl}/auth/verify?token=...`
 *   verify        ->  token consumed, account created on first sign-in, long-lived session token returned
 *   authenticate  ->  session token (HTTP bearer or the ws `hello`) resolves to an account
 *
 * Tokens are stored hashed; the plain token only ever travels to the player.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Account, IdentityProvider, Store } from "./store";

export const MAGIC_LINK_TTL_MS = 15 * 60_000;
export const SESSION_TTL_MS = 30 * 24 * 3_600_000;
/** Live links per address; a fourth request within the TTL is refused. */
export const MAGIC_LINKS_PER_EMAIL = 3;

export interface Mailer {
  sendMagicLink(to: string, link: string): Promise<void>;
}

/** Development mailer: the link goes to the log (and to `lastLink`, which tests read). */
export class ConsoleMailer implements Mailer {
  lastLink: string | null = null;
  constructor(private readonly log: (entry: Record<string, unknown>) => void = () => undefined) {}
  async sendMagicLink(to: string, link: string) { this.lastLink = link; this.log({ event: "magic-link", to, link }); }
}

/** Sends through Resend's HTTP API (https://resend.com); any provider with a JSON endpoint fits the same shape. */
export class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string, private readonly from: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async sendMagicLink(to: string, link: string) {
    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: this.from, to: [to], subject: "Your 0uroboros sign-in link",
        text: `Open this link to sign in to 0uroboros. It works once and expires in 15 minutes.\n\n${link}\n\nIf you did not ask for it, ignore this e-mail.`,
      }),
    });
    if (!response.ok) throw new Error(`mail provider answered ${response.status}`);
  }
}

/** Checks a native credential with its provider and returns the stable subject (Steam id, Apple `sub`). */
export interface IdentityVerifier {
  verify(credential: string): Promise<{ subject: string; name?: string; email?: string | null }>;
}

/**
 * Steam session tickets (`steamworks.js` `auth.getSessionTicketWithSteamId`) are checked with the Steam Web API.
 * Needs a publisher Web API key and the app id from the Steamworks partner site.
 */
export class SteamVerifier implements IdentityVerifier {
  constructor(private readonly webApiKey: string, private readonly appId: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async verify(ticket: string) {
    if (!/^[0-9a-fA-F]{40,4096}$/.test(ticket)) throw new AuthError(400, "That is not a Steam session ticket.");
    const url = `https://partner.steam-api.com/ISteamUserAuth/AuthenticateUserTicket/v1/?key=${encodeURIComponent(this.webApiKey)}&appid=${encodeURIComponent(this.appId)}&ticket=${ticket}`;
    const response = await this.fetchImpl(url);
    if (!response.ok) throw new AuthError(502, `Steam answered ${response.status}.`);
    const body = await response.json() as { response?: { params?: { result?: string; steamid?: string; vacbanned?: boolean; publisherbanned?: boolean }; error?: { errorcode: number; errordesc: string } } };
    const params = body.response?.params;
    if (!params || params.result !== "OK" || !params.steamid) throw new AuthError(401, body.response?.error?.errordesc ?? "Steam did not accept the ticket.");
    if (params.publisherbanned) throw new AuthError(403, "This Steam account is banned from 0uroboros.");
    return { subject: params.steamid };
  }
}

/**
 * Sign in with Apple identity tokens are RS256 JWTs; the key comes from Apple's JWKS, the audience is the app's bundle id
 * (or Services id on the web). Only the `sub` is stored.
 */
export class AppleVerifier implements IdentityVerifier {
  private keys: { kid: string; key: import("node:crypto").KeyObject }[] = [];
  private fetchedAt = 0;
  constructor(private readonly audiences: string[], private readonly fetchImpl: typeof fetch = fetch, private readonly now: () => number = Date.now) {}
  async verify(identityToken: string) {
    const [h, p, s] = identityToken.split(".");
    if (!h || !p || !s) throw new AuthError(400, "That is not an Apple identity token.");
    const header = JSON.parse(Buffer.from(h, "base64url").toString()) as { alg?: string; kid?: string };
    const payload = JSON.parse(Buffer.from(p, "base64url").toString()) as { iss?: string; aud?: string | string[]; exp?: number; sub?: string; email?: string };
    if (header.alg !== "RS256" || !header.kid) throw new AuthError(400, "Unsupported Apple token.");
    const key = await this.keyFor(header.kid);
    const { createVerify } = await import("node:crypto");
    const valid = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(key, Buffer.from(s, "base64url"));
    const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud ?? ""];
    if (!valid || payload.iss !== "https://appleid.apple.com" || !audience.some(a => this.audiences.includes(a)) || !payload.exp || payload.exp * 1000 < this.now() || !payload.sub) {
      throw new AuthError(401, "Apple did not accept the sign-in.");
    }
    return { subject: payload.sub, email: payload.email ?? null };
  }
  private async keyFor(kid: string) {
    if (!this.keys.some(k => k.kid === kid) || this.now() - this.fetchedAt > 3_600_000) {
      const response = await this.fetchImpl("https://appleid.apple.com/auth/keys");
      if (!response.ok) throw new AuthError(502, `Apple answered ${response.status}.`);
      const { keys } = await response.json() as { keys: ({ kid: string } & Record<string, unknown>)[] };
      const { createPublicKey } = await import("node:crypto");
      this.keys = keys.map(jwk => ({ kid: jwk.kid, key: createPublicKey({ key: jwk as unknown as JsonWebKey, format: "jwk" }) }));
      this.fetchedAt = this.now();
    }
    const found = this.keys.find(k => k.kid === kid);
    if (!found) throw new AuthError(401, "Apple did not accept the sign-in.");
    return found.key;
  }
}

export type AuthConfig = {
  store: Store;
  mailer: Mailer;
  /** Where the server is reachable from the player's browser, e.g. https://play-api.example.com. */
  publicUrl: string;
  /** Native identity providers available on this server; absent providers answer 404. */
  identities?: Partial<Record<IdentityProvider, IdentityVerifier>>;
  now?: () => number;
};

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");
export const newToken = () => randomBytes(32).toString("base64url");
/** "ada.lovelace@…" becomes "Ada Lovelace"; the player can rename at any time. */
const nameFromEmail = (email: string) =>
  email.split("@")[0]!.replace(/[._+-]+/g, " ").trim().split(" ").filter(Boolean).map(word => word[0]!.toUpperCase() + word.slice(1)).join(" ").slice(0, 24) || "Player";

export class AuthError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export class Auth {
  private readonly now: () => number;
  constructor(private readonly config: AuthConfig) { this.now = config.now ?? Date.now; }

  /** Mails a one-time link. Returns the same answer whether or not the address is known, so addresses cannot be probed. */
  async requestLink(rawEmail: string): Promise<void> {
    const email = normaliseEmail(rawEmail);
    if (!email) throw new AuthError(400, "That does not look like an e-mail address.");
    const now = this.now();
    if (this.config.store.liveMagicTokens(email, now) >= MAGIC_LINKS_PER_EMAIL) throw new AuthError(429, "A link was sent recently. Check your inbox or try again in a few minutes.");
    const token = newToken();
    this.config.store.saveMagicToken(hashToken(token), email, now + MAGIC_LINK_TTL_MS);
    await this.config.mailer.sendMagicLink(email, `${this.config.publicUrl.replace(/\/$/, "")}/auth/verify?token=${token}`);
  }

  /** Exchanges a mailed token for a session; the first sign-in creates the account. */
  verify(token: string): { session: string; account: Account } {
    const now = this.now();
    const email = token ? this.config.store.consumeMagicToken(hashToken(token), now) : null;
    if (!email) throw new AuthError(400, "That sign-in link has expired or was already used. Request a new one.");
    let account = this.config.store.accountByEmail(email);
    if (!account) account = this.createAccount(email, nameFromEmail(email));
    return { session: this.openSession(account), account };
  }

  /**
   * Native sign-in (Steam on desktop, Apple on iPad): the host's credential is checked with the provider and mapped to
   * an account. A signed-in player (`linkTo`) gets the identity attached to their existing account instead; otherwise the
   * identity's e-mail (Apple) joins an existing e-mail account, and failing that a new account is created.
   */
  async signInWith(provider: IdentityProvider, credential: string, suggestedName?: string, linkTo?: Account | null): Promise<{ session: string; account: Account }> {
    const verifier = this.config.identities?.[provider];
    if (!verifier) throw new AuthError(404, `${provider} sign-in is not enabled on this server.`);
    const identity = await verifier.verify(credential);
    let account = this.config.store.accountByIdentity(provider, identity.subject);
    if (!account) {
      const email = identity.email ? normaliseEmail(identity.email) : null;
      account = linkTo ?? (email ? this.config.store.accountByEmail(email) : null)
        ?? this.createAccount(email, (suggestedName ?? identity.name ?? "").trim().slice(0, 24) || (email ? nameFromEmail(email) : "Player"));
      this.config.store.linkIdentity(provider, identity.subject, account.id);
    }
    return { session: this.openSession(account), account };
  }

  private createAccount(email: string | null, name: string): Account {
    const account = { id: `acct_${randomBytes(12).toString("base64url")}`, email, name, createdAt: this.now() };
    this.config.store.createAccount(account);
    return account;
  }
  private openSession(account: Account): string {
    const session = newToken();
    this.config.store.saveSession(hashToken(session), account.id, this.now() + SESSION_TTL_MS);
    return session;
  }

  authenticate(session: string | null | undefined): Account | null {
    return session ? this.config.store.sessionAccount(hashToken(session), this.now()) : null;
  }

  signOut(session: string) { this.config.store.deleteSession(hashToken(session)); }

  rename(account: Account, rawName: string): Account {
    const name = rawName.trim().replace(/\s+/g, " ").slice(0, 24);
    if (name.length < 1) throw new AuthError(400, "Pick a name of at least one character.");
    this.config.store.renameAccount(account.id, name);
    return { ...account, name };
  }
}

export function normaliseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return EMAIL.test(email) ? email : null;
}
