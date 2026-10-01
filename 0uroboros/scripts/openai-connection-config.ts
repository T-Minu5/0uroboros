/**
 * Local OpenAI connection config for the Phase 0 smoke test.
 * Loads `.env` if present. Never logs the API key.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Current official Agents SDK default and cost-sensitive GPT-5.6 text model. */
export const DEFAULT_TEST_MODEL = 'gpt-5.6-luna';

export const MISSING_KEY_MESSAGE = `OPENAI_API_KEY is not configured.

Create your local .env file from .env.example and add your OpenAI project API key.

The key should never be committed to Git.`;

export type ConnectionConfig =
  | {
      ok: true;
      apiKey: string;
      model: string;
      usedDefaultModel: boolean;
    }
  | {
      ok: false;
      kind: 'missing_key';
      message: string;
    };

export function loadLocalEnv(cwd: string = process.cwd()): {
  envPath: string;
  found: boolean;
  names: string[];
} {
  const envPath = resolve(cwd, '.env');
  if (!existsSync(envPath)) {
    return { envPath, found: false, names: [] };
  }
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  }

  const names: string[] = [];
  const text = readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const trimmed = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!name) continue;
    names.push(name);
    if (!process.env[name]) {
      process.env[name] = value;
    }
  }
  return { envPath, found: true, names };
}

export function resolveConnectionConfig(
  env: Record<string, string | undefined> = process.env,
): ConnectionConfig {
  const apiKey = env.OPENAI_API_KEY?.trim() ?? '';
  if (!apiKey) {
    return { ok: false, kind: 'missing_key', message: MISSING_KEY_MESSAGE };
  }

  const configured = env.OPENAI_TEST_MODEL?.trim() ?? '';
  return {
    ok: true,
    apiKey,
    model: configured || DEFAULT_TEST_MODEL,
    usedDefaultModel: configured.length === 0,
  };
}
