import type { RunBudgetConfig } from './config';
import type { BudgetUsage } from './contracts';
import { BudgetExhaustedError } from './errors';

export class BudgetTracker {
  readonly config: RunBudgetConfig;
  turnsUsed = 0;
  totalAgentCalls = 0;
  specialistCalls = 0;
  reviewCalls = 0;
  researchCalls = 0;
  lookdevCalls = 0;
  contentCalls = 0;
  worldbuildingCalls = 0;
  executionCalls = 0;
  conflictRounds = 0;
  retries = 0;
  exhausted: string | null = null;

  constructor(config: RunBudgetConfig) {
    this.config = config;
  }

  snapshot(): BudgetUsage {
    return {
      ...this.config,
      turns_used: this.turnsUsed,
      total_agent_calls: this.totalAgentCalls,
      specialist_calls: this.specialistCalls,
      review_calls: this.reviewCalls,
      research_calls: this.researchCalls,
      lookdev_calls: this.lookdevCalls,
      content_calls: this.contentCalls,
      worldbuilding_calls: this.worldbuildingCalls,
      execution_calls: this.executionCalls,
      conflict_rounds: this.conflictRounds,
      retries: this.retries,
      exhausted: this.exhausted,
    };
  }

  markTurns(turns: number): void {
    this.turnsUsed = turns;
    if (turns >= this.config.max_turns) {
      this.stop('AGENT_MAX_TURNS');
    }
  }

  consumeAgentCall(
    kind: 'astra' | 'specialist' | 'reviewer' | 'research' | 'lookdev' | 'content' | 'worldbuilding' | 'utility' | 'execution',
  ): void {
    if (this.exhausted) {
      throw new BudgetExhaustedError(this.exhausted);
    }
    if (
      (kind === 'specialist' ||
        kind === 'research' ||
        kind === 'lookdev' ||
        kind === 'content' ||
        kind === 'worldbuilding') &&
      this.specialistCalls + 1 > this.config.max_specialist_calls
    ) {
      this.stop('MAX_SPECIALIST_CALLS_PER_RUN');
    }
    if (kind === 'research' && this.researchCalls + 1 > this.config.max_research_calls) {
      this.stop('MAX_RESEARCH_CALLS');
    }
    if (kind === 'lookdev' && this.lookdevCalls + 1 > this.config.max_lookdev_calls) {
      this.stop('MAX_LOOKDEV_CALLS');
    }
    if (kind === 'content' && this.contentCalls + 1 > this.config.max_content_calls) {
      this.stop('MAX_CONTENT_CALLS');
    }
    if (kind === 'worldbuilding' && this.worldbuildingCalls + 1 > this.config.max_worldbuilding_calls) {
      this.stop('MAX_WORLDBUILDING_CALLS');
    }
    if (kind === 'reviewer' && this.reviewCalls + 1 > this.config.max_review_calls) {
      this.stop('MAX_REVIEW_CALLS');
    }
    if (kind === 'execution' && this.executionCalls + 1 > this.config.max_execution_calls) {
      this.stop('MAX_EXECUTION_CALLS');
    }
    if (this.totalAgentCalls + 1 > this.config.max_total_agent_calls) {
      this.stop('MAX_TOTAL_AGENT_CALLS');
    }
    this.totalAgentCalls += 1;
    if (
      kind === 'specialist' ||
      kind === 'research' ||
      kind === 'lookdev' ||
      kind === 'content' ||
      kind === 'worldbuilding'
    ) {
      this.specialistCalls += 1;
    }
    if (kind === 'research') this.researchCalls += 1;
    if (kind === 'lookdev') this.lookdevCalls += 1;
    if (kind === 'content') this.contentCalls += 1;
    if (kind === 'worldbuilding') this.worldbuildingCalls += 1;
    if (kind === 'reviewer') this.reviewCalls += 1;
    if (kind === 'execution') this.executionCalls += 1;
  }

  canCallSpecialist(): boolean {
    return (
      !this.exhausted &&
      this.specialistCalls < this.config.max_specialist_calls &&
      this.totalAgentCalls < this.config.max_total_agent_calls
    );
  }

  canCallReviewer(): boolean {
    return (
      !this.exhausted &&
      this.reviewCalls < this.config.max_review_calls &&
      this.totalAgentCalls < this.config.max_total_agent_calls
    );
  }

  canCallResearch(): boolean {
    return (
      !this.exhausted &&
      this.researchCalls < this.config.max_research_calls &&
      this.specialistCalls < this.config.max_specialist_calls &&
      this.totalAgentCalls < this.config.max_total_agent_calls
    );
  }

  canCallLookDev(): boolean {
    return (
      !this.exhausted &&
      this.lookdevCalls < this.config.max_lookdev_calls &&
      this.specialistCalls < this.config.max_specialist_calls &&
      this.totalAgentCalls < this.config.max_total_agent_calls
    );
  }

  canCallContent(): boolean {
    return (
      !this.exhausted &&
      this.contentCalls < this.config.max_content_calls &&
      this.specialistCalls < this.config.max_specialist_calls &&
      this.totalAgentCalls < this.config.max_total_agent_calls
    );
  }

  canCallWorldbuilding(): boolean {
    return (
      !this.exhausted &&
      this.worldbuildingCalls < this.config.max_worldbuilding_calls &&
      this.specialistCalls < this.config.max_specialist_calls &&
      this.totalAgentCalls < this.config.max_total_agent_calls
    );
  }

  canCallExecutor(): boolean {
    return (
      !this.exhausted &&
      this.executionCalls < this.config.max_execution_calls &&
      this.totalAgentCalls < this.config.max_total_agent_calls
    );
  }

  recordRetry(): void {
    if (this.retries + 1 > this.config.retry_limit) {
      this.stop('AGENT_RETRY_LIMIT');
    }
    this.retries += 1;
  }

  recordConflictRound(): void {
    if (this.conflictRounds + 1 > this.config.max_conflict_rounds) {
      this.stop('MAX_CONFLICT_ROUNDS');
    }
    this.conflictRounds += 1;
  }

  stop(budget: string): never {
    this.exhausted = budget;
    throw new BudgetExhaustedError(budget);
  }
}
