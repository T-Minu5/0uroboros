/** The platform the game is running on: whatever the host wrapper injected, else the plain web page. */
import type { Platform } from './Platform';
import { createWebPlatform } from './web';

let instance: Platform | null = null;

export function platform(): Platform {
  if (!instance) instance = typeof window !== 'undefined' && window.ouroborosPlatform ? window.ouroborosPlatform : createWebPlatform();
  return instance;
}

export type { AuthProvider, Platform, PlatformKind, Session, StoreProvider, UpdateProvider } from './Platform';
