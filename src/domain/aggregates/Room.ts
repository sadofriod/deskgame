// Room aggregate – docs/implements/01-room-aggregate-impl.md
// Authoritative game state: manages stage flow, validates commands, emits events.

import { uuidv4 } from "../../utils/uuid";
import { Player, PlayerState } from "../entities/Player";
import {
  ActionSubmitted,
  CardsDealt,
  DomainEvent,
  EnvironmentRevealed,
  PlayerEliminated,
  PlayerJoinedRoom,
  PlayerRemovedFromRoom,
  RoomCreated,
  RoundSettled,
  StageAdvanced,
  VoteResolved,
  VoteSubmitted,
  WinnerDecided,
} from "../events";
import { DealService, RoleConfig } from "../services/DealService";
import { DEFAULT_ENV_CONFIG, EnvironmentDeckService } from "../services/EnvironmentDeckService";
import { SettlementService } from "../services/SettlementService";
import { StageFlowService } from "../services/StageFlowService";
import { WinnerJudgementService } from "../services/WinnerJudgementService";
import {
  ActionCard,
  ActionSubmission,
  EnvironmentCard,
  GameState,
  Role,
  Round,
  Stage,
  VoteResult,
  VoteSubmission,
  WinnerResult,
} from "../types";

// ──────────────────────────────────────────────
// Command interfaces (Gateway -> Room)
// ──────────────────────────────────────────────

export interface CreateRoomCommand {
  requestId: string;
  ownerOpenId: string;
  roleConfig: RoleConfig;
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

export interface StartGameCommand {
  requestId: string;
  roomId: string;
  openId: string;
  seed: string;
}

export interface SubmitActionCommand {
  requestId: string;
  roomId: string;
  openId: string;
  actionCard: ActionCard;
}

export interface RevealEnvironmentCommand {
  requestId: string;
  roomId: string;
}

export interface SubmitVoteCommand {
  requestId: string;
  roomId: string;
  openId: string;
  voteTarget: string;
  votePowerAtSubmit: number;
}

export interface AdvanceStageCommand {
  requestId: string;
  roomId: string;
  openId: string;
  timeoutFlag?: boolean;
}

// ──────────────────────────────────────────────
// Room state snapshot
// ──────────────────────────────────────────────

export interface RoomSnapshot {
  roomId: string;
  ownerOpenId: string;
  gameState: GameState;
  playerCount: number;
  roleConfig: RoleConfig;
  currentFloor: number;
  currentStage: Stage;
  envDeck: EnvironmentCard[];
  version: number;
  players: PlayerState[];
  rounds: Round[];
  winnerResult: WinnerResult | null;
}

// ──────────────────────────────────────────────
// Room aggregate
// ──────────────────────────────────────────────

export class Room {
  private roomId: string;
  private ownerOpenId: string;
  private gameState: GameState;
  private playerCount: number;
  private roleConfig: RoleConfig;
  private currentFloor: number;
  private currentStage: Stage;
  private envDeck: EnvironmentCard[];
  private version: number;
  private players: Map<string, Player>;
  private rounds: Round[];
  private winnerResult: WinnerResult | null;

  // Idempotency: set of processed requestIds
  private processedRequests: Set<string>;

  // Domain services
  private readonly dealService = new DealService();
  private readonly envDeckService = new EnvironmentDeckService();
  private readonly stageFlowService = new StageFlowService();
  private readonly settlementService = new SettlementService();
  private readonly winnerJudgementService = new WinnerJudgementService();

  // Uncommitted events
  private readonly _events: DomainEvent[] = [];

  private constructor(roomId: string) {
    this.roomId = roomId;
    this.ownerOpenId = "";
    this.gameState = GameState.wait;
    this.playerCount = 0;
    this.roleConfig = "independent";
    this.currentFloor = 1;
    this.currentStage = Stage.night;
    this.envDeck = [];
    this.version = 0;
    this.players = new Map();
    this.rounds = [];
    this.winnerResult = null;
    this.processedRequests = new Set();
  }

  /** Factory: create a brand-new room. */
  static create(cmd: CreateRoomCommand): Room {
    if (!cmd.ownerOpenId) throw new Error("ownerOpenId is required");
    if (!cmd.roleConfig) throw new Error("roleConfig is required");
    if (!cmd.requestId) throw new Error("requestId is required");

    const roomId = uuidv4();
    const room = new Room(roomId);
    room.ownerOpenId = cmd.ownerOpenId;
    room.roleConfig = cmd.roleConfig;
    room.version = 1;
    room.processedRequests.add(cmd.requestId);

    const event: RoomCreated = {
      name: "RoomCreated",
      roomId,
      ownerOpenId: cmd.ownerOpenId,
      gameState: GameState.wait,
      currentFloor: 1,
      currentStage: Stage.night,
      version: room.version,
    };
    room._events.push(event);
    return room;
  }

  /** Factory: restore from persisted snapshot. */
  static restore(snapshot: RoomSnapshot): Room {
    const room = new Room(snapshot.roomId);
    room.roomId = snapshot.roomId;
    room.ownerOpenId = snapshot.ownerOpenId;
    room.gameState = snapshot.gameState;
    room.playerCount = snapshot.playerCount;
    room.roleConfig = snapshot.roleConfig;
    room.currentFloor = snapshot.currentFloor;
    room.currentStage = snapshot.currentStage;
    room.envDeck = [...snapshot.envDeck];
    room.version = snapshot.version;
    room.winnerResult = snapshot.winnerResult;
    room.rounds = snapshot.rounds.map((r) => ({ ...r }));
    for (const ps of snapshot.players) {
      room.players.set(ps.openId, Player.restore(ps));
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
      ownerOpenId: this.ownerOpenId,
      gameState: this.gameState,
      playerCount: this.playerCount,
      roleConfig: this.roleConfig,
      currentFloor: this.currentFloor,
      currentStage: this.currentStage,
      envDeck: [...this.envDeck],
      version: this.version,
      players: [...this.players.values()].map((p) => p.toState()),
      rounds: this.rounds.map((r) => ({ ...r })),
      winnerResult: this.winnerResult,
    };
  }

  // ──────────────────────────────────────────────
  // Commands
  // ──────────────────────────────────────────────

  joinRoom(cmd: JoinRoomCommand): void {
    if (this.gameState !== GameState.wait) {
      throw new Error("Cannot join: game has already started");
    }
    if (this.playerCount >= 10) {
      throw new Error("Cannot join: room is full (max 10 players)");
    }
    if (this.players.has(cmd.openId)) {
      throw new Error(`Player ${cmd.openId} is already in the room`);
    }

    const player = new Player({
      openId: cmd.openId,
      nickname: cmd.nickname,
      avatar: cmd.avatar,
    });
    this.players.set(cmd.openId, player);
    this.playerCount++;
    this.version++;

    const event: PlayerJoinedRoom = {
      name: "PlayerJoinedRoom",
      roomId: this.roomId,
      openId: cmd.openId,
      playerCount: this.playerCount,
      version: this.version,
    };
    this._events.push(event);
  }

  leaveRoom(cmd: LeaveRoomCommand): void {
    if (!this.players.has(cmd.openId)) {
      throw new Error(`Player ${cmd.openId} is not in the room`);
    }
    this.players.delete(cmd.openId);
    this.playerCount--;
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

  startGame(cmd: StartGameCommand): void {
    if (cmd.openId !== this.ownerOpenId) {
      throw new Error("Only the room owner can start the game");
    }
    if (this.playerCount < 5 || this.playerCount > 10) {
      throw new Error(`Player count must be 5-10, got ${this.playerCount}`);
    }

    const playerIds = [...this.players.keys()];

    // Deal roles
    const assignments = this.dealService.deal({
      players: playerIds,
      roleConfig: this.roleConfig,
      seed: cmd.seed,
    });
    for (const { openId, role } of assignments) {
      this.players.get(openId)!.assignRole(role);
    }

    // Generate environment deck
    this.envDeck = this.envDeckService.generate(cmd.seed);

    this.gameState = GameState.start;
    this.currentStage = Stage.night;
    this.currentFloor = 1;
    this.version++;

    // Initialise first round
    this.rounds.push({
      floor: 1,
      environmentCard: null,
      actionSubmissions: [],
      voteSubmissions: [],
      settlementResult: null,
    });

    const event: CardsDealt = {
      name: "CardsDealt",
      roomId: this.roomId,
      envDeck: [...this.envDeck],
      roles: assignments,
      version: this.version,
    };
    this._events.push(event);
  }

  submitAction(cmd: SubmitActionCommand): void {
    if (this.currentStage !== Stage.action) {
      throw new Error("Cannot submit action: not in action stage");
    }
    if (!cmd.actionCard) {
      throw new Error("actionCard is required");
    }
    const player = this.players.get(cmd.openId);
    if (!player) throw new Error(`Player ${cmd.openId} not found`);
    if (!player.isAlive) {
      throw new Error(`Player ${cmd.openId} is not alive`);
    }

    // Idempotency by requestId
    if (this.processedRequests.has(cmd.requestId)) {
      return; // already processed
    }
    this.processedRequests.add(cmd.requestId);

    player.submitAction(cmd.actionCard);
    this.version++;

    const currentRound = this.currentRound();
    currentRound.actionSubmissions.push({
      openId: cmd.openId,
      actionCard: cmd.actionCard,
      submittedAt: new Date(),
    });

    const event: ActionSubmitted = {
      name: "ActionSubmitted",
      roomId: this.roomId,
      openId: cmd.openId,
      actionCard: cmd.actionCard,
      version: this.version,
    };
    this._events.push(event);
  }

  revealEnvironment(cmd: RevealEnvironmentCommand): void {
    if (this.currentStage !== Stage.env) {
      throw new Error("Cannot reveal environment: not in env stage");
    }

    const envCard = this.envDeck[this.currentFloor - 1];
    if (!envCard) throw new Error("No environment card for current floor");

    this.version++;
    const round = this.currentRound();
    round.environmentCard = envCard;

    const event: EnvironmentRevealed = {
      name: "EnvironmentRevealed",
      roomId: this.roomId,
      floor: this.currentFloor,
      environmentCard: envCard,
      version: this.version,
    };
    this._events.push(event);
  }

  submitVote(cmd: SubmitVoteCommand): void {
    if (this.currentStage !== Stage.vote) {
      throw new Error("Cannot submit vote: not in vote stage");
    }
    if (!cmd.voteTarget) throw new Error("voteTarget is required");

    const player = this.players.get(cmd.openId);
    if (!player) throw new Error(`Player ${cmd.openId} not found`);
    if (!player.isAlive) {
      throw new Error(`Player ${cmd.openId} is not alive`);
    }

    player.submitVote(cmd.voteTarget);
    this.version++;

    const round = this.currentRound();
    round.voteSubmissions.push({
      openId: cmd.openId,
      voteTarget: cmd.voteTarget,
      votePowerAtSubmit: cmd.votePowerAtSubmit,
      submittedAt: new Date(),
    });

    const event: VoteSubmitted = {
      name: "VoteSubmitted",
      roomId: this.roomId,
      openId: cmd.openId,
      voteTarget: cmd.voteTarget,
      votePowerAtSubmit: cmd.votePowerAtSubmit,
      version: this.version,
    };
    this._events.push(event);
  }

  advanceStage(cmd: AdvanceStageCommand): void {
    if (cmd.openId !== this.ownerOpenId && !cmd.timeoutFlag) {
      throw new Error("Only the room owner can advance the stage");
    }

    const previousStage = this.currentStage;
    const nextStage = this.stageFlowService.next(previousStage);

    // Run settlement when advancing into actionResolve or hurt
    if (
      nextStage === Stage.actionResolve ||
      nextStage === Stage.hurt
    ) {
      this.runSettlement();
    }

    // Resolve votes when advancing from vote -> night
    if (previousStage === Stage.vote) {
      this.resolveVotes();
    }

    // Advance floor after vote resolved (next stage = night wraps around)
    if (previousStage === Stage.vote) {
      this.currentFloor = Math.min(this.currentFloor + 1, 9);

      if (this.currentFloor <= 8) {
        // Start next round
        this.rounds.push({
          floor: this.currentFloor,
          environmentCard: null,
          actionSubmissions: [],
          voteSubmissions: [],
          settlementResult: null,
        });
        // Reset per-floor player state
        for (const player of this.players.values()) {
          player.resetFloor();
        }
      }
    }

    this.currentStage = nextStage;
    this.version++;

    const stageEvent: StageAdvanced = {
      name: "StageAdvanced",
      roomId: this.roomId,
      previousStage,
      currentStage: nextStage,
      currentFloor: this.currentFloor,
      version: this.version,
    };
    this._events.push(stageEvent);

    // Check winner after settlement or vote resolution
    this.checkWinner();
  }

  // ──────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────

  private currentRound(): Round {
    const round = this.rounds.find((r) => r.floor === this.currentFloor);
    if (!round) throw new Error(`No round found for floor ${this.currentFloor}`);
    return round;
  }

  private runSettlement(): void {
    const round = this.currentRound();
    if (!round.environmentCard) return; // env card not yet revealed
    if (round.settlementResult) return; // already settled

    const playerSnapshots = [...this.players.values()].map((p) => ({
      openId: p.openId,
      hp: p.hp,
      isAlive: p.isAlive,
    }));

    const result = this.settlementService.settle(
      round.environmentCard,
      round.actionSubmissions,
      playerSnapshots
    );

    // Apply damage to players
    for (const dmg of result.damages) {
      const player = this.players.get(dmg.openId);
      player?.resolveDamage(dmg.damage);
    }

    round.settlementResult = result;
    this.version++;

    const settledEvent: RoundSettled = {
      name: "RoundSettled",
      roomId: this.roomId,
      floor: this.currentFloor,
      settlementResult: result,
      version: this.version,
    };
    this._events.push(settledEvent);

    // Emit elimination events
    for (const openId of result.eliminated) {
      this.version++;
      const elimEvent: PlayerEliminated = {
        name: "PlayerEliminated",
        roomId: this.roomId,
        openId,
        floor: this.currentFloor,
        version: this.version,
      };
      this._events.push(elimEvent);
    }
  }

  private resolveVotes(): void {
    const round = this.currentRound();
    const voteSubs: VoteSubmission[] = round.voteSubmissions;

    const tally = new Map<string, number>();
    for (const sub of voteSubs) {
      tally.set(sub.voteTarget, (tally.get(sub.voteTarget) ?? 0) + sub.votePowerAtSubmit);
    }

    let maxVotes = 0;
    for (const v of tally.values()) {
      if (v > maxVotes) maxVotes = v;
    }

    const topTargets = [...tally.entries()]
      .filter(([, v]) => v === maxVotes)
      .map(([id]) => id);

    const isTie = topTargets.length > 1;
    const voteResult: VoteResult = {
      targetOpenId: isTie ? "" : topTargets[0] ?? "",
      votes: maxVotes,
      isTie,
      tieTargets: isTie ? topTargets : [],
    };

    this.version++;
    const event: VoteResolved = {
      name: "VoteResolved",
      roomId: this.roomId,
      floor: this.currentFloor,
      voteResult,
      version: this.version,
    };
    this._events.push(event);
  }

  private checkWinner(): void {
    if (this.gameState === GameState.end) return;

    const aliveByRole: Record<string, number> = {};
    for (const player of this.players.values()) {
      if (!player.isAlive) continue;
      const role = player.role ?? "unknown";
      aliveByRole[role] = (aliveByRole[role] ?? 0) + 1;
    }

    const result = this.winnerJudgementService.judge({
      aliveByRole,
      currentFloor: this.currentFloor,
    });

    if (result.isFinal && result.winnerResult) {
      this.winnerResult = result.winnerResult;
      this.gameState = GameState.end;
      this.currentFloor = 9;
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
    }
  }
}
