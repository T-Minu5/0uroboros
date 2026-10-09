/**
 * Electron main process. Serves the staged client build (`app/`) over a privileged `app://` scheme so the client's
 * absolute `/assets/...` URLs resolve exactly as on the website, then exposes Steam, updates and external links to the
 * page through the preload bridge (`window.ouroborosHost`).
 *
 * Two flavours from one codebase:
 *   website build  — electron-updater checks GitHub Releases; no Steam.
 *   Steam build    — steamworks.js initialises the overlay/auth/achievements; Steam handles updates.
 * The flavour is decided by `steamBuild` in package.json's extraMetadata (set by `npm run dist:steam`) or a
 * `steam_appid.txt` beside the executable (developer runs).
 */
import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSteam, type Steam } from './steam';
import { createUpdates } from './updates';

const APP_SCHEME = 'app';
const APP_HOST = 'game';
const clientRoot = app.isPackaged ? join(process.resourcesPath, 'app') : join(__dirname, '..', 'app');
const packageMeta = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as { version: string; steamBuild?: boolean; steamAppId?: number | string; serverUrl?: string };
// Developer runs: a steam_appid.txt beside desktop/package.json (gitignored) turns the dev build into a Steam build.
const steamAppIdFile = join(app.getAppPath(), 'steam_appid.txt');
const steamBuild = !!packageMeta.steamBuild || existsSync(steamAppIdFile);
const steamAppId = Number(packageMeta.steamAppId ?? process.env.STEAM_APP_ID ?? (existsSync(steamAppIdFile) ? readFileSync(steamAppIdFile, 'utf8').trim() : 0));

protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

let steam: Steam | null = null;
if (steamBuild) {
  // The Steam overlay needs these before the GPU process starts (steamworks.js README).
  app.commandLine.appendSwitch('in-process-gpu');
  app.commandLine.appendSwitch('disable-direct-composition');
}

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.glb': 'model/gltf-binary', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};

function serveClient() {
  protocol.handle(APP_SCHEME, request => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const file = normalize(join(clientRoot, pathname));
    if (!file.startsWith(clientRoot) || !existsSync(file)) return new Response('Not found', { status: 404 });
    // net.fetch of a file URL streams and honours Range requests, which the card videos rely on.
    return net.fetch(pathToFileURL(file).toString(), { headers: request.headers }).then(response => {
      const headers = new Headers(response.headers);
      headers.set('content-type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream');
      return new Response(response.body, { status: response.status, headers });
    });
  });
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1600, height: 1000, minWidth: 1180, minHeight: 760, show: false, backgroundColor: '#07090f', title: '0uroboros',
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, additionalArguments: [`--ouroboros-version=${packageMeta.version}`, `--ouroboros-steam=${steam ? 1 : 0}`, ...(packageMeta.serverUrl ? [`--ouroboros-server=${packageMeta.serverUrl}`] : [])] },
  });
  window.once('ready-to-show', () => window.show());
  // Links leave the app through the system browser; nothing else may navigate the game window.
  window.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(`${APP_SCHEME}://${APP_HOST}/`)) event.preventDefault(); });
  void window.loadURL(`${APP_SCHEME}://${APP_HOST}/`);
  return window;
}

app.whenReady().then(() => {
  serveClient();
  if (steamBuild) steam = createSteam(steamAppId);
  const updates = createUpdates({ enabled: !steamBuild && app.isPackaged, version: packageMeta.version });

  ipcMain.handle('host:steam-credential', async () => {
    if (!steam) throw new Error('Steam is not running.');
    return { provider: 'steam', ticket: await steam.sessionTicket(), name: steam.personaName() };
  });
  ipcMain.handle('host:open-external', (_event, url: string) => { if (/^https?:\/\//.test(url)) return shell.openExternal(url); });
  ipcMain.handle('host:check-update', () => updates.check());
  ipcMain.handle('host:apply-update', () => updates.apply());
  ipcMain.handle('host:unlock-achievement', (_event, id: string) => { steam?.unlockAchievement(id); });
  ipcMain.handle('host:set-presence', (_event, text: string) => { steam?.setPresence(text); });

  const window = createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

  // `electron . --smoke` (CI / developer check): load the client, report what the page sees, exit non-zero on failure.
  if (process.argv.includes('--smoke')) {
    const fail = (message: string) => { console.error(`SMOKE FAIL ${message}`); app.exit(1); };
    const timer = setTimeout(() => fail('timed out'), 30_000);
    const consoleErrors: string[] = [];
    window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleErrors.push(message.slice(0, 300)); });
    window.webContents.on('did-fail-load', (_event, code, description) => fail(`load ${code} ${description}`));
    window.webContents.on('did-finish-load', async () => {
      try {
        // Reach the setup screen, start a solo game, and wait for the board's phase label: assets must load over app://.
        const result = await window.webContents.executeJavaScript(`new Promise(resolve => {
          const started = Date.now();
          const state = { url: location.href, host: window.ouroborosHost ? { kind: window.ouroborosHost.kind, version: window.ouroborosHost.version, nativeAuth: window.ouroborosHost.nativeAuth, storeName: window.ouroborosHost.storeName } : null, setup: false, started: false, phase: null };
          const poll = () => {
            const button = [...document.querySelectorAll('button')].find(b => /Enter evaluation build/.test(b.textContent || ''));
            if (button && !button.disabled && !state.started) { state.setup = true; state.started = true; button.click(); }
            const phase = document.querySelector('.phase-label');
            if (phase && /CYCLE/.test(phase.textContent || '')) { state.phase = phase.textContent; resolve(state); return; }
            if (Date.now() - started > 25000) { resolve(state); return; }
            setTimeout(poll, 200);
          };
          poll();
        })`) as { url: string; host: unknown; setup: boolean; phase: string | null };
        clearTimeout(timer);
        console.log(`SMOKE ${JSON.stringify({ ...result, consoleErrors })}`);
        if (!result.setup || !result.host || !result.url.startsWith(`${APP_SCHEME}://${APP_HOST}/`) || !result.phase) fail('client did not start a game through the app:// scheme with the host bridge');
        else if (consoleErrors.length) fail(`renderer logged errors`);
        else app.exit(0);
      } catch (error) { fail(String(error)); }
    });
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { steam?.shutdown(); });
