import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor serves `app/` (the staged client) from `capacitor://localhost`, so the client's absolute `/assets/...`
 * URLs resolve unchanged. The bridge script (`app/host-ipad.js`, built from src/host.ts) is injected ahead of the
 * client by scripts/stage-client.mjs and exposes `window.ouroborosHost`.
 */
const config: CapacitorConfig = {
  appId: 'com.ouroboros.game',
  appName: '0uroboros',
  webDir: 'app',
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: '#07090f',
  },
  plugins: {
    SignInWithApple: {},
    StatusBar: { style: 'DARK', overlaysWebView: true },
  },
};

export default config;
