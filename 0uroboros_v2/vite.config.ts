import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { createContentApi } from './server/contentApi';
import { createArtworkApi } from './server/artworkApi';
import { createDepthApi } from './server/depthApi';

// Reference animations, concept art and Blender sources are never production assets.
export default defineConfig({
 plugins: [react(), {
  name: 'first-party-production-assets',
  configureServer(server) {
   server.middlewares.use('/assets', (request, response, next) => {
    // `?url` / `?import` requests are Vite resolving a source import, not the browser fetching the file.
    if (/[?&](url|import)(&|=|$)/.test(request.url ?? '')) return next();
    const rawPath = decodeURIComponent((request.url ?? '').split('?')[0] ?? '').replace(/^\/+/, '');
    const filePath = resolve('assets', rawPath);
    const assetsRoot = resolve('assets');
    if (!filePath.startsWith(assetsRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) return next();
    const mime: Record<string,string> = {'.glb':'model/gltf-binary','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.mp4':'video/mp4'};
    if (!mime[extname(filePath).toLowerCase()]) return next();
    const type = mime[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    const stat = statSync(filePath);
    response.setHeader('Content-Type', type);
    response.setHeader('Accept-Ranges', 'bytes');
    const range = request.headers.range;
    if (range && type.startsWith('video/')) {
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
   for (const folder of ['card_art', 'Icons', 'materials', 'board']) cpSync(resolve('assets', folder), resolve('dist/assets', folder), { recursive: true });
   mkdirSync(resolve('dist/assets/models'), { recursive: true });
   cpSync(resolve('assets/models/ouroboros-board-v4.glb'), resolve('dist/assets/models/ouroboros-board-v4.glb'));
  },
 }, {
  name: 'local-authoring-content-api',
  configureServer(server) {
   const depth = createDepthApi();
   server.middlewares.use(createContentApi({
    loadModel: () => server.ssrLoadModule('/src/authoring/contentModel.ts'),
    onSaved: document => depth.enqueue(document),
   }));
   server.middlewares.use(createArtworkApi());
   server.middlewares.use(depth.middleware);
  },
 }],
 // The client follows depth updates through /api/depth/status; a file-watch reload would discard unsaved authoring edits.
 server: {host:'127.0.0.1', port:5173, strictPort:true, watch:{ignored:['**/assets/card_art/depth/**']}},
});
