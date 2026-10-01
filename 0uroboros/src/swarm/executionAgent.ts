import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { run, type Tool } from '@openai/agents';
import { filesystem, localDir, Manifest, SandboxAgent, shell } from '@openai/agents/sandbox';
import { UnixLocalSandboxClient } from '@openai/agents/sandbox/local';

import { SPECIALIST_TOOL_NAMES } from './agents';
import { resolveModelForTask, type SwarmConfig } from './config';
import {
  ExecutionModelOutputSchema,
  ExecutionPacketSchema,
  type ExecutionAuthorization,
  type ExecutionModelOutput,
  type ExecutionPacket,
  type WorkPackage,
} from './contracts';
import {
  authorizationIsStale,
} from './executionAuthorization';
import { isPermittedExecutionCommand, normalizeRepoPath, resolveScopedPath, writeScopeAllows } from './executionPolicy';
import { extractUsageFromUnknown } from './diagnostics';
import { GovernanceError } from './errors';

export const EXECUTOR_AGENT_NAME = 'Implementation Executor';

/** Sandbox run options for the Implementation Executor. Omit cwd. The SDK treats "." as empty. */
export function executorSandboxOptions(
  client: UnixLocalSandboxClient,
  manifest: Manifest,
): { client: UnixLocalSandboxClient; manifest: Manifest } {
  return { client, manifest };
}

export const EXECUTION_OPENAI_GUIDANCE = [
  'Installed SDK: @openai/agents 0.17.0',
  'https://openai.github.io/openai-agents-js/guides/sandbox-agents/',
  'https://openai.github.io/openai-agents-js/guides/sandbox-agents/concepts/',
  'https://openai.github.io/openai-agents-js/guides/sandbox-agents/clients/',
  'https://developers.openai.com/api/docs/guides/agents/sandboxes',
  'Used: SandboxAgent, Manifest, localDir, filesystem(), shell(), UnixLocalSandboxClient, run({ sandbox }).',
  'Did not use Capabilities.default() because it adds compaction.',
  'SDK tool-approval HITL is not the authorization gate. Harness authorization is.',
];

export function boundedPacketStrings(values: string[], max: number): string[] {
  return [...new Set(values.filter(Boolean))].slice(0, max);
}

const ADVISORY_TOOL_NAMES = new Set<string>(Object.values(SPECIALIST_TOOL_NAMES));

export function createExecutionPacket(input: {
  workPackage: WorkPackage;
  authorization: ExecutionAuthorization;
  canonical_excerpts?: string[];
  harness_verified_evidence?: string[];
  constraints?: string[];
  execution_id?: string;
}): ExecutionPacket {
  if (
    authorizationIsStale(input.authorization, {
      workPackage: input.workPackage,
      operation: input.authorization.operation,
      read_scope: input.authorization.read_scope,
      write_scope: input.authorization.write_scope,
    })
  ) {
    throw new GovernanceError(
      'AUTHORIZATION_STALE',
      'Execution authorization does not match the current WorkPackage.',
    );
  }
  return ExecutionPacketSchema.parse({
    execution_id: input.execution_id ?? `exec-${randomUUID().slice(0, 8)}`,
    work_package_id: input.workPackage.id,
    objective: input.workPackage.objective,
    operation: input.authorization.operation,
    canonical_ids: boundedPacketStrings(
      [
        ...input.workPackage.authorized_rule_ids,
        ...input.workPackage.authorized_tech_ids,
      ],
      16,
    ),
    canonical_excerpts: boundedPacketStrings(input.canonical_excerpts ?? [], 8),
    harness_verified_evidence: boundedPacketStrings(
      input.harness_verified_evidence ?? [],
      8,
    ),
    read_scope: input.authorization.read_scope,
    write_scope: input.authorization.write_scope,
    acceptance_criteria: boundedPacketStrings(input.workPackage.acceptance_criteria, 12),
    permitted_commands: input.authorization.permitted_commands,
    constraints: [
      ...(input.constraints ?? []),
      'If the WorkPackage is insufficient, STOP. Do not improvise.',
      'Do not reformat, refactor, or fix unrelated code.',
      'Do not invoke Astra, specialists, or Reviewer.',
      'Do not modify canonical, governance, prompt, approval, or Obsidian files.',
    ],
    authorization: input.authorization,
  });
}

export function createImplementationExecutor(
  config: SwarmConfig,
  workspaceRoot: string,
  packet: ExecutionPacket,
) {
  return new SandboxAgent({
    name: EXECUTOR_AGENT_NAME,
    model: resolveModelForTask(config.models, 'execution'),
    instructions: executorInstructions(packet),
    tools: [],
    handoffs: [],
    outputType: ExecutionModelOutputSchema,
    defaultManifest: executionManifest(workspaceRoot),
    capabilities: [
      filesystem({
        configureTools: (tools) =>
          wrapExecutorTools(
            tools.filter((tool) => toolName(tool) === 'apply_patch'),
            packet,
          ),
      }),
      shell({
        configureTools: (tools) =>
          wrapExecutorTools(
            tools.filter((tool) => toolName(tool) === 'exec_command'),
            packet,
          ),
      }),
    ],
  });
}

export function executorHasAdvisoryTools(agent: {
  tools: ReadonlyArray<{ name?: string }>;
  handoffs: readonly unknown[];
}): boolean {
  if (agent.handoffs.length > 0) return true;
  return agent.tools.some((tool) => ADVISORY_TOOL_NAMES.has(String(tool.name ?? '')));
}

export async function invokeSandboxExecutor(input: {
  config: SwarmConfig;
  workspaceRoot: string;
  packet: ExecutionPacket;
  sessionBaseDir?: string;
}): Promise<{
  output: ExecutionModelOutput;
  sessionWorkspacePath: string | null;
  usage: {
    requests: number | null;
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
  } | null;
}> {
  const agent = createImplementationExecutor(input.config, input.workspaceRoot, input.packet);
  const sessionBaseDir = input.sessionBaseDir ?? join(dirname(input.workspaceRoot), 'sdk-session');
  mkdirSync(sessionBaseDir, { recursive: true });
  const client = new UnixLocalSandboxClient({
    workspaceBaseDir: sessionBaseDir,
  });
  const runResult = await run(agent, formatExecutionPrompt(input.workspaceRoot, input.packet), {
    maxTurns: 4,
    sandbox: executorSandboxOptions(
      client,
      agent.defaultManifest ?? executionManifest(input.workspaceRoot),
    ),
  });
  return {
    output: ExecutionModelOutputSchema.parse(runResult.finalOutput),
    sessionWorkspacePath: extractSessionWorkspacePath(runResult.state),
    usage:
      extractUsageFromUnknown(runResult.state) ??
      extractUsageFromUnknown(runResult.runContext) ??
      extractUsageFromUnknown(runResult.state.usage ?? runResult.runContext.usage),
  };
}

function executionManifest(workspaceRoot: string): Manifest {
  const entries: Record<string, ReturnType<typeof localDir>> = {};
  if (existsSync(join(workspaceRoot, 'src'))) {
    entries.src = localDir({ src: join(workspaceRoot, 'src') });
  }
  if (existsSync(join(workspaceRoot, 'tests'))) {
    entries.tests = localDir({ src: join(workspaceRoot, 'tests') });
  }
  if (Object.keys(entries).length === 0) {
    entries.workspace = localDir({ src: workspaceRoot });
  }
  return new Manifest({ entries });
}

function extractSessionWorkspacePath(state: { _sandbox?: unknown }): string | null {
  const sandbox = isRecord(state._sandbox) ? state._sandbox : null;
  if (!sandbox) return null;
  const session = isRecord(sandbox.sessionState) ? sandbox.sessionState : null;
  if (typeof session?.workspaceRootPath === 'string') return session.workspaceRootPath;
  const provider = isRecord(session?.providerState) ? session.providerState : null;
  if (typeof provider?.workspaceRootPath === 'string') return provider.workspaceRootPath;
  const sessions = isRecord(sandbox.sessionsByAgent) ? sandbox.sessionsByAgent : null;
  if (sessions) {
    for (const value of Object.values(sessions)) {
      if (!isRecord(value) || !isRecord(value.sessionState)) continue;
      const nested = value.sessionState;
      if (typeof nested.workspaceRootPath === 'string') return nested.workspaceRootPath;
      if (isRecord(nested.providerState) && typeof nested.providerState.workspaceRootPath === 'string') {
        return nested.providerState.workspaceRootPath;
      }
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function executorInstructions(packet: ExecutionPacket): string {
  return [
    'You are the Implementation Executor. You are a constrained implementation worker, not a designer.',
    'Implement only the authorized WorkPackage. Do not reinterpret upstream decisions.',
    'You may not create game rules, change canonical documents, invent mechanics, or change balance beyond the packet.',
    'You may not make Product, UX, LookDev, lore, or Worldbuilding decisions.',
    'You may not modify Obsidian, approve your own work, invoke Astra, invoke advisory specialists, or invoke Reviewer.',
    'You may not create another WorkPackage or silently fix unrelated problems.',
    'If the packet is insufficient, STOP and report the ambiguity. Do not improvise.',
    'If another file appears necessary, STOP and request scope expansion. Do not expand write_scope.',
    'Do not reformat unrelated code, rename unrelated variables, upgrade dependencies, fix nearby lint, rewrite comments, or update stale docs.',
    `Authorized operation: ${packet.operation}`,
    `Write scope: ${packet.write_scope.join(', ') || '(none)'}`,
    `Read scope: ${packet.read_scope.join(', ') || '(none)'}`,
    `Permitted commands: ${packet.permitted_commands.join(', ') || '(none)'}`,
  ].join('\n');
}

export function formatExecutionPrompt(workspaceRoot: string, packet: ExecutionPacket): string {
  const excerpts = packet.read_scope
    .concat(packet.write_scope)
    .filter((path, index, all) => all.indexOf(path) === index)
    .map((relativePath) => {
      const absolute = resolveScopedPath(workspaceRoot, relativePath);
      if (!absolute || !existsSync(absolute)) return `${relativePath}: (missing)`;
      const contents = packet.write_scope.includes(relativePath)
        ? readFileSync(absolute, 'utf8')
        : readFileSync(absolute, 'utf8').slice(0, 8000);
      return `${relativePath}:\n${contents}`;
    });
  return [
    `WorkPackage ${packet.work_package_id}`,
    `Objective: ${packet.objective}`,
    `Operation: ${packet.operation}`,
    `Canonical IDs: ${packet.canonical_ids.join(', ') || '(none)'}`,
    `Acceptance criteria:\n- ${packet.acceptance_criteria.join('\n- ')}`,
    `Canonical excerpts:\n${packet.canonical_excerpts.join('\n') || '(none)'}`,
    `Harness-verified evidence:\n${packet.harness_verified_evidence.join('\n') || '(none)'}`,
    `Constraints:\n- ${packet.constraints.join('\n- ')}`,
    `Authorization ${packet.authorization.authorization_id} by ${packet.authorization.authorized_by}`,
    'Sandbox file excerpts:',
    excerpts.join('\n\n'),
  ].join('\n\n');
}

export function wrapExecutorTools(tools: Tool[], packet: ExecutionPacket): Tool[] {
  return tools.map((tool) => {
    const name = toolName(tool);
    if (ADVISORY_TOOL_NAMES.has(name) || name === 'reviewer' || name === 'Astra') {
      throw new GovernanceError(
        'SCOPE_VIOLATION',
        `Executor must not receive advisory tool ${name}.`,
      );
    }
    if (!isFunctionTool(tool)) return tool;
    const original = tool.invoke.bind(tool);
    return {
      ...tool,
      invoke: async (runContext, input, details) => {
        if (name === 'exec_command') {
          const command = extractCommand(input);
          if (!isPermittedExecutionCommand(command, packet.permitted_commands)) {
            return `COMMAND_DENIED: ${command}`;
          }
        }
        if (name === 'apply_patch') {
          const unauthorized = extractPatchPaths(input).filter(
            (path) => !writeScopeAllows(packet.write_scope, stripSandboxPrefix(path)),
          );
          if (unauthorized.length > 0) {
            return `SCOPE_VIOLATION: ${unauthorized.join(', ')}`;
          }
        }
        return original(runContext, input, details);
      },
    };
  });
}

function toolName(tool: { name?: string }): string {
  return String(tool.name ?? '');
}

function isFunctionTool(
  tool: Tool,
): tool is Tool & { invoke: (runContext: unknown, input: string, details?: unknown) => Promise<unknown> } {
  return typeof (tool as { invoke?: unknown }).invoke === 'function';
}

function extractCommand(input: string): string {
  try {
    const parsed = JSON.parse(input) as { cmd?: string };
    return String(parsed.cmd ?? input);
  } catch {
    return input;
  }
}

function extractPatchPaths(input: string): string[] {
  const paths = new Set<string>();
  try {
    const parsed = JSON.parse(input) as {
      path?: string;
      patch?: string;
      operations?: Array<{ path?: string }>;
      operation?: { path?: string };
    };
    if (parsed.path) paths.add(parsed.path);
    if (parsed.operation?.path) paths.add(parsed.operation.path);
    for (const operation of parsed.operations ?? []) {
      if (operation.path) paths.add(operation.path);
    }
    if (parsed.patch) {
      for (const match of parsed.patch.matchAll(
        /\*\*\* (?:Add|Update|Delete) File: ([^\n]+)/g,
      )) {
        paths.add(match[1].trim());
      }
    }
  } catch {
    for (const match of input.matchAll(/\*\*\* (?:Add|Update|Delete) File: ([^\n]+)/g)) {
      paths.add(match[1].trim());
    }
  }
  return [...paths].map(normalizeRepoPath);
}

function stripSandboxPrefix(path: string): string {
  return normalizeRepoPath(path.replace(/^\/+/, '').replace(/^workspace\//, ''));
}
