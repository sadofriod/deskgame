// Domain events derived from docs/domain/04-领域事件与服务.md
// and docs/implements/05-domain-protocols.md

import {
  ActionCard,
  EnvironmentCard,
  GameState,
  Role,
  SettlementResult,
  Stage,
  VoteResult,
  WinnerCamp,
} from "../types";

export type DomainEventName =
  | "RoomCreated"
  | "PlayerJoinedRoom"
  | "PlayerRemovedFromRoom"
  | "CardsDealt"
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
  playerCount: number;
}

export interface PlayerRemovedFromRoom extends BaseDomainEvent {
  name: "PlayerRemovedFromRoom";
  openId: string;
  playerCount: number;
}

export interface CardsDealt extends BaseDomainEvent {
  name: "CardsDealt";
  envDeck: EnvironmentCard[];
  roles: Array<{ openId: string; role: Role }>;
}

export interface ActionSubmitted extends BaseDomainEvent {
  name: "ActionSubmitted";
  openId: string;
  actionCard: ActionCard;
}

export interface EnvironmentRevealed extends BaseDomainEvent {
  name: "EnvironmentRevealed";
  floor: number;
  environmentCard: EnvironmentCard;
}

export interface RoundSettled extends BaseDomainEvent {
  name: "RoundSettled";
  floor: number;
  settlementResult: SettlementResult;
}

export interface PlayerEliminated extends BaseDomainEvent {
  name: "PlayerEliminated";
  openId: string;
  floor: number;
}

export interface VoteSubmitted extends BaseDomainEvent {
  name: "VoteSubmitted";
  openId: string;
  voteTarget: string;
  votePowerAtSubmit: number;
}

export interface VoteResolved extends BaseDomainEvent {
  name: "VoteResolved";
  floor: number;
  voteResult: VoteResult;
}

export interface StageAdvanced extends BaseDomainEvent {
  name: "StageAdvanced";
  previousStage: Stage;
  currentStage: Stage;
  currentFloor: number;
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
  | CardsDealt
  | ActionSubmitted
  | EnvironmentRevealed
  | RoundSettled
  | PlayerEliminated
  | VoteSubmitted
  | VoteResolved
  | StageAdvanced
  | WinnerDecided;
