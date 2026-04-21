/// <reference types="jest" />
//
// Environment-card focused tests.
//
// Covers the environment-card behaviour described in `docs/规则以及相关数据.md`:
//   有屁 (gas)        - 对全员造成 1 点伤害
//   无屁 (no_gas)     - 无伤害
//   有臭屁 (smelly_gas) - 对所有玩家造成 2 点伤害
//   有闷屁 (stuffy_gas) - 对所有押牌玩家 1 点，对所有空压玩家 3 点
//
// Tests target both the SettlementService (pure damage rules) and the Room
// aggregate (reveal flow + roundKind classification).
//
import { Room } from "../domain/aggregates/Room";
import { Stage } from "../domain/types";
import { SettlementService } from "../domain/services/SettlementService";
import { EnvironmentDeckService } from "../domain/services/EnvironmentDeckService";

const OWNER = "owner-open-id";
const RULE_SET = "classic_v1";
const DECK_TMPL = "classic_pool_v1";
const REQ = (k: string) => `req-${k}`;

function makeRoomAtBet(playerCount = 5, seed = "env-test-seed"): Room {
  const room = Room.create({
    requestId: REQ("create"),
    ownerOpenId: OWNER,
    ruleSetCode: RULE_SET,
    deckTemplateCode: DECK_TMPL,
  });
  for (let i = 1; i <= playerCount - 1; i++) {
    room.joinRoom({
      requestId: REQ(`join-${i}`),
      roomId: room.id,
      openId: `player-${i}`,
      nickname: `P${i}`,
      avatar: "",
    });
  }
  room.startGame({ requestId: REQ("start"), roomId: room.id, openId: OWNER, seed });
  for (const p of room.snapshot().match!.players) {
    room.confirmRoleSelection({
      requestId: REQ(`role-${p.openId}`),
      roomId: room.id,
      openId: p.openId,
      roleCode: p.roleOptions[0]!,
    });
  }
  room.advanceStage({ requestId: REQ("prep-bet"), roomId: room.id, openId: OWNER });
  return room;
}

// ────────────────────────────────────────────────────────────────────────────
// SettlementService – environment-card damage rules
// ────────────────────────────────────────────────────────────────────────────
describe("Environment cards – SettlementService damage rules", () => {
  const service = new SettlementService();
  const players = [
    { openId: "p1", seatNo: 1, currentHp: 4, isAlive: true },
    { openId: "p2", seatNo: 2, currentHp: 4, isAlive: true },
    { openId: "p3", seatNo: 3, currentHp: 4, isAlive: true },
  ];

  it("gas: deals 1 damage to every alive player", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "gas",
      actionSubmissions: [],
      players,
    });
    expect(result.damages).toHaveLength(3);
    for (const p of players) {
      const total = result.damages
        .filter((d) => d.openId === p.openId)
        .reduce((s, d) => s + d.damage, 0);
      expect(total).toBe(1);
    }
  });

  it("no_gas: no damage at all", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "no_gas",
      actionSubmissions: [],
      players,
    });
    expect(result.damages).toHaveLength(0);
    expect(result.eliminated).toHaveLength(0);
  });

  it("smelly_gas: deals 2 damage to every alive player", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "smelly_gas",
      actionSubmissions: [],
      players,
    });
    for (const p of players) {
      const total = result.damages
        .filter((d) => d.openId === p.openId)
        .reduce((s, d) => s + d.damage, 0);
      expect(total).toBe(2);
    }
  });

  it("stuffy_gas: 1 damage to bettors, 3 damage to non-bettors", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "stuffy_gas",
      actionSubmissions: [
        // p1 bet endure-equivalent action (any submission counts as "押牌")
        {
          openId: "p1",
          cardInstanceId: "p1-card-0",
          actionCardCode: "listen",
          sequence: 1,
          sourceStage: Stage.bet,
          isLocked: true,
        },
      ],
      players,
    });
    const p1Env = result.damages
      .filter((d) => d.openId === "p1" && d.reason === "stuffy_gas")
      .reduce((s, d) => s + d.damage, 0);
    const p2Env = result.damages
      .filter((d) => d.openId === "p2" && d.reason === "stuffy_gas")
      .reduce((s, d) => s + d.damage, 0);
    const p3Env = result.damages
      .filter((d) => d.openId === "p3" && d.reason === "stuffy_gas")
      .reduce((s, d) => s + d.damage, 0);
    expect(p1Env).toBe(1);
    expect(p2Env).toBe(3);
    expect(p3Env).toBe(3);
  });

  it("gas: dead players take no damage", () => {
    const mixed = [
      { openId: "p1", seatNo: 1, currentHp: 4, isAlive: true },
      { openId: "p2", seatNo: 2, currentHp: 0, isAlive: false },
    ];
    const result = service.settle({
      floor: 1,
      environmentCardCode: "gas",
      actionSubmissions: [],
      players: mixed,
    });
    expect(result.damages.find((d) => d.openId === "p2")).toBeUndefined();
    expect(result.damages.find((d) => d.openId === "p1")?.damage).toBe(1);
  });

  it("smelly_gas: eliminates a player whose hp drops to 0", () => {
    const result = service.settle({
      floor: 1,
      environmentCardCode: "smelly_gas",
      actionSubmissions: [],
      players: [{ openId: "p1", seatNo: 1, currentHp: 2, isAlive: true }],
    });
    expect(result.eliminated).toEqual(["p1"]);
  });

  it("stuffy_gas + endure: bettor with endure takes 0 ordinary damage", () => {
    // 押牌-忍 防御本回合所有伤害
    const result = service.settle({
      floor: 1,
      environmentCardCode: "stuffy_gas",
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
      players,
    });
    expect(result.damages.find((d) => d.openId === "p1")).toBeUndefined();
    // non-bettors still take 3
    expect(result.damages.find((d) => d.openId === "p2")?.damage).toBe(3);
    expect(result.damages.find((d) => d.openId === "p3")?.damage).toBe(3);
  });

  it("gas + suck: suck bettor takes 1 (env) + 1 (suck) self-damage", () => {
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
      players,
    });
    const p1Total = result.damages
      .filter((d) => d.openId === "p1")
      .reduce((s, d) => s + d.damage, 0);
    expect(p1Total).toBe(2);
  });

  it("no_gas: action cards only triggered by gas rounds deal no damage", () => {
    // blow / grab / suck only deal damage in gas rounds per implementation
    const result = service.settle({
      floor: 1,
      environmentCardCode: "no_gas",
      actionSubmissions: [
        { openId: "p1", cardInstanceId: "p1-c", actionCardCode: "blow", sequence: 1, sourceStage: Stage.bet, isLocked: true },
        { openId: "p2", cardInstanceId: "p2-c", actionCardCode: "grab", sequence: 1, sourceStage: Stage.bet, isLocked: true, targetOpenId: "p3" },
        { openId: "p3", cardInstanceId: "p3-c", actionCardCode: "suck", sequence: 1, sourceStage: Stage.bet, isLocked: true },
      ],
      players,
    });
    expect(result.damages).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Room aggregate – revealEnvironment & roundKind classification
// ────────────────────────────────────────────────────────────────────────────
describe("Environment cards – Room.revealEnvironment", () => {
  it("rejects reveal outside environment stage", () => {
    const room = makeRoomAtBet();
    expect(() =>
      room.revealEnvironment({ requestId: REQ("env-bad"), roomId: room.id, ownerOpenId: OWNER })
    ).toThrow(/environment stage/i);
  });

  it("rejects reveal from a non-owner", () => {
    const room = makeRoomAtBet();
    room.advanceStage({ requestId: REQ("bet-env"), roomId: room.id, openId: OWNER });
    expect(() =>
      room.revealEnvironment({ requestId: REQ("env-bad-owner"), roomId: room.id, ownerOpenId: "player-1" })
    ).toThrow(/owner/i);
  });

  it("reveals the deck card at currentFloor and emits EnvironmentRevealed", () => {
    const room = makeRoomAtBet();
    const expectedCode = room.snapshot().match!.deck.find((d) => d.position === 1)!.environmentCardCode;
    room.advanceStage({ requestId: REQ("bet-env"), roomId: room.id, openId: OWNER });
    room.clearEvents();
    room.revealEnvironment({ requestId: REQ("env-1"), roomId: room.id, ownerOpenId: OWNER });

    const round = room.snapshot().match!.rounds.find((r) => r.floor === 1)!;
    expect(round.environmentCardCode).toBe(expectedCode);

    const evt = room.events.find((e) => e.name === "EnvironmentRevealed");
    expect(evt).toBeDefined();
    if (evt?.name === "EnvironmentRevealed") {
      expect(evt.environmentCard).toBe(expectedCode);
      expect(evt.floor).toBe(1);
    }
  });

  it("classifies gas / smelly_gas / stuffy_gas as roundKind=gas; no_gas as safe", () => {
    // Reveal the first floor's environment with several seeds; whatever card
    // shows up must be classified correctly. Across enough seeds we cover all
    // four card codes.
    const observed = new Set<string>();
    for (const seed of ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9", "k10"]) {
      const room = makeRoomAtBet(5, seed);
      room.advanceStage({ requestId: REQ(`bet-env-${seed}`), roomId: room.id, openId: OWNER });
      room.revealEnvironment({ requestId: REQ(`env-${seed}`), roomId: room.id, ownerOpenId: OWNER });
      const round = room.snapshot().match!.rounds.find((r) => r.floor === 1)!;
      const code = round.environmentCardCode!;
      observed.add(code);
      const expected: "gas" | "safe" = code === "no_gas" ? "safe" : "gas";
      expect(round.roundKind).toBe(expected);
    }
    // Sanity: at least gas and no_gas should both have appeared across 10 seeds.
    expect(observed.has("gas")).toBe(true);
    expect(observed.has("no_gas")).toBe(true);
  });

  it("is idempotent for the same requestId", () => {
    const room = makeRoomAtBet();
    room.advanceStage({ requestId: REQ("bet-env"), roomId: room.id, openId: OWNER });
    room.revealEnvironment({ requestId: REQ("env-once"), roomId: room.id, ownerOpenId: OWNER });
    const v1 = room.snapshot().version;
    room.revealEnvironment({ requestId: REQ("env-once"), roomId: room.id, ownerOpenId: OWNER });
    const v2 = room.snapshot().version;
    expect(v2).toBe(v1);
  });

  it("rejects advanceStage after the game has ended", () => {
    // Walk floors with nobody submitting any action: each gas round damages
    // all alive players, so within a few gas rounds everyone dies and
    // WinnerJudgement returns isFinal=true. Then any further advanceStage
    // must throw instead of silently re-running winner judgement.
    const room = makeRoomAtBet(5, "end-guard-seed");
    let safety = 0;
    while (room.snapshot().gameState !== "end" && safety++ < 50) {
      const stage = room.snapshot().currentStage;
      if (stage === Stage.environment) {
        room.revealEnvironment({ requestId: REQ(`env-${safety}`), roomId: room.id, ownerOpenId: OWNER });
      }
      try {
        room.advanceStage({ requestId: REQ(`adv-${safety}`), roomId: room.id, openId: OWNER });
      } catch {
        break;
      }
    }
    expect(room.snapshot().gameState).toBe("end");
    expect(() =>
      room.advanceStage({ requestId: REQ("adv-after-end"), roomId: room.id, openId: OWNER }),
    ).toThrow(/already ended/i);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// EnvironmentDeckService – pool composition
// ────────────────────────────────────────────────────────────────────────────
describe("Environment cards – EnvironmentDeckService pool composition", () => {
  const service = new EnvironmentDeckService();

  it("contains exactly 3 gas cards regardless of seed", () => {
    for (const seed of ["s1", "s2", "s3", "abc", "xyz"]) {
      const deck = service.generate({ ruleSetCode: RULE_SET, deckTemplateCode: DECK_TMPL, seed });
      const gasCount = deck.filter((d) => d.environmentCardCode === "gas").length;
      expect(gasCount).toBe(3);
    }
  });

  it("contains exactly 4 no_gas cards regardless of seed", () => {
    for (const seed of ["s1", "s2", "s3", "abc", "xyz"]) {
      const deck = service.generate({ ruleSetCode: RULE_SET, deckTemplateCode: DECK_TMPL, seed });
      const noGasCount = deck.filter((d) => d.environmentCardCode === "no_gas").length;
      expect(noGasCount).toBe(4);
    }
  });

  it("contains exactly one of (smelly_gas, stuffy_gas) — the other is removed", () => {
    for (const seed of ["s1", "s2", "s3", "abc", "xyz"]) {
      const deck = service.generate({ ruleSetCode: RULE_SET, deckTemplateCode: DECK_TMPL, seed });
      const optionals = deck.filter(
        (d) => d.environmentCardCode === "smelly_gas" || d.environmentCardCode === "stuffy_gas"
      );
      expect(optionals).toHaveLength(1);
    }
  });
});
