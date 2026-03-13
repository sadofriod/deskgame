// WinnerJudgementService – docs/implements/04-domain-services-impl.md
// Evaluates win conditions after each settlement and vote.

import { Role, WinnerCamp, WinnerResult } from "../types";

export interface AliveByRole {
  [role: string]: number;
}

export interface JudgementInput {
  aliveByRole: AliveByRole;
  currentFloor: number;
}

export interface JudgementResult {
  isFinal: boolean;
  winnerResult?: WinnerResult;
}

const FATTER_ROLES = new Set<string>([Role.fatter, Role.fatter1, Role.fatter2]);

function countFatters(aliveByRole: AliveByRole): number {
  return Object.entries(aliveByRole)
    .filter(([role]) => FATTER_ROLES.has(role))
    .reduce((sum, [, count]) => sum + count, 0);
}

function countPassengers(aliveByRole: AliveByRole): number {
  return aliveByRole[Role.passenger] ?? 0;
}

export class WinnerJudgementService {
  judge(input: JudgementInput): JudgementResult {
    const { aliveByRole, currentFloor } = input;
    const fatters = countFatters(aliveByRole);
    const passengers = countPassengers(aliveByRole);
    const total = fatters + passengers;

    // Draw: no one alive
    if (total === 0) {
      return {
        isFinal: true,
        winnerResult: {
          winnerCamp: WinnerCamp.draw,
          reason: "All players eliminated",
          decidedAt: new Date(),
        },
      };
    }

    // Fatter wins: passengers cleared, or alive passengers <= alive fatters
    if (passengers === 0) {
      return {
        isFinal: true,
        winnerResult: {
          winnerCamp: WinnerCamp.fatter,
          reason: "All passengers eliminated",
          decidedAt: new Date(),
        },
      };
    }
    if (fatters > 0 && passengers <= fatters) {
      return {
        isFinal: true,
        winnerResult: {
          winnerCamp: WinnerCamp.fatter,
          reason: "Alive passengers ≤ alive fatters",
          decidedAt: new Date(),
        },
      };
    }

    // Passenger wins: fatters wiped out
    if (fatters === 0) {
      return {
        isFinal: true,
        winnerResult: {
          winnerCamp: WinnerCamp.passenger,
          reason: "All fatters eliminated",
          decidedAt: new Date(),
        },
      };
    }

    // Passenger wins: reached floor 8 end and still have more survivors
    if (currentFloor >= 8 && passengers > fatters) {
      return {
        isFinal: true,
        winnerResult: {
          winnerCamp: WinnerCamp.passenger,
          reason: "Survived 8 floors with more passengers than fatters",
          decidedAt: new Date(),
        },
      };
    }

    return { isFinal: false };
  }
}
