import { Role, RoleConfig, RoomConfig } from "../types";

export interface DealServiceInput {
  players: string[];
  roomConfig: RoomConfig;
  seed: string;
}

export interface CandidateRoleAssignment {
  openId: string;
  roles: Role[];
}

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

function buildRolePool(roleConfig: RoleConfig): Role[] {
  if (roleConfig === "independent") {
    return [Role.fatter1, Role.fatter2, Role.passenger, Role.passenger];
  }
  return [Role.fatter, Role.passenger, Role.passenger, Role.passenger];
}

function pickCandidateRoles(rolePool: Role[], rng: () => number): Role[] {
  return shuffle(rolePool, rng).slice(0, 3);
}

export class DealService {
  deal(input: DealServiceInput): CandidateRoleAssignment[] {
    const rng = seededRng(input.seed);
    const rolePool = buildRolePool(input.roomConfig.roleConfig);
    const orderedPlayers = shuffle([...input.players], rng);
    return orderedPlayers.map((openId) => ({
      openId,
      roles: pickCandidateRoles(rolePool, rng),
    }));
  }
}
