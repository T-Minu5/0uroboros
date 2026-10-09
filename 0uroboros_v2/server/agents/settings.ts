import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Server-side agent switches. Never holds keys; the API only reports whether a model is configured. */
export type AgentSettings = {
  agentsEnabled: boolean;
  stratG: { enabled: boolean; recordDecisions: boolean };
  t5: { enabled: boolean };
  dv8: { enabled: boolean };
  vpDog: { enabled: boolean };
  /** AI-vs-AI league between Strat-G, T-5, DV-8 and VP-Dog. */
  league: { rounds: number; seedsPerBlock: number; ecoObserves: boolean };
  ecoStrat: { enabled: boolean; observeHumanGames: boolean; continuous: boolean; reportEvery: number; baselineGames: number };
};

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  agentsEnabled: true,
  stratG: { enabled: true, recordDecisions: true },
  t5: { enabled: true },
  dv8: { enabled: true },
  vpDog: { enabled: true },
  league: { rounds: 3, seedsPerBlock: 4, ecoObserves: true },
  ecoStrat: { enabled: true, observeHumanGames: true, continuous: true, reportEvery: 10, baselineGames: 10 },
};

const bool = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
const int = (value: unknown, fallback: number, min: number, max: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
const SECTIONS = ['stratG', 't5', 'dv8', 'vpDog', 'league', 'ecoStrat'] as const;
const section = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};

export function sanitizeSettings(value: unknown, base: AgentSettings = DEFAULT_AGENT_SETTINGS): AgentSettings {
  const input = section(value);
  const [stratG, t5, dv8, vpDog, league, eco] = SECTIONS.map(key => section(input[key]));
  return {
    agentsEnabled: bool(input.agentsEnabled, base.agentsEnabled),
    stratG: { enabled: bool(stratG.enabled, base.stratG.enabled), recordDecisions: bool(stratG.recordDecisions, base.stratG.recordDecisions) },
    t5: { enabled: bool(t5.enabled, base.t5.enabled) },
    dv8: { enabled: bool(dv8.enabled, base.dv8.enabled) },
    vpDog: { enabled: bool(vpDog.enabled, base.vpDog.enabled) },
    league: {
      rounds: int(league.rounds, base.league.rounds, 1, 5), seedsPerBlock: int(league.seedsPerBlock, base.league.seedsPerBlock, 2, 8),
      ecoObserves: bool(league.ecoObserves, base.league.ecoObserves),
    },
    ecoStrat: {
      enabled: bool(eco.enabled, base.ecoStrat.enabled), observeHumanGames: bool(eco.observeHumanGames, base.ecoStrat.observeHumanGames),
      continuous: bool(eco.continuous, base.ecoStrat.continuous),
      reportEvery: int(eco.reportEvery, base.ecoStrat.reportEvery, 5, 100), baselineGames: int(eco.baselineGames, base.ecoStrat.baselineGames, 10, 50),
    },
  };
}

/** The master switch gates every agent. */
export const stratGActive = (settings: AgentSettings) => settings.agentsEnabled && settings.stratG.enabled;
export const t5Active = (settings: AgentSettings) => settings.agentsEnabled && settings.t5.enabled;
export const dv8Active = (settings: AgentSettings) => settings.agentsEnabled && settings.dv8.enabled;
export const vpDogActive = (settings: AgentSettings) => settings.agentsEnabled && settings.vpDog.enabled;
export const ecoStratActive = (settings: AgentSettings) => settings.agentsEnabled && settings.ecoStrat.enabled;

export function createSettingsStore(file: string) {
  let cached: { mtime: number; value: AgentSettings } | null = null;
  function read(): AgentSettings {
    try {
      const mtime = statSync(file).mtimeMs;
      if (cached?.mtime === mtime) return cached.value;
      const value = sanitizeSettings(JSON.parse(readFileSync(file, 'utf8')));
      cached = { mtime, value };
      return value;
    } catch {
      return structuredClone(DEFAULT_AGENT_SETTINGS);
    }
  }
  function write(patch: unknown): AgentSettings {
    const current = read();
    const input = section(patch);
    const merged: Record<string, unknown> = { ...current, ...input };
    for (const key of SECTIONS) merged[key] = { ...current[key], ...section(input[key]) };
    const next = sanitizeSettings(merged, current);
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    renameSync(temp, file);
    cached = null;
    return next;
  }
  return { read, write, file };
}
