/** The platform the game is running on: built from the host bridge a wrapper injected, else the plain web page. */
import type { Platform } from './Platform';
import { createHostPlatform } from './host';
import { createWebPlatform } from './web';

let instance: Platform | null = null;

export function platform(): Platform {
  if (!instance) instance = typeof window !== 'undefined' && window.ouroborosHost ? createHostPlatform(window.ouroborosHost) : createWebPlatform();
  return instance;
}

export type { AuthProvider, HostBridge, NativeCredential, Platform, PlatformKind, Session, StoreProvider, UpdateProvider } from './Platform';
