import { LiveEnvError } from './errors';

export const DEFAULT_ASTRA_MODEL = 'gpt-6-astra';
export const DEFAULT_ENGINEERING_MODEL = 'gpt-5.6-sol';
export const DEFAULT_SPECIALIST_MODEL = 'gpt-5.6-terra';
export const DEFAULT_UTILITY_MODEL = 'gpt-5.6-luna';
export const DEFAULT_EXECUTION_MODEL = 'gpt-5.6-sol';
export const DEFAULT_ASTRA_FALLBACK_MODEL = 'gpt-5.6-sol';

export const CANONICAL_VERSION = '2.0.0';

const ASTRA_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AstraReasoningEffort = (typeof ASTRA_REASONING_EFFORTS)[number];

export type TaskClass = 'code' | 'utility' | 'specialist' | 'engineering' | 'reviewer' | 'astra' | 'execution';

export interface SwarmModels {
  astra: string;
  engineering: string;
  specialist: string;
  utility: string;
  reviewer: string;
  execution: string;
  astraFallback: string;
  allowModelFallback: boolean;
  astraReasoningEffort: AstraReasoningEffort | null;
}

export interface RunBudgetConfig {
  max_turns: number;
  max_total_agent_calls: number;
  max_specialist_calls: number;
  max_review_calls: number;
  max_research_calls: number;
  max_research_sources: number;
  max_research_findings: number;
  max_research_proposals: number;
  max_lookdev_calls: number;
  max_lookdev_findings: number;
  max_lookdev_recommendations: number;
  max_lookdev_concepts: number;
  max_content_calls: number;
  max_content_proposals: number;
  max_worldbuilding_calls: number;
  max_worldbuilding_concepts: number;
  max_creative_concepts: number;
  max_execution_calls: number;
  max_conflict_rounds: number;
  max_proposals_per_assignment: number;
  retry_limit: number;
  optional_token_budget: number | null;
}

export interface SwarmConfig {
  apiKey: string | null;
  models: SwarmModels;
  budget: RunBudgetConfig;
}

export interface SwarmConfigError {
  ok: false;
  message: string;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  throw new LiveEnvError(`Invalid boolean env value: ${value}`);
}

function parseInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max?: number,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new LiveEnvError(`${name} must be an integer.`);
  }
  if (parsed < min || (max !== undefined && parsed > max)) {
    const bound = max === undefined ? `>= ${min}` : `${min}..${max}`;
    throw new LiveEnvError(`${name} must be ${bound}.`);
  }
  return parsed;
}

function parseReasoningEffort(
  value: string | undefined,
): AstraReasoningEffort | null {
  if (value === undefined || value.trim() === '') return null;
  const effort = value.trim().toLowerCase();
  if (effort === 'none' || effort === 'minimal') {
    throw new LiveEnvError(
      'ASTRA_REASONING_EFFORT cannot be none or minimal. Astra supports low, medium, high, xhigh, and max.',
    );
  }
  if (!ASTRA_REASONING_EFFORTS.includes(effort as AstraReasoningEffort)) {
    throw new LiveEnvError(
      `ASTRA_REASONING_EFFORT must be one of ${ASTRA_REASONING_EFFORTS.join(', ')}.`,
    );
  }
  return effort as AstraReasoningEffort;
}

export function resolveSwarmConfig(
  env: Record<string, string | undefined> = process.env,
): SwarmConfig {
  const models: SwarmModels = {
    astra: env.ASTRA_MODEL?.trim() || DEFAULT_ASTRA_MODEL,
    engineering: env.ENGINEERING_MODEL?.trim() || DEFAULT_ENGINEERING_MODEL,
    specialist: env.SPECIALIST_MODEL?.trim() || DEFAULT_SPECIALIST_MODEL,
    utility: env.UTILITY_MODEL?.trim() || DEFAULT_UTILITY_MODEL,
    reviewer:
      env.REVIEWER_MODEL?.trim() ||
      env.ENGINEERING_MODEL?.trim() ||
      DEFAULT_ENGINEERING_MODEL,
    execution:
      env.EXECUTION_MODEL?.trim() ||
      env.ENGINEERING_MODEL?.trim() ||
      DEFAULT_EXECUTION_MODEL,
    astraFallback: env.ASTRA_FALLBACK_MODEL?.trim() || DEFAULT_ASTRA_FALLBACK_MODEL,
    allowModelFallback: parseBoolean(env.ALLOW_MODEL_FALLBACK, false),
    astraReasoningEffort: parseReasoningEffort(env.ASTRA_REASONING_EFFORT),
  };

  const budget: RunBudgetConfig = {
    max_turns: parseInteger('AGENT_MAX_TURNS', env.AGENT_MAX_TURNS, 10, 1),
    max_total_agent_calls: parseInteger(
      'MAX_TOTAL_AGENT_CALLS',
      env.MAX_TOTAL_AGENT_CALLS,
      8,
      1,
    ),
    max_specialist_calls: parseInteger(
      'MAX_SPECIALIST_CALLS_PER_RUN',
      env.MAX_SPECIALIST_CALLS_PER_RUN,
      6,
      0,
    ),
    max_review_calls: parseInteger('MAX_REVIEW_CALLS', env.MAX_REVIEW_CALLS, 1, 0),
    max_research_calls: parseInteger('MAX_RESEARCH_CALLS', env.MAX_RESEARCH_CALLS, 1, 0),
    max_research_sources: parseInteger(
      'MAX_RESEARCH_SOURCES',
      env.MAX_RESEARCH_SOURCES,
      6,
      1,
      12,
    ),
    max_research_findings: parseInteger(
      'MAX_RESEARCH_FINDINGS',
      env.MAX_RESEARCH_FINDINGS,
      5,
      1,
      8,
    ),
    max_research_proposals: parseInteger(
      'MAX_RESEARCH_PROPOSALS',
      env.MAX_RESEARCH_PROPOSALS,
      5,
      0,
      5,
    ),
    max_lookdev_calls: parseInteger('MAX_LOOKDEV_CALLS', env.MAX_LOOKDEV_CALLS, 1, 0),
    max_lookdev_findings: parseInteger(
      'MAX_LOOKDEV_FINDINGS',
      env.MAX_LOOKDEV_FINDINGS,
      5,
      1,
      8,
    ),
    max_lookdev_recommendations: parseInteger(
      'MAX_LOOKDEV_RECOMMENDATIONS',
      env.MAX_LOOKDEV_RECOMMENDATIONS,
      5,
      0,
      5,
    ),
    max_lookdev_concepts: parseInteger('MAX_LOOKDEV_CONCEPTS', env.MAX_LOOKDEV_CONCEPTS, 3, 1, 3),
    max_content_calls: parseInteger('MAX_CONTENT_CALLS', env.MAX_CONTENT_CALLS, 1, 0),
    max_content_proposals: parseInteger('MAX_CONTENT_PROPOSALS', env.MAX_CONTENT_PROPOSALS, 5, 0, 5),
    max_worldbuilding_calls: parseInteger(
      'MAX_WORLDBUILDING_CALLS',
      env.MAX_WORLDBUILDING_CALLS,
      1,
      0,
    ),
    max_worldbuilding_concepts: parseInteger(
      'MAX_WORLDBUILDING_CONCEPTS',
      env.MAX_WORLDBUILDING_CONCEPTS,
      5,
      1,
      5,
    ),
    max_creative_concepts: parseInteger(
      'MAX_CREATIVE_CONCEPTS_PER_RUN',
      env.MAX_CREATIVE_CONCEPTS_PER_RUN,
      5,
      1,
      5,
    ),
    max_execution_calls: parseInteger('MAX_EXECUTION_CALLS', env.MAX_EXECUTION_CALLS, 1, 0, 1),
    max_conflict_rounds: parseInteger(
      'MAX_CONFLICT_ROUNDS',
      env.MAX_CONFLICT_ROUNDS,
      2,
      0,
      2,
    ),
    max_proposals_per_assignment: parseInteger(
      'MAX_PROPOSALS_PER_AGENT',
      env.MAX_PROPOSALS_PER_AGENT,
      5,
      0,
      5,
    ),
    retry_limit: parseInteger('AGENT_RETRY_LIMIT', env.AGENT_RETRY_LIMIT, 1, 0),
    optional_token_budget: env.OPTIONAL_TOKEN_BUDGET?.trim()
      ? parseInteger('OPTIONAL_TOKEN_BUDGET', env.OPTIONAL_TOKEN_BUDGET, 1, 1)
      : null,
  };

  return {
    apiKey: env.OPENAI_API_KEY?.trim() || null,
    models,
    budget,
  };
}

export function requireLiveApiKey(config: SwarmConfig): string {
  if (!config.apiKey) {
    throw new LiveEnvError(
      'OPENAI_API_KEY is not configured. Create .env from .env.example. Do not commit the key.',
    );
  }
  return config.apiKey;
}

export function preferTaskClass(kind: 'format' | 'plan' | 'engineer'): TaskClass {
  if (kind === 'format') return 'utility';
  if (kind === 'engineer') return 'engineering';
  return 'astra';
}

export function resolveModelForTask(
  models: SwarmModels,
  task: TaskClass,
): string {
  switch (task) {
    case 'code':
      throw new LiveEnvError('Mechanical deterministic tasks must stay in TypeScript.');
    case 'utility':
      return models.utility;
    case 'specialist':
      return models.specialist;
    case 'engineering':
      return models.engineering;
    case 'reviewer':
      return models.reviewer;
    case 'execution':
      return models.execution;
    case 'astra':
      return models.astra;
  }
}

export interface ResolvedAstraModel {
  model: string;
  usedFallback: boolean;
  presentedAsAstra: boolean;
}

export function resolveAstraModel(
  models: SwarmModels,
  options: { forceFallback?: boolean; unavailableReason?: string } = {},
): ResolvedAstraModel {
  if (!options.forceFallback) {
    return { model: models.astra, usedFallback: false, presentedAsAstra: true };
  }
  if (!models.allowModelFallback) {
    throw new LiveEnvError(
      `Astra fallback is disabled. ${options.unavailableReason ?? 'Astra was unavailable.'}`,
    );
  }
  return {
    model: models.astraFallback,
    usedFallback: true,
    presentedAsAstra: false,
  };
}
