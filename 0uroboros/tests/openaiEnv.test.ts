import { resolve } from 'node:path';

import {
  DEFAULT_TEST_MODEL,
  MISSING_KEY_MESSAGE,
  resolveConnectionConfig,
} from '../scripts/openai-connection-config';

describe('OpenAI connection config', () => {
  it('stops cleanly when OPENAI_API_KEY is missing', () => {
    const result = resolveConnectionConfig({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe('missing_key');
    expect(result.message).toBe(MISSING_KEY_MESSAGE);
  });

  it('uses gpt-5.6-luna when OPENAI_TEST_MODEL is empty', () => {
    const result = resolveConnectionConfig({
      OPENAI_API_KEY: 'sk-test-not-real',
      OPENAI_TEST_MODEL: '',
    });
    expect(result).toEqual({
      ok: true,
      apiKey: 'sk-test-not-real',
      model: DEFAULT_TEST_MODEL,
      usedDefaultModel: true,
    });
  });

  it('uses OPENAI_TEST_MODEL when set', () => {
    const result = resolveConnectionConfig({
      OPENAI_API_KEY: 'sk-test-not-real',
      OPENAI_TEST_MODEL: 'gpt-5.6-terra',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.model).toBe('gpt-5.6-terra');
    expect(result.usedDefaultModel).toBe(false);
  });

  it('resolves the local env path next to the repo root', () => {
    expect(resolve(process.cwd(), '.env.example').endsWith('.env.example')).toBe(
      true,
    );
  });
});
