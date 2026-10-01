export class SwarmError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SwarmError';
    this.code = code;
  }
}

export class BudgetExhaustedError extends SwarmError {
  readonly budget: string;

  constructor(budget: string, message?: string) {
    super(
      'BUDGET_EXHAUSTED',
      message ?? `Run stopped because the ${budget} budget was exhausted.`,
    );
    this.name = 'BudgetExhaustedError';
    this.budget = budget;
  }
}

export class ModelFallbackDisabledError extends SwarmError {
  constructor(model: string, cause: string) {
    super(
      'ASTRA_FALLBACK_DISABLED',
      `Astra model ${model} is unavailable and ALLOW_MODEL_FALLBACK is false. ${cause}`,
    );
    this.name = 'ModelFallbackDisabledError';
  }
}

export class LiveEnvError extends SwarmError {
  constructor(message: string) {
    super('LIVE_ENV', message);
    this.name = 'LiveEnvError';
  }
}

export class GovernanceError extends SwarmError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'GovernanceError';
  }
}

export function classifyOpenAiError(error: unknown, model: string): string {
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
    return `OpenAI authentication failed for model ${model}. Check OPENAI_API_KEY. Do not paste the key into chat.`;
  }

  if (
    status === 404 ||
    status === 403 ||
    code === 'model_not_found' ||
    (lowered.includes('model') &&
      (lowered.includes('does not exist') ||
        lowered.includes('not found') ||
        lowered.includes('not have access')))
  ) {
    return `Configured model is unavailable to this API project: ${model}.`;
  }

  if (
    status === 429 ||
    code === 'insufficient_quota' ||
    lowered.includes('insufficient_quota') ||
    lowered.includes('quota') ||
    lowered.includes('billing')
  ) {
    return `OpenAI billing or quota blocked the request for model ${model}.`;
  }

  if (
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    lowered.includes('fetch failed') ||
    lowered.includes('network')
  ) {
    return `OpenAI network failure for model ${model}. ${text}`;
  }

  return text;
}

export function isAstraUnavailableError(error: unknown): boolean {
  const text = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    text.includes('does not exist') ||
    text.includes('not found') ||
    text.includes('not have access') ||
    text.includes('model_not_found') ||
    text.includes('unavailable')
  );
}
