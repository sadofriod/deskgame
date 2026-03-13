// StageFlowService – docs/implements/04-domain-services-impl.md
// Enforces the single-direction stage FSM.

import { Stage, STAGE_ORDER } from "../types";

export class StageFlowService {
  /**
   * Returns the next stage after the given current stage.
   * After `vote` the floor increments and we return to `night`.
   */
  next(current: Stage): Stage {
    const idx = STAGE_ORDER.indexOf(current);
    if (idx === -1) {
      throw new Error(`Unknown stage: ${current}`);
    }
    // After vote, wrap back to night
    const nextIdx = (idx + 1) % STAGE_ORDER.length;
    return STAGE_ORDER[nextIdx];
  }

  /**
   * Validates that `candidate` is a legal forward step from `current`.
   */
  isValidTransition(current: Stage, candidate: Stage): boolean {
    return this.next(current) === candidate;
  }
}
