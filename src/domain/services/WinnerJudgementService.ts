import { Role, WinnerCamp, WinnerResult } from "../types";

export interface AliveByRole {
  [role: string]: number;
}

export interface JudgementInput {
  aliveByRole: AliveByRole;
  currentRound: number;
  allEliminated?: boolean;
}

export interface JudgementResult {
  isFinal: boolean;
  winnerResult?: WinnerResult;
}

const FATTER_ROLES = new Set<string>([Role.fatter, Role.fatter1, Role.fatter2]);

function buildWinnerResult(winnerCamp: WinnerCamp, reason: string): WinnerResult {
  return { winnerCamp, reason, decidedAt: new Date() };
}

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
    const fatters = countFatters(input.aliveByRole);
    const passengers = countPassengers(input.aliveByRole);
    const total = fatters + passengers;

    if (input.allEliminated || total === 0) {
      return {
        isFinal: true,
        winnerResult: buildWinnerResult(WinnerCamp.draw, "All players eliminated"),
      };
    }

    if (passengers === 0) {
      return {
        isFinal: true,
        winnerResult: buildWinnerResult(WinnerCamp.fatter, "All passengers eliminated"),
      };
    }

    if (fatters === 0) {
      return {
        isFinal: true,
        winnerResult: buildWinnerResult(WinnerCamp.passenger, "All fatters eliminated"),
      };
    }

    if (passengers <= fatters) {
      return {
        isFinal: true,
        winnerResult: buildWinnerResult(WinnerCamp.fatter, "Alive passengers ≤ alive fatters"),
      };
    }

    if (input.currentRound >= 8 && passengers > fatters) {
      return {
        isFinal: true,
        winnerResult: buildWinnerResult(
          WinnerCamp.passenger,
          "Survived 8 rounds with more passengers than fatters"
        ),
      };
    }

    return { isFinal: false };
  }
}
