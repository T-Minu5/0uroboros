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
import type { Account, Store } from "./store";

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

export type AuthConfig = {
  store: Store;
  mailer: Mailer;
  /** Where the server is reachable from the player's browser, e.g. https://play-api.example.com. */
  publicUrl: string;
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
    if (!account) {
      account = { id: `acct_${randomBytes(12).toString("base64url")}`, email, name: nameFromEmail(email), createdAt: now };
      this.config.store.createAccount(account);
    }
    const session = newToken();
    this.config.store.saveSession(hashToken(session), account.id, now + SESSION_TTL_MS);
    return { session, account };
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
