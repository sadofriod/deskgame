import { Camp } from "../types";

export interface JudgementInput {
  aliveByCamp: { passenger: number; fatter: number };
  currentFloor: number;
  resolvedGasRounds: number;
}

export interface JudgementOutput {
  winnerCamp: Camp | null;
  reason: string;
  isFinal: boolean;
}

export class WinnerJudgementService {
  judge(input: JudgementInput): JudgementOutput {
    const { aliveByCamp, currentFloor, resolvedGasRounds } = input;
    const { passenger, fatter } = aliveByCamp;

    // alivePassenger <= aliveFatter → fatter wins (covers all-eliminated case too)
    if (passenger <= fatter) {
      return {
        winnerCamp: Camp.fatter,
        reason:
          passenger === 0 && fatter === 0
            ? "All players eliminated"
            : "Passengers no longer outnumber fatters",
        isFinal: true,
      };
    }

    // resolvedGasRounds >= 4 → fatter wins
    if (resolvedGasRounds >= 4) {
      return {
        winnerCamp: Camp.fatter,
        reason: "4 gas rounds completed",
        isFinal: true,
      };
    }

    // floor 8 settlement finished with passenger > fatter → passenger wins
    if (currentFloor >= 8) {
      return {
        winnerCamp: Camp.passenger,
        reason: "Passengers survived all 8 floors",
        isFinal: true,
      };
    }

    return { winnerCamp: null, reason: "", isFinal: false };
  }
}
