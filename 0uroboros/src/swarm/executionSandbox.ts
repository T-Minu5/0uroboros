import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { normalizeRepoPath, resolveScopedPath } from './executionPolicy';

export interface FileSnapshot {
  path: string;
  hash: string;
  contents: string;
}

export function stageExecutionWorkspace(input: {
  hostRoot: string;
  workspaceRoot: string;
  read_scope: string[];
  write_scope: string[];
}): string[] {
  if (existsSync(input.workspaceRoot)) {
    rmSync(input.workspaceRoot, { recursive: true, force: true });
  }
  mkdirSync(input.workspaceRoot, { recursive: true });
  const staged: string[] = [];
  for (const relativePath of unique([...input.read_scope, ...input.write_scope])) {
    const source = resolveScopedPath(input.hostRoot, relativePath);
    if (!source || !existsSync(source)) continue;
    const dest = join(input.workspaceRoot, normalizeRepoPath(relativePath));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(source, dest);
    staged.push(normalizeRepoPath(relativePath));
  }
  return staged;
}

export function overlayWorkspaceFiles(sourceRoot: string, destinationRoot: string): string[] {
  if (!existsSync(sourceRoot)) return [];
  const copied: string[] = [];
  for (const absolute of listFiles(sourceRoot)) {
    const relativePath = normalizeRepoPath(relative(sourceRoot, absolute));
    const dest = resolveScopedPath(destinationRoot, relativePath);
    if (!dest) continue;
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(absolute, dest);
    copied.push(relativePath);
  }
  return copied;
}

export function snapshotWorkspace(root: string): FileSnapshot[] {
  return listFiles(root).map((absolute) => {
    const path = normalizeRepoPath(relative(root, absolute));
    const contents = readFileSync(absolute, 'utf8');
    return {
      path,
      contents,
      hash: createHash('sha256').update(contents).digest('hex'),
    };
  });
}

export function diffSnapshots(
  before: FileSnapshot[],
  after: FileSnapshot[],
): {
  files_modified: string[];
  files_created: string[];
  files_deleted: string[];
  patch: string;
} {
  const beforeMap = new Map(before.map((item) => [item.path, item]));
  const afterMap = new Map(after.map((item) => [item.path, item]));
  const files_created: string[] = [];
  const files_modified: string[] = [];
  const files_deleted: string[] = [];
  const chunks: string[] = [];
  for (const [path, current] of afterMap) {
    const previous = beforeMap.get(path);
    if (!previous) {
      files_created.push(path);
      chunks.push(unifiedDiff(path, '', current.contents));
      continue;
    }
    if (previous.hash !== current.hash) {
      files_modified.push(path);
      chunks.push(unifiedDiff(path, previous.contents, current.contents));
    }
  }
  for (const [path, previous] of beforeMap) {
    if (!afterMap.has(path)) {
      files_deleted.push(path);
      chunks.push(unifiedDiff(path, previous.contents, ''));
    }
  }
  return {
    files_modified: files_modified.sort(),
    files_created: files_created.sort(),
    files_deleted: files_deleted.sort(),
    patch: chunks.join('\n'),
  };
}

export function targetFilesAreDirty(repoRoot: string, files: string[]): boolean {
  if (files.length === 0) return false;
  const wanted = new Set(files.map(normalizeRepoPath));
  const result = spawnSync(
    'git',
    ['-C', repoRoot, 'status', '--porcelain', '--untracked-files=all'],
    { encoding: 'utf8', env: gitEnv(repoRoot) },
  );
  if (result.status !== 0) return false;
  return result.stdout
    .split('\n')
    .map((line) => porcelainPath(line))
    .some((path) => path !== null && wanted.has(normalizeRepoPath(path)));
}

function gitEnv(repoRoot: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  env.GIT_DIR = join(repoRoot, '.git');
  env.GIT_WORK_TREE = repoRoot;
  return env;
}

function porcelainPath(line: string): string | null {
  if (line.length < 4) return null;
  const body = line.slice(3).trim();
  if (!body) return null;
  const renamed = body.split(' -> ');
  return renamed[renamed.length - 1]?.replace(/^"|"$/g, '') ?? null;
}

export function writeWorkspaceFile(root: string, relativePath: string, contents: string): string | null {
  const dest = resolveScopedPath(root, relativePath);
  if (!dest) return null;
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, contents, 'utf8');
  return dest;
}

export function readWorkspaceFile(root: string, relativePath: string): string | null {
  const dest = resolveScopedPath(root, relativePath);
  if (!dest || !existsSync(dest)) return null;
  return readFileSync(dest, 'utf8');
}

function listFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const absolute = join(dir, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        walk(absolute);
        continue;
      }
      found.push(absolute);
    }
  };
  walk(root);
  return found;
}

function unifiedDiff(path: string, before: string, after: string): string {
  return [`--- a/${path}`, `+++ b/${path}`, `@@`, `- ${before}`, `+ ${after}`].join('\n');
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}
