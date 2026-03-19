/// <reference types="jest" />

import { DealService } from "../domain/services/DealService";
import { DEFAULT_ENV_CONFIG, EnvironmentDeckService } from "../domain/services/EnvironmentDeckService";
import { SettlementService } from "../domain/services/SettlementService";
import { StageFlowService } from "../domain/services/StageFlowService";
import { WinnerJudgementService } from "../domain/services/WinnerJudgementService";
import { ActionCard, EnvironmentCard, Role, Stage, WinnerCamp } from "../domain/types";

describe("DealService", () => {
  const service = new DealService();
  const players = ["p1", "p2", "p3", "p4", "p5"];

  it("builds three candidate roles for every player", () => {
    const result = service.deal({
      players,
      roomConfig: { playerCount: 5, roleConfig: "independent" },
      seed: "s1",
    });
    expect(result).toHaveLength(players.length);
    expect(result.every((item) => item.roles.length === 3)).toBe(true);
  });

  it("is deterministic for the same seed", () => {
    const input = { players, roomConfig: { playerCount: 5, roleConfig: "independent" as const }, seed: "s1" };
    expect(service.deal(input)).toEqual(service.deal(input));
  });

  it("includes faction role candidates in faction mode", () => {
    const result = service.deal({
      players,
      roomConfig: { playerCount: 5, roleConfig: "faction" },
      seed: "s1",
    });
    expect(result.some((item) => item.roles.includes(Role.fatter))).toBe(true);
  });
});

describe("EnvironmentDeckService", () => {
  const service = new EnvironmentDeckService();

  it("generates eight cards by default", () => {
    expect(service.generate("seed1")).toHaveLength(8);
  });

  it("only uses configured environment cards", () => {
    const deck = service.generate("seed2", DEFAULT_ENV_CONFIG);
    const allowed = new Set(Object.values(EnvironmentCard));
    expect(deck.every((card) => allowed.has(card))).toBe(true);
  });
});

describe("StageFlowService", () => {
  const service = new StageFlowService();

  it("advances lobby into roleSelection", () => {
    expect(service.next({ current: Stage.lobby })).toBe(Stage.roleSelection);
  });

  it("loops discussionVote back to bet when not final", () => {
    expect(service.next({ current: Stage.discussionVote })).toBe(Stage.bet);
  });

  it("moves discussionVote to review when final", () => {
    expect(service.next({ current: Stage.discussionVote, isFinal: true })).toBe(Stage.review);
  });
});

describe("SettlementService", () => {
  const service = new SettlementService();

  it("deals gas damage to all alive players", () => {
    const result = service.settle(EnvironmentCard.gas, [], [
      { openId: "p1", hp: 4, isAlive: true },
      { openId: "p2", hp: 4, isAlive: true },
    ]);
    expect(result.settlementResult.damages).toHaveLength(2);
  });

  it("pass bet adds extra damage", () => {
    const result = service.settle(EnvironmentCard.none, [
      { openId: "p1", selectedAction: null, passedBet: true, submittedAt: new Date() },
    ], [{ openId: "p1", hp: 4, isAlive: true }]);
    expect(result.settlementResult.damages[0]?.damage).toBe(1);
  });

  it("endure clears base damage on self", () => {
    const result = service.settle(EnvironmentCard.gas, [
      { openId: "p1", selectedAction: ActionCard.endure, passedBet: false, submittedAt: new Date() },
      { openId: "p2", selectedAction: ActionCard.listen, passedBet: false, submittedAt: new Date() },
    ], [
      { openId: "p1", hp: 4, isAlive: true },
      { openId: "p2", hp: 4, isAlive: true },
    ]);
    expect(result.settlementResult.damages.find((item) => item.openId === "p1")).toBeUndefined();
    expect(result.settlementResult.damages.find((item) => item.openId === "p2")?.damage).toBe(1);
  });
});

describe("WinnerJudgementService", () => {
  const service = new WinnerJudgementService();

  it("returns draw when everyone is eliminated", () => {
    const result = service.judge({ aliveByRole: {}, currentRound: 2, allEliminated: true });
    expect(result.winnerResult?.winnerCamp).toBe(WinnerCamp.draw);
  });

  it("returns fatter victory when passengers are not more than fatters", () => {
    const result = service.judge({ aliveByRole: { passenger: 2, fatter: 2 }, currentRound: 2 });
    expect(result.winnerResult?.winnerCamp).toBe(WinnerCamp.fatter);
  });

  it("returns passenger victory at round eight with majority", () => {
    const result = service.judge({ aliveByRole: { passenger: 3, fatter: 1 }, currentRound: 8 });
    expect(result.winnerResult?.winnerCamp).toBe(WinnerCamp.passenger);
  });
});
