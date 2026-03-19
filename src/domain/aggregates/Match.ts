import { uuidv4 } from "../../utils/uuid";
import { Round, WinnerResult } from "../types";

export interface MatchState {
  matchId: string;
  roomId: string;
  rounds: Round[];
  winnerResult: WinnerResult | null;
  createdAt: Date;
}

export class Match {
  private state: MatchState;

  constructor(roomId: string) {
    this.state = {
      matchId: uuidv4(),
      roomId,
      rounds: [],
      winnerResult: null,
      createdAt: new Date(),
    };
  }

  static restore(state: MatchState): Match {
    const m = new Match(state.roomId);
    m.state = { ...state, rounds: state.rounds.map((r) => ({ ...r })) };
    return m;
  }

  get matchId(): string {
    return this.state.matchId;
  }

  appendRound(round: Round): void {
    this.state.rounds.push({ ...round });
  }

  finalize(winnerResult: WinnerResult): void {
    this.state.winnerResult = winnerResult;
  }

  toState(): MatchState {
    return {
      ...this.state,
      rounds: this.state.rounds.map((r) => ({ ...r })),
    };
  }
}
