# 0uroboros iPad (Capacitor)

Same client, wrapped by Capacitor for iPadOS. The game never learns it is on iPad beyond `platform().kind === 'ipad'`
and `input === 'touch'`; everything native sits behind `window.ouroborosHost` (built from `src/host.ts`).

## What the wrapper provides

- **Sign in with Apple** as the native identity (`@capacitor-community/apple-sign-in`); the identity token goes to the
  server's `/auth/apple`, which verifies it against Apple's JWKS and maps it onto the same account an e-mail sign-in
  would use. E-mail magic links keep working too (the link opens the app through a universal link, or the player
  pastes the session in Safari).
- **Touch-first client**: drag-to-deploy is Pointer Events with `touch-action: none`, a wider touch slop keeps taps as
  taps, and `.app[data-input=touch]` enlarges hit targets to 44 px.
- **Asset limits** (`scripts/stage-client.mjs`): raster textures capped at 2048 px, staged app must stay under 200 MB,
  the board renders at DPR ≤ 1.6.
- **Offline practice** runs the engine in-process (`LocalClient`), so a flight with no network still has the AI.

## Setup (macOS with Xcode)

```bash
cd ipad
npm install
VITE_GAME_SERVER_URL=wss://ouroboros-server.fly.dev npm run stage   # client + limits + bridge -> app/
# ios/App is already scaffolded (commit it); CocoaPods + full Xcode are needed for plugins:
sudo gem install cocoapods && sudo xcode-select -s /Applications/Xcode.app
npm run sync           # copies app/ into the Xcode project and installs plugins (pod install)
npm run open           # Xcode: set the team, enable the "Sign in with Apple" capability, archive for TestFlight
```

Server side: set `APPLE_AUDIENCES=com.ouroboros.game` (the bundle id; add the Services id if the web ever uses Apple)
so `/auth/apple` is enabled. Update `clientId` / `redirectURI` in `src/host.ts` to match.

## Acceptance

- A full online game against a desktop player, three Cycles, drag-to-deploy by finger, a choice dialog answered by tap.
- Sign in with Apple creates an account; signing in by e-mail on the web afterwards lands on the same account.
- Memory stays flat across three Cycles on the oldest supported iPad (Instruments: no texture growth).
- Offline practice vs AI in airplane mode.
