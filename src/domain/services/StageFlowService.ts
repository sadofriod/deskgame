import { Stage } from "../types";

export interface StageFlowInput {
  current: Stage;
  isFinal?: boolean;
}

export class StageFlowService {
  next(input: StageFlowInput): Stage {
    if (input.current === Stage.discussionVote) {
      return input.isFinal ? Stage.review : Stage.bet;
    }

    switch (input.current) {
      case Stage.lobby:
        return Stage.roleSelection;
      case Stage.roleSelection:
        return Stage.bet;
      case Stage.bet:
        return Stage.action;
      case Stage.action:
        return Stage.settlement;
      case Stage.settlement:
        return Stage.discussionVote;
      case Stage.review:
        return Stage.review;
      default:
        throw new Error(`Unknown stage: ${input.current}`);
    }
  }

  isValidTransition(current: Stage, candidate: Stage, isFinal = false): boolean {
    return this.next({ current, isFinal }) === candidate;
  }
}
