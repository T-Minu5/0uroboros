#!/usr/bin/env node
/**
 * Import-boundary lint for the publishing architecture.
 *
 *   packages/engine   pure rules: relative imports inside the package only; no react/three/node/browser modules.
 *   packages/protocol zod and engine types only.
 *   packages/server   the game server: node, ws, zod and the engine, protocol and content packages; never client UI or studio.
 *   src (client)      may import the engine, protocol and other client modules; never src/authoring, server, tools or node:* statically.
 *   src/authoring     studio code; may import anything (it is never shipped).
 *   server            studio-side dev middleware and agents; may import the engine; never src UI.
 *
 * Studio UI that the client hosts in dev (agents panels, dev game log) must be loaded through a dynamic import guarded
 * by STUDIO_TOOLS so `build:client` can drop it; static imports of those files from client code are rejected here.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

const root = resolve(process.cwd());
const rel = p => relative(root, p).split('\\').join('/');
const STUDIO_ONLY_CLIENT_FILES = new Set(['src/AgentsPanel.tsx', 'src/TestGamesPanel.tsx', 'src/AgentReader.tsx', 'src/AgentsPage.tsx', 'src/devGameLog.ts', 'src/agentsApi.ts']);
const STUDIO_ENTRY = new Set(['src/studio.tsx', 'src/agents.tsx']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
/** Static import/export-from specifiers only; dynamic `import()` is intentionally not matched. */
function staticImports(text) {
  const out = [];
  for (const m of text.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push(m[1]);
  return out;
}
const errors = [];
const fail = (file, spec, why) => errors.push(`${rel(file)}: import '${spec}' ${why}`);

// Engine purity
for (const file of walk(resolve(root, 'packages/engine/src'))) {
  for (const spec of staticImports(readFileSync(file, 'utf8'))) {
    if (spec.startsWith('.')) {
      const target = resolve(dirname(file), spec);
      const inside = target.startsWith(resolve(root, 'packages/engine/src'));
      const dataException = /assets\/card_art\/cards\.json$/.test(target);
      if (!inside && !dataException) fail(file, spec, 'leaves packages/engine');
    } else fail(file, spec, 'engine must not depend on external packages');
  }
}

// Protocol: zod and engine types only
for (const file of walk(resolve(root, 'packages/protocol/src'))) {
  for (const spec of staticImports(readFileSync(file, 'utf8'))) {
    const ok = spec === 'zod' || spec.startsWith('.') || spec.startsWith('@0uroboros/engine/');
    if (!ok) fail(file, spec, 'protocol may import only zod and engine types');
  }
}

// Game server: engine, protocol, content, node and ws; never the client UI or the studio
for (const file of walk(resolve(root, 'packages/server/src'))) {
  for (const spec of staticImports(readFileSync(file, 'utf8'))) {
    if (spec.startsWith('.')) {
      const target = rel(resolve(dirname(file), spec));
      if (!target.startsWith('packages/server/')) fail(file, spec, 'leaves packages/server (use @0uroboros/* packages)');
      continue;
    }
    const ok = spec.startsWith('node:') || spec === 'ws' || spec === 'zod' || /^@0uroboros\/(engine|protocol|content)\//.test(spec);
    if (!ok) fail(file, spec, 'game server may import only node, ws, zod and the engine, protocol and content packages');
  }
}

// Client and studio
for (const file of walk(resolve(root, 'src'))) {
  const r = rel(file);
  const isStudio = r.startsWith('src/authoring/') || STUDIO_ENTRY.has(r) || STUDIO_ONLY_CLIENT_FILES.has(r);
  for (const spec of staticImports(readFileSync(file, 'utf8'))) {
    if (spec.startsWith('node:')) fail(file, spec, 'browser code cannot use node modules');
    if (!spec.startsWith('.')) continue;
    const target = rel(resolve(dirname(file), spec));
    const targetTs = [target, `${target}.ts`, `${target}.tsx`].find(candidate => STUDIO_ONLY_CLIENT_FILES.has(candidate));
    if (target.startsWith('server/') || target.startsWith('tools/')) fail(file, spec, 'client must not import server or tools');
    if (isStudio) continue;
    if (target.startsWith('src/authoring/')) fail(file, spec, 'client must not import the Content Studio (src/authoring)');
    if (targetTs) fail(file, spec, 'studio-only UI must be loaded with a STUDIO_TOOLS-guarded dynamic import');
  }
}

// Server must not import client UI
for (const file of walk(resolve(root, 'server'))) {
  for (const spec of staticImports(readFileSync(file, 'utf8'))) {
    if (!spec.startsWith('.')) continue;
    const target = rel(resolve(dirname(file), spec));
    if (target.startsWith('src/') && !target.startsWith('src/contentPack/')) fail(file, spec, 'server must not import client UI (use @0uroboros/engine)');
  }
}

if (errors.length) { console.error(`Boundary violations (${errors.length}):\n  ${errors.join('\n  ')}`); process.exit(1); }
console.log('Import boundaries OK: engine is pure, client excludes studio code, server excludes UI.');
