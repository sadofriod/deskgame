// WebSocket message protocol – docs/implements/server-architecture.md §3.1
// and docs/implements/05-domain-protocols.md

import { ActionCard, EnvironmentCard, GameState, Role, Stage, WinnerCamp } from "../domain/types";
import { RoleConfig } from "../domain/services/DealService";

// ──────────────────────────────────────────────
// Message envelope
// ──────────────────────────────────────────────

export type WsMessageType = "COMMAND" | "EVENT" | "ERROR";

export interface WsMessage {
  type: WsMessageType;
  name: string;
  requestId?: string;
  roomId?: string;
  openId?: string;
  payload: Record<string, unknown>;
}

// ──────────────────────────────────────────────
// COMMAND payloads (client → server)
// ──────────────────────────────────────────────

export interface CreateRoomPayload {
  ownerOpenId: string;
  roleConfig: RoleConfig;
}

export interface JoinRoomPayload {
  roomId: string;
  openId: string;
  nickname: string;
  avatar?: string;
}

export interface LeaveRoomPayload {
  roomId: string;
  openId: string;
}

export interface StartGamePayload {
  roomId: string;
  openId: string;
  seed: string;
}

export interface SubmitActionPayload {
  roomId: string;
  openId: string;
  actionCard: ActionCard;
}

export interface RevealEnvironmentPayload {
  roomId: string;
}

export interface SubmitVotePayload {
  roomId: string;
  openId: string;
  voteTarget: string;
  votePowerAtSubmit: number;
}

export interface AdvanceStagePayload {
  roomId: string;
  openId: string;
  timeoutFlag?: boolean;
}

// ──────────────────────────────────────────────
// EVENT payloads (server → client)
// ──────────────────────────────────────────────

export interface RoomCreatedEventPayload {
  roomId: string;
  ownerOpenId: string;
  gameState: GameState;
  currentFloor: number;
  currentStage: Stage;
  version: number;
}

export interface PlayerJoinedRoomEventPayload {
  roomId: string;
  openId: string;
  playerCount: number;
  version: number;
}

export interface PlayerRemovedFromRoomEventPayload {
  roomId: string;
  openId: string;
  playerCount: number;
  version: number;
}

export interface CardsDealtEventPayload {
  roomId: string;
  envDeck: EnvironmentCard[];
  roles: Array<{ openId: string; role: Role }>;
  version: number;
}

export interface ActionSubmittedEventPayload {
  roomId: string;
  openId: string;
  actionCard: ActionCard;
  version: number;
}

export interface EnvironmentRevealedEventPayload {
  roomId: string;
  floor: number;
  environmentCard: EnvironmentCard;
  version: number;
}

export interface RoundSettledEventPayload {
  roomId: string;
  floor: number;
  settlementResult: {
    damages: Array<{ openId: string; damage: number; reason: string }>;
    eliminated: string[];
  };
  version: number;
}

export interface PlayerEliminatedEventPayload {
  roomId: string;
  openId: string;
  floor: number;
  version: number;
}

export interface VoteSubmittedEventPayload {
  roomId: string;
  openId: string;
  voteTarget: string;
  votePowerAtSubmit: number;
  version: number;
}

export interface VoteResolvedEventPayload {
  roomId: string;
  floor: number;
  voteResult: {
    targetOpenId: string;
    votes: number;
    isTie: boolean;
    tieTargets: string[];
  };
  version: number;
}

export interface StageAdvancedEventPayload {
  roomId: string;
  previousStage: Stage;
  currentStage: Stage;
  currentFloor: number;
  version: number;
}

export interface WinnerDecidedEventPayload {
  roomId: string;
  winnerCamp: WinnerCamp;
  reason: string;
  /** ISO 8601 string – Date is serialized to string over JSON/Socket.IO */
  decidedAt: string;
  version: number;
}

// ──────────────────────────────────────────────
// ERROR payload (server → client)
// ──────────────────────────────────────────────

export interface WsErrorPayload {
  code: string;
  message: string;
  requestId?: string;
}

// ──────────────────────────────────────────────
// Socket.IO typed event maps
// ──────────────────────────────────────────────

/** Events the client can emit to the server */
export interface ClientToServerEvents {
  command: (msg: WsMessage) => void;
}

/** Events the server can emit to clients */
export interface ServerToClientEvents {
  event: (msg: WsMessage) => void;
  error: (msg: WsMessage) => void;
}

/** Inter-server events (for multi-instance with Redis adapter) */
export interface InterServerEvents {
  broadcast: (roomId: string, msg: WsMessage) => void;
}

/** Per-socket data stored by socket.io */
export interface SocketData {
  openId: string;
  roomId: string;
}
