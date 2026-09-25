import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { createContentApi } from './server/contentApi';

// Reference animations, concept art and Blender sources are never production assets.
export default defineConfig({
 plugins: [react(), {
  name: 'first-party-production-assets',
  configureServer(server) {
   server.middlewares.use('/assets', (request, response, next) => {
    const rawPath = decodeURIComponent((request.url ?? '').split('?')[0] ?? '').replace(/^\/+/, '');
    const filePath = resolve('assets', rawPath);
    const assetsRoot = resolve('assets');
    if (!filePath.startsWith(assetsRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) return next();
    const mime: Record<string,string> = {'.glb':'model/gltf-binary','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
    if (!mime[extname(filePath).toLowerCase()]) return next();
    response.setHeader('Content-Type', mime[extname(filePath).toLowerCase()] ?? 'application/octet-stream');
    createReadStream(filePath).pipe(response);
   });
  },
  closeBundle() {
   for (const folder of ['card_art', 'Icons', 'materials']) cpSync(resolve('assets', folder), resolve('dist/assets', folder), { recursive: true });
   mkdirSync(resolve('dist/assets/models'), { recursive: true });
   cpSync(resolve('assets/models/ouroboros-board-v4.glb'), resolve('dist/assets/models/ouroboros-board-v4.glb'));
  },
 }, {
  name: 'local-authoring-content-api',
  configureServer(server) {
   server.middlewares.use(createContentApi({
    loadModel: () => server.ssrLoadModule('/src/authoring/contentModel.ts'),
   }));
  },
 }],
 server: {host:'127.0.0.1', port:5173, strictPort:true},
});
