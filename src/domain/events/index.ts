import {
  Camp,
  GameState,
  SettlementResult,
  Stage,
  VoteResult,
} from "../types";

export type DomainEventName =
  | "RoomCreated"
  | "PlayerJoinedRoom"
  | "PlayerRemovedFromRoom"
  | "RoleSelectionStarted"
  | "RoleSelectionCompleted"
  | "CardsDealt"
  | "RoleSelected"
  | "ActionSubmitted"
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
  ownerOpenId: string;
  gameState: GameState;
  currentFloor: number;
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

export interface CardsDealt extends BaseDomainEvent {
  name: "CardsDealt";
  matchId: string;
  currentFloor: number;
  currentStage: Stage;
  players: Array<{
    openId: string;
    identityCode: string;
    roleOptions: string[];
    initialHandCards: { cardInstanceId: string; actionCardCode: string }[];
  }>;
}

export interface RoleSelectionStarted extends BaseDomainEvent {
  name: "RoleSelectionStarted";
  matchId: string;
  pendingPlayers: string[];
}

export interface RoleSelected extends BaseDomainEvent {
  name: "RoleSelected";
  openId: string;
  roleCode: string;
}

export interface RoleSelectionCompleted extends BaseDomainEvent {
  name: "RoleSelectionCompleted";
  matchId: string;
  currentFloor: number;
  currentStage: Stage;
}

export interface ActionSubmitted extends BaseDomainEvent {
  name: "ActionSubmitted";
  floor: number;
  openId: string;
  sequence: number;
  sourceStage: Stage;
}

export interface EnvironmentRevealed extends BaseDomainEvent {
  name: "EnvironmentRevealed";
  floor: number;
  environmentCard: string;
  roundKind: string;
}

export interface RoundSettled extends BaseDomainEvent {
  name: "RoundSettled";
  floor: number;
  stage: Stage;
  settlementResult: SettlementResult;
}

export interface PlayerEliminated extends BaseDomainEvent {
  name: "PlayerEliminated";
  openId: string;
  floor: number;
}

export interface VoteSubmitted extends BaseDomainEvent {
  name: "VoteSubmitted";
  floor: number;
  voteRound: number;
  openId: string;
  votePowerAtSubmit: number;
}

export interface VoteResolved extends BaseDomainEvent {
  name: "VoteResolved";
  floor: number;
  voteRound: number;
  voteResult: VoteResult;
  nextStage: Stage;
}

export interface StageAdvanced extends BaseDomainEvent {
  name: "StageAdvanced";
  currentFloor: number;
  fromStage: Stage;
  toStage: Stage;
  currentVoteRound: number;
}

export interface WinnerDecided extends BaseDomainEvent {
  name: "WinnerDecided";
  winnerCamp: Camp;
  reason: string;
  decidedAt: Date;
}

export type DomainEvent =
  | RoomCreated
  | PlayerJoinedRoom
  | PlayerRemovedFromRoom
  | CardsDealt
  | RoleSelectionStarted
  | RoleSelected
  | RoleSelectionCompleted
  | ActionSubmitted
  | EnvironmentRevealed
  | RoundSettled
  | PlayerEliminated
  | VoteSubmitted
  | VoteResolved
  | StageAdvanced
  | WinnerDecided;
