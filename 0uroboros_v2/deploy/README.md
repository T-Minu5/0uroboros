# Deploying 0uroboros (Hostinger)

Two things get hosted on one VPS: the **game server** (Node + WebSocket + SQLite) and the **website** (static client
at `/`, download page at `/download/`). Everything else — Content Studio, depth pipeline, agents, league — stays on
your machine.

Full walkthrough: [`../ARCHITECTURE_AND_DEPLOY.md`](../ARCHITECTURE_AND_DEPLOY.md) (Parts 3–7).

```
browser ── http(s) ──> nginx on the VPS   → /var/www/0uroboros/site
browser ── ws(s)  ──> game server        → :8787 (/auth, /evidence, /healthz)
studio  ── https    ──> same server /evidence   Eco-Strat pulls online-pvp games
```

## Quick playtest (IP address)

From `0uroboros_v2/`:

```bash
npm run server:build
npm run build:site
./deploy/hostinger-up.sh                 # default: root@179.236.68.191
# or: ./deploy/hostinger-up.sh root@YOUR.IP
```

With `VITE_GAME_SERVER_URL` unset, the client talks to the page host on port `8787` (`ws://YOUR.IP:8787`).

## Full release (domain + HTTPS)

See Part 5–6 of `ARCHITECTURE_AND_DEPLOY.md`. Summary:

```bash
npm run assets:manifest
npm test
npm run server:build
VITE_GAME_SERVER_URL=wss://api.yourdomain.com npm run build:site
# then rsync server + site as in Part 6, or extend hostinger-up.sh
```

## Local run of the hosted stack

```bash
npm run server:build
OUROBOROS_AUTH=on OUROBOROS_WEB_ORIGIN=http://127.0.0.1:5173 OUROBOROS_DB=.data/dev.sqlite npm run server:start
# Second terminal — client on :5173 talks to ws://127.0.0.1:8787 by default.
npm run dev
```

Magic links print to the server's stdout when mail is unset. `npm run test:online` runs the networked play gate.

## Eco-Strat on online games

In the studio's `.env`:

```
OUROBOROS_EVIDENCE_URL=http://YOUR.IP:8787
OUROBOROS_ADMIN_TOKEN=<same value as /etc/0uroboros/server.env on the VPS>
```

### Publishing an opponent

1. `npm run dev`, open `/agents` › Agents, **Publish … to the pack**.
2. `npm run assets:manifest`, commit, rebuild server + site, run `./deploy/hostinger-up.sh`.
3. Online tables play the pack built into the server; local AI games use the pack bundled in the next client build.

## Hardening notes

Optional env on the VPS (`/etc/0uroboros/server.env`):

- `SENTRY_DSN` — server errors and client crash reports
- `OUROBOROS_TRUST_PROXY` — set `off` when nginx is not forwarding client IPs (Hostinger quick path uses `off`)
- `OUROBOROS_PACK_URL` — CDN base for content packs by hash (optional)
- `OUROBOROS_RELEASE` — git short sha for logs (Part 6 sets this on each server upload)
