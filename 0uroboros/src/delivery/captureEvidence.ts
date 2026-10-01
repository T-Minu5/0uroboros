/**
 * Capture current local demo frames for quality evidence.
 * LookDev confidence stays low without runtime captures.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export function evidenceDir(root: string): string {
  return join(root, 'tools/agent-harness/delivery/evidence');
}

export async function ensureDevServer(root: string, port = 5176): Promise<string> {
  const url = `http://127.0.0.1:${port}/?look=1`;
  if (await reachable(url)) return url;
  spawn(
    process.execPath,
    [
      join(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: root,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PATH: process.env.PATH },
    },
  ).unref();
  for (let i = 0; i < 40; i += 1) {
    await sleep(500);
    if (await reachable(url)) return url;
  }
  throw new Error(`Dev server did not become ready at ${url}`);
}

export async function captureDeliveryEvidence(root: string): Promise<{
  url: string;
  files: string[];
  note: string;
}> {
  const url = await ensureDevServer(root);
  const dir = evidenceDir(root);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const idlePath = join(dir, `board-idle-${stamp}.png`);
  await runCapture(root, url, idlePath);
  const files = [idlePath].filter((path) => existsSync(path));
  writeFileSync(
    join(dir, 'latest.json'),
    `${JSON.stringify({ at: new Date().toISOString(), url, files }, null, 2)}\n`,
  );
  return {
    url,
    files,
    note: `Captured ${files.length} runtime frame(s) from ${url}`,
  };
}

async function runCapture(root: string, url: string, outPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'npx',
      ['playwright', 'screenshot', '--viewport-size=1440,900', '--wait-for-timeout=4200', url, outPath],
      {
        cwd: root,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let err = '';
    child.stderr.on('data', (chunk) => {
      err += String(chunk);
    });
    child.on('exit', (code) => {
      if (code === 0 && existsSync(outPath)) resolve();
      else reject(new Error(err || `playwright screenshot exit ${code}`));
    });
  });
}

async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok || response.status === 304;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
