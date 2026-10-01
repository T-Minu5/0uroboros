import { spawnSync } from 'node:child_process';

import type { ExecutionCommandResult } from './contracts';
import { isPermittedExecutionCommand } from './executionPolicy';

const OUTPUT_LIMIT = 8000;
const COMMAND_TIMEOUT_MS = 60_000;

export function boundOutput(value: string, limit = OUTPUT_LIMIT): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n…truncated…`;
}

export function runPermittedCommand(
  command: string,
  cwd: string,
  extraAllowed: string[] = [],
): ExecutionCommandResult {
  const permitted = isPermittedExecutionCommand(command, extraAllowed);
  if (!permitted) {
    return {
      command,
      exit_code: 126,
      stdout: '',
      stderr: `COMMAND_DENIED: ${command}`,
      duration_ms: 0,
      permitted: false,
    };
  }
  const started = Date.now();
  const result = spawnSync(command, {
    cwd,
    encoding: 'utf8',
    shell: true,
    timeout: COMMAND_TIMEOUT_MS,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      NODE_ENV: process.env.NODE_ENV,
    },
  });
  return {
    command,
    exit_code: result.status ?? 1,
    stdout: boundOutput(result.stdout ?? ''),
    stderr: boundOutput(result.stderr ?? String(result.error ?? '')),
    duration_ms: Date.now() - started,
    permitted: true,
  };
}
