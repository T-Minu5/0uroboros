/**
 * Builds the Platform for a wrapped build (Electron desktop, Capacitor iPad) from the host's bridge. Sign-in reuses
 * the web implementation plus the host's native identity; updates, store and external links go through the bridge.
 */
import type { HostBridge, Platform } from './Platform';
import { WebAuth, httpTwin, webServerUrl } from './web';

const storage = {
  get: (key: string) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* unavailable */ } },
  remove: (key: string) => { try { localStorage.removeItem(key); } catch { /* unavailable */ } },
};

export function createHostPlatform(host: HostBridge): Platform {
  const serverUrl = host.serverUrl || webServerUrl();
  const serverHttpUrl = httpTwin(serverUrl);
  return {
    kind: host.kind,
    input: host.kind === 'ipad' || matchMedia('(pointer: coarse)').matches ? 'touch' : 'pointer',
    serverUrl, serverHttpUrl,
    auth: new WebAuth(serverHttpUrl, host),
    updates: { version: host.version, check: () => host.checkForUpdate(), ...(host.applyUpdate ? { apply: () => host.applyUpdate!() } : {}) },
    store: { name: host.storeName, unlockAchievement: id => host.unlockAchievement(id).catch(() => undefined), setPresence: text => host.setPresence(text).catch(() => undefined) },
    storage,
    openExternal: url => { void host.openExternal(url); },
  };
}
