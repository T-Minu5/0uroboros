/**
 * The bridge the client sees as `window.ouroborosHost` (see src/platform/Platform.ts `HostBridge` in the game repo).
 * Only narrow, promise-returning functions cross the context boundary.
 */
import { contextBridge, ipcRenderer } from 'electron';

const arg = (name: string) => process.argv.find(value => value.startsWith(`--ouroboros-${name}=`))?.split('=').slice(1).join('=');
const steam = arg('steam') === '1';

contextBridge.exposeInMainWorld('ouroborosHost', {
  kind: 'desktop',
  version: arg('version') ?? 'dev',
  serverUrl: arg('server') || undefined,
  nativeAuth: steam ? 'steam' : null,
  nativeCredential: () => ipcRenderer.invoke('host:steam-credential'),
  openExternal: (url: string) => ipcRenderer.invoke('host:open-external', url),
  checkForUpdate: () => ipcRenderer.invoke('host:check-update'),
  applyUpdate: () => ipcRenderer.invoke('host:apply-update'),
  storeName: steam ? 'steam' : 'none',
  unlockAchievement: (id: string) => ipcRenderer.invoke('host:unlock-achievement', id),
  setPresence: (text: string) => ipcRenderer.invoke('host:set-presence', text),
});
