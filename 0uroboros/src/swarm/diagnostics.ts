export const REDACTED_STRUCTURED_OUTPUT_MESSAGE =
  'Invalid output type: final assistant output did not match the expected schema.';

export interface StructuredOutputFailure {
  agent: string;
  model: string;
  schema: string;
  error_type: string;
  error_message: string;
  redacted_by_sdk: boolean;
  validation_paths: string[];
  usage: {
    requests: number | null;
    input_tokens: number | null;
    output_tokens: number | null;
    total_tokens: number | null;
  } | null;
  last_response_id: string | null;
  output_item_kinds: string[];
  final_output_kind: 'object' | 'string' | 'undefined' | 'other';
  final_output_bytes: number | null;
  run_id: string;
  trace_note: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function extractUsageFromUnknown(source: unknown): {
  requests: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
} | null {
  if (!isRecord(source)) return null;
  const usage = isRecord(source.usage) ? source.usage : source;
  const requests = typeof usage.requests === 'number' ? usage.requests : null;
  const input =
    typeof usage.inputTokens === 'number'
      ? usage.inputTokens
      : typeof usage.input_tokens === 'number'
        ? usage.input_tokens
        : null;
  const output =
    typeof usage.outputTokens === 'number'
      ? usage.outputTokens
      : typeof usage.output_tokens === 'number'
        ? usage.output_tokens
        : null;
  const total =
    typeof usage.totalTokens === 'number'
      ? usage.totalTokens
      : typeof usage.total_tokens === 'number'
        ? usage.total_tokens
        : null;
  if (requests === null && input === null && output === null && total === null) {
    return null;
  }
  return { requests, input_tokens: input, output_tokens: output, total_tokens: total };
}

export function extractUsageFromError(error: unknown): ReturnType<typeof extractUsageFromUnknown> {
  if (!isRecord(error)) return null;
  const state = error.state;
  if (!isRecord(state)) return null;
  return extractUsageFromUnknown(state) ?? extractUsageFromUnknown(state._context);
}

function collectValidationPaths(error: unknown): string[] {
  if (!isRecord(error)) return [];
  const issues = error.issues;
  if (!Array.isArray(issues)) return [];
  return issues
    .map((issue) => {
      if (!isRecord(issue) || !Array.isArray(issue.path)) return '';
      return issue.path.map(String).join('.');
    })
    .filter(Boolean);
}

function inspectFinalOutput(value: unknown): {
  kind: StructuredOutputFailure['final_output_kind'];
  bytes: number | null;
} {
  if (value === undefined) return { kind: 'undefined', bytes: null };
  if (typeof value === 'string') {
    return { kind: 'string', bytes: Buffer.byteLength(value, 'utf8') };
  }
  if (typeof value === 'object' && value !== null) {
    return { kind: 'object', bytes: Buffer.byteLength(JSON.stringify(value), 'utf8') };
  }
  return { kind: 'other', bytes: null };
}

export function describeStructuredOutputFailure(input: {
  error: unknown;
  agent: string;
  model: string;
  schema: string;
  runId: string;
  finalOutput?: unknown;
}): StructuredOutputFailure {
  const error = input.error;
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : 'Error';
  const state = isRecord(error) && isRecord(error.state) ? error.state : null;
  const output = inspectFinalOutput(input.finalOutput);
  const itemKinds: string[] = [];
  if (state && Array.isArray(state._generatedItems)) {
    for (const item of state._generatedItems) {
      if (isRecord(item) && typeof item.type === 'string') itemKinds.push(item.type);
    }
  }

  return {
    agent: input.agent,
    model: input.model,
    schema: input.schema,
    error_type: name,
    error_message: message,
    redacted_by_sdk: message === REDACTED_STRUCTURED_OUTPUT_MESSAGE,
    validation_paths: collectValidationPaths(error),
    usage: extractUsageFromError(error),
    last_response_id:
      state && typeof state._lastResponseId === 'string' ? state._lastResponseId : null,
    output_item_kinds: itemKinds,
    final_output_kind: output.kind,
    final_output_bytes: output.bytes,
    run_id: input.runId,
    trace_note:
      'Inspect the OpenAI dashboard Trace viewer with this run ID. SDK may redact invalid final output when model-data logging is disabled.',
  };
}
