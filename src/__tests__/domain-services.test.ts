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

  it("gives each player exactly 4 initial hand cards (BUG-01 fix)", () => {
    const result = service.deal({ players: ["p1", "p2", "p3", "p4", "p5"], playerCount: 5, seed: "s1" });
    expect(result.every((r) => r.initialHandCards.length === 4)).toBe(true);
  });

  it("all 4 hand cards per player have unique cardInstanceIds", () => {
    const result = service.deal({ players: ["p1", "p2", "p3", "p4", "p5"], playerCount: 5, seed: "s1" });
    for (const assignment of result) {
      const ids = assignment.initialHandCards.map((c) => c.cardInstanceId);
      expect(new Set(ids).size).toBe(4);
    }
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
        { openId: "p1", seatNo: 1, currentHp: 4, isAlive: true },
        { openId: "p2", seatNo: 2, currentHp: 4, isAlive: true },
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
      players: [{ openId: "p1", seatNo: 1, currentHp: 4, isAlive: true }],
    });
    expect(result.damages[0]?.damage).toBe(2);
  });

  it("endure blocks all ordinary damage to self (BUG-04 fix)", () => {
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
        { openId: "p1", seatNo: 1, currentHp: 4, isAlive: true },
        { openId: "p2", seatNo: 2, currentHp: 4, isAlive: true },
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
      players: [{ openId: "p1", seatNo: 1, currentHp: 2, isAlive: true }],
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
      players: [{ openId: "p1", seatNo: 1, currentHp: 4, isAlive: true }],
    });
    // p1 takes 1 base gas + 1 suck = 2 total (may be split into separate records)
    const p1Total = result.damages.filter((d) => d.openId === "p1").reduce((s, d) => s + d.damage, 0);
    expect(p1Total).toBe(2); // 1 base + 1 suck
  });

  it("no damage on no_gas round", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "no_gas",
      actionSubmissions: [],
      players: [{ openId: "p1", seatNo: 1, currentHp: 4, isAlive: true }],
    });
    expect(result.damages).toHaveLength(0);
  });

  it("blow deals 1 ordinary damage to each adjacent alive player in gas round (BUG-02 fix)", () => {
    // Seats: p1(1) p2(2) p3(3) — p1 bets blow, p2 and p3 are adjacent
    const result = service.settle({
      floor: 1,
      environmentCardCode: "gas",
      actionSubmissions: [
        {
          openId: "p1",
          cardInstanceId: "p1-card-0",
          actionCardCode: "blow",
          sequence: 1,
          sourceStage: Stage.bet,
          isLocked: true,
        },
      ],
      players: [
        { openId: "p1", seatNo: 1, currentHp: 4, isAlive: true },
        { openId: "p2", seatNo: 2, currentHp: 4, isAlive: true },
        { openId: "p3", seatNo: 3, currentHp: 4, isAlive: true },
      ],
    });
    // p2 (right of p1) and p3 (left of p1 wrapping) each take blow damage
    const p2Total = result.damages.filter((d) => d.openId === "p2").reduce((s, d) => s + d.damage, 0);
    const p3Total = result.damages.filter((d) => d.openId === "p3").reduce((s, d) => s + d.damage, 0);
    const blowDamageForP2 = result.damages.find((d) => d.openId === "p2" && d.reason === "blow");
    const blowDamageForP3 = result.damages.find((d) => d.openId === "p3" && d.reason === "blow");
    expect(blowDamageForP2?.damage).toBe(1);
    expect(blowDamageForP3?.damage).toBe(1);
    // p1 must not take self-damage from blow
    const p1BlowDamage = result.damages.find((d) => d.openId === "p1" && d.reason === "blow");
    expect(p1BlowDamage).toBeUndefined();
  });

  it("blow does not deal damage in non-gas round", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "no_gas",
      actionSubmissions: [
        {
          openId: "p1",
          cardInstanceId: "p1-card-0",
          actionCardCode: "blow",
          sequence: 1,
          sourceStage: Stage.bet,
          isLocked: true,
        },
      ],
      players: [
        { openId: "p1", seatNo: 1, currentHp: 4, isAlive: true },
        { openId: "p2", seatNo: 2, currentHp: 4, isAlive: true },
      ],
    });
    expect(result.damages).toHaveLength(0);
  });

  it("grab deals 1 unblockable damage to target in gas round (BUG-03 fix)", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "gas",
      actionSubmissions: [
        {
          openId: "p1",
          cardInstanceId: "p1-card-0",
          actionCardCode: "grab",
          sequence: 1,
          sourceStage: Stage.bet,
          isLocked: true,
          targetOpenId: "p2",
        },
      ],
      players: [
        { openId: "p1", seatNo: 1, currentHp: 4, isAlive: true },
        { openId: "p2", seatNo: 2, currentHp: 4, isAlive: true },
      ],
    });
    const grabRecord = result.damages.find((d) => d.openId === "p2" && d.reason === "grab");
    expect(grabRecord?.damage).toBe(1);
    expect(grabRecord?.unblockable).toBe(true);
  });

  it("endure does not block unblockable grab damage (BUG-04 fix)", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "gas",
      actionSubmissions: [
        {
          openId: "p1",
          cardInstanceId: "p1-card-0",
          actionCardCode: "grab",
          sequence: 1,
          sourceStage: Stage.bet,
          isLocked: true,
          targetOpenId: "p2",
        },
        {
          openId: "p2",
          cardInstanceId: "p2-card-0",
          actionCardCode: "endure",
          sequence: 1,
          sourceStage: Stage.bet,
          isLocked: true,
        },
      ],
      players: [
        { openId: "p1", seatNo: 1, currentHp: 4, isAlive: true },
        { openId: "p2", seatNo: 2, currentHp: 4, isAlive: true },
      ],
    });
    // p2 has endure so ordinary gas damage is blocked, but grab's unblockable damage still applies
    const ordinaryForP2 = result.damages.filter((d) => d.openId === "p2" && !d.unblockable);
    const unblockableForP2 = result.damages.filter((d) => d.openId === "p2" && d.unblockable);
    expect(ordinaryForP2).toHaveLength(0);
    expect(unblockableForP2[0]?.damage).toBe(1);
  });

  it("scold grants voteModifier +0.5 in gas round (BUG-05 fix)", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "gas",
      actionSubmissions: [
        {
          openId: "p1",
          cardInstanceId: "p1-card-0",
          actionCardCode: "scold",
          sequence: 1,
          sourceStage: Stage.bet,
          isLocked: true,
        },
      ],
      players: [
        { openId: "p1", seatNo: 1, currentHp: 4, isAlive: true },
        { openId: "p2", seatNo: 2, currentHp: 4, isAlive: true },
      ],
    });
    const p1Modifier = result.voteModifiers.find((v) => v.openId === "p1");
    expect(p1Modifier?.modifier).toBe(0.5);
    // p2 did not bet scold so no modifier
    expect(result.voteModifiers.find((v) => v.openId === "p2")).toBeUndefined();
  });

  it("scold does not grant vote modifier in non-gas round", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "no_gas",
      actionSubmissions: [
        {
          openId: "p1",
          cardInstanceId: "p1-card-0",
          actionCardCode: "scold",
          sequence: 1,
          sourceStage: Stage.bet,
          isLocked: true,
        },
      ],
      players: [{ openId: "p1", seatNo: 1, currentHp: 4, isAlive: true }],
    });
    expect(result.voteModifiers).toHaveLength(0);
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
