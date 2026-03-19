import {
  ActionCard,
  EnvironmentCard,
  GameState,
  Role,
  RoomConfig,
  SettlementResult,
  Stage,
  VoteResult,
  WinnerCamp,
} from "../types";

export type DomainEventName =
  | "RoomCreated"
  | "PlayerJoinedRoom"
  | "PlayerRemovedFromRoom"
  | "RoomConfigUpdated"
  | "PlayerReadyStateChanged"
  | "RoleSelectionStarted"
  | "RoleSelectionCompleted"
  | "BetSubmitted"
  | "EnvironmentRevealed"
  | "RoundSettled"
  | "PlayerEliminated"
  | "VoteSubmitted"
  | "VoteResolved"
  | "StageAdvanced"
  | "WinnerDecided";

export interface BaseDomainEvent {
  name: DomainEventName;
  roomId: string;
  version: number;
}

export interface RoomCreated extends BaseDomainEvent {
  name: "RoomCreated";
  roomCode: string;
  ownerOpenId: string;
  gameState: GameState;
  currentRound: number;
  currentStage: Stage;
}

export interface PlayerJoinedRoom extends BaseDomainEvent {
  name: "PlayerJoinedRoom";
  openId: string;
  seatNo: number;
  playerCount: number;
}

export interface PlayerRemovedFromRoom extends BaseDomainEvent {
  name: "PlayerRemovedFromRoom";
  openId: string;
  playerCount: number;
}

export interface RoomConfigUpdated extends BaseDomainEvent {
  name: "RoomConfigUpdated";
  roomConfig: RoomConfig;
}

export interface PlayerReadyStateChanged extends BaseDomainEvent {
  name: "PlayerReadyStateChanged";
  openId: string;
  ready: boolean;
  allReady: boolean;
}

export interface RoleSelectionStarted extends BaseDomainEvent {
  name: "RoleSelectionStarted";
  candidateRoles: Array<{ openId: string; roles: Role[] }>;
  currentStage: Stage.roleSelection;
}

export interface RoleSelectionCompleted extends BaseDomainEvent {
  name: "RoleSelectionCompleted";
  currentRound: number;
  currentStage: Stage.bet;
  envDeck: EnvironmentCard[];
}

export interface BetSubmitted extends BaseDomainEvent {
  name: "BetSubmitted";
  round: number;
  openId: string;
  passedBet: boolean;
  selectedAction: ActionCard | null;
}

export interface EnvironmentRevealed extends BaseDomainEvent {
  name: "EnvironmentRevealed";
  round: number;
  environmentCard: EnvironmentCard;
}

export interface RoundSettled extends BaseDomainEvent {
  name: "RoundSettled";
  round: number;
  settlementResult: SettlementResult;
}

export interface PlayerEliminated extends BaseDomainEvent {
  name: "PlayerEliminated";
  openId: string;
  round: number;
}

export interface VoteSubmitted extends BaseDomainEvent {
  name: "VoteSubmitted";
  round: number;
  openId: string;
  voteTarget: string;
  votePowerAtSubmit: number;
}

export interface VoteResolved extends BaseDomainEvent {
  name: "VoteResolved";
  round: number;
  voteResult: VoteResult;
}

export interface StageAdvanced extends BaseDomainEvent {
  name: "StageAdvanced";
  previousStage: Stage;
  currentStage: Stage;
  currentRound: number;
}

export interface WinnerDecided extends BaseDomainEvent {
  name: "WinnerDecided";
  winnerCamp: WinnerCamp;
  reason: string;
  decidedAt: Date;
}

export type DomainEvent =
  | RoomCreated
  | PlayerJoinedRoom
  | PlayerRemovedFromRoom
  | RoomConfigUpdated
  | PlayerReadyStateChanged
  | RoleSelectionStarted
  | RoleSelectionCompleted
  | BetSubmitted
  | EnvironmentRevealed
  | RoundSettled
  | PlayerEliminated
  | VoteSubmitted
  | VoteResolved
  | StageAdvanced
  | WinnerDecided;
