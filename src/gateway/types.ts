import { Camp, GameState, Stage } from "../domain/types";

// ── Message envelope ───────────────────────────────────────────────────────────

export type WsMessageType = "COMMAND" | "EVENT" | "ERROR";

export interface WsMessage {
  type: WsMessageType;
  name: string;
  requestId?: string;
  roomId?: string;
  openId?: string;
  payload: Record<string, unknown>;
}

// ── COMMAND payloads (client → server) ────────────────────────────────────────

export interface CreateRoomPayload {
  ownerOpenId: string;
  ruleSetCode: string;
  deckTemplateCode: string;
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
  seed?: string;
}

export interface ConfirmRoleSelectionPayload {
  roomId: string;
  openId: string;
  roleCode: string;
}

export interface SubmitActionPayload {
  roomId: string;
  openId: string;
  cardInstanceId: string;
}

export interface SubmitVotePayload {
  roomId: string;
  openId: string;
  voteRound?: number;
  voteTarget?: string | null;
  votePowerAtSubmit?: number;
}

export interface AdvanceStagePayload {
  roomId: string;
  openId?: string;
  trigger?: "ownerCommand" | "timeout";
}

// ── EVENT payloads (server → client) ──────────────────────────────────────────

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
  seatNo: number;
  playerCount: number;
  version: number;
}

export interface PlayerRemovedFromRoomEventPayload {
  roomId: string;
  openId: string;
  playerCount: number;
  version: number;
}

export interface WinnerDecidedEventPayload {
  roomId: string;
  winnerCamp: Camp;
  reason: string;
  decidedAt: string;
  version: number;
}

// ── ERROR payload (server → client) ───────────────────────────────────────────

export interface WsErrorPayload {
  code: string;
  message: string;
  requestId?: string;
}

// ── Socket.IO typed event maps ─────────────────────────────────────────────────

export interface ClientToServerEvents {
  command: (msg: WsMessage) => void;
}

export interface ServerToClientEvents {
  event: (msg: WsMessage) => void;
  error: (msg: WsMessage) => void;
}

export interface InterServerEvents {
  broadcast: (roomId: string, msg: WsMessage) => void;
}

export interface SocketData {
  openId: string;
  roomId: string;
}
