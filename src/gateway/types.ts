import {
  ActionCard,
  EnvironmentCard,
  GameState,
  Role,
  RoomConfig,
  Stage,
  WinnerCamp,
} from "../domain/types";

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
  roomConfig: RoomConfig;
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

export interface UpdateRoomConfigPayload {
  roomId: string;
  openId: string;
  roomConfig: RoomConfig;
}

export interface SetReadyPayload {
  roomId: string;
  openId: string;
  ready: boolean;
}

export interface ConfirmRoleSelectionPayload {
  roomId: string;
  openId: string;
  roleId: Role;
}

export interface SubmitBetPayload {
  roomId: string;
  openId: string;
  actionCard?: ActionCard;
  passedBet?: boolean;
}

export interface SubmitVotePayload {
  roomId: string;
  openId: string;
  voteTarget: string;
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
  roomCode: string;
  ownerOpenId: string;
  gameState: GameState;
  currentRound: number;
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

export interface RoomConfigUpdatedEventPayload {
  roomId: string;
  roomConfig: RoomConfig;
  version: number;
}

export interface PlayerReadyStateChangedEventPayload {
  roomId: string;
  openId: string;
  ready: boolean;
  allReady: boolean;
  version: number;
}

export interface RoleSelectionStartedEventPayload {
  roomId: string;
  candidateRoles: Array<{ openId: string; roles: Role[] }>;
  currentStage: Stage.roleSelection;
  version: number;
}

export interface RoleSelectionCompletedEventPayload {
  roomId: string;
  currentRound: number;
  currentStage: Stage.bet;
  envDeck: EnvironmentCard[];
  version: number;
}

export interface BetSubmittedEventPayload {
  roomId: string;
  round: number;
  openId: string;
  passedBet: boolean;
  selectedAction: ActionCard | null;
  version: number;
}

export interface EnvironmentRevealedEventPayload {
  roomId: string;
  round: number;
  environmentCard: EnvironmentCard;
  version: number;
}

export interface RoundSettledEventPayload {
  roomId: string;
  round: number;
  settlementResult: {
    damages: Array<{ openId: string; damage: number; reason: string }>;
    heals: Array<{ openId: string; heal: number; reason: string }>;
    eliminated: string[];
  };
  version: number;
}

export interface PlayerEliminatedEventPayload {
  roomId: string;
  openId: string;
  round: number;
  version: number;
}

export interface VoteSubmittedEventPayload {
  roomId: string;
  round: number;
  openId: string;
  voteTarget: string;
  votePowerAtSubmit: number;
  version: number;
}

export interface VoteResolvedEventPayload {
  roomId: string;
  round: number;
  voteResult: {
    targetOpenId: string | null;
    votes: number;
    isTie: boolean;
    tieTargets: string[];
    needRevote: boolean;
  };
  version: number;
}

export interface StageAdvancedEventPayload {
  roomId: string;
  previousStage: Stage;
  currentStage: Stage;
  currentRound: number;
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
