/** One value per `PlayerId`; index 0 is the local player. */
export type PerPlayer<T> = [T, T];

export const withPlayer = <T>(pair: PerPlayer<T>, owner: 0 | 1, value: T): PerPlayer<T> => owner ? [pair[0], value] : [value, pair[1]];

/** The saved pair under `key`; a single value saved under `legacyKey`, from before the setting was per player, applies to both. */
export function loadPerPlayer<T extends string>(key: string, options: readonly T[], fallback: PerPlayer<T>, legacyKey?: string): PerPlayer<T> {
  const valid = (value: unknown): value is T => (options as readonly unknown[]).includes(value);
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const saved: unknown = JSON.parse(raw);
      return Array.isArray(saved) && saved.length === 2 && valid(saved[0]) && valid(saved[1]) ? [saved[0], saved[1]] : [...fallback];
    }
    const legacy = legacyKey ? localStorage.getItem(legacyKey) : null;
    if (valid(legacy)) return [legacy, legacy];
  } catch { /* storage unavailable or corrupt */ }
  return [...fallback];
}

export function savePerPlayer<T extends string>(key: string, value: PerPlayer<T>) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
