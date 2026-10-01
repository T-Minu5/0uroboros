import { ZodError } from 'zod';

import type { ArtifactStore } from './artifacts';
import type {
  ContentAssignment,
  SpecialistFailureRecord,
  WorldbuildingAssignment,
} from './contracts';
import { SpecialistFailureRecordSchema } from './contracts';
import {
  extractUsageFromError,
  REDACTED_STRUCTURED_OUTPUT_MESSAGE,
} from './diagnostics';
import { BudgetExhaustedError, GovernanceError } from './errors';

export const CONTENT_SCHEMA_NAME = 'ContentModelOutputSchema';
export const WORLDBUILDING_SCHEMA_NAME = 'WorldbuildingResponseSchema';
export const SPECIALIST_SCHEMA_VERSION = '1';

const SECRET_RE = /sk-[A-Za-z0-9_-]+/g;

export function classifySpecialistError(error: unknown): SpecialistFailureRecord['error_class'] {
  if (error instanceof BudgetExhaustedError) return 'BUDGET_FAILURE';
  if (error instanceof GovernanceError) {
    if (error.code === 'CONCEPT_ID_MISMATCH') return 'CONCEPT_ID_MISMATCH';
    return 'HARNESS_VALIDATION_FAILURE';
  }
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  if (
    error instanceof ZodError ||
    name === 'ZodError' ||
    name === 'ModelBehaviorError' ||
    /did not match the expected schema|invalid output type|output type/i.test(message)
  ) {
    return 'MODEL_OUTPUT_SCHEMA_FAILURE';
  }
  if (error) return 'SPECIALIST_RUNTIME_FAILURE';
  return 'UNKNOWN_SPECIALIST_FAILURE';
}

export function redactSpecialistErrorMessage(error: unknown): {
  error_message: string;
  model_output_redacted: boolean;
} {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown specialist failure');
  const model_output_redacted = message === REDACTED_STRUCTURED_OUTPUT_MESSAGE;
  return {
    error_message: message.replace(SECRET_RE, '[redacted]').slice(0, 500),
    model_output_redacted,
  };
}

export function validationPathsFromError(error: unknown): string[] {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => issue.path.map(String).join('.')).filter(Boolean);
  }
  if (typeof error === 'object' && error !== null && 'issues' in error) {
    const issues = (error as { issues?: unknown }).issues;
    if (!Array.isArray(issues)) return [];
    return issues
      .map((issue) => {
        if (typeof issue !== 'object' || issue === null || !('path' in issue)) return '';
        const path = (issue as { path?: unknown }).path;
        return Array.isArray(path) ? path.map(String).join('.') : '';
      })
      .filter(Boolean);
  }
  return [];
}

export function buildSpecialistFailure(input: {
  specialist: SpecialistFailureRecord['specialist'];
  assignment_id: string;
  concept_id: string;
  model: string;
  error?: unknown;
  error_class?: SpecialistFailureRecord['error_class'];
  schema_name: string;
  fatal?: boolean;
}): SpecialistFailureRecord {
  const classified = input.error_class ?? classifySpecialistError(input.error);
  const redacted = redactSpecialistErrorMessage(input.error);
  return SpecialistFailureRecordSchema.parse({
    code: 'SPECIALIST_FAILURE',
    specialist: input.specialist,
    assignment_id: input.assignment_id,
    concept_id: input.concept_id,
    model: input.model,
    error_class: classified,
    schema_name: input.schema_name,
    schema_version: SPECIALIST_SCHEMA_VERSION,
    error_message: redacted.error_message,
    validation_paths: validationPathsFromError(input.error),
    usage: extractUsageFromError(input.error),
    model_output_redacted: redacted.model_output_redacted,
    fatal: input.fatal ?? classified !== 'CONCEPT_ID_MISMATCH',
  });
}

export function persistSpecialistFailure(
  store: ArtifactStore | undefined,
  failure: SpecialistFailureRecord,
): void {
  if (!store || !failure.fatal) return;
  const name =
    failure.specialist === 'content' ? 'content-failure.json' : 'worldbuilding-failure.json';
  store.writeJson(name, failure);
}

export function persistenceGapFailure(input: {
  specialist: 'content' | 'worldbuilding';
  assignment_id: string;
  concept_id: string;
  model: string;
  schema_name: string;
}): SpecialistFailureRecord {
  return buildSpecialistFailure({
    ...input,
    error_class: 'RESULT_PERSISTENCE_FAILURE',
    error: new Error(
      'A specialist call was consumed but no structured result or failure artifact was persisted.',
    ),
  });
}

export function closeOpenSpecialistInvocations(input: {
  contentAssignments: ContentAssignment[];
  worldbuildingAssignments: WorldbuildingAssignment[];
  contentResultCount: number;
  worldbuildingResultCount: number;
  existingFailures: SpecialistFailureRecord[];
  sharedConceptId: string;
  model: string;
}): SpecialistFailureRecord[] {
  const extra: SpecialistFailureRecord[] = [];
  const hasContentFailure = input.existingFailures.some((item) => item.specialist === 'content');
  const hasWorldFailure = input.existingFailures.some(
    (item) => item.specialist === 'worldbuilding',
  );
  if (input.contentAssignments.length > input.contentResultCount && !hasContentFailure) {
    extra.push(
      persistenceGapFailure({
        specialist: 'content',
        assignment_id: input.contentAssignments.at(-1)?.assignment_id ?? 'content-unrecorded',
        concept_id: input.sharedConceptId,
        model: input.model,
        schema_name: CONTENT_SCHEMA_NAME,
      }),
    );
  }
  if (input.worldbuildingAssignments.length > input.worldbuildingResultCount && !hasWorldFailure) {
    extra.push(
      persistenceGapFailure({
        specialist: 'worldbuilding',
        assignment_id:
          input.worldbuildingAssignments.at(-1)?.assignment_id ?? 'worldbuilding-unrecorded',
        concept_id: input.sharedConceptId,
        model: input.model,
        schema_name: WORLDBUILDING_SCHEMA_NAME,
      }),
    );
  }
  return extra;
}

export function diagnoseConsumedCallWithoutResult(input: {
  content_calls: number;
  content_results: unknown[];
  errors: unknown[];
  structured_output_failure: unknown;
}): SpecialistFailureRecord['error_class'] {
  if (input.content_calls <= 0) return 'UNKNOWN_SPECIALIST_FAILURE';
  if (input.content_results.length > 0) return 'UNKNOWN_SPECIALIST_FAILURE';
  if (input.structured_output_failure) return 'MODEL_OUTPUT_SCHEMA_FAILURE';
  if (input.errors.length > 0) return 'SPECIALIST_RUNTIME_FAILURE';
  return 'RESULT_PERSISTENCE_FAILURE';
}

export function specialistFailureToolPayload(failure: SpecialistFailureRecord): string {
  const owned =
    failure.specialist === 'content'
      ? 'Do not invent Power, effect, Draft cost, gameplay role, or mechanic provenance.'
      : 'Do not invent biography, faction, history, relationships, symbolic meaning, or lore identity.';
  return JSON.stringify({
    code: 'SPECIALIST_FAILURE',
    error_class: failure.error_class,
    assignment_id: failure.assignment_id,
    concept_id: failure.concept_id,
    message: `${failure.specialist} did not return a valid structured contribution. ${owned}`,
  });
}
