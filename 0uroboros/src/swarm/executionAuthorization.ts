import { createHash, randomUUID } from 'node:crypto';

import type { ExecutionAuthorization, WorkPackage } from './contracts';
import { ExecutionAuthorizationSchema } from './contracts';
import { GovernanceError } from './errors';

export interface AuthorizationBindInput {
  workPackage: WorkPackage;
  operation: string;
  read_scope: string[];
  write_scope: string[];
}

export function hashWorkPackageAuthorization(input: AuthorizationBindInput): string {
  const payload = {
    work_package_id: input.workPackage.id,
    objective: input.workPackage.objective,
    operation: input.operation,
    write_scope: [...input.write_scope].sort(),
    read_scope: [...input.read_scope].sort(),
    acceptance_criteria: input.workPackage.acceptance_criteria,
    canonical_ids: [
      ...input.workPackage.authorized_rule_ids,
      ...input.workPackage.authorized_tech_ids,
    ],
    files_or_domains_allowed: input.workPackage.files_or_domains_allowed,
    tests_required: input.workPackage.tests_required,
    authority_level: input.workPackage.authority_level,
    canonical_version: input.workPackage.canonical_version,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function implementationClassificationDoesNotAuthorizeExecution(): boolean {
  return true;
}

export function reviewerPassDoesNotAuthorizeExecution(): boolean {
  return true;
}

export function astraCannotAuthorizeExecution(): boolean {
  return true;
}

export function executorCannotAuthorizeExecution(): boolean {
  return true;
}

export function isHumanExecutionAuthorizer(authorizedBy: string): boolean {
  return /^human:/i.test(authorizedBy.trim());
}

export function createExecutionAuthorization(input: {
  workPackage: WorkPackage;
  authorized_by: string;
  authorized_at?: string;
  operation: string;
  read_scope: string[];
  write_scope: string[];
  permitted_commands: string[];
}): ExecutionAuthorization {
  const source = input.authorized_by.trim();
  if (!isHumanExecutionAuthorizer(source)) {
    throw new GovernanceError(
      'AUTHORIZATION_MISSING',
      'Execution authorization must be recorded by an explicit human source (human:...). Astra, Reviewer, and the executor cannot authorize execution.',
    );
  }
  const hash = hashWorkPackageAuthorization(input);
  return ExecutionAuthorizationSchema.parse({
    authorization_id: `auth-${randomUUID().slice(0, 8)}`,
    work_package_id: input.workPackage.id,
    work_package_hash: hash,
    authorized_by: source,
    authorized_at: input.authorized_at ?? new Date().toISOString(),
    operation: input.operation,
    execution_authorized: true,
    read_scope: unique(input.read_scope),
    write_scope: unique(input.write_scope),
    permitted_commands: unique(input.permitted_commands),
    canonical_version: input.workPackage.canonical_version,
    authorized_target_files: unique(input.write_scope),
  });
}

export function authorizationIsStale(
  authorization: ExecutionAuthorization | null | undefined,
  input: AuthorizationBindInput,
): boolean {
  if (!authorization) return true;
  if (authorization.work_package_id !== input.workPackage.id) return true;
  if (authorization.operation !== input.operation) return true;
  if (!sameSet(authorization.write_scope, input.write_scope)) return true;
  if (!sameSet(authorization.read_scope, input.read_scope)) return true;
  return authorization.work_package_hash !== hashWorkPackageAuthorization(input);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function sameSet(left: string[], right: string[]): boolean {
  const a = unique(left).sort().join('\0');
  const b = unique(right).sort().join('\0');
  return a === b;
}
