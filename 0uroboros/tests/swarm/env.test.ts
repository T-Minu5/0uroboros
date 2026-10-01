import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ASTRA_MODEL,
  DEFAULT_ENGINEERING_MODEL,
  DEFAULT_SPECIALIST_MODEL,
  DEFAULT_UTILITY_MODEL,
  preferTaskClass,
  requireLiveApiKey,
  resolveAstraModel,
  resolveModelForTask,
  resolveSwarmConfig,
} from '../../src/swarm/config';
import { LiveEnvError } from '../../src/swarm/errors';

describe('swarm environment', () => {
  it('fails live runs when the API key is missing', () => {
    const config = resolveSwarmConfig({ OPENAI_API_KEY: '' });
    expect(config.apiKey).toBeNull();
    expect(() => requireLiveApiKey(config)).toThrow(LiveEnvError);
  });

  it('does not require a key to resolve offline config', () => {
    const config = resolveSwarmConfig({});
    expect(config.models.astra).toBe(DEFAULT_ASTRA_MODEL);
    expect(config.models.allowModelFallback).toBe(false);
  });

  it('applies model overrides from env', () => {
    const config = resolveSwarmConfig({
      ASTRA_MODEL: 'gpt-6-astra-override',
      ENGINEERING_MODEL: 'gpt-5.6-sol-override',
      SPECIALIST_MODEL: 'gpt-5.6-terra-override',
      UTILITY_MODEL: 'gpt-5.6-luna-override',
      REVIEWER_MODEL: 'gpt-5.6-sol-reviewer',
      EXECUTION_MODEL: 'gpt-5.6-sol-executor',
    });
    expect(config.models.astra).toBe('gpt-6-astra-override');
    expect(config.models.engineering).toBe('gpt-5.6-sol-override');
    expect(config.models.specialist).toBe('gpt-5.6-terra-override');
    expect(config.models.utility).toBe('gpt-5.6-luna-override');
    expect(config.models.reviewer).toBe('gpt-5.6-sol-reviewer');
    expect(config.models.execution).toBe('gpt-5.6-sol-executor');
  });

  it('keeps Astra fallback disabled by default and explicit when enabled', () => {
    const disabled = resolveSwarmConfig({});
    expect(disabled.models.allowModelFallback).toBe(false);
    expect(() =>
      resolveAstraModel(disabled.models, { forceFallback: true }),
    ).toThrow(/fallback is disabled/i);

    const enabled = resolveSwarmConfig({ ALLOW_MODEL_FALLBACK: 'true' });
    const resolved = resolveAstraModel(enabled.models, { forceFallback: true });
    expect(resolved.usedFallback).toBe(true);
    expect(resolved.presentedAsAstra).toBe(false);
    expect(resolved.model).toBe(enabled.models.astraFallback);
  });

  it('validates numeric budget limits', () => {
    expect(() => resolveSwarmConfig({ AGENT_MAX_TURNS: '0' })).toThrow(LiveEnvError);
    expect(() => resolveSwarmConfig({ MAX_CONFLICT_ROUNDS: '3' })).toThrow(LiveEnvError);
    expect(() => resolveSwarmConfig({ MAX_PROPOSALS_PER_AGENT: '6' })).toThrow(
      LiveEnvError,
    );
    expect(() => resolveSwarmConfig({ MAX_TOTAL_AGENT_CALLS: '1.5' })).toThrow(
      LiveEnvError,
    );
    expect(resolveSwarmConfig({}).budget.max_lookdev_calls).toBe(1);
    expect(resolveSwarmConfig({ MAX_LOOKDEV_CALLS: '0' }).budget.max_lookdev_calls).toBe(0);
    expect(resolveSwarmConfig({}).budget.max_content_calls).toBe(1);
    expect(resolveSwarmConfig({}).budget.max_worldbuilding_calls).toBe(1);
    expect(resolveSwarmConfig({}).budget.max_creative_concepts).toBe(5);
    expect(resolveSwarmConfig({}).budget.max_execution_calls).toBe(1);
    expect(resolveSwarmConfig({ MAX_EXECUTION_CALLS: '0' }).budget.max_execution_calls).toBe(0);
    expect(() => resolveSwarmConfig({ MAX_EXECUTION_CALLS: '2' })).toThrow(LiveEnvError);
  });

  it('routes task classes through the central model table', () => {
    const models = resolveSwarmConfig({}).models;
    expect(resolveModelForTask(models, 'astra')).toBe(DEFAULT_ASTRA_MODEL);
    expect(resolveModelForTask(models, 'engineering')).toBe(DEFAULT_ENGINEERING_MODEL);
    expect(resolveModelForTask(models, 'specialist')).toBe(DEFAULT_SPECIALIST_MODEL);
    expect(resolveModelForTask(models, 'utility')).toBe(DEFAULT_UTILITY_MODEL);
    expect(resolveModelForTask(models, 'reviewer')).toBe(DEFAULT_ENGINEERING_MODEL);
    expect(resolveModelForTask(models, 'execution')).toBe(DEFAULT_ENGINEERING_MODEL);
    expect(preferTaskClass('format')).toBe('utility');
    expect(() => resolveModelForTask(models, 'code')).toThrow(/TypeScript/);
  });

  it('rejects unsupported Astra reasoning settings', () => {
    expect(() => resolveSwarmConfig({ ASTRA_REASONING_EFFORT: 'none' })).toThrow(
      /cannot be none/,
    );
    expect(resolveSwarmConfig({ ASTRA_REASONING_EFFORT: 'low' }).models.astraReasoningEffort).toBe(
      'low',
    );
  });
});
