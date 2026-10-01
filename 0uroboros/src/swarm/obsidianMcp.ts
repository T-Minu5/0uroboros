import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_OBSIDIAN_MCP_URL = 'http://127.0.0.1:27200/mcp';
export const OBSIDIAN_PLUGIN_DATA_RELATIVE =
  '0uroboros/.obsidian/plugins/mcp-tools-istefox/data.json';

export const WORLDBUILDING_OBSIDIAN_READ_TOOLS = [
  'get_server_info',
  'search_vault_smart',
  'search_vault_simple',
  'search_vault',
  'get_vault_file',
  'get_vault_files',
  'get_vault_file_partial',
  'list_vault_files',
  'list_tags',
  'get_files_by_tag',
  'get_note_property',
  'list_property_values',
  'get_outgoing_links',
  'get_backlinks',
  'get_note_outline',
  'get_vault_overview',
] as const;

export const OBSIDIAN_WRITE_TOOLS = [
  'update_active_file',
  'append_to_active_file',
  'patch_active_file',
  'delete_active_file',
  'create_vault_file',
  'create_vault_binary_file',
  'append_to_vault_file',
  'patch_vault_file',
  'delete_vault_file',
  'rename_vault_file',
  'rename_heading',
  'create_vault_directory',
  'delete_vault_directory',
  'set_note_property',
  'delete_note_property',
  'search_and_replace',
  'add_canvas_node',
  'connect_canvas_nodes',
  'execute_obsidian_command',
  'get_or_create_daily_note',
  'get_or_create_periodic_note',
  'append_to_periodic_note',
  'execute_template',
  'activate_tool',
  'activate_tools',
] as const;

export type WorldbuildingObsidianReadTool = (typeof WORLDBUILDING_OBSIDIAN_READ_TOOLS)[number];

export interface ObsidianServerInfo {
  status: string;
  version: string;
  vault_name: string;
  transport: string;
}

export interface VaultSearchMatch {
  context: string;
  line?: number;
}

export interface VaultSearchHit {
  path: string;
  matches: VaultSearchMatch[];
  score?: number;
}

export interface VaultOutgoingLink {
  to: string;
  relation: string;
}

export interface VaultNoteRecord {
  path: string;
  title: string;
  content: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  properties: Record<string, unknown>;
  outgoing_links: VaultOutgoingLink[];
  headings: string[];
}

export interface ObsidianVaultClient {
  getServerInfo(): Promise<ObsidianServerInfo>;
  searchSimple(query: string, limit?: number): Promise<VaultSearchHit[]>;
  searchSmart(query: string, limit?: number): Promise<VaultSearchHit[]>;
  readFile(path: string): Promise<VaultNoteRecord>;
  listTags(): Promise<string[]>;
  getOutgoingLinks(path: string): Promise<VaultOutgoingLink[]>;
}

export interface ObsidianMcpConfig {
  url: string;
  token: string;
  source: 'env' | 'plugin_data' | 'none';
}

export function worldbuildingHasNoObsidianWriteTools(): boolean {
  return WORLDBUILDING_OBSIDIAN_READ_TOOLS.every(
    (tool) => !(OBSIDIAN_WRITE_TOOLS as readonly string[]).includes(tool),
  );
}

export function worldbuildingCannotMutateVault(): boolean {
  return true;
}

export function assertWorldbuildingReadTool(name: string): asserts name is WorldbuildingObsidianReadTool {
  if (!(WORLDBUILDING_OBSIDIAN_READ_TOOLS as readonly string[]).includes(name)) {
    throw new Error(`Worldbuilding cannot call Obsidian tool ${name}. Read-only vault access only.`);
  }
}

export function discoverObsidianMcpConfig(
  cwd: string = process.cwd(),
  env: Record<string, string | undefined> = process.env,
): ObsidianMcpConfig {
  const url = env.OBSIDIAN_MCP_URL?.trim() || DEFAULT_OBSIDIAN_MCP_URL;
  const envToken = env.OBSIDIAN_MCP_TOKEN?.trim() ?? '';
  if (envToken) {
    return { url, token: envToken, source: 'env' };
  }
  const pluginPath = join(cwd, OBSIDIAN_PLUGIN_DATA_RELATIVE);
  if (!existsSync(pluginPath)) {
    return { url, token: '', source: 'none' };
  }
  try {
    const parsed = JSON.parse(readFileSync(pluginPath, 'utf8')) as {
      mcpTransport?: { livePort?: number; tokens?: Array<{ token?: string }>; bearerToken?: string };
    };
    const port = parsed.mcpTransport?.livePort;
    const discoveredUrl =
      env.OBSIDIAN_MCP_URL?.trim() ||
      (typeof port === 'number' ? `http://127.0.0.1:${port}/mcp` : url);
    const token =
      parsed.mcpTransport?.tokens?.[0]?.token?.trim() ||
      parsed.mcpTransport?.bearerToken?.trim() ||
      '';
    return { url: discoveredUrl, token, source: token ? 'plugin_data' : 'none' };
  } catch {
    return { url, token: '', source: 'none' };
  }
}

export function createHttpObsidianVaultClient(
  config: ObsidianMcpConfig,
  options: { vaultName?: string; timeoutMs?: number } = {},
): ObsidianVaultClient {
  const timeoutMs = options.timeoutMs ?? 20000;
  let requestId = 0;

  async function rpc(method: string, params: unknown): Promise<unknown> {
    if (!config.token) {
      throw new Error('Obsidian MCP token is not configured.');
    }
    requestId += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          method,
          params,
        }),
        signal: controller.signal,
      });
      const raw = await response.text();
      const payload = parseMcpBody(raw);
      if (!response.ok) {
        throw new Error(`Obsidian MCP HTTP ${response.status}`);
      }
      if (payload && typeof payload === 'object' && 'error' in payload) {
        throw new Error(`Obsidian MCP error: ${JSON.stringify((payload as { error: unknown }).error)}`);
      }
      return (payload as { result?: unknown }).result ?? payload;
    } finally {
      clearTimeout(timer);
    }
  }

  async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    assertWorldbuildingReadTool(name);
    const result = await rpc('tools/call', { name, arguments: args });
    return unwrapToolResult(result);
  }

  return {
    async getServerInfo() {
      await rpc('initialize', {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: '0uroboros-swarm-worldbuilding', version: '0.1.0' },
      });
      const info = asRecord(await callTool('get_server_info', {}));
      return {
        status: String(info.status ?? 'unknown'),
        version: String(info.version ?? ''),
        vault_name: options.vaultName ?? 'Obsidian - 0uroboros',
        transport: String(info.transport ?? 'streamable-http'),
      };
    },
    async searchSimple(query: string, limit = 8) {
      const body = asRecord(
        await callTool('search_vault_simple', {
          query,
          limit,
          contextLength: 220,
        }),
      );
      return normalizeSearchHits(body);
    },
    async searchSmart(query: string, limit = 8) {
      try {
        const body = asRecord(await callTool('search_vault_smart', { query, limit }));
        if (body.errorCode === 'index_building' || body.index_building) return [];
        return normalizeSearchHits(body);
      } catch {
        return [];
      }
    },
    async readFile(path: string) {
      const body = asRecord(await callTool('get_vault_file', { path, format: 'json' }));
      const content = String(body.content ?? body.text ?? '');
      const frontmatter = parseFrontmatter(content);
      const tags = [
        ...asStringArray(body.tags),
        ...asStringArray(frontmatter.tags),
        ...extractHashtags(content),
      ];
      return {
        path: String(body.path ?? path),
        title: titleFromPath(String(body.path ?? path)),
        content,
        frontmatter,
        tags: uniqueStrings(tags),
        properties: { ...frontmatter, ...(asRecord(body.frontmatter) ?? {}) },
        outgoing_links: [],
        headings: extractHeadings(content),
      };
    },
    async listTags() {
      const body = asRecord(await callTool('list_tags', { limit: 50 }));
      const tags = body.tags;
      if (!Array.isArray(tags)) return [];
      return uniqueStrings(
        tags.map((item) => (typeof item === 'string' ? item : String(asRecord(item).tag ?? ''))),
      );
    },
    async getOutgoingLinks(path: string) {
      const body = asRecord(
        await callTool('get_outgoing_links', {
          path,
          includeUnresolved: true,
          limit: 24,
        }),
      );
      return normalizeOutgoingLinks(body);
    },
  };
}

export function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result: Record<string, unknown> = {};
  let currentKey = '';
  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.trimEnd();
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      const value = keyMatch[2].trim();
      if (value === '' || value === '|' || value === '>') {
        result[currentKey] = [];
        continue;
      }
      result[currentKey] = parseScalar(value);
      continue;
    }
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && currentKey) {
      const existing = result[currentKey];
      const next = parseScalar(listItem[1]);
      result[currentKey] = Array.isArray(existing) ? [...existing, next] : [next];
    }
  }
  return result;
}

export function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  const pattern = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let match = pattern.exec(content);
  while (match) {
    links.push(match[1].trim());
    match = pattern.exec(content);
  }
  return uniqueStrings(links);
}

export function extractHashtags(content: string): string[] {
  return uniqueStrings(
    [...content.matchAll(/(?:^|\s)#([A-Za-z][\w/-]*)/g)].map((item) => item[1].toLowerCase()),
  );
}

export function extractHeadings(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim() ?? '')
    .filter(Boolean);
}

export function titleFromPath(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop()?.replace(/\.md$/i, '') ?? path;
}

function parseMcpBody(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  const data = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('');
  return data ? JSON.parse(data) : {};
}

function unwrapToolResult(result: unknown): unknown {
  const record = asRecord(result);
  if (record.structuredContent && typeof record.structuredContent === 'object') {
    return record.structuredContent;
  }
  const content = record.content;
  if (Array.isArray(content) && content[0] && typeof content[0] === 'object') {
    const text = String((content[0] as { text?: string }).text ?? '');
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    }
    return { text };
  }
  return result;
}

function normalizeSearchHits(body: Record<string, unknown>): VaultSearchHit[] {
  const rows = Array.isArray(body.results) ? body.results : Array.isArray(body.hits) ? body.hits : [];
  return rows.map((row) => {
    const item = asRecord(row);
    const path = String(item.filename ?? item.path ?? item.file ?? '');
    const matches = Array.isArray(item.matches)
      ? item.matches.map((match) => {
          const entry = asRecord(match);
          return {
            context: String(entry.context ?? entry.text ?? entry.excerpt ?? ''),
            line: typeof entry.line === 'number' ? entry.line : undefined,
          };
        })
      : item.excerpt || item.context
        ? [{ context: String(item.excerpt ?? item.context) }]
        : [];
    return {
      path,
      matches,
      score: typeof item.score === 'number' ? item.score : undefined,
    };
  }).filter((item) => item.path);
}

function normalizeOutgoingLinks(body: Record<string, unknown>): VaultOutgoingLink[] {
  const rows = Array.isArray(body.links) ? body.links : [];
  return rows.map((row) => {
    if (typeof row === 'string') {
      return { to: row, relation: 'wikilink' };
    }
    const item = asRecord(row);
    return {
      to: String(item.path ?? item.filename ?? item.target ?? item.to ?? item.display ?? ''),
      relation: String(item.relation ?? item.type ?? 'wikilink'),
    };
  }).filter((item) => item.to);
}

function parseScalar(value: string): unknown {
  const unquoted = value.replace(/^['"]|['"]$/g, '');
  if (unquoted === 'true') return true;
  if (unquoted === 'false') return false;
  if (/^-?\d+$/.test(unquoted)) return Number(unquoted);
  return unquoted;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}
