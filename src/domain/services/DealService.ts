export interface IdentityAssignment {
  openId: string;
  identityCode: string; // "passenger" or "fatter"
  roleOptions: string[]; // 2 role codes offered
  initialHandCards: { cardInstanceId: string; actionCardCode: string }[];
}

export interface DealServiceInput {
  players: string[]; // openIds ordered by seat
  playerCount: number;
  seed: string;
}

const IDENTITY_DISTRIBUTION: Record<number, { passenger: number; fatter: number }> = {
  5: { passenger: 3, fatter: 2 },
  6: { passenger: 4, fatter: 2 },
  7: { passenger: 5, fatter: 2 },
  8: { passenger: 6, fatter: 2 },
  9: { passenger: 6, fatter: 3 },
  10: { passenger: 7, fatter: 3 },
};

const ROLE_POOL = [
  "broker", "alien", "pumpkin", "vampire",
  "plague_doctor", "prophet", "big_bro", "sunshine_boy",
];

const CARD_POOL = ["endure", "scold", "blow", "suck", "grab", "listen"];

const SEED_MAX_LEN = 256;

function seededRng(seed: string): () => number {
  const safeSeed = String(seed).slice(0, SEED_MAX_LEN);
  let h = 0;
  for (let i = 0; i < SEED_MAX_LEN; i++) {
    // Use 0 for positions beyond the actual seed length (constant loop bound)
    h = (Math.imul(31, h) + (i < safeSeed.length ? safeSeed.charCodeAt(i) : 0)) | 0;
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
    // Both i and j are valid indices since j < i + 1 <= a.length
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}

export class DealService {
  deal(input: DealServiceInput): IdentityAssignment[] {
    if (input.players.length !== input.playerCount) {
      throw new Error(
        `players.length (${input.players.length}) must equal playerCount (${input.playerCount})`
      );
    }
    if (input.playerCount < 5 || input.playerCount > 10) {
      throw new Error(`playerCount must be 5–10, got ${input.playerCount}`);
    }
    const rng = seededRng(input.seed);
    const dist = IDENTITY_DISTRIBUTION[input.playerCount]!;

    // Build identity array; total must match player count
    const identities: string[] = [
      ...Array(dist.passenger).fill("passenger"),
      ...Array(dist.fatter).fill("fatter"),
    ];
    const shuffledIdentities = shuffle(identities, rng);

    // Shuffle card pool for initial hand distribution (cycles if more players than card types)
    const shuffledCards = shuffle([...CARD_POOL], rng);
    const cardCount = shuffledCards.length;

    return input.players.map((openId, index) => {
      // Each player gets 2 unique roles drawn from the pool
      const shuffledRoles = shuffle([...ROLE_POOL], rng);
      // Use index directly — shuffledIdentities.length equals input.players.length for valid player counts
      const identityCode = shuffledIdentities[index] ?? "passenger";
      return {
        openId,
        identityCode,
        roleOptions: [shuffledRoles[0]!, shuffledRoles[1]!],
        // BUG-01 fix: each player receives 4 hand cards (cycling through the shuffled pool)
        initialHandCards: Array.from({ length: 4 }, (_, cardIndex) => ({
          cardInstanceId: `${openId}-card-${cardIndex}`,
          actionCardCode: shuffledCards[(index * 4 + cardIndex) % cardCount] ?? "listen",
        })),
      };
    });
  }
}
