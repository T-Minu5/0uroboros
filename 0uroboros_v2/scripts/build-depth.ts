// Generates WebP colour + depth pairs for every piece of card art in the project.
//   node scripts/build-depth.ts           bring everything up to date (incremental)
//   node scripts/build-depth.ts --force   regenerate everything
//   node scripts/build-depth.ts --check   exit 1 if any card art lacks a current pair
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DepthWorker, allArtUrls, artFile, depthPaths, fileBytes, isCurrent, loadManifest, processArt, pruneDepthFiles, saveManifest, sha256 } from '../server/depthPipeline.ts';

const args = new Set(process.argv.slice(2));
const paths = depthPaths(resolve(import.meta.dirname, '..'));
const urls = await allArtUrls(paths);
const manifest = await loadManifest(paths);

if (args.has('--check')) {
  const stale: string[] = [];
  for (const url of urls) if (!isCurrent(paths, manifest.entries[url], await sha256(artFile(paths, url)!))) stale.push(url);
  if (stale.length) {
    console.error(`Depth assets missing or stale for ${stale.length} of ${urls.length} card images. Run npm run depth:build.`);
    for (const url of stale) console.error(`  ${url}`);
    process.exit(1);
  }
  console.log(`Depth assets current for all ${urls.length} card images.`);
  process.exit(0);
}

const worker = new DepthWorker(paths, line => console.error(`  [worker] ${line}`));
const counts = { generated: 0, reused: 0, skipped: 0, failed: 0 };
const started = Date.now();
try {
  for (const [index, url] of urls.entries()) {
    const label = `[${String(index + 1).padStart(3)}/${urls.length}] ${url}`;
    try {
      const outcome = await processArt(paths, worker, manifest, url, args.has('--force'));
      counts[outcome]++;
      if (outcome === 'generated') await saveManifest(paths, manifest);
      console.log(`${label}  ${outcome}`);
    } catch (error) {
      counts.failed++;
      console.error(`${label}  FAILED: ${error instanceof Error ? error.message : error}`);
    }
  }
} finally { worker.stop(); }

for (const url of Object.keys(manifest.entries)) if (!urls.includes(url)) delete manifest.entries[url];
await saveManifest(paths, manifest);
const pruned = await pruneDepthFiles(paths, manifest);

let source = 0, webp = 0;
const counted = new Set<string>();
for (const url of urls) {
  source += await fileBytes(artFile(paths, url)!);
  const entry = manifest.entries[url];
  if (!entry || counted.has(entry.sha)) continue;
  counted.add(entry.sha);
  for (const asset of [entry.color, entry.depth]) {
    const file = resolve(paths.assets, asset.slice('/assets/'.length));
    if (existsSync(file)) webp += await fileBytes(file);
  }
}
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
console.log(`\nCard images: ${urls.length}  generated ${counts.generated}, reused ${counts.reused}, skipped ${counts.skipped}, failed ${counts.failed}, pruned ${pruned} old files`);
console.log(`Source art ${mb(source)}  ->  WebP colour + depth ${mb(webp)} (${counted.size} unique images) in ${((Date.now() - started) / 1000).toFixed(0)}s`);
if (counts.failed) process.exit(1);
