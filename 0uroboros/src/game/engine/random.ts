/**
 * Randomness abstraction.
 *
 * The engine never calls Math.random directly. In the boardgame.io game this is
 * backed by the server-authoritative Random plugin. Tests inject a seeded
 * implementation so every deterministic path is reproducible.
 */

export interface RandomAPI {
  /** Uniform integer in [0, max). */
  int(max: number): number;
  shuffle<T>(items: T[]): T[];
  /** Index selected by weight. Weights need not be normalized. */
  weighted(weights: number[]): number;
}

/** Wrap the boardgame.io Random plugin API. */
export function fromBoardgameRandom(random: {
  Die: (spotvalue: number) => number;
  Number: () => number;
  Shuffle: <T>(deck: T[]) => T[];
}): RandomAPI {
  return {
    int(max: number): number {
      if (max <= 0) return 0;
      return Math.min(max - 1, Math.floor(random.Number() * max));
    },
    shuffle<T>(items: T[]): T[] {
      return random.Shuffle(items);
    },
    weighted(weights: number[]): number {
      return weightedFromUnit(weights, random.Number());
    },
  };
}

/** Deterministic seeded generator for tests and offline simulation. */
export function createSeededRandom(seed: number): RandomAPI {
  let state = seed >>> 0 || 1;
  const next = (): number => {
    // xorshift32
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
  return {
    int(max: number): number {
      if (max <= 0) return 0;
      return Math.min(max - 1, Math.floor(next() * max));
    },
    shuffle<T>(items: T[]): T[] {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
    weighted(weights: number[]): number {
      return weightedFromUnit(weights, next());
    },
  };
}

function weightedFromUnit(weights: number[], unit: number): number {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) return -1;
  let roll = unit * total;
  for (let i = 0; i < weights.length; i += 1) {
    const weight = Math.max(0, weights[i]);
    if (weight <= 0) continue;
    roll -= weight;
    if (roll <= 0) return i;
  }
  // Floating point guard: return the last non-zero weight index.
  for (let i = weights.length - 1; i >= 0; i -= 1) {
    if (weights[i] > 0) return i;
  }
  return -1;
}
