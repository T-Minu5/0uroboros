import { relative, resolve, sep } from 'node:path';

export const PROTECTED_WRITE_PREFIXES = [
  '0uroboros_swarm_v2_0/',
  '0uroboros_swarm_v3_0/',
  '0uroboros_agent_docs_v0.1/',
  'src/swarm/',
  '.cursor/',
  'docs/',
  'AGENTS.md',
  'tools/agent-harness/runs/',
];

const DEFAULT_ALLOWED_COMMANDS = [
  /^npm run typecheck$/,
  /^npm test$/,
  /^npx vitest run(?: tests\/[\w./-]+)?$/,
  /^git status(?: --porcelain)?$/,
  /^git diff(?: -- [\w./-]+)*$/,
  /^node --test(?: [\w./-]+)*$/,
];

const DENIED_COMMAND_RE =
  /\b(deploy|publish|git push|git commit|git reset|git checkout|git stash|git rebase|rm -rf|sudo|chmod|chown|curl |wget |ssh |scp |docker |kubectl |npm publish|yarn publish|pnpm publish|obsidian|mcp)\b/i;

export function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

export function isProtectedWritePath(path: string): boolean {
  const normalized = normalizeRepoPath(path);
  if (normalized.includes('.obsidian') || normalized.includes('mcp-tools-istefox')) return true;
  return PROTECTED_WRITE_PREFIXES.some((prefix) => {
    if (prefix.endsWith('/')) return normalized === prefix.slice(0, -1) || normalized.startsWith(prefix);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
}

export function resolveScopedPath(root: string, relativePath: string): string | null {
  const normalized = normalizeRepoPath(relativePath);
  if (!normalized || normalized.includes('..')) return null;
  const absolute = resolve(root, normalized);
  const rel = relative(root, absolute);
  if (rel.startsWith('..') || rel.startsWith(`..${sep}`)) return null;
  return absolute;
}

export function writeScopeAllows(writeScope: string[], path: string): boolean {
  const normalized = normalizeRepoPath(path);
  return writeScope.map(normalizeRepoPath).includes(normalized);
}

export function readScopeAllows(readScope: string[], writeScope: string[], path: string): boolean {
  const normalized = normalizeRepoPath(path);
  return (
    readScope.map(normalizeRepoPath).includes(normalized) ||
    writeScope.map(normalizeRepoPath).includes(normalized)
  );
}

export function protectedWriteViolations(writeScope: string[]): string[] {
  return writeScope.filter(isProtectedWritePath);
}

export function isDeniedExecutionCommand(command: string): boolean {
  return DENIED_COMMAND_RE.test(command);
}

export function isPermittedExecutionCommand(
  command: string,
  extraAllowed: string[] = [],
): boolean {
  const trimmed = command.trim();
  if (!trimmed || isDeniedExecutionCommand(trimmed)) return false;
  if (extraAllowed.includes(trimmed)) return true;
  return DEFAULT_ALLOWED_COMMANDS.some((pattern) => pattern.test(trimmed));
}
