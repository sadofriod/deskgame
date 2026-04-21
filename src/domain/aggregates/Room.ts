import { uuidv4 } from "../../utils/uuid";
import { MatchPlayer } from "../entities/Player";
import {
  ActionSubmitted,
  CardsDealt,
  DomainEvent,
  EnvironmentRevealed,
  PlayerJoinedRoom,
  PlayerRemovedFromRoom,
  RoleSelected,
  RoleSelectionCompleted,
  RoleSelectionStarted,
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
  ActionSubmission,
  Camp,
  DeckEntry,
  GameState,
  HandCard,
  MatchPlayerState,
  MatchState,
  RoomPlayerState,
  RoundState,
  Stage,
  VoteResult,
  WinnerResult,
} from "../types";

// ── Commands ──────────────────────────────────────────────────────────────────

export interface CreateRoomCommand {
  requestId: string;
  ownerOpenId: string;
  ruleSetCode: string;
  deckTemplateCode: string;
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

export interface ConfirmRoleSelectionCommand {
  requestId: string;
  roomId: string;
  openId: string;
  roleCode: string;
}

export interface SubmitActionCommand {
  requestId: string;
  roomId: string;
  openId: string;
  cardInstanceId: string;
  /** Target player for cards that require a target (e.g. `grab`). */
  targetOpenId?: string;
}

export interface RevealEnvironmentCommand {
  requestId: string;
  roomId: string;
  ownerOpenId?: string;
}

export interface SubmitVoteCommand {
  requestId: string;
  roomId: string;
  openId: string;
  voteRound: number;
  voteTarget: string | null;
  votePowerAtSubmit: number;
}

export interface AdvanceStageCommand {
  requestId: string;
  roomId: string;
  openId?: string;
  trigger?: "ownerCommand" | "timeout";
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

export interface RoomSnapshot {
  roomId: string;
  ownerOpenId: string;
  ruleSetCode: string;
  deckTemplateCode: string;
  gameState: GameState;
  playerCount: number;
  currentFloor: number;
  currentStage: Stage;
  currentMatchId: string | null;
  version: number;
  roomPlayers: RoomPlayerState[];
  match: MatchState | null;
}

export interface RoomPersistenceState {
  snapshot: RoomSnapshot;
  processedRequests: string[];
}

// ── Room aggregate ────────────────────────────────────────────────────────────

export class Room {
  private roomId: string;
  private ownerOpenId: string;
  private ruleSetCode: string;
  private deckTemplateCode: string;
  private gameState: GameState;
  private playerCount: number;
  private currentFloor: number;
  private currentStage: Stage;
  private currentMatchId: string | null;
  private version: number;
  private roomPlayers: RoomPlayerState[];
  private matchPlayers: Map<string, MatchPlayer>; // openId → MatchPlayer
  private deck: DeckEntry[];
  private rounds: RoundState[];
  private winnerResult: WinnerResult | null;
  private processedRequests: Set<string>;
  private readonly _events: DomainEvent[] = [];

  private readonly dealService = new DealService();
  private readonly envDeckService = new EnvironmentDeckService();
  private readonly stageFlowService = new StageFlowService();
  private readonly settlementService = new SettlementService();
  private readonly winnerJudgementService = new WinnerJudgementService();

  private constructor(roomId: string) {
    this.roomId = roomId;
    this.ownerOpenId = "";
    this.ruleSetCode = "";
    this.deckTemplateCode = "";
    this.gameState = GameState.wait;
    this.playerCount = 0;
    this.currentFloor = 1;
    this.currentStage = Stage.preparation;
    this.currentMatchId = null;
    this.version = 0;
    this.roomPlayers = [];
    this.matchPlayers = new Map();
    this.deck = [];
    this.rounds = [];
    this.winnerResult = null;
    this.processedRequests = new Set();
  }

  get id(): string {
    return this.roomId;
  }

  get events(): readonly DomainEvent[] {
    return this._events;
  }

  clearEvents(): void {
    this._events.length = 0;
  }

  // ── Factory ─────────────────────────────────────────────────────────────────

  static create(cmd: CreateRoomCommand): Room {
    if (!cmd.requestId) throw new Error("requestId is required");
    if (!cmd.ownerOpenId) throw new Error("ownerOpenId is required");
    if (!cmd.ruleSetCode) throw new Error("ruleSetCode is required");
    if (!cmd.deckTemplateCode) throw new Error("deckTemplateCode is required");

    const room = new Room(uuidv4());
    room.processedRequests.add(cmd.requestId);
    room.ownerOpenId = cmd.ownerOpenId;
    room.ruleSetCode = cmd.ruleSetCode;
    room.deckTemplateCode = cmd.deckTemplateCode;
    room.gameState = GameState.wait;
    room.currentFloor = 1;
    room.currentStage = Stage.preparation;
    room.playerCount = 1;
    room.version = 1;
    room.roomPlayers = [
      { openId: cmd.ownerOpenId, seatNo: 1, nickname: cmd.ownerOpenId, avatar: "", isReady: false, joinedAt: new Date() },
    ];

    room._events.push({
      name: "RoomCreated",
      roomId: room.roomId,
      version: room.version,
      ownerOpenId: room.ownerOpenId,
      gameState: room.gameState,
      currentFloor: room.currentFloor,
      currentStage: room.currentStage,
    } as RoomCreated);

    return room;
  }

  static restore(state: RoomPersistenceState): Room {
    const snap = state.snapshot;
    const room = new Room(snap.roomId);
    room.ownerOpenId = snap.ownerOpenId;
    room.ruleSetCode = snap.ruleSetCode;
    room.deckTemplateCode = snap.deckTemplateCode;
    room.gameState = snap.gameState;
    room.playerCount = snap.playerCount;
    room.currentFloor = snap.currentFloor;
    room.currentStage = snap.currentStage;
    room.currentMatchId = snap.currentMatchId;
    room.version = snap.version;
    room.roomPlayers = snap.roomPlayers.map((p) => ({
      ...p,
      joinedAt: p.joinedAt ?? new Date(),
    }));

    if (snap.match) {
      for (const ps of snap.match.players) {
        room.matchPlayers.set(ps.openId, new MatchPlayer(ps));
      }
      room.deck = snap.match.deck;
      room.rounds = snap.match.rounds;
      room.winnerResult = snap.match.winnerResult;
    }

    room.processedRequests = new Set(state.processedRequests);
    return room;
  }

  // ── Snapshot ─────────────────────────────────────────────────────────────────

  snapshot(): RoomSnapshot {
    const match: MatchState | null =
      this.currentMatchId
        ? {
            matchId: this.currentMatchId,
            players: [...this.matchPlayers.values()].map((p) => p.toState()),
            deck: this.deck,
            rounds: this.rounds.map((r) => ({ ...r, actionSubmissions: [...r.actionSubmissions], voteSubmissions: [...r.voteSubmissions] })),
            winnerResult: this.winnerResult,
          }
        : null;

    return {
      roomId: this.roomId,
      ownerOpenId: this.ownerOpenId,
      ruleSetCode: this.ruleSetCode,
      deckTemplateCode: this.deckTemplateCode,
      gameState: this.gameState,
      playerCount: this.playerCount,
      currentFloor: this.currentFloor,
      currentStage: this.currentStage,
      currentMatchId: this.currentMatchId,
      version: this.version,
      roomPlayers: [...this.roomPlayers],
      match,
    };
  }

  toPersistenceState(): RoomPersistenceState {
    return {
      snapshot: this.snapshot(),
      processedRequests: [...this.processedRequests],
    };
  }

  // ── Commands ──────────────────────────────────────────────────────────────────

  joinRoom(cmd: JoinRoomCommand): void {
    if (this.processedRequests.has(cmd.requestId)) return;
    if (this.gameState !== GameState.wait) throw new Error("Room is not in wait state");
    if (this.playerCount >= 10) throw new Error("Room is full (max 10 players)");
    if (this.roomPlayers.some((p) => p.openId === cmd.openId))
      throw new Error(`Player ${cmd.openId} already in room`);

    const seatNo = this.playerCount + 1;
    this.roomPlayers.push({ openId: cmd.openId, seatNo, nickname: cmd.nickname, avatar: cmd.avatar, isReady: false, joinedAt: new Date() });
    this.playerCount++;
    this.version++;
    this.processedRequests.add(cmd.requestId);

    this._events.push({
      name: "PlayerJoinedRoom",
      roomId: this.roomId,
      version: this.version,
      openId: cmd.openId,
      seatNo,
      playerCount: this.playerCount,
    } as PlayerJoinedRoom);
  }

  leaveRoom(cmd: LeaveRoomCommand): void {
    if (this.processedRequests.has(cmd.requestId)) return;
    const idx = this.roomPlayers.findIndex((p) => p.openId === cmd.openId);
    if (idx < 0) throw new Error(`Player ${cmd.openId} not in room`);

    this.roomPlayers.splice(idx, 1);
    // Re-assign seatNos
    this.roomPlayers.forEach((p, i) => { p.seatNo = i + 1; });
    this.playerCount--;
    this.version++;
    this.processedRequests.add(cmd.requestId);

    this._events.push({
      name: "PlayerRemovedFromRoom",
      roomId: this.roomId,
      version: this.version,
      openId: cmd.openId,
      playerCount: this.playerCount,
    } as PlayerRemovedFromRoom);
  }

  startGame(cmd: StartGameCommand): void {
    if (this.processedRequests.has(cmd.requestId)) return;
    if (cmd.openId !== this.ownerOpenId) throw new Error("Only owner can start game");
    if (this.gameState !== GameState.wait) throw new Error("Game already started");
    if (this.playerCount < 5) throw new Error("Need at least 5 players to start");
    if (this.playerCount > 10) throw new Error("Cannot have more than 10 players");

    const playerOpenIds = this.roomPlayers.map((p) => p.openId);
    const assignments = this.dealService.deal({
      players: playerOpenIds,
      playerCount: this.playerCount,
      seed: cmd.seed,
    });
    const deck = this.envDeckService.generate({
      ruleSetCode: this.ruleSetCode,
      deckTemplateCode: this.deckTemplateCode,
      seed: cmd.seed,
    });

    const matchId = uuidv4();
    this.currentMatchId = matchId;
    this.deck = deck;
    this.matchPlayers = new Map();

    for (const assignment of assignments) {
      const roomPlayer = this.roomPlayers.find((p) => p.openId === assignment.openId);
      const playerState: MatchPlayerState = {
        openId: assignment.openId,
        seatNo: roomPlayer?.seatNo ?? 1,
        identityCode: assignment.identityCode,
        chosenRoleCode: null,
        maxHp: null,
        currentHp: null,
        isAlive: true,
        canSpeak: true,
        canVote: true,
        voteModifier: 0,
        roleOptions: assignment.roleOptions,
        handCards: assignment.initialHandCards.map((c) => ({ ...c, consumed: false })),
        status: {},
      };
      this.matchPlayers.set(assignment.openId, new MatchPlayer(playerState));
    }

    // Create floor-1 Round shell
    this.rounds = [];
    this.rounds.push({
      floor: 1,
      environmentCardCode: null,
      roundKind: null,
      currentVoteRound: 1,
      actionSubmissions: [],
      voteSubmissions: [],
      settlementResult: null,
      voteResult: null,
    });

    this.gameState = GameState.start;
    this.currentFloor = 1;
    this.currentStage = Stage.preparation;
    this.winnerResult = null;
    this.version++;
    this.processedRequests.add(cmd.requestId);

    // BUG-11 fix: in 7+ player games fatter players can identify each other
    const fatterCanSeeEachOther = this.playerCount >= 7;

    this._events.push({
      name: "CardsDealt",
      roomId: this.roomId,
      version: this.version,
      matchId,
      currentFloor: this.currentFloor,
      currentStage: this.currentStage,
      fatterCanSeeEachOther,
      players: assignments.map((a) => ({
        openId: a.openId,
        identityCode: a.identityCode,
        roleOptions: a.roleOptions,
        initialHandCards: a.initialHandCards,
      })),
    } as CardsDealt);

    this._events.push({
      name: "RoleSelectionStarted",
      roomId: this.roomId,
      version: this.version,
      matchId,
      pendingPlayers: playerOpenIds,
    } as RoleSelectionStarted);
  }

  confirmRoleSelection(cmd: ConfirmRoleSelectionCommand): void {
    if (this.processedRequests.has(cmd.requestId)) return;
    if (this.currentStage !== Stage.preparation) throw new Error("Not in preparation stage");

    const player = this.matchPlayers.get(cmd.openId);
    if (!player) throw new Error(`Player ${cmd.openId} not in match`);
    if (player.state.chosenRoleCode !== null)
      throw new Error(`Player ${cmd.openId} already confirmed role`);
    if (!player.state.roleOptions.includes(cmd.roleCode))
      throw new Error(`roleCode "${cmd.roleCode}" not in player's roleOptions`);

    player.confirmRole(cmd.roleCode);
    this.version++;
    this.processedRequests.add(cmd.requestId);

    this._events.push({
      name: "RoleSelected",
      roomId: this.roomId,
      version: this.version,
      openId: cmd.openId,
      roleCode: cmd.roleCode,
    } as RoleSelected);

    // Check if all players confirmed
    const allConfirmed = [...this.matchPlayers.values()].every((p) => p.state.chosenRoleCode !== null);
    if (allConfirmed) {
      this._events.push({
        name: "RoleSelectionCompleted",
        roomId: this.roomId,
        version: this.version,
        matchId: this.currentMatchId!,
        currentFloor: this.currentFloor,
        currentStage: this.currentStage,
      } as RoleSelectionCompleted);
    }
  }

  submitAction(cmd: SubmitActionCommand): void {
    if (this.processedRequests.has(cmd.requestId)) return;
    if (this.currentStage !== Stage.bet) throw new Error("Not in bet stage");

    const player = this.matchPlayers.get(cmd.openId);
    if (!player) throw new Error(`Player ${cmd.openId} not in match`);
    if (!player.isAlive) throw new Error(`Player ${cmd.openId} is not alive`);

    const card = player.state.handCards.find(
      (c) => c.cardInstanceId === cmd.cardInstanceId && !c.consumed
    );
    if (!card) throw new Error(`Card ${cmd.cardInstanceId} not found or already consumed`);

    // Validate target for cards that require one (e.g. `grab`)
    const TARGETED_CARDS = new Set(["grab"]);
    if (TARGETED_CARDS.has(card.actionCardCode)) {
      if (!cmd.targetOpenId) {
        throw new Error(`Card "${card.actionCardCode}" requires a targetOpenId`);
      }
      if (cmd.targetOpenId === cmd.openId) {
        throw new Error(`Card "${card.actionCardCode}" cannot target the submitting player`);
      }
      const target = this.matchPlayers.get(cmd.targetOpenId);
      if (!target) {
        throw new Error(`targetOpenId "${cmd.targetOpenId}" is not a player in this match`);
      }
      if (!target.isAlive) {
        throw new Error(`targetOpenId "${cmd.targetOpenId}" is not alive`);
      }
    }

    const currentRound = this.getCurrentRound();
    if (!currentRound) throw new Error("No current round found");

    // Check if player already submitted in this round
    const existing = currentRound.actionSubmissions.find((s) => s.openId === cmd.openId);
    const sequence = existing ? existing.sequence + 1 : 1;

    const submission: ActionSubmission = {
      openId: cmd.openId,
      cardInstanceId: cmd.cardInstanceId,
      actionCardCode: card.actionCardCode,
      sequence,
      sourceStage: Stage.bet,
      isLocked: true,
      targetOpenId: cmd.targetOpenId,
    };
    currentRound.actionSubmissions.push(submission);
    player.consumeCard(cmd.cardInstanceId);
    this.version++;
    this.processedRequests.add(cmd.requestId);

    this._events.push({
      name: "ActionSubmitted",
      roomId: this.roomId,
      version: this.version,
      floor: this.currentFloor,
      openId: cmd.openId,
      sequence: submission.sequence,
      sourceStage: Stage.bet,
    } as ActionSubmitted);
  }

  revealEnvironment(cmd: RevealEnvironmentCommand): void {
    if (this.processedRequests.has(cmd.requestId)) return;
    if (this.currentStage !== Stage.environment) throw new Error("Not in environment stage");
    if (cmd.ownerOpenId !== undefined && cmd.ownerOpenId !== this.ownerOpenId)
      throw new Error("Only owner can reveal environment");

    const deckEntry = this.deck.find((d) => d.position === this.currentFloor);
    if (!deckEntry) throw new Error(`No deck entry at position ${this.currentFloor}`);

    const currentRound = this.getCurrentRound();
    if (!currentRound) throw new Error("No current round");

    const code = deckEntry.environmentCardCode;
    const gasCards = new Set(["gas", "smelly_gas", "stuffy_gas"]);
    const roundKind = gasCards.has(code) ? "gas" : "safe";
    currentRound.environmentCardCode = code;
    currentRound.roundKind = roundKind as "gas" | "safe";

    this.version++;
    this.processedRequests.add(cmd.requestId);

    this._events.push({
      name: "EnvironmentRevealed",
      roomId: this.roomId,
      version: this.version,
      floor: this.currentFloor,
      environmentCard: code,
      roundKind,
    } as EnvironmentRevealed);
  }

  submitVote(cmd: SubmitVoteCommand): void {
    if (this.processedRequests.has(cmd.requestId)) return;
    if (this.currentStage !== Stage.vote && this.currentStage !== Stage.tieBreak)
      throw new Error("Not in vote stage");

    const player = this.matchPlayers.get(cmd.openId);
    if (!player) throw new Error(`Player ${cmd.openId} not in match`);
    if (!player.canVote) throw new Error(`Player ${cmd.openId} cannot vote`);

    const currentRound = this.getCurrentRound();
    if (!currentRound) throw new Error("No current round");
    if (cmd.voteRound !== currentRound.currentVoteRound)
      throw new Error(`voteRound mismatch: expected ${currentRound.currentVoteRound}, got ${cmd.voteRound}`);

    // BUG-05 fix: scold bettors in a gas round cannot abstain
    const betSubmission = currentRound.actionSubmissions.find((s) => s.openId === cmd.openId);
    if (
      cmd.voteTarget === null &&
      betSubmission?.actionCardCode === "scold" &&
      currentRound.roundKind === "gas"
    ) {
      throw new Error(
        `Player ${cmd.openId} must vote for a target: players who bet scold in a gas round cannot abstain`
      );
    }

    // BUG-08 fix: validate votePowerAtSubmit against server-computed vote power
    const expectedVotePower = 1 + player.state.voteModifier;
    if (cmd.votePowerAtSubmit !== expectedVotePower) {
      throw new Error(
        `INVALID_VOTE_POWER: expected ${expectedVotePower}, got ${cmd.votePowerAtSubmit}`
      );
    }

    currentRound.voteSubmissions.push({
      voteRound: cmd.voteRound,
      voterOpenId: cmd.openId,
      targetOpenId: cmd.voteTarget,
      votePowerAtSubmit: cmd.votePowerAtSubmit,
    });
    this.version++;
    this.processedRequests.add(cmd.requestId);

    this._events.push({
      name: "VoteSubmitted",
      roomId: this.roomId,
      version: this.version,
      floor: this.currentFloor,
      voteRound: cmd.voteRound,
      openId: cmd.openId,
      votePowerAtSubmit: cmd.votePowerAtSubmit,
    } as VoteSubmitted);
  }

  advanceStage(cmd: AdvanceStageCommand): void {
    if (this.processedRequests.has(cmd.requestId)) return;
    const isTimeout = cmd.trigger === "timeout";
    if (!isTimeout && cmd.openId !== this.ownerOpenId)
      throw new Error("Only owner can advance stage");

    const fromStage = this.currentStage;

    // Validate preparation→bet: all players must have confirmed role
    if (fromStage === Stage.preparation) {
      const allConfirmed = [...this.matchPlayers.values()].every((p) => p.state.chosenRoleCode !== null);
      if (!allConfirmed) throw new Error("Not all players have confirmed their role selection");
    }

    let isTieVote = false;
    let isFinal = false;
    let resolvedVoteResult: VoteResult | null = null;
    let nextFloor = this.currentFloor;

    // Stage-specific pre-advance logic
    if (fromStage === Stage.bet) {
      // BUG-09 fix: mark players who did not submit any action as canVote = false
      const currentRound = this.getCurrentRound();
      for (const player of this.matchPlayers.values()) {
        if (!player.isAlive) continue;
        const hasSubmitted = currentRound?.actionSubmissions.some((s) => s.openId === player.openId) ?? false;
        if (!hasSubmitted) {
          player.state.canVote = false;
        }
      }
    } else if (fromStage === Stage.action) {
      // action → damage: run settlement
      this.runSettlement();
    } else if (fromStage === Stage.vote || fromStage === Stage.tieBreak) {
      // Resolve votes for current voteRound
      resolvedVoteResult = this.resolveVotes();
      isTieVote = resolvedVoteResult.isTie;
    } else if (fromStage === Stage.settlement) {
      // Check winner
      const gasRounds = this.rounds.filter((r) => r.roundKind === "gas" && r.settlementResult !== null).length;
      const aliveByCamp = this.countAliveByCamp();
      const judgement = this.winnerJudgementService.judge({
        aliveByCamp,
        currentFloor: this.currentFloor,
        resolvedGasRounds: gasRounds,
      });
      isFinal = judgement.isFinal;

      // BUG-10 fix: retrieve the round's resolved vote result (resolvedVoteResult is a
      // local variable set only in the vote/tieBreak branch; use round state instead)
      const roundVoteResult = this.getCurrentRound()?.voteResult ?? null;
      if (roundVoteResult) {
        this._events.push({
          name: "VoteResolved",
          roomId: this.roomId,
          version: this.version,
          floor: this.currentFloor,
          voteRound: this.getCurrentRound()?.currentVoteRound ?? 1,
          voteResult: roundVoteResult,
          nextStage: isFinal ? Stage.settlement : Stage.preparation,
        } as VoteResolved);
      }

      if (isFinal && judgement.winnerCamp) {
        this.winnerResult = {
          winnerCamp: judgement.winnerCamp,
          reason: judgement.reason,
          decidedAt: new Date(),
        };
        this.gameState = GameState.end;
        this.version++;
        this.processedRequests.add(cmd.requestId);

        this._events.push({
          name: "WinnerDecided",
          roomId: this.roomId,
          version: this.version,
          winnerCamp: judgement.winnerCamp,
          reason: judgement.reason,
          decidedAt: this.winnerResult.decidedAt,
        } as WinnerDecided);

        this._events.push({
          name: "StageAdvanced",
          roomId: this.roomId,
          version: this.version,
          currentFloor: this.currentFloor,
          fromStage,
          toStage: Stage.settlement,
          currentVoteRound: this.getCurrentRound()?.currentVoteRound ?? 1,
        } as StageAdvanced);
        return;
      }

      // Not final: move to next floor
      nextFloor = this.currentFloor + 1;
    }

    // tieBreak → vote: increment voteRound
    if (fromStage === Stage.tieBreak) {
      const round = this.getCurrentRound();
      if (round) round.currentVoteRound++;
    }

    const nextStage = this.stageFlowService.next({ currentStage: fromStage, isTieVote, isFinal });

    // Emit VoteResolved if we just resolved a vote going to settlement
    if ((fromStage === Stage.vote || fromStage === Stage.tieBreak) && nextStage === Stage.settlement && resolvedVoteResult) {
      this._events.push({
        name: "VoteResolved",
        roomId: this.roomId,
        version: this.version,
        floor: this.currentFloor,
        voteRound: this.getCurrentRound()?.currentVoteRound ?? 1,
        voteResult: resolvedVoteResult,
        nextStage,
      } as VoteResolved);
    }

    this.currentStage = nextStage;

    // If advancing to preparation for next floor
    if (nextStage === Stage.preparation && nextFloor > this.currentFloor) {
      this.currentFloor = nextFloor;
      // Create new round shell
      this.rounds.push({
        floor: this.currentFloor,
        environmentCardCode: null,
        roundKind: null,
        currentVoteRound: 1,
        actionSubmissions: [],
        voteSubmissions: [],
        settlementResult: null,
        voteResult: null,
      });

      // BUG-06 fix: reset canSpeak and canVote for all alive players on floor change
      // BUG-07 fix: reset voteModifier to 0 for all alive players on floor change
      for (const player of this.matchPlayers.values()) {
        if (!player.isAlive) continue;
        player.state.canSpeak = true;
        player.state.canVote = true;
        player.state.voteModifier = 0;
      }
    }

    this.version++;
    this.processedRequests.add(cmd.requestId);

    this._events.push({
      name: "StageAdvanced",
      roomId: this.roomId,
      version: this.version,
      currentFloor: this.currentFloor,
      fromStage,
      toStage: nextStage,
      currentVoteRound: this.getCurrentRound()?.currentVoteRound ?? 1,
    } as StageAdvanced);
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private getCurrentRound(): RoundState | undefined {
    return this.rounds.find((r) => r.floor === this.currentFloor);
  }

  private runSettlement(): void {
    const round = this.getCurrentRound();
    if (!round) return;

    const players = [...this.matchPlayers.values()].map((p) => ({
      openId: p.openId,
      seatNo: p.state.seatNo,
      currentHp: p.currentHp,
      isAlive: p.isAlive,
    }));

    const result = this.settlementService.settle({
      floor: this.currentFloor,
      environmentCardCode: round.environmentCardCode,
      actionSubmissions: round.actionSubmissions,
      players,
    });

    round.settlementResult = result;

    // Apply damages to match players
    for (const dmg of result.damages) {
      const player = this.matchPlayers.get(dmg.openId);
      player?.applyDamage(dmg.damage);
    }

    // BUG-05 fix: apply vote modifiers from scold (and any other future effect)
    for (const vm of result.voteModifiers) {
      const player = this.matchPlayers.get(vm.openId);
      if (player) {
        player.state.voteModifier += vm.modifier;
      }
    }

    this._events.push({
      name: "RoundSettled",
      roomId: this.roomId,
      version: this.version,
      floor: this.currentFloor,
      stage: Stage.action,
      settlementResult: result,
    } as RoundSettled);
  }

  private resolveVotes(): VoteResult {
    const round = this.getCurrentRound();
    const currentVoteRound = round?.currentVoteRound ?? 1;
    const submissions = (round?.voteSubmissions ?? []).filter(
      (s) => s.voteRound === currentVoteRound
    );

    // Tally votes
    const tallyMap = new Map<string, number>();
    for (const s of submissions) {
      if (s.targetOpenId) {
        tallyMap.set(s.targetOpenId, (tallyMap.get(s.targetOpenId) ?? 0) + s.votePowerAtSubmit);
      }
    }

    // Find max
    let maxVotes = 0;
    for (const votes of tallyMap.values()) {
      if (votes > maxVotes) maxVotes = votes;
    }
    const topTargets = [...tallyMap.entries()]
      .filter(([, v]) => v === maxVotes)
      .map(([k]) => k);

    const isTie = topTargets.length > 1;
    const targetOpenId = isTie ? null : (topTargets[0] ?? null);

    const result: VoteResult = {
      targetOpenId,
      votes: maxVotes,
      isTie,
      tieTargets: isTie ? topTargets : [],
    };

    if (round) round.voteResult = result;

    // Eliminate voted player if not a tie
    if (targetOpenId) {
      const player = this.matchPlayers.get(targetOpenId);
      player?.eliminate();
    }

    return result;
  }

  private countAliveByCamp(): { passenger: number; fatter: number } {
    let passenger = 0;
    let fatter = 0;
    for (const p of this.matchPlayers.values()) {
      if (!p.isAlive) continue;
      if (p.state.identityCode === "fatter") fatter++;
      else passenger++;
    }
    return { passenger, fatter };
  }
}
