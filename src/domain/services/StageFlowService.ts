import { Stage } from "../types";

export interface StageFlowInput {
  currentStage: Stage;
  isTieVote?: boolean;
  isFinal?: boolean;
}

export class StageFlowService {
  next(input: StageFlowInput): Stage {
    const { currentStage, isTieVote, isFinal } = input;

    switch (currentStage) {
      case Stage.preparation:
        return Stage.bet;
      case Stage.bet:
        return Stage.environment;
      case Stage.environment:
        return Stage.action;
      case Stage.action:
        return Stage.damage;
      case Stage.damage:
        return Stage.talk;
      case Stage.talk:
        return Stage.vote;
      case Stage.vote:
        return isTieVote ? Stage.tieBreak : Stage.settlement;
      case Stage.tieBreak:
        return Stage.vote;
      case Stage.settlement:
        return isFinal ? Stage.settlement : Stage.preparation;
      default:
        throw new Error(`Unknown stage: ${currentStage}`);
    }
  }

  isValidTransition(from: Stage, to: Stage): boolean {
    try {
      const normalNext = this.next({ currentStage: from });
      const tieNext = this.next({ currentStage: from, isTieVote: true });
      return normalNext === to || tieNext === to;
    } catch {
      return false;
    }
  }
}
