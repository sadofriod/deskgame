// Socket.io Gateway – docs/implements/server-architecture.md
// Manages WebSocket connections, dispatches COMMAND messages to the Room aggregate,
// and broadcasts EVENT messages to all sockets in a room.

import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";

import { Room } from "../domain/aggregates/Room";
import { DomainEvent } from "../domain/events";
import {
  AdvanceStagePayload,
  ClientToServerEvents,
  ConfirmRoleSelectionPayload,
  CreateRoomPayload,
  InterServerEvents,
  JoinRoomPayload,
  LeaveRoomPayload,
  ServerToClientEvents,
  SetReadyPayload,
  SocketData,
  SubmitBetPayload,
  SubmitVotePayload,
  UpdateRoomConfigPayload,
  WsErrorPayload,
  WsMessage,
} from "./types";
import { RoomRegistry } from "./RoomRegistry";

// ──────────────────────────────────────────────
// Command-name constants
// ──────────────────────────────────────────────

const CMD_CREATE_ROOM = "CreateRoom";
const CMD_JOIN_ROOM = "JoinRoom";
const CMD_LEAVE_ROOM = "LeaveRoom";
const CMD_UPDATE_ROOM_CONFIG = "UpdateRoomConfig";
const CMD_SET_READY = "SetReady";
const CMD_CONFIRM_ROLE_SELECTION = "ConfirmRoleSelection";
const CMD_SUBMIT_BET = "SubmitBet";
const CMD_SUBMIT_VOTE = "SubmitVote";
const CMD_ADVANCE_STAGE = "AdvanceStage";

// ──────────────────────────────────────────────
// RoomGateway
// ──────────────────────────────────────────────

export interface RoomGatewayOptions {
  /** Optional pre-existing registry. Useful for testing. */
  registry?: RoomRegistry;
  /**
   * Socket.io CORS origins.
   * Pass an explicit origin string/array (e.g. "https://example.com") for production.
   * Defaults to `false` (no CORS headers – safe for server-side clients).
   */
  corsOrigin?: string | string[] | false;
}

/**
 * RoomGateway wraps a Socket.io server and:
 * - maps incoming COMMAND messages to Room aggregate methods
 * - broadcasts the resulting domain events back to all sockets in the room
 * - maintains a socket → {roomId, openId} session map for clean disconnect handling
 */
export class RoomGateway {
  private readonly io: SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >;
  private readonly registry: RoomRegistry;
  /** socketId -> { roomId, openId } */
  private readonly sessions = new Map<string, { roomId: string; openId: string }>();

  constructor(httpServer: HttpServer, options: RoomGatewayOptions = {}) {
    this.registry = options.registry ?? new RoomRegistry();
    this.io = new SocketServer(httpServer, {
      cors: { origin: options.corsOrigin ?? false },
    });
    this.attachListeners();
  }

  /** Expose the underlying Socket.io server (e.g. for testing or Redis adapter attachment). */
  get server(): SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  > {
    return this.io;
  }

  /** Expose the room registry (e.g. for testing). */
  get rooms(): RoomRegistry {
    return this.registry;
  }

  /** Gracefully close the Socket.io server. */
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.io.close((err) => (err ? reject(err) : resolve()));
    });
  }

  // ──────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────

  private attachListeners(): void {
    this.io.on("connection", (socket) => {
      socket.on("command", (msg: WsMessage) => {
        try {
          this.handleCommand(socket.id, msg);
        } catch (err: unknown) {
          const errorPayload: WsErrorPayload = {
            code: "COMMAND_ERROR",
            message: err instanceof Error ? err.message : String(err),
            requestId: msg.requestId,
          };
          socket.emit("error", {
            type: "ERROR",
            name: "CommandError",
            requestId: msg.requestId,
            payload: errorPayload as unknown as Record<string, unknown>,
          });
        }
      });

      socket.on("disconnect", () => {
        this.handleDisconnect(socket.id);
      });
    });
  }

  private handleCommand(socketId: string, msg: WsMessage): void {
    if (msg.type !== "COMMAND") return;

    switch (msg.name) {
      case CMD_CREATE_ROOM:
        this.handleCreateRoom(socketId, msg);
        break;
      case CMD_JOIN_ROOM:
        this.handleJoinRoom(socketId, msg);
        break;
      case CMD_LEAVE_ROOM:
        this.handleLeaveRoom(socketId, msg);
        break;
      case CMD_UPDATE_ROOM_CONFIG:
        this.handleUpdateRoomConfig(socketId, msg);
        break;
      case CMD_SET_READY:
        this.handleSetReady(socketId, msg);
        break;
      case CMD_CONFIRM_ROLE_SELECTION:
        this.handleConfirmRoleSelection(socketId, msg);
        break;
      case CMD_SUBMIT_BET:
        this.handleSubmitBet(socketId, msg);
        break;
      case CMD_SUBMIT_VOTE:
        this.handleSubmitVote(socketId, msg);
        break;
      case CMD_ADVANCE_STAGE:
        this.handleAdvanceStage(socketId, msg);
        break;
      default:
        throw new Error(`Unknown command: ${msg.name}`);
    }
  }

  private handleCreateRoom(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as CreateRoomPayload;
    if (!p.ownerOpenId) throw new Error("ownerOpenId is required");
    if (!p.roomConfig) throw new Error("roomConfig is required");

    const room = Room.create({
      requestId: msg.requestId ?? socketId,
      ownerOpenId: p.ownerOpenId,
      roomConfig: p.roomConfig,
    });

    this.registry.set(room.id, room);

    // Register session: the creator joins the room socket channel
    this.joinSocketRoom(socketId, room.id, p.ownerOpenId);

    this.broadcastEvents(room);
  }

  private handleJoinRoom(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as JoinRoomPayload;
    if (!p.roomId) throw new Error("roomId is required");
    if (!p.openId) throw new Error("openId is required");
    if (!p.nickname) throw new Error("nickname is required");
    const room = this.requireRoom(p.roomId);

    room.joinRoom({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
      nickname: p.nickname,
      avatar: p.avatar ?? "",
    });

    this.joinSocketRoom(socketId, p.roomId, p.openId);
    this.broadcastEvents(room);
  }

  private handleLeaveRoom(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as LeaveRoomPayload;
    if (!p.roomId) throw new Error("roomId is required");
    if (!p.openId) throw new Error("openId is required");
    const room = this.requireRoom(p.roomId);

    room.leaveRoom({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
    });

    this.leaveSocketRoom(socketId, p.roomId);
    this.broadcastEvents(room);
  }

  private handleUpdateRoomConfig(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as UpdateRoomConfigPayload;
    if (!p.roomId) throw new Error("roomId is required");
    if (!p.openId) throw new Error("openId is required");
    if (!p.roomConfig) throw new Error("roomConfig is required");
    const room = this.requireRoom(p.roomId);

    room.updateRoomConfig({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
      roomConfig: p.roomConfig,
    });

    this.broadcastEvents(room);
  }

  private handleSetReady(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as SetReadyPayload;
    if (!p.roomId) throw new Error("roomId is required");
    if (!p.openId) throw new Error("openId is required");
    const room = this.requireRoom(p.roomId);

    room.setReady({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
      ready: p.ready,
    });

    this.broadcastEvents(room);
  }

  private handleConfirmRoleSelection(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as ConfirmRoleSelectionPayload;
    if (!p.roomId) throw new Error("roomId is required");
    if (!p.openId) throw new Error("openId is required");
    const room = this.requireRoom(p.roomId);

    room.confirmRoleSelection({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
      roleId: p.roleId,
    });

    this.broadcastEvents(room);
  }

  private handleSubmitBet(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as SubmitBetPayload;
    if (!p.roomId) throw new Error("roomId is required");
    if (!p.openId) throw new Error("openId is required");
    const room = this.requireRoom(p.roomId);

    room.submitBet({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
      selectedAction: p.actionCard,
      passedBet: p.passedBet,
    });

    this.broadcastEvents(room);
  }

  private handleSubmitVote(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as SubmitVotePayload;
    if (!p.roomId) throw new Error("roomId is required");
    if (!p.openId) throw new Error("openId is required");
    if (!p.voteTarget) throw new Error("voteTarget is required");
    const room = this.requireRoom(p.roomId);

    room.submitVote({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
      voteTarget: p.voteTarget,
    });

    this.broadcastEvents(room);
  }

  private handleAdvanceStage(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as AdvanceStagePayload;
    if (!p.roomId) throw new Error("roomId is required");
    if (!p.openId && !p.timeoutFlag) {
      throw new Error("Either openId or timeoutFlag must be provided");
    }
    const room = this.requireRoom(p.roomId);

    room.advanceStage({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
      timeoutFlag: p.timeoutFlag,
    });

    this.broadcastEvents(room);
  }

  private handleDisconnect(socketId: string): void {
    const session = this.sessions.get(socketId);
    if (!session) return;

    const { roomId } = session;
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(roomId);
    }
    this.sessions.delete(socketId);
  }

  // ──────────────────────────────────────────────
  // Broadcast helpers
  // ──────────────────────────────────────────────

  /**
   * Convert each uncommitted domain event into a WsMessage envelope and
   * broadcast it to every socket subscribed to the room's channel.
   */
  private broadcastEvents(room: Room): void {
    const events = room.events;
    room.clearEvents();
    for (const evt of events) {
      this.broadcastEvent(room.id, evt);
    }
  }

  private broadcastEvent(roomId: string, evt: DomainEvent): void {
    const msg: WsMessage = {
      type: "EVENT",
      name: evt.name,
      roomId,
      payload: evt as unknown as Record<string, unknown>,
    };
    this.io.to(roomId).emit("event", msg);
  }

  // ──────────────────────────────────────────────
  // Session management
  // ──────────────────────────────────────────────

  private joinSocketRoom(socketId: string, roomId: string, openId: string): void {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(roomId);
    }
    this.sessions.set(socketId, { roomId, openId });
  }

  private leaveSocketRoom(socketId: string, roomId: string): void {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(roomId);
    }
    this.sessions.delete(socketId);
  }

  private requireRoom(roomId: string): Room {
    const room = this.registry.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);
    return room;
  }
}
