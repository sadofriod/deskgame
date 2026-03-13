// DealService – derived from docs/implements/04-domain-services-impl.md
// Deterministic shuffle based on a seed string so results are reproducible.

import { Role } from "../types";

export type RoleConfig = "independent" | "faction";

export interface DealServiceInput {
  players: string[]; // openId list, order must be stable
  roleConfig: RoleConfig;
  seed: string;
}

export interface RoleAssignment {
  openId: string;
  role: Role;
}

/**
 * Simple seeded PRNG (mulberry32) for reproducible shuffles.
 * Same seed + same input always produces the same output.
 */
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

export class DealService {
  deal(input: DealServiceInput): RoleAssignment[] {
    const { players, roleConfig, seed } = input;
    const rng = seededRng(seed);

    const fatCount = Math.max(1, Math.floor(players.length / 3));
    let roles: Role[];

    if (roleConfig === "independent") {
      roles = [
        Role.fatter1,
        ...Array(fatCount - 1 > 0 ? fatCount - 1 : 0).fill(Role.fatter2),
        ...Array(players.length - fatCount).fill(Role.passenger),
      ];
    } else {
      roles = [
        ...Array(fatCount).fill(Role.fatter),
        ...Array(players.length - fatCount).fill(Role.passenger),
      ];
    }

    const shuffledRoles = shuffle(roles, rng);
    const shuffledPlayers = shuffle([...players], rng);

    return shuffledPlayers.map((openId, idx) => ({
      openId,
      role: shuffledRoles[idx],
    }));
  }
}
