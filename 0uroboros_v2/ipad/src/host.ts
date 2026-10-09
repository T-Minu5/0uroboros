/**
 * The iPad host bridge, bundled to app/host-ipad.js and loaded before the client. It mirrors `HostBridge` in the game
 * repo (src/platform/Platform.ts): Sign in with Apple as the native identity, App Store updates, no store hooks yet
 * (Game Center can be added behind `unlockAchievement` without touching the client).
 */
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { SignInWithApple } from '@capacitor-community/apple-sign-in';
import { StatusBar, Style } from '@capacitor/status-bar';

const nonce = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');

async function appVersion() {
  try { const info = await App.getInfo(); return `${info.version} (${info.build})`; } catch { return 'dev'; }
}

const host = {
  kind: 'ipad' as const,
  version: 'dev',
  serverUrl: undefined as string | undefined,
  nativeAuth: 'apple' as const,
  async nativeCredential() {
    const result = await SignInWithApple.authorize({ clientId: 'com.ouroboros.game', redirectURI: 'https://play.0uroboros.example/auth/apple', scopes: 'name email', state: nonce(), nonce: nonce() });
    const name = [result.response.givenName, result.response.familyName].filter(Boolean).join(' ') || undefined;
    return { provider: 'apple' as const, identityToken: result.response.identityToken, name };
  },
  openExternal: (url: string) => Browser.open({ url }),
  async checkForUpdate() { return { available: false }; },
  storeName: 'none' as const,
  async unlockAchievement(_id: string) { /* Game Center: future */ },
  async setPresence(_text: string) { /* no presence on iPad */ },
};

void appVersion().then(version => { host.version = version; });
void StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
(window as unknown as { ouroborosHost: typeof host }).ouroborosHost = host;
