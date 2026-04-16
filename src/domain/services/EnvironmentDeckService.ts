import { DeckEntry } from "../types";

export interface DeckInput {
  ruleSetCode: string;
  deckTemplateCode: string;
  seed: string;
}

// DeckEntry is re-exported from domain types

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
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export class EnvironmentDeckService {
  generate(input: DeckInput): DeckEntry[] {
    const rng = seededRng(input.seed);

    // classic_pool_v1: gas×3, no_gas×4, smelly_gas×1, stuffy_gas×1 = 9 cards
    const pool: string[] = [
      "gas", "gas", "gas",
      "no_gas", "no_gas", "no_gas", "no_gas",
      "smelly_gas",
      "stuffy_gas",
    ];

    // Remove 1 optional card (smelly_gas or stuffy_gas) randomly
    const optionals = ["smelly_gas", "stuffy_gas"];
    const removeCard = optionals[Math.floor(rng() * 2)]!;
    const removeIdx = pool.indexOf(removeCard);
    if (removeIdx >= 0) pool.splice(removeIdx, 1);

    // Shuffle remaining 8
    const shuffled = shuffle(pool, rng);

    // Return with positions 1-8
    return shuffled.map((code, i) => ({ position: i + 1, environmentCardCode: code }));
  }
}
