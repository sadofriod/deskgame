// Unit tests for domain services

import { DealService } from "../domain/services/DealService";
import { EnvironmentDeckService, DEFAULT_ENV_CONFIG } from "../domain/services/EnvironmentDeckService";
import { StageFlowService } from "../domain/services/StageFlowService";
import { SettlementService } from "../domain/services/SettlementService";
import { WinnerJudgementService } from "../domain/services/WinnerJudgementService";
import { ActionCard, EnvironmentCard, Role, Stage, WinnerCamp } from "../domain/types";

// ──────────────────────────────────────────────
// DealService
// ──────────────────────────────────────────────

describe("DealService", () => {
  const svc = new DealService();
  const players = ["p1", "p2", "p3", "p4", "p5"];

  it("assigns a role to every player", () => {
    const result = svc.deal({ players, roleConfig: "independent", seed: "s1" });
    expect(result).toHaveLength(players.length);
    expect(result.every((r) => r.role)).toBe(true);
  });

  it("is deterministic: same seed produces same result", () => {
    const a = svc.deal({ players, roleConfig: "independent", seed: "s1" });
    const b = svc.deal({ players, roleConfig: "independent", seed: "s1" });
    expect(a).toEqual(b);
  });

  it("produces different results for different seeds", () => {
    const a = svc.deal({ players, roleConfig: "independent", seed: "s1" });
    const b = svc.deal({ players, roleConfig: "independent", seed: "s2" });
    const different = a.some((item, i) => item.openId !== b[i]?.openId || item.role !== b[i]?.role);
    expect(different).toBe(true);
  });

  it("independent mode assigns fatter1 role", () => {
    const result = svc.deal({ players, roleConfig: "independent", seed: "s1" });
    expect(result.some((r) => r.role === Role.fatter1)).toBe(true);
  });

  it("faction mode assigns fatter role (not fatter1/fatter2)", () => {
    const result = svc.deal({ players, roleConfig: "faction", seed: "s1" });
    expect(result.some((r) => r.role === Role.fatter)).toBe(true);
    expect(result.every((r) => r.role !== Role.fatter1)).toBe(true);
  });
});

// ──────────────────────────────────────────────
// EnvironmentDeckService
// ──────────────────────────────────────────────

describe("EnvironmentDeckService", () => {
  const svc = new EnvironmentDeckService();

  it("generates exactly 8 cards by default", () => {
    expect(svc.generate("seed1")).toHaveLength(8);
  });

  it("is deterministic", () => {
    expect(svc.generate("seed1")).toEqual(svc.generate("seed1"));
  });

  it("produces different decks for different seeds", () => {
    const a = svc.generate("seed1");
    const b = svc.generate("seed2");
    expect(a).not.toEqual(b);
  });

  it("cards come from the configured pool", () => {
    const deck = svc.generate("s", DEFAULT_ENV_CONFIG);
    const allowed = new Set(Object.values(EnvironmentCard));
    expect(deck.every((c) => allowed.has(c))).toBe(true);
  });
});

// ──────────────────────────────────────────────
// StageFlowService
// ──────────────────────────────────────────────

describe("StageFlowService", () => {
  const svc = new StageFlowService();

  it("advances night -> action", () => {
    expect(svc.next(Stage.night)).toBe(Stage.action);
  });

  it("advances vote -> night (wrap around)", () => {
    expect(svc.next(Stage.vote)).toBe(Stage.night);
  });

  it("validates legal transition", () => {
    expect(svc.isValidTransition(Stage.night, Stage.action)).toBe(true);
  });

  it("rejects illegal backward transition", () => {
    expect(svc.isValidTransition(Stage.action, Stage.night)).toBe(false);
  });

  it("throws on unknown stage", () => {
    // @ts-expect-error intentional
    expect(() => svc.next("unknown")).toThrow();
  });
});

// ──────────────────────────────────────────────
// SettlementService
// ──────────────────────────────────────────────

describe("SettlementService", () => {
  const svc = new SettlementService();

  const alivePlayers = (ids: string[]) =>
    ids.map((openId) => ({ openId, hp: 4, isAlive: true }));

  it("deals 1 damage to all alive players on gas turn", () => {
    const players = alivePlayers(["p1", "p2", "p3"]);
    const result = svc.settle(EnvironmentCard.gas, [], players);
    expect(result.damages).toHaveLength(3);
    expect(result.damages.every((d) => d.damage === 1)).toBe(true);
  });

  it("deals 2 damage on stink turn", () => {
    const players = alivePlayers(["p1"]);
    const result = svc.settle(EnvironmentCard.stink, [], players);
    expect(result.damages[0].damage).toBe(2);
  });

  it("deals no damage on none turn", () => {
    const players = alivePlayers(["p1", "p2"]);
    const result = svc.settle(EnvironmentCard.none, [], players);
    expect(result.damages).toHaveLength(0);
  });

  it("endure prevents gas damage", () => {
    const players = alivePlayers(["p1", "p2"]);
    const subs = [
      { openId: "p1", actionCard: ActionCard.endure, submittedAt: new Date() },
    ];
    const result = svc.settle(EnvironmentCard.gas, subs, players);
    expect(result.damages.find((d) => d.openId === "p1")).toBeUndefined();
    expect(result.damages.find((d) => d.openId === "p2")?.damage).toBe(1);
  });

  it("marks elimination when damage >= hp", () => {
    const players = [{ openId: "p1", hp: 1, isAlive: true }];
    const result = svc.settle(EnvironmentCard.gas, [], players);
    expect(result.eliminated).toContain("p1");
  });

  it("suck adds 1 extra damage to self on gas turn", () => {
    const players = alivePlayers(["p1"]);
    const subs = [{ openId: "p1", actionCard: ActionCard.suck, submittedAt: new Date() }];
    const result = svc.settle(EnvironmentCard.gas, subs, players);
    const p1Dmg = result.damages.find((d) => d.openId === "p1")?.damage ?? 0;
    expect(p1Dmg).toBe(2); // 1 env + 1 extra
  });
});

// ──────────────────────────────────────────────
// WinnerJudgementService
// ──────────────────────────────────────────────

describe("WinnerJudgementService", () => {
  const svc = new WinnerJudgementService();

  it("passengers win when all fatters eliminated", () => {
    const result = svc.judge({ aliveByRole: { passenger: 3 }, currentFloor: 4 });
    expect(result.isFinal).toBe(true);
    expect(result.winnerResult?.winnerCamp).toBe(WinnerCamp.passenger);
  });

  it("fatters win when passengers cleared", () => {
    const result = svc.judge({ aliveByRole: { fatter: 2 }, currentFloor: 4 });
    expect(result.isFinal).toBe(true);
    expect(result.winnerResult?.winnerCamp).toBe(WinnerCamp.fatter);
  });

  it("fatters win when alive passengers <= alive fatters", () => {
    const result = svc.judge({ aliveByRole: { passenger: 2, fatter: 2 }, currentFloor: 4 });
    expect(result.isFinal).toBe(true);
    expect(result.winnerResult?.winnerCamp).toBe(WinnerCamp.fatter);
  });

  it("draw when no one alive", () => {
    const result = svc.judge({ aliveByRole: {}, currentFloor: 5 });
    expect(result.isFinal).toBe(true);
    expect(result.winnerResult?.winnerCamp).toBe(WinnerCamp.draw);
  });

  it("game continues when passengers > fatters and floor < 8", () => {
    const result = svc.judge({ aliveByRole: { passenger: 3, fatter: 1 }, currentFloor: 4 });
    expect(result.isFinal).toBe(false);
  });

  it("passengers win at floor 8 end with majority", () => {
    const result = svc.judge({ aliveByRole: { passenger: 3, fatter: 1 }, currentFloor: 8 });
    expect(result.isFinal).toBe(true);
    expect(result.winnerResult?.winnerCamp).toBe(WinnerCamp.passenger);
  });
});
