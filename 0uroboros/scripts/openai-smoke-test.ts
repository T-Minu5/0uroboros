/**
 * Phase 0 OpenAI Agents SDK connection smoke test.
 * One small request. No tools, handoffs, swarm, or game context.
 */

import { Agent, getGlobalTraceProvider, run } from '@openai/agents';

import {
  DEFAULT_TEST_MODEL,
  loadLocalEnv,
  resolveConnectionConfig,
} from './openai-connection-config';

function fail(message: string, code = 1): never {
  console.error(message);
  process.exit(code);
}

function classifyError(error: unknown, model: string): string {
  const text = error instanceof Error ? error.message : String(error);
  const lowered = text.toLowerCase();
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: number }).status)
      : undefined;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code)
      : '';

  if (
    status === 401 ||
    code === 'invalid_api_key' ||
    lowered.includes('incorrect api key') ||
    lowered.includes('invalid api key') ||
    lowered.includes('authentication')
  ) {
    return `OpenAI authentication failed.

The OpenAI project API key could not authenticate.
Check that OPENAI_API_KEY is a valid project key from platform.openai.com.
Do not use a ChatGPT password or a leaked/revoked key.`;
  }

  if (
    status === 404 ||
    status === 403 ||
    code === 'model_not_found' ||
    lowered.includes('model') &&
      (lowered.includes('does not exist') ||
        lowered.includes('not found') ||
        lowered.includes('not have access'))
  ) {
    return `OpenAI authentication succeeded, but the configured model is unavailable to this API project.

Configured model: ${model}

Set OPENAI_TEST_MODEL to a model available to your OpenAI project.`;
  }

  if (
    status === 429 ||
    code === 'insufficient_quota' ||
    lowered.includes('insufficient_quota') ||
    lowered.includes('quota') ||
    lowered.includes('billing')
  ) {
    return `OpenAI API billing or quota blocked this request.

The OpenAI API has separate billing from ChatGPT subscriptions.
Add credits or enable billing on the OpenAI API project, then retry.`;
  }

  if (
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    lowered.includes('fetch failed') ||
    lowered.includes('network')
  ) {
    return `OpenAI connection/network failure.

Could not reach the OpenAI API. Check internet access and proxy settings.
${text}`;
  }

  return `OpenAI request failed.

${text}`;
}

async function main(): Promise<void> {
  const loaded = loadLocalEnv();
  const config = resolveConnectionConfig();
  if (!config.ok) {
    const names = loaded.names.length > 0 ? loaded.names.join(', ') : '(none)';
    fail(
      `${config.message}

.env path: ${loaded.envPath}
.env found: ${loaded.found ? 'yes' : 'no'}
Variable names found: ${names}

The key line must look like OPENAI_API_KEY=sk-... with no spaces in the name.`,
    );
  }

  const { model, usedDefaultModel } = config;

  const agent = new Agent({
    name: '0uroboros Connection Test',
    model,
    instructions: 'You are a connection test. Respond concisely and do not call tools.',
  });

  try {
    const result = await run(
      agent,
      'Reply exactly with: 0uroboros OpenAI connection confirmed.',
    );

    await getGlobalTraceProvider().forceFlush();

    const response = String(result.finalOutput ?? '').trim();
    const defaultNote = usedDefaultModel
      ? ` (default ${DEFAULT_TEST_MODEL}; set OPENAI_TEST_MODEL to override)`
      : '';

    console.log('0uroboros OpenAI API Test');
    console.log('');
    console.log(`Model: ${model}${defaultNote}`);
    console.log('');
    console.log('OpenAI connection successful.');
    console.log('');
    console.log('Response:');
    console.log(response || '(empty response)');
    console.log('');
    console.log('Agents SDK tracing is enabled by default.');
    console.log('You can inspect this run in the OpenAI dashboard Trace viewer.');
  } catch (error) {
    fail(classifyError(error, model));
  }
}

void main();
