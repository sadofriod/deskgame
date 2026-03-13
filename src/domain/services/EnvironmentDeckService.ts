// EnvironmentDeckService – docs/implements/04-domain-services-impl.md
// Picks 8 environment cards from 9 in a reproducible, seeded manner.

import { EnvironmentCard } from "../types";

export interface EnvConfig {
  hasGas: number;    // 有屁
  hasStink: number;  // 有臭屁
  hasStew: number;   // 有闷屁
  none: number;      // 无屁
  pick: number;      // how many to pick (default 8)
}

export const DEFAULT_ENV_CONFIG: EnvConfig = {
  hasGas: 3,
  hasStink: 1,
  hasStew: 0,
  none: 4,
  pick: 8,
};

function seededRng(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  let state = h >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class EnvironmentDeckService {
  generate(seed: string, config: EnvConfig = DEFAULT_ENV_CONFIG): EnvironmentCard[] {
    const pool: EnvironmentCard[] = [
      ...Array(config.hasGas).fill(EnvironmentCard.gas),
      ...Array(config.hasStink).fill(EnvironmentCard.stink),
      ...Array(config.hasStew).fill(EnvironmentCard.stew),
      ...Array(config.none).fill(EnvironmentCard.none),
    ];

    const rng = seededRng(seed);
    const shuffled = shuffle(pool, rng);
    return shuffled.slice(0, config.pick);
  }
}
