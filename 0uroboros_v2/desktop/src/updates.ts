/**
 * Website builds update themselves from GitHub Releases through electron-updater (electron-builder's `publish`).
 * Steam builds leave updating to Steam, so the updater is disabled there.
 */
export type Updates = { check(): Promise<{ available: boolean; version?: string }>; apply(): Promise<void> };

export function createUpdates(options: { enabled: boolean; version: string }): Updates {
  if (!options.enabled) return { async check() { return { available: false }; }, async apply() { /* nothing to apply */ } };
  // Required lazily: electron-updater reads app-update.yml, which only exists in packaged builds.
  const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;
  let downloaded: string | null = null;
  autoUpdater.on('update-downloaded', info => { downloaded = info.version; });
  // One check at launch; the client can ask again from its settings.
  setTimeout(() => { autoUpdater.checkForUpdates().catch(error => console.error('[updates]', error)); }, 5_000);
  return {
    async check() {
      try {
        const result = await autoUpdater.checkForUpdates();
        const version = result?.updateInfo.version;
        return { available: !!version && version !== options.version, version };
      } catch (error) { console.error('[updates]', error); return { available: false }; }
    },
    async apply() { if (downloaded) autoUpdater.quitAndInstall(); },
  };
}
