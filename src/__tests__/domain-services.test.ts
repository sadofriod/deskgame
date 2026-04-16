/// <reference types="jest" />

import { DealService } from "../domain/services/DealService";
import { EnvironmentDeckService } from "../domain/services/EnvironmentDeckService";
import { SettlementService } from "../domain/services/SettlementService";
import { StageFlowService } from "../domain/services/StageFlowService";
import { WinnerJudgementService } from "../domain/services/WinnerJudgementService";
import { Camp, Stage } from "../domain/types";

describe("DealService", () => {
  const service = new DealService();

  it("assigns identities to all players", () => {
    const result = service.deal({ players: ["p1", "p2", "p3", "p4", "p5"], playerCount: 5, seed: "s1" });
    expect(result).toHaveLength(5);
    expect(result.every((r) => r.identityCode === "passenger" || r.identityCode === "fatter")).toBe(true);
  });

  it("assigns correct distribution for 5 players (3 passenger, 2 fatter)", () => {
    const result = service.deal({ players: ["p1", "p2", "p3", "p4", "p5"], playerCount: 5, seed: "s1" });
    const passengers = result.filter((r) => r.identityCode === "passenger").length;
    const fatters = result.filter((r) => r.identityCode === "fatter").length;
    expect(passengers).toBe(3);
    expect(fatters).toBe(2);
  });

  it("gives each player 2 roleOptions", () => {
    const result = service.deal({ players: ["p1", "p2", "p3", "p4", "p5"], playerCount: 5, seed: "s1" });
    expect(result.every((r) => r.roleOptions.length === 2)).toBe(true);
  });

  it("gives each player at least 1 initial hand card", () => {
    const result = service.deal({ players: ["p1", "p2", "p3", "p4", "p5"], playerCount: 5, seed: "s1" });
    expect(result.every((r) => r.initialHandCards.length >= 1)).toBe(true);
  });

  it("is deterministic for the same seed", () => {
    const input = { players: ["p1", "p2", "p3", "p4", "p5"], playerCount: 5 as const, seed: "s1" };
    expect(service.deal(input)).toEqual(service.deal(input));
  });

  it("produces different results for different seeds", () => {
    const players = ["p1", "p2", "p3", "p4", "p5"];
    const r1 = service.deal({ players, playerCount: 5, seed: "seed-A" });
    const r2 = service.deal({ players, playerCount: 5, seed: "seed-B" });
    const identities1 = r1.map((r) => r.identityCode).join(",");
    const identities2 = r2.map((r) => r.identityCode).join(",");
    // At least one should differ (highly likely with different seeds)
    const rolesAreSame = identities1 === identities2 &&
      r1.every((r, i) => r.roleOptions.join(",") === r2[i]!.roleOptions.join(","));
    expect(rolesAreSame).toBe(false);
  });

  it("assigns correct distribution for 10 players (7 passenger, 3 fatter)", () => {
    const players = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const result = service.deal({ players, playerCount: 10, seed: "s2" });
    const passengers = result.filter((r) => r.identityCode === "passenger").length;
    const fatters = result.filter((r) => r.identityCode === "fatter").length;
    expect(passengers).toBe(7);
    expect(fatters).toBe(3);
  });
});

describe("EnvironmentDeckService", () => {
  const service = new EnvironmentDeckService();

  it("generates 8 deck entries", () => {
    const deck = service.generate({ ruleSetCode: "classic_v1", deckTemplateCode: "classic_pool_v1", seed: "s1" });
    expect(deck).toHaveLength(8);
  });

  it("positions are 1-8", () => {
    const deck = service.generate({ ruleSetCode: "classic_v1", deckTemplateCode: "classic_pool_v1", seed: "s1" });
    const positions = deck.map((d) => d.position).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("only uses valid card codes", () => {
    const deck = service.generate({ ruleSetCode: "classic_v1", deckTemplateCode: "classic_pool_v1", seed: "s2" });
    const validCodes = new Set(["gas", "no_gas", "smelly_gas", "stuffy_gas"]);
    expect(deck.every((d) => validCodes.has(d.environmentCardCode))).toBe(true);
  });

  it("is deterministic for the same seed", () => {
    const input = { ruleSetCode: "classic_v1", deckTemplateCode: "classic_pool_v1", seed: "det-seed" };
    expect(service.generate(input)).toEqual(service.generate(input));
  });

  it("pool of 9 minus 1 optional = 8 cards", () => {
    // gas×3, no_gas×4, smelly_gas or stuffy_gas (one removed) → 8
    const deck = service.generate({ ruleSetCode: "classic_v1", deckTemplateCode: "classic_pool_v1", seed: "test" });
    expect(deck).toHaveLength(8);
  });
});

describe("StageFlowService", () => {
  const service = new StageFlowService();

  it("preparation → bet", () => {
    expect(service.next({ currentStage: Stage.preparation })).toBe(Stage.bet);
  });

  it("bet → environment", () => {
    expect(service.next({ currentStage: Stage.bet })).toBe(Stage.environment);
  });

  it("environment → action", () => {
    expect(service.next({ currentStage: Stage.environment })).toBe(Stage.action);
  });

  it("action → damage", () => {
    expect(service.next({ currentStage: Stage.action })).toBe(Stage.damage);
  });

  it("damage → talk", () => {
    expect(service.next({ currentStage: Stage.damage })).toBe(Stage.talk);
  });

  it("talk → vote", () => {
    expect(service.next({ currentStage: Stage.talk })).toBe(Stage.vote);
  });

  it("vote → settlement (no tie)", () => {
    expect(service.next({ currentStage: Stage.vote })).toBe(Stage.settlement);
  });

  it("vote → tieBreak (tie)", () => {
    expect(service.next({ currentStage: Stage.vote, isTieVote: true })).toBe(Stage.tieBreak);
  });

  it("tieBreak → vote", () => {
    expect(service.next({ currentStage: Stage.tieBreak })).toBe(Stage.vote);
  });

  it("settlement → preparation (not final)", () => {
    expect(service.next({ currentStage: Stage.settlement })).toBe(Stage.preparation);
  });

  it("settlement → settlement (final)", () => {
    expect(service.next({ currentStage: Stage.settlement, isFinal: true })).toBe(Stage.settlement);
  });
});

describe("SettlementService", () => {
  const service = new SettlementService();

  it("deals 1 gas damage to all alive players", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "gas",
      actionSubmissions: [],
      players: [
        { openId: "p1", currentHp: 4, isAlive: true },
        { openId: "p2", currentHp: 4, isAlive: true },
      ],
    });
    expect(result.damages).toHaveLength(2);
    expect(result.damages.every((d) => d.damage === 1)).toBe(true);
  });

  it("deals 2 damage on smelly_gas", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "smelly_gas",
      actionSubmissions: [],
      players: [{ openId: "p1", currentHp: 4, isAlive: true }],
    });
    expect(result.damages[0]?.damage).toBe(2);
  });

  it("endure blocks all damage to self", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "gas",
      actionSubmissions: [
        {
          openId: "p1",
          cardInstanceId: "p1-card-0",
          actionCardCode: "endure",
          sequence: 1,
          sourceStage: Stage.bet,
          isLocked: true,
        },
      ],
      players: [
        { openId: "p1", currentHp: 4, isAlive: true },
        { openId: "p2", currentHp: 4, isAlive: true },
      ],
    });
    expect(result.damages.find((d) => d.openId === "p1")).toBeUndefined();
    expect(result.damages.find((d) => d.openId === "p2")?.damage).toBe(1);
  });

  it("eliminates player when hp drops to 0", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "smelly_gas",
      actionSubmissions: [],
      players: [{ openId: "p1", currentHp: 2, isAlive: true }],
    });
    expect(result.eliminated).toContain("p1");
  });

  it("suck on gas round adds +1 damage to self", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "gas",
      actionSubmissions: [
        {
          openId: "p1",
          cardInstanceId: "p1-card-0",
          actionCardCode: "suck",
          sequence: 1,
          sourceStage: Stage.bet,
          isLocked: true,
        },
      ],
      players: [{ openId: "p1", currentHp: 4, isAlive: true }],
    });
    expect(result.damages.find((d) => d.openId === "p1")?.damage).toBe(2); // 1 base + 1 suck
  });

  it("no damage on no_gas round", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "no_gas",
      actionSubmissions: [],
      players: [{ openId: "p1", currentHp: 4, isAlive: true }],
    });
    expect(result.damages).toHaveLength(0);
  });
});

describe("WinnerJudgementService", () => {
  const service = new WinnerJudgementService();

  it("fatter wins when passengers <= fatters", () => {
    const result = service.judge({ aliveByCamp: { passenger: 2, fatter: 2 }, currentFloor: 3, resolvedGasRounds: 0 });
    expect(result.winnerCamp).toBe(Camp.fatter);
    expect(result.isFinal).toBe(true);
  });

  it("fatter wins when all players eliminated", () => {
    const result = service.judge({ aliveByCamp: { passenger: 0, fatter: 0 }, currentFloor: 3, resolvedGasRounds: 0 });
    expect(result.winnerCamp).toBe(Camp.fatter);
    expect(result.isFinal).toBe(true);
  });

  it("fatter wins when resolvedGasRounds >= 4", () => {
    const result = service.judge({ aliveByCamp: { passenger: 3, fatter: 1 }, currentFloor: 3, resolvedGasRounds: 4 });
    expect(result.winnerCamp).toBe(Camp.fatter);
    expect(result.isFinal).toBe(true);
  });

  it("passengers win at floor 8 when they outnumber fatters", () => {
    const result = service.judge({ aliveByCamp: { passenger: 3, fatter: 1 }, currentFloor: 8, resolvedGasRounds: 0 });
    expect(result.winnerCamp).toBe(Camp.passenger);
    expect(result.isFinal).toBe(true);
  });

  it("returns no winner in mid-game when passengers dominate", () => {
    const result = service.judge({ aliveByCamp: { passenger: 4, fatter: 1 }, currentFloor: 3, resolvedGasRounds: 1 });
    expect(result.winnerCamp).toBeNull();
    expect(result.isFinal).toBe(false);
  });
});
