import { uuidv4 } from "../../utils/uuid";
import { Player, PlayerState } from "../entities/Player";
import {
  BetSubmitted,
  DomainEvent,
  EnvironmentRevealed,
  PlayerEliminated,
  PlayerJoinedRoom,
  PlayerReadyStateChanged,
  PlayerRemovedFromRoom,
  RoleSelectionCompleted,
  RoleSelectionStarted,
  RoomConfigUpdated,
  RoomCreated,
  RoundSettled,
  StageAdvanced,
  VoteResolved,
  VoteSubmitted,
  WinnerDecided,
} from "../events";
import { DealService } from "../services/DealService";
import { EnvironmentDeckService } from "../services/EnvironmentDeckService";
import { SettlementService } from "../services/SettlementService";
import { StageFlowService } from "../services/StageFlowService";
import { WinnerJudgementService } from "../services/WinnerJudgementService";
import {
  ActionCard,
  EnvironmentCard,
  GameState,
  Role,
  RoomConfig,
  Round,
  Stage,
  VoteResult,
  WinnerResult,
} from "../types";

export interface CreateRoomCommand {
  requestId: string;
  ownerOpenId: string;
  roomConfig: RoomConfig;
}

export interface JoinRoomCommand {
  requestId: string;
  roomId: string;
  openId: string;
  nickname: string;
  avatar: string;
}

export interface LeaveRoomCommand {
  requestId: string;
  roomId: string;
  openId: string;
}

export interface UpdateRoomConfigCommand {
  requestId: string;
  roomId: string;
  openId: string;
  roomConfig: RoomConfig;
}

export interface SetReadyCommand {
  requestId: string;
  roomId: string;
  openId: string;
  ready: boolean;
}

export interface ConfirmRoleSelectionCommand {
  requestId: string;
  roomId: string;
  openId: string;
  roleId: Role;
}

export interface SubmitBetCommand {
  requestId: string;
  roomId: string;
  openId: string;
  selectedAction?: ActionCard;
  passedBet?: boolean;
}

export interface SubmitVoteCommand {
  requestId: string;
  roomId: string;
  openId: string;
  voteTarget: string;
}

export interface AdvanceStageCommand {
  requestId: string;
  roomId: string;
  openId?: string;
  timeoutFlag?: boolean;
}

export interface RoomSnapshot {
  roomId: string;
  roomCode: string;
  ownerOpenId: string;
  gameState: GameState;
  playerCount: number;
  roomConfig: RoomConfig;
  currentRound: number;
  currentStage: Stage;
  envDeck: EnvironmentCard[];
  version: number;
  players: PlayerState[];
  rounds: Round[];
  winnerResult: WinnerResult | null;
}

function buildInitialRound(round: number): Round {
  return {
    round,
    environmentCard: null,
    betSubmissions: [],
    actionLogs: [],
    voteSubmissions: [],
    voteResult: null,
    settlementResult: null,
    revoteCount: 0,
  };
}

function cloneRound(round: Round): Round {
  return {
    ...round,
    betSubmissions: round.betSubmissions.map((item) => ({ ...item })),
    actionLogs: round.actionLogs.map((item) => ({ ...item, targetOpenIds: [...item.targetOpenIds] })),
    voteSubmissions: round.voteSubmissions.map((item) => ({ ...item })),
    voteResult: round.voteResult ? { ...round.voteResult, tieTargets: [...round.voteResult.tieTargets] } : null,
    settlementResult: round.settlementResult
      ? {
          damages: round.settlementResult.damages.map((item) => ({ ...item })),
          heals: round.settlementResult.heals.map((item) => ({ ...item })),
          eliminated: [...round.settlementResult.eliminated],
        }
      : null,
  };
}

function generateRoomCode(): string {
  return uuidv4().replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
}

export class Room {
  private roomId: string;
  private roomCode: string;
  private ownerOpenId: string;
  private gameState: GameState;
  private playerCount: number;
  private roomConfig: RoomConfig;
  private currentRoundNumber: number;
  private currentStage: Stage;
  private envDeck: EnvironmentCard[];
  private version: number;
  private players: Map<string, Player>;
  private rounds: Round[];
  private winnerResult: WinnerResult | null;
  private processedRequests: Set<string>;
  private readonly dealService = new DealService();
  private readonly envDeckService = new EnvironmentDeckService();
  private readonly stageFlowService = new StageFlowService();
  private readonly settlementService = new SettlementService();
  private readonly winnerJudgementService = new WinnerJudgementService();
  private readonly _events: DomainEvent[] = [];

  private constructor(roomId: string) {
    this.roomId = roomId;
    this.roomCode = "";
    this.ownerOpenId = "";
    this.gameState = GameState.wait;
    this.playerCount = 0;
    this.roomConfig = { playerCount: 5, roleConfig: "independent" };
    this.currentRoundNumber = 0;
    this.currentStage = Stage.lobby;
    this.envDeck = [];
    this.version = 0;
    this.players = new Map();
    this.rounds = [];
    this.winnerResult = null;
    this.processedRequests = new Set();
  }

  static create(cmd: CreateRoomCommand): Room {
    if (!cmd.requestId) throw new Error("requestId is required");
    if (!cmd.ownerOpenId) throw new Error("ownerOpenId is required");
    Room.validateRoomConfig(cmd.roomConfig);

    const room = new Room(uuidv4());
    room.roomCode = generateRoomCode();
    room.ownerOpenId = cmd.ownerOpenId;
    room.roomConfig = { ...cmd.roomConfig };
    room.version = 1;
    room.processedRequests.add(cmd.requestId);
    room.addPlayer({ openId: cmd.ownerOpenId, nickname: "", avatar: "" });

    const event: RoomCreated = {
      name: "RoomCreated",
      roomId: room.roomId,
      roomCode: room.roomCode,
      ownerOpenId: room.ownerOpenId,
      gameState: room.gameState,
      currentRound: room.currentRoundNumber,
      currentStage: room.currentStage,
      version: room.version,
    };
    room._events.push(event);
    return room;
  }

  static restore(snapshot: RoomSnapshot): Room {
    const room = new Room(snapshot.roomId);
    room.roomCode = snapshot.roomCode;
    room.ownerOpenId = snapshot.ownerOpenId;
    room.gameState = snapshot.gameState;
    room.playerCount = snapshot.playerCount;
    room.roomConfig = { ...snapshot.roomConfig };
    room.currentRoundNumber = snapshot.currentRound;
    room.currentStage = snapshot.currentStage;
    room.envDeck = [...snapshot.envDeck];
    room.version = snapshot.version;
    room.rounds = snapshot.rounds.map(cloneRound);
    room.winnerResult = snapshot.winnerResult;
    for (const playerState of snapshot.players) {
      room.players.set(playerState.openId, Player.restore(playerState));
    }
    return room;
  }

  get id(): string {
    return this.roomId;
  }

  get events(): DomainEvent[] {
    return [...this._events];
  }

  clearEvents(): void {
    this._events.length = 0;
  }

  snapshot(): RoomSnapshot {
    return {
      roomId: this.roomId,
      roomCode: this.roomCode,
      ownerOpenId: this.ownerOpenId,
      gameState: this.gameState,
      playerCount: this.playerCount,
      roomConfig: { ...this.roomConfig },
      currentRound: this.currentRoundNumber,
      currentStage: this.currentStage,
      envDeck: [...this.envDeck],
      version: this.version,
      players: [...this.players.values()].map((player) => player.toState()),
      rounds: this.rounds.map(cloneRound),
      winnerResult: this.winnerResult,
    };
  }

  joinRoom(cmd: JoinRoomCommand): void {
    this.assertLobbyState();
    if (this.players.has(cmd.openId)) {
      throw new Error(`Player ${cmd.openId} is already in the room`);
    }
    if (this.playerCount >= 10) {
      throw new Error("Cannot join: room is full (max 10 players)");
    }

    const seatNo = this.addPlayer({
      openId: cmd.openId,
      nickname: cmd.nickname,
      avatar: cmd.avatar,
    });
    this.version++;

    const event: PlayerJoinedRoom = {
      name: "PlayerJoinedRoom",
      roomId: this.roomId,
      openId: cmd.openId,
      seatNo,
      playerCount: this.playerCount,
      version: this.version,
    };
    this._events.push(event);
  }

  leaveRoom(cmd: LeaveRoomCommand): void {
    if (cmd.openId === this.ownerOpenId) {
      throw new Error("Owner cannot leave room directly");
    }
    const deleted = this.players.delete(cmd.openId);
    if (!deleted) {
      throw new Error(`Player ${cmd.openId} is not in the room`);
    }
    this.playerCount--;
    if (this.currentStage === Stage.lobby) {
      this.reseatPlayers();
    }
    this.version++;

    const event: PlayerRemovedFromRoom = {
      name: "PlayerRemovedFromRoom",
      roomId: this.roomId,
      openId: cmd.openId,
      playerCount: this.playerCount,
      version: this.version,
    };
    this._events.push(event);
  }

  updateRoomConfig(cmd: UpdateRoomConfigCommand): void {
    this.assertOwner(cmd.openId);
    this.assertLobbyState();
    Room.validateRoomConfig(cmd.roomConfig);
    this.roomConfig = { ...cmd.roomConfig };
    this.version++;

    const event: RoomConfigUpdated = {
      name: "RoomConfigUpdated",
      roomId: this.roomId,
      roomConfig: { ...this.roomConfig },
      version: this.version,
    };
    this._events.push(event);
  }

  setReady(cmd: SetReadyCommand): void {
    this.assertLobbyState();
    const player = this.requirePlayer(cmd.openId);
    player.setReady(cmd.ready);
    this.version++;

    const allReady = this.allPlayersReady();
    const event: PlayerReadyStateChanged = {
      name: "PlayerReadyStateChanged",
      roomId: this.roomId,
      openId: cmd.openId,
      ready: cmd.ready,
      allReady,
      version: this.version,
    };
    this._events.push(event);

    if (allReady) {
      this.startRoleSelection();
    }
  }

  confirmRoleSelection(cmd: ConfirmRoleSelectionCommand): void {
    if (this.currentStage !== Stage.roleSelection) {
      throw new Error("Cannot confirm role selection outside roleSelection stage");
    }
    const player = this.requirePlayer(cmd.openId);
    player.confirmRoleSelection(cmd.roleId);

    if (!this.allRolesSelected()) {
      return;
    }

    this.envDeck = this.envDeckService.generate(`${this.roomId}:env`);
    this.gameState = GameState.playing;
    this.currentRoundNumber = 1;
    this.currentStage = Stage.bet;
    this.rounds = [buildInitialRound(1)];
    for (const currentPlayer of this.players.values()) {
      currentPlayer.resetRoundState();
    }
    this.version++;

    const event: RoleSelectionCompleted = {
      name: "RoleSelectionCompleted",
      roomId: this.roomId,
      currentRound: this.currentRoundNumber,
      currentStage: Stage.bet,
      envDeck: [...this.envDeck],
      version: this.version,
    };
    this._events.push(event);
  }

  submitBet(cmd: SubmitBetCommand): void {
    if (this.currentStage !== Stage.bet) {
      throw new Error("Cannot submit bet: not in bet stage");
    }
    if (this.processedRequests.has(cmd.requestId)) {
      return;
    }

    const player = this.requirePlayer(cmd.openId);
    if (!player.isAlive) {
      throw new Error(`Player ${cmd.openId} is not alive`);
    }
    player.submitBet({
      selectedAction: cmd.selectedAction,
      passedBet: cmd.passedBet,
    });
    this.processedRequests.add(cmd.requestId);

    const round = this.currentRound();
    round.betSubmissions = round.betSubmissions.filter((item) => item.openId !== cmd.openId);
    round.betSubmissions.push({
      openId: cmd.openId,
      selectedAction: player.selectedAction,
      passedBet: player.passedBet,
      submittedAt: new Date(),
    });
    this.version++;

    const event: BetSubmitted = {
      name: "BetSubmitted",
      roomId: this.roomId,
      round: this.currentRoundNumber,
      openId: cmd.openId,
      passedBet: player.passedBet,
      selectedAction: player.selectedAction,
      version: this.version,
    };
    this._events.push(event);
  }

  submitVote(cmd: SubmitVoteCommand): void {
    if (this.currentStage !== Stage.discussionVote) {
      throw new Error("Cannot submit vote: not in discussionVote stage");
    }
    if (!cmd.voteTarget) {
      throw new Error("voteTarget is required");
    }

    const player = this.requirePlayer(cmd.openId);
    player.submitVote(cmd.voteTarget);

    const round = this.currentRound();
    round.voteSubmissions = round.voteSubmissions.filter((item) => item.openId !== cmd.openId);
    round.voteSubmissions.push({
      openId: cmd.openId,
      voteTarget: cmd.voteTarget,
      votePowerAtSubmit: player.votePower,
      submittedAt: new Date(),
    });
    this.version++;

    const event: VoteSubmitted = {
      name: "VoteSubmitted",
      roomId: this.roomId,
      round: this.currentRoundNumber,
      openId: cmd.openId,
      voteTarget: cmd.voteTarget,
      votePowerAtSubmit: player.votePower,
      version: this.version,
    };
    this._events.push(event);
  }

  advanceStage(cmd: AdvanceStageCommand): void {
    if (cmd.openId !== this.ownerOpenId && !cmd.timeoutFlag) {
      throw new Error("Only the room owner can advance the stage");
    }
    if (this.gameState === GameState.ended) {
      throw new Error("Game has already ended");
    }

    const previousStage = this.currentStage;

    if (previousStage === Stage.bet) {
      this.revealEnvironmentForCurrentRound();
    }

    if (previousStage === Stage.action) {
      this.runSettlement();
      if (this.checkWinner()) {
        this.emitStageAdvanced(previousStage, Stage.review);
        return;
      }
    }

    if (previousStage === Stage.discussionVote) {
      const resolution = this.resolveVotes();
      if (resolution.needRevote) {
        return;
      }
      if (this.checkWinner()) {
        this.emitStageAdvanced(previousStage, Stage.review);
        return;
      }
      if (this.currentRoundNumber < 8) {
        this.startNextRound();
        this.emitStageAdvanced(previousStage, Stage.bet);
        return;
      }
      this.checkWinner();
      this.emitStageAdvanced(previousStage, this.currentStage);
      return;
    }

    const nextStage = this.stageFlowService.next({ current: previousStage });
    this.currentStage = nextStage;
    this.version++;

    const event: StageAdvanced = {
      name: "StageAdvanced",
      roomId: this.roomId,
      previousStage,
      currentStage: nextStage,
      currentRound: this.currentRoundNumber,
      version: this.version,
    };
    this._events.push(event);
  }

  private emitStageAdvanced(previousStage: Stage, currentStage: Stage): void {
    this.currentStage = currentStage;
    this.version++;
    const event: StageAdvanced = {
      name: "StageAdvanced",
      roomId: this.roomId,
      previousStage,
      currentStage,
      currentRound: this.currentRoundNumber,
      version: this.version,
    };
    this._events.push(event);
  }

  private addPlayer(input: { openId: string; nickname: string; avatar: string }): number {
    const seatNo = this.playerCount + 1;
    this.players.set(
      input.openId,
      new Player({
        openId: input.openId,
        nickname: input.nickname,
        avatar: input.avatar,
        seatNo,
      })
    );
    this.playerCount++;
    return seatNo;
  }

  private assertOwner(openId: string): void {
    if (openId !== this.ownerOpenId) {
      throw new Error("Only the room owner can perform this operation");
    }
  }

  private assertLobbyState(): void {
    if (this.currentStage !== Stage.lobby || this.gameState !== GameState.wait) {
      throw new Error("Room can only be modified in lobby stage");
    }
  }

  private requirePlayer(openId: string): Player {
    const player = this.players.get(openId);
    if (!player) {
      throw new Error(`Player ${openId} not found`);
    }
    return player;
  }

  private allPlayersReady(): boolean {
    if (this.playerCount !== this.roomConfig.playerCount) {
      return false;
    }
    return [...this.players.values()].every((player) => player.isReady);
  }

  private startRoleSelection(): void {
    const assignments = this.dealService.deal({
      players: [...this.players.values()]
        .sort((left, right) => left.seatNo - right.seatNo)
        .map((player) => player.openId),
      roomConfig: this.roomConfig,
      seed: `${this.roomId}:roles`,
    });
    for (const assignment of assignments) {
      this.players.get(assignment.openId)?.setCandidateRoles(assignment.roles);
    }

    this.gameState = GameState.selecting;
    this.currentStage = Stage.roleSelection;
    this.version++;

    const event: RoleSelectionStarted = {
      name: "RoleSelectionStarted",
      roomId: this.roomId,
      candidateRoles: assignments,
      currentStage: Stage.roleSelection,
      version: this.version,
    };
    this._events.push(event);
  }

  private allRolesSelected(): boolean {
    return [...this.players.values()].every((player) => player.selectedRole !== null);
  }

  private currentRound(): Round {
    const round = this.rounds.find((item) => item.round === this.currentRoundNumber);
    if (!round) {
      throw new Error(`No round found for round ${this.currentRoundNumber}`);
    }
    return round;
  }

  private revealEnvironmentForCurrentRound(): void {
    const round = this.currentRound();
    if (round.environmentCard) {
      return;
    }
    const environmentCard = this.envDeck[this.currentRoundNumber - 1];
    if (!environmentCard) {
      throw new Error("No environment card available for current round");
    }
    round.environmentCard = environmentCard;
    this.version++;

    const event: EnvironmentRevealed = {
      name: "EnvironmentRevealed",
      roomId: this.roomId,
      round: this.currentRoundNumber,
      environmentCard,
      version: this.version,
    };
    this._events.push(event);
  }

  private runSettlement(): void {
    const round = this.currentRound();
    if (!round.environmentCard) {
      throw new Error("Cannot settle round before revealing environment");
    }
    if (round.settlementResult) {
      return;
    }

    const output = this.settlementService.settle(
      round.environmentCard,
      round.betSubmissions,
      [...this.players.values()].map((player) => ({
        openId: player.openId,
        hp: player.hp,
        isAlive: player.isAlive,
      }))
    );

    for (const record of output.settlementResult.damages) {
      this.players.get(record.openId)?.resolveDamage(record.damage);
    }
    for (const record of output.settlementResult.heals) {
      this.players.get(record.openId)?.applyHeal(record.heal);
    }
    for (const player of this.players.values()) {
      player.resolveRoundPermission();
    }

    round.actionLogs = output.actionLogs;
    round.settlementResult = output.settlementResult;
    this.version++;

    const event: RoundSettled = {
      name: "RoundSettled",
      roomId: this.roomId,
      round: this.currentRoundNumber,
      settlementResult: output.settlementResult,
      version: this.version,
    };
    this._events.push(event);

    for (const openId of output.settlementResult.eliminated) {
      this.version++;
      const eliminatedEvent: PlayerEliminated = {
        name: "PlayerEliminated",
        roomId: this.roomId,
        openId,
        round: this.currentRoundNumber,
        version: this.version,
      };
      this._events.push(eliminatedEvent);
    }
  }

  private resolveVotes(): { needRevote: boolean; voteResult: VoteResult } {
    const round = this.currentRound();
    const tally = new Map<string, number>();
    for (const submission of round.voteSubmissions) {
      tally.set(
        submission.voteTarget,
        (tally.get(submission.voteTarget) ?? 0) + submission.votePowerAtSubmit
      );
    }

    let maxVotes = 0;
    for (const value of tally.values()) {
      maxVotes = Math.max(maxVotes, value);
    }

    const tieTargets = [...tally.entries()]
      .filter(([, value]) => value === maxVotes)
      .map(([openId]) => openId);
    const isTie = tieTargets.length > 1;
    const needRevote = isTie && round.revoteCount === 0;
    const targetOpenId = isTie ? null : tieTargets[0] ?? null;

    const voteResult: VoteResult = {
      targetOpenId,
      votes: maxVotes,
      isTie,
      tieTargets: isTie ? tieTargets : [],
      needRevote,
    };
    round.voteResult = voteResult;
    if (needRevote) {
      round.revoteCount += 1;
      round.voteSubmissions = [];
    } else if (targetOpenId) {
      this.players.get(targetOpenId)?.eliminate();
    }

    this.version++;
    const event: VoteResolved = {
      name: "VoteResolved",
      roomId: this.roomId,
      round: this.currentRoundNumber,
      voteResult,
      version: this.version,
    };
    this._events.push(event);

    if (!needRevote && targetOpenId) {
      this.version++;
      const eliminatedEvent: PlayerEliminated = {
        name: "PlayerEliminated",
        roomId: this.roomId,
        openId: targetOpenId,
        round: this.currentRoundNumber,
        version: this.version,
      };
      this._events.push(eliminatedEvent);
    }

    return { needRevote, voteResult };
  }

  private startNextRound(): void {
    this.currentRoundNumber += 1;
    this.rounds.push(buildInitialRound(this.currentRoundNumber));
    for (const player of this.players.values()) {
      player.resetRoundState();
    }
  }

  private checkWinner(): boolean {
    if (this.gameState === GameState.ended) {
      return true;
    }

    const aliveByRole: Record<string, number> = {};
    let aliveCount = 0;
    for (const player of this.players.values()) {
      if (!player.isAlive) {
        continue;
      }
      aliveCount += 1;
      const role = player.selectedRole;
      if (!role) {
        continue;
      }
      aliveByRole[role] = (aliveByRole[role] ?? 0) + 1;
    }

    const result = this.winnerJudgementService.judge({
      aliveByRole,
      currentRound: this.currentRoundNumber,
      allEliminated: aliveCount === 0,
    });
    if (!result.isFinal || !result.winnerResult) {
      return false;
    }

    this.winnerResult = result.winnerResult;
    this.gameState = GameState.ended;
    this.currentStage = Stage.review;
    this.version++;

    const event: WinnerDecided = {
      name: "WinnerDecided",
      roomId: this.roomId,
      winnerCamp: result.winnerResult.winnerCamp,
      reason: result.winnerResult.reason,
      decidedAt: result.winnerResult.decidedAt,
      version: this.version,
    };
    this._events.push(event);
    return true;
  }

  private reseatPlayers(): void {
    [...this.players.values()]
      .sort((left, right) => left.seatNo - right.seatNo)
      .forEach((player, index) => player.setSeatNo(index + 1));
  }

  private static validateRoomConfig(roomConfig: RoomConfig): void {
    if (!roomConfig) {
      throw new Error("roomConfig is required");
    }
    if (roomConfig.playerCount < 5 || roomConfig.playerCount > 10) {
      throw new Error(`playerCount must be between 5 and 10, got ${roomConfig.playerCount}`);
    }
    if (!["independent", "faction"].includes(roomConfig.roleConfig)) {
      throw new Error(`Invalid roleConfig: ${roomConfig.roleConfig}`);
    }
  }
}
