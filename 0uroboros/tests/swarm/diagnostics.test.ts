import { describe, expect, it } from 'vitest';

import {
  describeStructuredOutputFailure,
  extractUsageFromError,
  REDACTED_STRUCTURED_OUTPUT_MESSAGE,
} from '../../src/swarm/diagnostics';

describe('structured output failure diagnostics', () => {
  it('records agent, model, schema, and redacted SDK errors without secrets', () => {
    const error = new Error(REDACTED_STRUCTURED_OUTPUT_MESSAGE);
    error.name = 'ModelBehaviorError';
    const failure = describeStructuredOutputFailure({
      error,
      agent: 'Astra',
      model: 'gpt-6-astra',
      schema: 'AstraSynthesisSchema',
      runId: 'run-test',
    });
    expect(failure.redacted_by_sdk).toBe(true);
    expect(failure.agent).toBe('Astra');
    expect(failure.schema).toBe('AstraSynthesisSchema');
    expect(JSON.stringify(failure)).not.toMatch(/sk-/);
    expect(failure.trace_note).toMatch(/Trace viewer/);
  });

  it('captures usage from error.state when the SDK attached it', () => {
    const error = Object.assign(new Error('schema failed'), {
      state: { usage: { requests: 4, inputTokens: 100, outputTokens: 50, totalTokens: 150 } },
    });
    expect(extractUsageFromError(error)).toEqual({
      requests: 4,
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
    });
  });

  it('returns null usage when the SDK did not expose it', () => {
    expect(extractUsageFromError(new Error(REDACTED_STRUCTURED_OUTPUT_MESSAGE))).toBeNull();
  });
});
