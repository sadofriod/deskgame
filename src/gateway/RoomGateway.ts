// Socket.io Gateway – docs/implements/server-architecture.md
// Manages WebSocket connections, dispatches COMMAND messages to the Room aggregate,
// and broadcasts EVENT messages to all sockets in a room.

import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";

import { Room } from "../domain/aggregates/Room";
import { DomainEvent } from "../domain/events";
import { RoleConfig } from "../domain/services/DealService";
import {
  AdvanceStagePayload,
  ClientToServerEvents,
  CreateRoomPayload,
  InterServerEvents,
  JoinRoomPayload,
  LeaveRoomPayload,
  RevealEnvironmentPayload,
  ServerToClientEvents,
  SocketData,
  StartGamePayload,
  SubmitActionPayload,
  SubmitVotePayload,
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
const CMD_START_GAME = "StartGame";
const CMD_SUBMIT_ACTION = "SubmitAction";
const CMD_REVEAL_ENVIRONMENT = "RevealEnvironment";
const CMD_SUBMIT_VOTE = "SubmitVote";
const CMD_ADVANCE_STAGE = "AdvanceStage";

// ──────────────────────────────────────────────
// RoomGateway
// ──────────────────────────────────────────────

export interface RoomGatewayOptions {
  /** Optional pre-existing registry. Useful for testing. */
  registry?: RoomRegistry;
  /** Socket.io CORS origins. Defaults to '*'. */
  corsOrigin?: string | string[];
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
      cors: { origin: options.corsOrigin ?? "*" },
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
      case CMD_START_GAME:
        this.handleStartGame(socketId, msg);
        break;
      case CMD_SUBMIT_ACTION:
        this.handleSubmitAction(socketId, msg);
        break;
      case CMD_REVEAL_ENVIRONMENT:
        this.handleRevealEnvironment(socketId, msg);
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
    if (!p.roleConfig) throw new Error("roleConfig is required");

    const room = Room.create({
      requestId: msg.requestId ?? socketId,
      ownerOpenId: p.ownerOpenId,
      roleConfig: p.roleConfig as RoleConfig,
    });

    this.registry.set(room.id, room);

    // Register session: the creator joins the room socket channel
    this.joinSocketRoom(socketId, room.id, p.ownerOpenId);

    this.broadcastEvents(room);
  }

  private handleJoinRoom(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as JoinRoomPayload;
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
    const room = this.requireRoom(p.roomId);

    room.leaveRoom({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
    });

    this.leaveSocketRoom(socketId, p.roomId);
    this.broadcastEvents(room);
  }

  private handleStartGame(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as StartGamePayload;
    const room = this.requireRoom(p.roomId);

    room.startGame({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
      seed: p.seed,
    });

    this.broadcastEvents(room);
  }

  private handleSubmitAction(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as SubmitActionPayload;
    const room = this.requireRoom(p.roomId);

    room.submitAction({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
      actionCard: p.actionCard,
    });

    this.broadcastEvents(room);
  }

  private handleRevealEnvironment(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as RevealEnvironmentPayload;
    const room = this.requireRoom(p.roomId);

    room.revealEnvironment({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
    });

    this.broadcastEvents(room);
  }

  private handleSubmitVote(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as SubmitVotePayload;
    const room = this.requireRoom(p.roomId);

    room.submitVote({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
      voteTarget: p.voteTarget,
      votePowerAtSubmit: p.votePowerAtSubmit,
    });

    this.broadcastEvents(room);
  }

  private handleAdvanceStage(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as AdvanceStagePayload;
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
