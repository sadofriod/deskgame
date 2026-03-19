/// <reference types="jest" />

import { Room } from "../domain/aggregates/Room";
import { ActionCard, GameState, Role, Stage } from "../domain/types";

const OWNER = "owner-open-id";
const REQ = (index: number) => `req-${index}`;

function makeRoom() {
  return Room.create({
    requestId: REQ(0),
    ownerOpenId: OWNER,
    roomConfig: { playerCount: 5, roleConfig: "independent" },
  });
}

function addPlayers(room: Room, count: number) {
  for (let index = 1; index <= count; index++) {
    room.joinRoom({
      requestId: REQ(100 + index),
      roomId: room.id,
      openId: `player-${index}`,
      nickname: `Player ${index}`,
      avatar: "",
    });
  }
}

function pickRole(roleOptions: Role[], requireFatter: boolean): Role {
  if (requireFatter) {
    return roleOptions.find((role) => role !== Role.passenger) ?? roleOptions[0]!;
  }
  return roleOptions.find((role) => role === Role.passenger) ?? roleOptions[0]!;
}

function roomAtBetStage(): Room {
  const room = makeRoom();
  addPlayers(room, 4);
  const playerIds = room.snapshot().players.map((player) => player.openId);
  for (const openId of playerIds) {
    room.setReady({ requestId: `ready-${openId}`, roomId: room.id, openId, ready: true });
  }

  const snapshot = room.snapshot();
  snapshot.players.forEach((player, index) => {
    room.confirmRoleSelection({
      requestId: `role-${player.openId}`,
      roomId: room.id,
      openId: player.openId,
      roleId: pickRole(player.candidateRoles, index === 0),
    });
  });
  return room;
}

function roomAtDiscussionVote(): Room {
  const room = roomAtBetStage();
  const players = room.snapshot().players.filter((player) => player.isAlive);
  for (const player of players) {
    room.submitBet({
      requestId: `bet-${player.openId}`,
      roomId: room.id,
      openId: player.openId,
      selectedAction: ActionCard.listen,
    });
  }
  room.advanceStage({ requestId: REQ(500), roomId: room.id, openId: OWNER });
  room.advanceStage({ requestId: REQ(501), roomId: room.id, openId: OWNER });
  room.advanceStage({ requestId: REQ(502), roomId: room.id, openId: OWNER });
  room.clearEvents();
  return room;
}

describe("Room boundary flow", () => {
  it("creates room in lobby with owner already present", () => {
    const room = makeRoom();
    const snapshot = room.snapshot();
    expect(snapshot.gameState).toBe(GameState.wait);
    expect(snapshot.currentRound).toBe(0);
    expect(snapshot.currentStage).toBe(Stage.lobby);
    expect(snapshot.playerCount).toBe(1);
    expect(snapshot.roomCode).toMatch(/^\d{6}$/);
  });

  it("joins player with sequential seat number", () => {
    const room = makeRoom();
    room.clearEvents();
    room.joinRoom({ requestId: REQ(1), roomId: room.id, openId: "p1", nickname: "P1", avatar: "" });
    const event = room.events.find((item) => item.name === "PlayerJoinedRoom");
    expect(event?.name).toBe("PlayerJoinedRoom");
    if (event?.name === "PlayerJoinedRoom") {
      expect(event.seatNo).toBe(2);
      expect(event.playerCount).toBe(2);
    }
  });

  it("only owner can update room config in lobby", () => {
    const room = makeRoom();
    expect(() =>
      room.updateRoomConfig({
        requestId: REQ(2),
        roomId: room.id,
        openId: "player-1",
        roomConfig: { playerCount: 6, roleConfig: "faction" },
      })
    ).toThrow("owner");

    room.updateRoomConfig({
      requestId: REQ(3),
      roomId: room.id,
      openId: OWNER,
      roomConfig: { playerCount: 6, roleConfig: "faction" },
    });
    expect(room.snapshot().roomConfig.playerCount).toBe(6);
  });

  it("enters roleSelection after all configured players are ready", () => {
    const room = makeRoom();
    addPlayers(room, 4);
    room.clearEvents();
    for (const player of room.snapshot().players) {
      room.setReady({ requestId: `ready-${player.openId}`, roomId: room.id, openId: player.openId, ready: true });
    }
    const snapshot = room.snapshot();
    expect(snapshot.gameState).toBe(GameState.selecting);
    expect(snapshot.currentStage).toBe(Stage.roleSelection);
    expect(room.events.some((event) => event.name === "RoleSelectionStarted")).toBe(true);
  });

  it("enters bet stage after all players confirm role selection", () => {
    const room = roomAtBetStage();
    const snapshot = room.snapshot();
    expect(snapshot.gameState).toBe(GameState.playing);
    expect(snapshot.currentRound).toBe(1);
    expect(snapshot.currentStage).toBe(Stage.bet);
    expect(room.events.some((event) => event.name === "RoleSelectionCompleted")).toBe(true);
  });

  it("submits bet idempotently", () => {
    const room = roomAtBetStage();
    room.clearEvents();
    room.submitBet({ requestId: "dup-bet", roomId: room.id, openId: OWNER, selectedAction: ActionCard.listen });
    room.submitBet({ requestId: "dup-bet", roomId: room.id, openId: OWNER, selectedAction: ActionCard.listen });
    expect(room.events.filter((event) => event.name === "BetSubmitted")).toHaveLength(1);
  });

  it("blocks vote before discussionVote stage", () => {
    const room = roomAtBetStage();
    expect(() =>
      room.submitVote({ requestId: REQ(4), roomId: room.id, openId: OWNER, voteTarget: "player-1" })
    ).toThrow("discussionVote");
  });

  it("allows vote in discussionVote stage", () => {
    const room = roomAtDiscussionVote();
    const voters = room.snapshot().players.filter((player) => player.isAlive);
    room.submitVote({
      requestId: REQ(5),
      roomId: room.id,
      openId: voters[0]!.openId,
      voteTarget: voters[1]!.openId,
    });
    expect(room.events.some((event) => event.name === "VoteSubmitted")).toBe(true);
  });

  it("reveals environment when advancing bet to action", () => {
    const room = roomAtBetStage();
    for (const player of room.snapshot().players.filter((item) => item.isAlive)) {
      room.submitBet({
        requestId: `advance-bet-${player.openId}`,
        roomId: room.id,
        openId: player.openId,
        selectedAction: ActionCard.listen,
      });
    }
    room.clearEvents();
    room.advanceStage({ requestId: REQ(6), roomId: room.id, openId: OWNER });
    expect(room.events.some((event) => event.name === "EnvironmentRevealed")).toBe(true);
    expect(room.snapshot().currentStage).toBe(Stage.action);
  });

  it("settles round when advancing action to settlement", () => {
    const room = roomAtBetStage();
    for (const player of room.snapshot().players.filter((item) => item.isAlive)) {
      room.submitBet({
        requestId: `settle-bet-${player.openId}`,
        roomId: room.id,
        openId: player.openId,
        selectedAction: ActionCard.listen,
      });
    }
    room.advanceStage({ requestId: REQ(7), roomId: room.id, openId: OWNER });
    room.clearEvents();
    room.advanceStage({ requestId: REQ(8), roomId: room.id, openId: OWNER });
    expect(room.events.some((event) => event.name === "RoundSettled")).toBe(true);
    expect(room.snapshot().currentStage).toBe(Stage.settlement);
  });

  it("returns to bet stage and increments round after discussionVote", () => {
    const room = roomAtDiscussionVote();
    const voters = room.snapshot().players.filter((player) => player.isAlive);
    const target = voters.find((player) => player.openId !== OWNER) ?? voters[0]!;
    for (const voter of voters) {
      room.submitVote({
        requestId: `vote-${voter.openId}`,
        roomId: room.id,
        openId: voter.openId,
        voteTarget: target.openId,
      });
    }
    room.advanceStage({ requestId: REQ(9), roomId: room.id, openId: OWNER });
    expect(room.snapshot().currentRound).toBe(2);
    expect(room.snapshot().currentStage).toBe(Stage.bet);
  });
});
