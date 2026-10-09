# Deploying 0uroboros (web release)

Two things get hosted: the **game server** (one Node process, WebSocket + a few HTTP routes, SQLite on a volume) and the
**website** (static files: the web client at `/`, the download page at `/download/`). Everything else — Content Studio,
depth pipeline, agents, league — stays on your machine.

```
browser ── https ──> Cloudflare Pages (dist/site)        static client + download page
browser ── wss ───> Fly.io machine  (deploy/Dockerfile)  game server, /auth, /evidence, /healthz
studio  ── https ─> Fly.io /evidence                     Eco-Strat pulls online-pvp games
```

## 1. Game server on Fly.io (once)

```bash
# from 0uroboros_v2/
fly auth login
fly launch --copy-config --config deploy/fly.toml --dockerfile deploy/Dockerfile --no-deploy   # pick the app name/region
fly volumes create ouroboros_data --size 1 --region <region>
fly secrets set \
  OUROBOROS_ADMIN_TOKEN="$(openssl rand -base64 32)" \
  RESEND_API_KEY="re_..." \
  MAIL_FROM="0uroboros <play@your-domain>"
```

Edit `deploy/fly.toml` `[env]` first:

- `OUROBOROS_PUBLIC_URL` — the server's own https URL (magic links point here), e.g. `https://ouroboros-server.fly.dev`.
- `OUROBOROS_WEB_ORIGIN` — the website origin, e.g. `https://play.your-domain`. CORS and the post-sign-in redirect use it.

Then `fly deploy --config deploy/fly.toml --dockerfile deploy/Dockerfile`. `GET /healthz` must answer `{"ok":true,...,"auth":true}`.
One machine only (`max_machines_running = 1`): rooms and the quick-match queue live in memory; a second machine would
split them. Scale the machine, not the count.

Mail: [Resend](https://resend.com) needs a verified sending domain. Without `RESEND_API_KEY` the server logs magic
links instead of mailing them (`fly logs` shows `"event":"magic-link"`), which is enough for a first private test.

## 2. Website on Cloudflare Pages (once)

```bash
VITE_GAME_SERVER_URL=wss://ouroboros-server.fly.dev npm run build:site      # -> dist/site
npx wrangler pages project create ouroboros
npx wrangler pages deploy dist/site --project-name ouroboros
```

Point your domain at the Pages project. The client finds the server through `VITE_GAME_SERVER_URL` baked in at build
time; `site/_headers` sets caching and basic security headers; `dist/site/version.json` records what was deployed.

Edit `site/download/index.html` to replace `OWNER/REPO` with the GitHub repository once desktop builds exist (Phase 5).

## 3. Continuous deployment (GitHub Actions)

Workflows live at the repository root (`.github/workflows/`), running inside `0uroboros_v2/`:

| Workflow | Trigger | Needs |
| --- | --- | --- |
| `ci.yml` | every push / PR | nothing |
| `deploy-server.yml` | push to `main` touching server inputs | secret `FLY_API_TOKEN` (`fly tokens create deploy`) |
| `deploy-site.yml` | push to `main` | secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; variables `GAME_SERVER_URL` (wss://…), `CLOUDFLARE_PAGES_PROJECT` |

## 4. Local run of the hosted stack

```bash
npm run server:build
OUROBOROS_AUTH=on OUROBOROS_WEB_ORIGIN=http://127.0.0.1:5173 OUROBOROS_DB=.data/dev.sqlite npm run server:start
# In a second terminal. The client on :5173 talks to ws://127.0.0.1:8787 by default.
npm run dev
```

(Keep comments on their own line: zsh passes an inline `# …` to the command, and Vite would use `#` as its root.)

Magic links print to the server's stdout. `npm run test:online` runs the whole gate (server + two browsers + sign-in).

## 5. Eco-Strat on online games

In the studio's `.env`:

```
OUROBOROS_EVIDENCE_URL=https://ouroboros-server.fly.dev
OUROBOROS_ADMIN_TOKEN=<same value as the Fly secret>
```

While Eco-Strat is active the dev server pulls finished PvP games every five minutes (`/evidence`), publishes them as
`source: 'online-pvp'`, and keeps its cursor in `ai-agents/online-evidence.json`. AI tables and games without a match
report are skipped; e-mails never leave the server.

## 6. Hardening (Phase 6)

Optional secrets and vars, all read by `packages/server/src/main.ts`:

- `SENTRY_DSN` — server errors and client crash reports (`POST /errors`, rate limited per address) go to Sentry; unset,
  they are logged as `"event":"error-report"`. `OUROBOROS_RELEASE` tags them (the deploy workflow sets it to the git sha).
- `OUROBOROS_TRUST_PROXY` — on by default: client addresses come from `Fly-Client-IP` / `CF-Connecting-IP` /
  `X-Forwarded-For` for the per-address limits (8 sockets, 30 auth calls/min, 10 magic links/hour, 10 crash reports/min).
  Set `off` when the server is reached directly.
- `OUROBOROS_PACK_URL` — CDN base for content packs by hash. The server announces its pack hash in `welcome`; a client
  whose bundled pack differs fetches `<base>/<hash>` (default: the server's own `/pack/<hash>`, immutable-cached).
  The server keeps the current and previous pack in SQLite, so older clients keep playing through a rollout.
  To front it with Cloudflare, add a cache rule for `/pack/*` on the server's hostname — the responses are already
  `immutable`.
- Ratings: pvp games between two signed-in players are rated (Elo, 1200 start, K 32 for ten games then 16). Quick match
  pairs players within 100 points, widening by 50 every 10 s. Guests queue at 1200 and are never rated.

## 7. Friends playtest checklist

Before inviting anyone:

- `npm run test:online` passes on the commit being deployed (guide 14, networked play gate).
- `/healthz` on the deployed server reports `auth: true`; a magic link to your own address arrives within a minute.
- Two machines on different networks complete three Cycles; one reloads mid-Draft and rejoins.
- `fly logs` shows no `dispatch-error` / `store-error` / `error-report` entries during the session.

During the session:

- Players sign in (optional) and share the six-character invite code; "Play the server AI" is the fallback when a friend is late.
- Watch `fly logs` for `forfeit` / `abandon` events; a 20 s first-disconnect pause and 120 s later grace are expected behaviour (guide 06).
- After each game the result and replay are in SQLite (`fly ssh console`, `/data/ouroboros.sqlite`); Eco-Strat picks up PvP games on its next pull.

After:

- Export notes from the players (what felt slow, unclear, or unfair) into `docs/playtests/<date>.md`.
- Content changes raise the pack revision in `content/authored-content.json`; every replay records the revision it was played on, so redeploy the server after a content save rather than editing the pack in place.
