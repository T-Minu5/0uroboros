import { Manifest, localDir } from '@openai/agents/sandbox';
import { UnixLocalSandboxClient } from '@openai/agents/sandbox/local';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createPlanningTeam } from '../../src/swarm/agents';
import { BudgetTracker } from '../../src/swarm/budget';
import { BudgetExhaustedError, GovernanceError } from '../../src/swarm/errors';
import {
  boundedPacketStrings,
  createExecutionPacket,
  createImplementationExecutor,
  EXECUTOR_AGENT_NAME,
  executorHasAdvisoryTools,
  executorSandboxOptions,
} from '../../src/swarm/executionAgent';
import {
  astraCannotAuthorizeExecution,
  createExecutionAuthorization,
  executorCannotAuthorizeExecution,
  implementationClassificationDoesNotAuthorizeExecution,
  reviewerPassDoesNotAuthorizeExecution,
} from '../../src/swarm/executionAuthorization';
import { runExecutionHarness } from '../../src/swarm/executionHarness';
import { writeWorkspaceFile, targetFilesAreDirty } from '../../src/swarm/executionSandbox';
import { isPermittedExecutionCommand, readScopeAllows, resolveScopedPath, writeScopeAllows } from '../../src/swarm/executionPolicy';
import { runPlanningHarness } from '../../src/swarm/harness';
import { collectHarnessVerifiedEvidence, startingDeckCorrectionPackage } from '../../src/swarm/evidence';
import { emptyRuntime, tempCwd, testConfig, workPackage } from './fixtures';

function isolateGit(cwd: string) {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  return spawnSync('git', ['init'], { cwd, encoding: 'utf8', env });
}

function fixtureHost(): string {
  const host = mkdtempSync(join(tmpdir(), 'ouroboros-exec-host-'));
  mkdirSync(join(host, 'fixture-src'), { recursive: true });
  writeFileSync(join(host, 'fixture-src/value.txt'), 'old-value\n');
  writeFileSync(join(host, 'fixture-src/support.txt'), 'support-only\n');
  writeFileSync(
    join(host, 'fixture-src/fail.test.js'),
    "import { test } from 'node:test';\ntest('fails', () => { throw new Error('boom'); });\n",
  );
  return host;
}

function fixturePackage() {
  return workPackage({
    id: 'wp-exec-fixture',
    objective: 'Change the disposable fixture value.',
    owner_role: 'engineering',
    authorized_rule_ids: [],
    authorized_tech_ids: [],
    scope: ['fixture-src/value.txt'],
    files_or_domains_allowed: ['fixture-src/value.txt'],
    acceptance_criteria: [
      'fixture-src/value.txt contains authorized-value',
      'no unauthorized files changed',
    ],
    tests_required: [],
    authority_level: 'IMPLEMENTATION',
    approval_required: true,
  });
}

function humanAuth(pkg = fixturePackage(), extra: { read?: string[]; write?: string[]; commands?: string[] } = {}) {
  return createExecutionAuthorization({
    workPackage: pkg,
    authorized_by: 'human:mel',
    operation: 'replace fixture value',
    read_scope: extra.read ?? ['fixture-src/value.txt', 'fixture-src/support.txt'],
    write_scope: extra.write ?? ['fixture-src/value.txt'],
    permitted_commands: extra.commands ?? [],
  });
}

describe('sandboxed execution layer', () => {
  const config = testConfig();

  it('blocks execution when authorization is missing', async () => {
    const output = await runExecutionHarness({
      workPackage: fixturePackage(),
      operation: 'replace fixture value',
      read_scope: ['fixture-src/value.txt'],
      write_scope: ['fixture-src/value.txt'],
      permitted_commands: [],
      authorization: null,
      hostRoot: fixtureHost(),
      cwd: tempCwd(),
      config,
      skipModel: true,
    });
    expect(output.result.status).toBe('AUTHORIZATION_MISSING');
    expect(output.result.files_modified).toEqual([]);
  });

  it('blocks stale authorization after a WorkPackage change', async () => {
    const pkg = fixturePackage();
    const authorization = humanAuth(pkg);
    const output = await runExecutionHarness({
      workPackage: { ...pkg, objective: 'Changed after approval.' },
      operation: authorization.operation,
      read_scope: authorization.read_scope,
      write_scope: authorization.write_scope,
      permitted_commands: [],
      authorization,
      hostRoot: fixtureHost(),
      cwd: tempCwd(),
      config,
      skipModel: true,
      mutator: (root) => {
        writeWorkspaceFile(root, 'fixture-src/value.txt', 'authorized-value\n');
      },
    });
    expect(output.result.status).toBe('AUTHORIZATION_STALE');
    expect(output.result.files_modified).toEqual([]);
  });

  it('detects unauthorized file mutation from the actual diff', async () => {
    const pkg = fixturePackage();
    const authorization = humanAuth(pkg);
    const output = await runExecutionHarness({
      workPackage: pkg,
      operation: authorization.operation,
      read_scope: authorization.read_scope,
      write_scope: authorization.write_scope,
      permitted_commands: [],
      authorization,
      hostRoot: fixtureHost(),
      cwd: tempCwd(),
      config,
      skipModel: true,
      mutator: (root) => {
        writeWorkspaceFile(root, 'fixture-src/value.txt', 'authorized-value\n');
        writeWorkspaceFile(root, 'fixture-src/support.txt', 'cleaned up\n');
      },
    });
    expect(output.result.status).toBe('SCOPE_VIOLATION');
    expect(output.result.files_modified).toEqual(['fixture-src/support.txt', 'fixture-src/value.txt']);
    expect(output.result.scope_violations).toContain('fixture-src/support.txt');
  });

  it('does not treat read scope as write scope', async () => {
    const pkg = fixturePackage();
    const authorization = humanAuth(pkg);
    expect(readScopeAllows(authorization.read_scope, authorization.write_scope, 'fixture-src/support.txt')).toBe(
      true,
    );
    expect(writeScopeAllows(authorization.write_scope, 'fixture-src/support.txt')).toBe(false);
    const output = await runExecutionHarness({
      workPackage: pkg,
      operation: authorization.operation,
      read_scope: authorization.read_scope,
      write_scope: authorization.write_scope,
      permitted_commands: [],
      authorization,
      hostRoot: fixtureHost(),
      cwd: tempCwd(),
      config,
      skipModel: true,
      mutator: (root) => {
        writeWorkspaceFile(root, 'fixture-src/support.txt', 'should not write\n');
      },
    });
    expect(output.result.status).toBe('SCOPE_VIOLATION');
    expect(output.result.files_modified).toEqual(['fixture-src/support.txt']);
    expect(output.result.scope_violations).toEqual(['fixture-src/support.txt']);
  });

  it('stops on a dirty authorized target file', async () => {
    const host = fixtureHost();
    const inited = isolateGit(host);
    expect(inited.status).toBe(0);
    expect(targetFilesAreDirty(host, ['fixture-src/value.txt'])).toBe(true);
    const pkg = fixturePackage();
    const authorization = humanAuth(pkg);
    const output = await runExecutionHarness({
      workPackage: pkg,
      operation: authorization.operation,
      read_scope: authorization.read_scope,
      write_scope: authorization.write_scope,
      permitted_commands: [],
      authorization,
      hostRoot: host,
      cwd: tempCwd(),
      config,
      skipModel: true,
      mutator: (root) => {
        writeWorkspaceFile(root, 'fixture-src/value.txt', 'authorized-value\n');
      },
    });
    expect(output.result.status).toBe('WORKTREE_CONFLICT');
    expect(output.result.files_modified).toEqual([]);
  });

  it('records VALIDATION_FAILED from the actual command exit code', async () => {
    const pkg = fixturePackage();
    const authorization = humanAuth(pkg, {
      read: ['fixture-src/value.txt', 'fixture-src/support.txt', 'fixture-src/fail.test.js'],
      commands: ['node --test fixture-src/fail.test.js'],
    });
    const output = await runExecutionHarness({
      workPackage: pkg,
      operation: authorization.operation,
      read_scope: authorization.read_scope,
      write_scope: authorization.write_scope,
      permitted_commands: authorization.permitted_commands,
      authorization,
      hostRoot: fixtureHost(),
      cwd: tempCwd(),
      config,
      skipModel: true,
      mutator: (root) => {
        writeWorkspaceFile(root, 'fixture-src/value.txt', 'authorized-value\n');
      },
    });
    expect(output.result.status).toBe('VALIDATION_FAILED');
    expect(output.result.validation_results[0]?.exit_code).not.toBe(0);
    expect(output.result.files_modified).toEqual(['fixture-src/value.txt']);
  });

  it('returns SUCCESS for an authorized temp-fixture mutation', async () => {
    const pkg = fixturePackage();
    const authorization = humanAuth(pkg);
    const output = await runExecutionHarness({
      workPackage: pkg,
      operation: authorization.operation,
      read_scope: authorization.read_scope,
      write_scope: authorization.write_scope,
      permitted_commands: [],
      authorization,
      hostRoot: fixtureHost(),
      cwd: tempCwd(),
      config,
      skipModel: true,
      mutator: (root) => {
        writeWorkspaceFile(root, 'fixture-src/value.txt', 'authorized-value\n');
      },
    });
    expect(output.result.status).toBe('SUCCESS');
    expect(output.result.files_modified).toEqual(['fixture-src/value.txt']);
    expect(output.result.files_created).toEqual([]);
    expect(output.result.scope_violations).toEqual([]);
  });

  it('lets the harness diff override model claims', async () => {
    const pkg = fixturePackage();
    const authorization = humanAuth(pkg);
    const output = await runExecutionHarness({
      workPackage: pkg,
      operation: authorization.operation,
      read_scope: authorization.read_scope,
      write_scope: authorization.write_scope,
      permitted_commands: [],
      authorization,
      hostRoot: fixtureHost(),
      cwd: tempCwd(),
      config,
      skipModel: true,
      claimedOutput: {
        summary: 'I only changed cards.ts',
        claimed_files_modified: ['src/game/content/cards.ts'],
        unresolved_issues: [],
        warnings: [],
        confidence: 0.9,
      },
      mutator: (root) => {
        writeWorkspaceFile(root, 'fixture-src/value.txt', 'authorized-value\n');
      },
    });
    expect(output.result.status).toBe('SUCCESS');
    expect(output.result.claimed_files_modified).toEqual(['src/game/content/cards.ts']);
    expect(output.result.files_modified).toEqual(['fixture-src/value.txt']);
    expect(output.result.files_modified).not.toContain('src/game/content/cards.ts');
  });

  it('detects unrelated extra-file cleanup as a scope violation', async () => {
    const pkg = fixturePackage();
    const authorization = humanAuth(pkg);
    const output = await runExecutionHarness({
      workPackage: pkg,
      operation: authorization.operation,
      read_scope: authorization.read_scope,
      write_scope: authorization.write_scope,
      permitted_commands: [],
      authorization,
      hostRoot: fixtureHost(),
      cwd: tempCwd(),
      config,
      skipModel: true,
      mutator: (root) => {
        writeWorkspaceFile(root, 'fixture-src/value.txt', 'authorized-value\n');
        writeWorkspaceFile(root, 'fixture-src/README.md', 'drive-by docs\n');
      },
    });
    expect(output.result.status).toBe('SCOPE_VIOLATION');
    expect(output.result.files_created).toContain('fixture-src/README.md');
    expect(output.result.scope_violations).toContain('fixture-src/README.md');
  });

  it('protects canonical and governance paths in write scope', async () => {
    const pkg = fixturePackage();
    const write_scope = ['src/swarm/config.ts'];
    expect(() =>
      createExecutionAuthorization({
        workPackage: pkg,
        authorized_by: 'human:mel',
        operation: 'tamper governance',
        read_scope: write_scope,
        write_scope,
        permitted_commands: [],
      }),
    ).not.toThrow();
    const authorization = createExecutionAuthorization({
      workPackage: pkg,
      authorized_by: 'human:mel',
      operation: 'tamper governance',
      read_scope: write_scope,
      write_scope,
      permitted_commands: [],
    });
    const output = await runExecutionHarness({
      workPackage: pkg,
      operation: authorization.operation,
      read_scope: write_scope,
      write_scope,
      permitted_commands: [],
      authorization,
      hostRoot: fixtureHost(),
      cwd: tempCwd(),
      config,
      skipModel: true,
      mutator: (root) => {
        writeWorkspaceFile(root, 'src/swarm/config.ts', 'nope\n');
      },
    });
    expect(output.result.status).toBe('SCOPE_VIOLATION');
    expect(output.result.files_modified).toEqual([]);
  });

  it('cannot give the executor advisory specialist tools or handoffs', () => {
    const pkg = fixturePackage();
    const authorization = humanAuth(pkg);
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'ouroboros-exec-agent-'));
    const agent = createImplementationExecutor(
      config,
      workspaceRoot,
      {
        execution_id: 'exec-test',
        work_package_id: pkg.id,
        objective: pkg.objective,
        operation: authorization.operation,
        canonical_ids: [],
        canonical_excerpts: [],
        harness_verified_evidence: [],
        read_scope: authorization.read_scope,
        write_scope: authorization.write_scope,
        acceptance_criteria: pkg.acceptance_criteria,
        permitted_commands: [],
        constraints: [],
        authorization,
      },
    );
    expect(agent.name).toBe(EXECUTOR_AGENT_NAME);
    expect(agent.handoffs).toEqual([]);
    expect(agent.capabilities.map((item) => item.type).sort()).toEqual(['filesystem', 'shell']);
    expect(executorHasAdvisoryTools(agent)).toBe(false);
    const team = createPlanningTeam(config, emptyRuntime());
    expect(String(team.astra.instructions)).not.toMatch(/Implementation Executor/);
  });

  it('omits sandbox cwd so the SDK does not receive "."', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'ouroboros-exec-cwd-'));
    mkdirSync(join(workspaceRoot, 'src'), { recursive: true });
    const client = new UnixLocalSandboxClient({
      workspaceBaseDir: join(workspaceRoot, 'sdk-session'),
    });
    const manifest = new Manifest({
      entries: { src: localDir({ src: join(workspaceRoot, 'src') }) },
    });
    const sandbox = executorSandboxOptions(client, manifest);
    expect('cwd' in sandbox).toBe(false);
    expect(Object.keys(sandbox).sort()).toEqual(['client', 'manifest']);
    expect(sandbox.client).toBe(client);
    expect(sandbox.manifest).toBe(manifest);
  });

  it('keeps relative sandbox file operations inside the staged workspace', () => {
    const staged = mkdtempSync(join(tmpdir(), 'ouroboros-exec-stage-'));
    expect(resolveScopedPath(staged, '../host-secrets.txt')).toBeNull();
    expect(resolveScopedPath(staged, '..')).toBeNull();
    const inside = writeWorkspaceFile(staged, 'src/game/content/cards.ts', 'sandbox-only\n');
    expect(inside).toBe(join(staged, 'src/game/content/cards.ts'));
    expect(inside?.startsWith(staged)).toBe(true);
  });

  it('rejects Obsidian and push/deploy operations', async () => {
    expect(isPermittedExecutionCommand('git push origin HEAD')).toBe(false);
    expect(isPermittedExecutionCommand('npm publish')).toBe(false);
    expect(isPermittedExecutionCommand('git commit -am x')).toBe(false);
    const pkg = fixturePackage();
    const write_scope = ['.obsidian/workspace.json'];
    const authorization = createExecutionAuthorization({
      workPackage: pkg,
      authorized_by: 'human:mel',
      operation: 'edit vault',
      read_scope: write_scope,
      write_scope,
      permitted_commands: [],
    });
    const output = await runExecutionHarness({
      workPackage: pkg,
      operation: authorization.operation,
      read_scope: write_scope,
      write_scope,
      permitted_commands: [],
      authorization,
      hostRoot: fixtureHost(),
      cwd: tempCwd(),
      config,
      skipModel: true,
    });
    expect(output.result.status).toBe('SCOPE_VIOLATION');
  });

  it('enforces MAX_EXECUTION_CALLS=1 without consuming specialist budget', async () => {
    const pkg = fixturePackage();
    const authorization = humanAuth(pkg);
    const budget = new BudgetTracker({ ...config.budget, max_execution_calls: 1 });
    const first = await runExecutionHarness({
      workPackage: pkg,
      operation: authorization.operation,
      read_scope: authorization.read_scope,
      write_scope: authorization.write_scope,
      permitted_commands: [],
      authorization,
      hostRoot: fixtureHost(),
      cwd: tempCwd(),
      config,
      skipModel: true,
      budget,
      mutator: (root) => {
        writeWorkspaceFile(root, 'fixture-src/value.txt', 'authorized-value\n');
      },
    });
    expect(first.result.status).toBe('SUCCESS');
    expect(budget.executionCalls).toBe(1);
    expect(budget.specialistCalls).toBe(0);
    const second = await runExecutionHarness({
      workPackage: pkg,
      operation: authorization.operation,
      read_scope: authorization.read_scope,
      write_scope: authorization.write_scope,
      permitted_commands: [],
      authorization,
      hostRoot: fixtureHost(),
      cwd: tempCwd(),
      config,
      skipModel: true,
      budget,
      mutator: (root) => {
        writeWorkspaceFile(root, 'fixture-src/value.txt', 'authorized-value\n');
      },
    });
    expect(second.result.status).toBe('EXECUTOR_FAILURE');
    expect(second.result.unresolved_issues.join(' ')).toMatch(/MAX_EXECUTION_CALLS/);
    expect(() => budget.consumeAgentCall('execution')).toThrow(BudgetExhaustedError);
  });

  it('does not treat Reviewer PASS or Astra as execution authorization', () => {
    expect(reviewerPassDoesNotAuthorizeExecution()).toBe(true);
    expect(astraCannotAuthorizeExecution()).toBe(true);
    expect(executorCannotAuthorizeExecution()).toBe(true);
    expect(implementationClassificationDoesNotAuthorizeExecution()).toBe(true);
    expect(() =>
      createExecutionAuthorization({
        workPackage: fixturePackage(),
        authorized_by: 'reviewer',
        operation: 'replace fixture value',
        read_scope: ['fixture-src/value.txt'],
        write_scope: ['fixture-src/value.txt'],
        permitted_commands: [],
      }),
    ).toThrow(GovernanceError);
    expect(() =>
      createExecutionAuthorization({
        workPackage: fixturePackage(),
        authorized_by: 'Astra',
        operation: 'replace fixture value',
        read_scope: ['fixture-src/value.txt'],
        write_scope: ['fixture-src/value.txt'],
        permitted_commands: [],
      }),
    ).toThrow(/human/);
  });

  it('bounds ExecutionPacket lists so a 19-id starter WorkPackage still parses', () => {
    expect(boundedPacketStrings(Array.from({ length: 20 }, (_, index) => `id-${index}`), 16)).toHaveLength(
      16,
    );
    const pkg = startingDeckCorrectionPackage(
      'exec-bound',
      '2.0.0',
      collectHarnessVerifiedEvidence()[0]!,
    );
    expect(pkg.authorized_rule_ids.length).toBeGreaterThan(16);
    const authorization = createExecutionAuthorization({
      workPackage: pkg,
      authorized_by: 'human:mel',
      operation: 'starter implementation',
      read_scope: [...pkg.scope].slice(0, 16),
      write_scope: [...pkg.scope].slice(0, 16),
      permitted_commands: [],
    });
    const packet = createExecutionPacket({
      workPackage: pkg,
      authorization,
    });
    expect(packet.canonical_ids).toHaveLength(16);
    expect(packet.acceptance_criteria.length).toBeLessThanOrEqual(12);
  });

  it('does not execute WorkPackages during ordinary planning runs', async () => {
    const output = await runPlanningHarness({
      objective: 'Plan HUD',
      cwd: tempCwd(),
      config: testConfig({ OPENAI_API_KEY: '' }),
      skipModel: true,
    });
    expect(output.manifest.work_packages_executed).toEqual([]);
    expect(output.errors.some((item) => (item as { code?: string }).code === 'EXECUTION_DISABLED')).toBe(
      false,
    );
  });
});
