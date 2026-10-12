import { defineConfig, loadEnv, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

const ART_MANIFEST = JSON.parse(readFileSync(resolve('packages/content/art-manifest.json'), 'utf8')) as { files: string[] };

const AUDIO_TYPES: Record<string,string> = {'.mp3':'audio/mpeg','.m4a':'audio/mp4','.aac':'audio/aac','.ogg':'audio/ogg','.oga':'audio/ogg','.wav':'audio/wav','.flac':'audio/flac'};
const MUSIC_DIR = resolve('assets/music');
/** Songs in assets/music, read on every request so newly added files play without a restart. */
const musicFiles = () => existsSync(MUSIC_DIR)
 ? readdirSync(MUSIC_DIR).filter(name => !name.startsWith('.') && AUDIO_TYPES[extname(name).toLowerCase()]).sort()
 : [];

// Server code is loaded through Vite, never imported here: importing it would make Vite restart in-process on every server edit,
// and each in-process restart leaks the previous server's memory. `npm run dev` restarts the whole process instead (see package.json).
const load = <T>(server: ViteDevServer, path: string) => server.ssrLoadModule(path) as Promise<T>;

/**
 * Build targets. `client` is what ships to players: the game page only, studio UI compiled out (`__STUDIO__ = false`),
 * written to dist/client. The default (`studio`) builds the game and the Content Studio together for local use.
 */
const TARGET = process.env.OUROBOROS_TARGET === 'client' ? 'client' : 'studio';
const CLIENT = TARGET === 'client';
const OUT_DIR = CLIENT ? 'dist/client' : 'dist';

// Reference animations, concept art and Blender sources are never production assets.
export default defineConfig({
 // Workspace packages resolve from source; the alias keeps Vite, Vitest and scripts independent of the node_modules symlink.
 resolve: { alias: [
  { find: /^@0uroboros\/engine\/(.*)$/, replacement: `${resolve('packages/engine/src')}/$1` },
  { find: /^@0uroboros\/content\/(.*)$/, replacement: `${resolve('packages/content')}/$1` },
  { find: /^@0uroboros\/protocol\/(.*)$/, replacement: `${resolve('packages/protocol/src')}/$1` },
  { find: /^@0uroboros\/server\/(.*)$/, replacement: `${resolve('packages/server/src')}/$1` },
 ] },
 define: { __STUDIO__: JSON.stringify(!CLIENT) },
 build: {
  outDir: OUT_DIR,
  emptyOutDir: true,
  rollupOptions: { input: CLIENT ? { index: resolve('index.html') } : { index: resolve('index.html'), studio: resolve('studio.html'), agents: resolve('agents.html') } },
 },
 plugins: [react(), {
  name: 'studio-page-route',
  configureServer(server) {
   // The Content Studio keeps its /author URL and the Agents page its /agents URL in dev; they are separate pages so
   // the client build can leave them out.
   server.middlewares.use((request, _response, next) => {
    const path = (request.url ?? '').split('?')[0];
    if (path === '/author' || path.startsWith('/author/')) request.url = '/studio.html';
    else if (path === '/agents' || path.startsWith('/agents/')) request.url = '/agents.html';
    next();
   });
  },
 }, {
  name: 'first-party-production-assets',
  configureServer(server) {
   server.middlewares.use('/assets', (request, response, next) => {
    // `?url` / `?import` requests are Vite resolving a source import, not the browser fetching the file.
    if (/[?&](url|import)(&|=|$)/.test(request.url ?? '')) return next();
    const rawPath = decodeURIComponent((request.url ?? '').split('?')[0] ?? '').replace(/^\/+/, '');
    if (rawPath === 'music/playlist.json') {
     response.setHeader('Content-Type', 'application/json');
     response.setHeader('Cache-Control', 'no-store');
     response.end(JSON.stringify(musicFiles()));
     return;
    }
    const filePath = resolve('assets', rawPath);
    const assetsRoot = resolve('assets');
    if (!filePath.startsWith(assetsRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) return next();
    const mime: Record<string,string> = {'.glb':'model/gltf-binary','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.mp4':'video/mp4',...AUDIO_TYPES};
    if (!mime[extname(filePath).toLowerCase()]) return next();
    const type = mime[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    const stat = statSync(filePath);
    response.setHeader('Content-Type', type);
    response.setHeader('Accept-Ranges', 'bytes');
    const range = request.headers.range;
    if (range && (type.startsWith('video/') || type.startsWith('audio/'))) {
     const match = /bytes=(\d+)-(\d*)/.exec(range);
     if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      response.statusCode = 206;
      response.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      response.setHeader('Content-Length', String(end - start + 1));
      createReadStream(filePath, { start, end }).pipe(response);
      return;
     }
    }
    response.setHeader('Content-Length', String(stat.size));
    createReadStream(filePath).pipe(response);
   });
  },
  closeBundle() {
   // The client ships exactly the files in art-manifest.json (scripts/build-art-manifest.mjs); the studio build also
   // keeps the whole art folders so its browsers can show unshipped work.
   for (const file of ART_MANIFEST.files) {
    mkdirSync(dirname(resolve(OUT_DIR, file)), { recursive: true });
    cpSync(resolve(file), resolve(OUT_DIR, file));
   }
   if (!CLIENT) for (const folder of ['card_art', 'Icons', 'materials', 'board', 'HUDs']) cpSync(resolve('assets', folder), resolve(OUT_DIR, 'assets', folder), { recursive: true });
   const songs = musicFiles();
   mkdirSync(resolve(OUT_DIR, 'assets/music'), { recursive: true });
   for (const song of songs) cpSync(resolve(MUSIC_DIR, song), resolve(OUT_DIR, 'assets/music', song));
   writeFileSync(resolve(OUT_DIR, 'assets/music/playlist.json'), JSON.stringify(songs));
  },
 }, {
  name: 'local-authoring-content-api',
  async configureServer(server) {
   const { createContentApi } = await load<typeof import('./server/contentApi')>(server, '/server/contentApi.ts');
   const { createArtworkApi } = await load<typeof import('./server/artworkApi')>(server, '/server/artworkApi.ts');
   const { createDepthApi } = await load<typeof import('./server/depthApi')>(server, '/server/depthApi.ts');
   const { createGameLogApi } = await load<typeof import('./server/gameLogApi')>(server, '/server/gameLogApi.ts');
   const depth = createDepthApi();
   server.middlewares.use(createContentApi({
    loadModel: () => server.ssrLoadModule('/packages/engine/src/authoring/contentModel.ts'),
    onSaved: document => depth.enqueue(document),
   }));
   server.middlewares.use(createArtworkApi());
   server.middlewares.use(createGameLogApi());
   server.middlewares.use(depth.middleware);
  },
 }, {
  name: 'ai-agents',
  async configureServer(server) {
   // Vitest and scripts reuse this config; they must not boot agent versions or call the model.
   if (process.env.VITEST || process.env.OUROBOROS_AGENTS === 'off') return;
   const { createAgentSystem } = await load<typeof import('./server/agents')>(server, '/server/agents/index.ts');
   // Every dev-server start boots the next Strat-G version (if enabled in Settings > Agents); Eco-Strat resumes its journal.
   const env = loadEnv(server.config.mode, process.cwd(), '');
   const agents = createAgentSystem({ cwd: process.cwd(), env, loadModule: path => server.ssrLoadModule(path) });
   agents.start();
   for (const middleware of agents.middlewares) server.middlewares.use(middleware);
  },
 }],
 // The client follows depth updates through /api/depth/status; a file-watch reload would discard unsaved authoring edits.
 // Strat-G and Eco-Strat write their notebooks during play; reloading on those writes would end the game.
 server: {host:'127.0.0.1', port:5173, strictPort:true, watch:{ignored:['**/assets/card_art/depth/**', '**/ai-strategist/**', '**/ai-agents/**', '**/logs/**']}},
});
