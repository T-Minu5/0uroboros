import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  createArtifactStore,
  createRunId,
  type ArtifactStore,
} from './artifacts';
import { BudgetTracker } from './budget';
import { resolveSwarmConfig, type SwarmConfig } from './config';
import {
  ExecutionResultSchema,
  type ExecutionAuthorization,
  type ExecutionModelOutput,
  type ExecutionPacket,
  type ExecutionResult,
  type ExecutionStatus,
  type WorkPackage,
} from './contracts';
import { BudgetExhaustedError, GovernanceError } from './errors';
import { createExecutionPacket, invokeSandboxExecutor } from './executionAgent';
import {
  authorizationIsStale,
  isHumanExecutionAuthorizer,
} from './executionAuthorization';
import { inspectStartingDeckSource } from './executionAcceptance';
import { runPermittedCommand } from './executionCommands';
import {
  isProtectedWritePath,
  normalizeRepoPath,
  protectedWriteViolations,
  writeScopeAllows,
} from './executionPolicy';
import {
  diffSnapshots,
  overlayWorkspaceFiles,
  snapshotWorkspace,
  stageExecutionWorkspace,
  targetFilesAreDirty,
  type FileSnapshot,
} from './executionSandbox';

export type ExecutionMutator = (
  workspaceRoot: string,
  packet: ExecutionPacket,
) => void | Promise<void>;

export interface ExecutionHarnessInput {
  workPackage: WorkPackage;
  operation: string;
  read_scope: string[];
  write_scope: string[];
  permitted_commands: string[];
  authorization: ExecutionAuthorization | null;
  canonical_excerpts?: string[];
  harness_verified_evidence?: string[];
  constraints?: string[];
  hostRoot?: string;
  cwd?: string;
  config?: SwarmConfig;
  skipModel?: boolean;
  mutator?: ExecutionMutator;
  claimedOutput?: ExecutionModelOutput;
  budget?: BudgetTracker;
}

export interface ExecutionHarnessOutput {
  execution_id: string;
  result: ExecutionResult;
  packet: ExecutionPacket | null;
  artifactDir: string;
  workspaceRoot: string;
}

export async function runExecutionHarness(
  input: ExecutionHarnessInput,
): Promise<ExecutionHarnessOutput> {
  const started = new Date();
  const config = input.config ?? resolveSwarmConfig();
  const hostRoot = input.hostRoot ?? process.cwd();
  const runId = createRunId(started);
  const store = createArtifactStore(runId, input.cwd);
  const workspaceRoot = join(store.dir, 'sandbox-workspace');
  const execution_id = `exec-${runId}`;
  const budget = input.budget ?? new BudgetTracker(config.budget);
  const filesRead = unique([...input.read_scope, ...input.write_scope]).map(normalizeRepoPath);

  persistAttempt(store, input);

  const fail = (
    status: ExecutionStatus,
    extras: Partial<ExecutionResult> = {},
    packet: ExecutionPacket | null = null,
  ): ExecutionHarnessOutput => {
    const result = ExecutionResultSchema.parse({
      execution_id,
      work_package_id: input.workPackage.id,
      authorization_id: input.authorization?.authorization_id ?? '',
      status,
      files_read: filesRead,
      execution_model: config.models.execution,
      started_at: started.toISOString(),
      completed_at: new Date().toISOString(),
      ...extras,
    });
    persistResult(store, result, packet, extras.diff_summary ?? '');
    return { execution_id, result, packet, artifactDir: store.dir, workspaceRoot };
  };

  if (!input.authorization) {
    return fail('AUTHORIZATION_MISSING', {
      unresolved_issues: ['Execution requires an explicit harness authorization record.'],
    });
  }
  if (!input.authorization.execution_authorized || !isHumanExecutionAuthorizer(input.authorization.authorized_by)) {
    return fail('AUTHORIZATION_MISSING', {
      unresolved_issues: [
        'Reviewer PASS, Astra, IMPLEMENTATION classification, and the executor cannot authorize execution.',
      ],
    });
  }
  if (
    authorizationIsStale(input.authorization, {
      workPackage: input.workPackage,
      operation: input.operation,
      read_scope: input.read_scope,
      write_scope: input.write_scope,
    })
  ) {
    return fail('AUTHORIZATION_STALE', {
      unresolved_issues: ['Authorized WorkPackage hash no longer matches execution-relevant fields.'],
    });
  }

  const protectedWrites = protectedWriteViolations(input.write_scope);
  if (protectedWrites.length > 0) {
    return fail('SCOPE_VIOLATION', {
      scope_violations: protectedWrites.map((path) => `protected write path: ${path}`),
    });
  }
  if (input.write_scope.some((path) => isProtectedWritePath(path))) {
    return fail('SCOPE_VIOLATION', {
      scope_violations: input.write_scope.filter(isProtectedWritePath),
    });
  }
  if (targetFilesAreDirty(hostRoot, input.write_scope)) {
    return fail('WORKTREE_CONFLICT', {
      unresolved_issues: [
        'Authorized target files already contain uncommitted changes. The executor will not overwrite them.',
      ],
    });
  }
  if (!budget.canCallExecutor()) {
    return fail('EXECUTOR_FAILURE', {
      unresolved_issues: ['MAX_EXECUTION_CALLS already exhausted. No retry.'],
    });
  }

  let packet: ExecutionPacket;
  try {
    packet = createExecutionPacket({
      workPackage: input.workPackage,
      authorization: input.authorization,
      canonical_excerpts: input.canonical_excerpts,
      harness_verified_evidence: input.harness_verified_evidence,
      constraints: input.constraints,
      execution_id,
    });
    store.writeJson('execution-packet.json', packet);
  } catch (error) {
    const code = error instanceof GovernanceError ? error.code : 'EXECUTOR_FAILURE';
    const status: ExecutionStatus =
      code === 'AUTHORIZATION_STALE' || code === 'AUTHORIZATION_MISSING' ? code : 'EXECUTOR_FAILURE';
    return fail(status, {
      unresolved_issues: [error instanceof Error ? error.message : String(error)],
    });
  }

  try {
    budget.consumeAgentCall('execution');
  } catch (error) {
    const message = error instanceof BudgetExhaustedError ? error.budget : String(error);
    return fail('EXECUTOR_FAILURE', { unresolved_issues: [message] }, packet);
  }

  mkdirSync(workspaceRoot, { recursive: true });
  stageExecutionWorkspace({
    hostRoot,
    workspaceRoot,
    read_scope: packet.read_scope,
    write_scope: packet.write_scope,
  });
  const before = snapshotWorkspace(workspaceRoot);
  let claimed: ExecutionModelOutput | undefined = input.claimedOutput;
  const warnings: string[] = [];

  try {
    if (input.mutator) {
      await input.mutator(workspaceRoot, packet);
    } else if (!input.skipModel) {
      const live = await invokeSandboxExecutor({
        config,
        workspaceRoot,
        packet,
        sessionBaseDir: join(store.dir, 'sdk-session'),
      });
      claimed = live.output;
      if (live.sessionWorkspacePath) {
        const overlayRoot = existsSync(join(live.sessionWorkspacePath, 'src'))
          ? live.sessionWorkspacePath
          : existsSync(join(live.sessionWorkspacePath, 'workspace'))
            ? join(live.sessionWorkspacePath, 'workspace')
            : live.sessionWorkspacePath;
        overlayWorkspaceFiles(overlayRoot, workspaceRoot);
        warnings.push(`Synced SDK session workspace ${live.sessionWorkspacePath} into the staged sandbox.`);
      } else {
        warnings.push('SDK session workspace path was not exposed; harness diff uses the staged sandbox only.');
      }
      if (live.usage) {
        warnings.push(
          `usage requests=${live.usage.requests ?? 'n/a'} input=${live.usage.input_tokens ?? 'n/a'} output=${live.usage.output_tokens ?? 'n/a'} total=${live.usage.total_tokens ?? 'n/a'}`,
        );
      }
    }
  } catch (error) {
    store.writeJson('executor-failure.json', {
      message: error instanceof Error ? error.message : String(error),
    });
    return fail(
      'EXECUTOR_FAILURE',
      {
        unresolved_issues: [error instanceof Error ? error.message : String(error)],
        claimed_files_modified: claimed?.claimed_files_modified ?? [],
      },
      packet,
    );
  }

  const after = snapshotWorkspace(workspaceRoot);
  const diff = diffSnapshots(before, after);
  const mutated = [...diff.files_modified, ...diff.files_created, ...diff.files_deleted];
  const scope_violations = mutated.filter((path) => !writeScopeAllows(packet.write_scope, path));
  writeFileSync(join(store.dir, 'execution-diff.patch'), `${diff.patch}\n`, 'utf8');

  const commands_run = packet.permitted_commands.map((command) =>
    runPermittedCommand(command, workspaceRoot, packet.permitted_commands),
  );
  store.writeJson('execution-validation.json', commands_run);
  const validationFailed = commands_run.some((item) => !item.permitted || item.exit_code !== 0);
  const acceptance = evaluateAcceptance(packet, {
    before,
    after,
    scope_violations,
    validationFailed,
  });

  let status: ExecutionStatus = 'SUCCESS';
  if (input.skipModel && !input.mutator) status = 'INCOMPLETE';
  if (validationFailed) status = 'VALIDATION_FAILED';
  if (scope_violations.length > 0) status = 'SCOPE_VIOLATION';
  if (status === 'SUCCESS' && acceptance.failed) status = 'INCOMPLETE';

  if (claimed?.claimed_files_modified?.length) {
    warnings.push('Model claimed file changes are recorded but do not determine files_modified.');
  }

  return fail(
    status,
    {
      files_modified: diff.files_modified,
      files_created: diff.files_created,
      files_deleted: diff.files_deleted,
      commands_run,
      validation_results: commands_run,
      diff_summary: summarizeDiff(diff),
      acceptance_criteria_results: acceptance.results,
      scope_violations,
      unresolved_issues: [
        ...(claimed?.unresolved_issues ?? []),
        ...acceptance.unresolved,
      ],
      warnings: [...warnings, ...(claimed?.warnings ?? [])],
      claimed_files_modified: claimed?.claimed_files_modified ?? [],
    },
    packet,
  );
}

export function planningRunCannotExecuteWorkPackages(): true {
  return true;
}

function evaluateAcceptance(
  packet: ExecutionPacket,
  input: {
    before: FileSnapshot[];
    after: FileSnapshot[];
    scope_violations: string[];
    validationFailed: boolean;
  },
): { results: string[]; failed: boolean; unresolved: string[] } {
  const afterMap = new Map(input.after.map((item) => [item.path, item.contents]));
  const beforeMap = new Map(input.before.map((item) => [item.path, item.contents]));
  const results: string[] = [];
  const unresolved: string[] = [];
  let failed = false;
  const cardsAfter = afterMap.get('src/game/content/cards.ts');
  const cardsBefore = beforeMap.get('src/game/content/cards.ts');
  if (cardsAfter && cardsBefore) {
    const beforeDeck = inspectStartingDeckSource(cardsBefore);
    const afterDeck = inspectStartingDeckSource(cardsAfter);
    const invented = (afterDeck?.definition_ids ?? []).filter(
      (id) => !(beforeDeck?.definition_ids ?? []).includes(id),
    );
    if (invented.length > 0 && packet.constraints.some((item) => /do not invent/i.test(item))) {
      results.push(`FAIL: invented card definitions ${invented.join(', ')}`);
      unresolved.push(`Executor invented card definitions: ${invented.join(', ')}.`);
      failed = true;
    }
  }
  for (const criterion of packet.acceptance_criteria) {
    const contains = criterion.match(/^(.+?)\s+contains\s+(.+)$/i);
    if (criterion.toLowerCase().includes('no unauthorized files')) {
      const ok = input.scope_violations.length === 0;
      results.push(`${ok ? 'PASS' : 'FAIL'}: ${criterion}`);
      if (!ok) failed = true;
      continue;
    }
    if (/5 Character.*3 Crypto.*2 VP/i.test(criterion) || /RULE-DECK-001/i.test(criterion)) {
      const inspection = cardsAfter ? inspectStartingDeckSource(cardsAfter) : null;
      const ok = Boolean(inspection?.matches_rule_deck_001);
      results.push(`${ok ? 'PASS' : 'FAIL'}: ${criterion}`);
      if (!ok) failed = true;
      continue;
    }
    if (/HIST-DECK-4-4-2/i.test(criterion)) {
      const treatsHistoricalAsCurrent = /HIST-DECK-4-4-2/.test(cardsAfter ?? '') && /current authority/i.test(cardsAfter ?? '');
      const ok = !treatsHistoricalAsCurrent;
      results.push(`${ok ? 'PASS' : 'FAIL'}: ${criterion}`);
      if (!ok) failed = true;
      continue;
    }
    if (contains) {
      const path = normalizeRepoPath(contains[1]);
      const needle = contains[2];
      const contents = afterMap.get(path) ?? '';
      const ok = contents.includes(needle);
      results.push(`${ok ? 'PASS' : 'FAIL'}: ${criterion}`);
      if (!ok) failed = true;
      continue;
    }
    if (criterion.toLowerCase().includes('validation') || criterion.toLowerCase().includes('tests pass')) {
      const ok = !input.validationFailed;
      results.push(`${ok ? 'PASS' : 'FAIL'}: ${criterion}`);
      if (!ok) failed = true;
      continue;
    }
    results.push(`UNCHECKED: ${criterion}`);
    unresolved.push(`Acceptance criterion is not machine-checkable: ${criterion}`);
  }
  return { results, failed, unresolved };
}

function summarizeDiff(diff: {
  files_modified: string[];
  files_created: string[];
  files_deleted: string[];
}): string {
  return [
    `modified=${diff.files_modified.join(',') || '(none)'}`,
    `created=${diff.files_created.join(',') || '(none)'}`,
    `deleted=${diff.files_deleted.join(',') || '(none)'}`,
  ].join('; ');
}

function persistAttempt(store: ArtifactStore, input: ExecutionHarnessInput): void {
  store.writeJson('execution-authorization.json', input.authorization);
}

function persistResult(
  store: ArtifactStore,
  result: ExecutionResult,
  packet: ExecutionPacket | null,
  diff: string,
): void {
  if (packet) store.writeJson('execution-packet.json', packet);
  store.writeJson('execution-result.json', result);
  if (diff) writeFileSync(join(store.dir, 'execution-diff.patch'), `${diff}\n`, 'utf8');
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

