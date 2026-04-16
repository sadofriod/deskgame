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

export class DealService {
  deal(input: DealServiceInput): IdentityAssignment[] {
    const rng = seededRng(input.seed);
    const dist = IDENTITY_DISTRIBUTION[input.playerCount] ?? { passenger: 3, fatter: 2 };

    // Build identity array
    const identities: string[] = [
      ...Array(dist.passenger).fill("passenger"),
      ...Array(dist.fatter).fill("fatter"),
    ];
    const shuffledIdentities = shuffle(identities, rng);

    // Shuffle card pool for initial hand distribution
    const shuffledCards = shuffle([...CARD_POOL], rng);

    return input.players.map((openId, index) => {
      // Each player gets 2 unique roles drawn from the pool
      const shuffledRoles = shuffle([...ROLE_POOL], rng);
      return {
        openId,
        identityCode: shuffledIdentities[index % shuffledIdentities.length] ?? "passenger",
        roleOptions: [shuffledRoles[0]!, shuffledRoles[1]!],
        initialHandCards: [
          {
            cardInstanceId: `${openId}-card-0`,
            actionCardCode: shuffledCards[index % shuffledCards.length] ?? "listen",
          },
        ],
      };
    });
  }
}
