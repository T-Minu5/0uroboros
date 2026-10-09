# 0uroboros desktop (Electron)

Wraps the shippable client (`npm run build:client` in the repo root) for Windows and macOS. One codebase, two flavours:

| Flavour | Updates | Sign-in | Store hooks |
| --- | --- | --- | --- |
| Website download (`npm run dist` / `release`) | electron-updater from GitHub Releases | e-mail magic link | none |
| Steam (`npm run dist:steam`) | Steam | Steam session ticket → `/auth/steam` (plus e-mail) | achievements, rich presence |

The game code never knows which: it talks to `window.ouroborosHost` (`HostBridge`, see `src/platform/Platform.ts` in
the repo), and `src/platform/host.ts` builds the full platform from it. The client is served over a privileged
`app://game/` scheme so its absolute `/assets/...` URLs work unchanged.

## Developer loop

```bash
cd desktop
npm install                       # Electron, electron-builder, electron-updater, steamworks.js
VITE_GAME_SERVER_URL=ws://127.0.0.1:8787 npm run stage    # builds the client and copies it to desktop/app
npm start                         # compile + run
npx electron . --smoke            # loads the client, starts a solo game, exits 0/1 (also `npm run test:desktop` from the root)
```

If `npm install` skipped Electron's binary (npm's install-scripts policy), run `node node_modules/electron/install.js`.
Unset `ELECTRON_RUN_AS_NODE` if it is set in your shell; with it Electron runs as plain Node.

Steam while developing: put the app id in `desktop/steam_appid.txt` (gitignored) and run with the Steam client open.
Release builds get the id from `npm run dist:steam` (`STEAM_APP_ID` env → `extraMetadata.steamAppId`) and never ship
`steam_appid.txt`.

## Signing and notarisation

`electron-builder.yml` enables the hardened runtime and notarisation on macOS and NSIS on Windows. Provide:

- macOS: `CSC_LINK` (base64 or path of the Developer ID Application `.p12`), `CSC_KEY_PASSWORD`, `APPLE_ID`,
  `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
- Windows: `CSC_LINK` / `CSC_KEY_PASSWORD` for the code-signing `.pfx` (CI maps `WIN_CSC_*` secrets onto them).

Without them the build still produces unsigned artefacts for local testing; Gatekeeper and SmartScreen will warn.

## Publishing

- Website: `npm run release` uploads the installers and `latest*.yml` to the GitHub Release matching `package.json`'s
  version; set `publish.owner` / `publish.repo` in `electron-builder.yml`. Installed apps update themselves on launch.
- Steam: the `Desktop` workflow (`.github/workflows/desktop.yml`) packages both platforms on a `v*` tag and uploads with
  `steamcmd` (game-ci/steam-deploy) to the `internal` branch. Steamworks setup needed once: the app, two depots
  (Windows x64, macOS), the achievements listed in `src/platform/achievements.ts` (API names), rich presence
  localisation with a `#Status` token, and a publisher Web API key for the server's `STEAM_WEB_API_KEY`.

## Acceptance (guide 13, step 14)

- `npx electron . --smoke` passes on the tagged commit for both platforms (CI).
- Steam internal build: sign in with Steam, play one full online game and one offline AI game, achievements unlock.
- Website build: installs, auto-updates to the next release, plays online.
