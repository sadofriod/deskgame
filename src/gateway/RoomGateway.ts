// Socket.io Gateway – docs/implements/server-architecture.md

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
  SocketData,
  StartGamePayload,
  SubmitActionPayload,
  SubmitVotePayload,
  WsErrorPayload,
  WsMessage,
} from "./types";
import { RoomRegistry } from "./RoomRegistry";

const CMD_CREATE_ROOM = "CreateRoom";
const CMD_JOIN_ROOM = "JoinRoom";
const CMD_LEAVE_ROOM = "LeaveRoom";
const CMD_START_GAME = "StartGame";
const CMD_CONFIRM_ROLE_SELECTION = "ConfirmRoleSelection";
const CMD_SUBMIT_ACTION = "SubmitAction";
const CMD_REVEAL_ENVIRONMENT = "RevealEnvironment";
const CMD_SUBMIT_VOTE = "SubmitVote";
const CMD_ADVANCE_STAGE = "AdvanceStage";

export interface RoomGatewayOptions {
  registry?: RoomRegistry;
  corsOrigin?: string | string[] | false;
}

export class RoomGateway {
  private readonly io: SocketServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
  private readonly registry: RoomRegistry;
  private readonly sessions = new Map<string, { roomId: string; openId: string }>();

  constructor(httpServer: HttpServer, options: RoomGatewayOptions = {}) {
    this.registry = options.registry ?? new RoomRegistry();
    this.io = new SocketServer(httpServer, { cors: { origin: options.corsOrigin ?? false } });
    this.attachListeners();
  }

  get server(): SocketServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> {
    return this.io;
  }

  get rooms(): RoomRegistry {
    return this.registry;
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.io.close((err) => (err ? reject(err) : resolve()));
    });
  }

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
        const session = this.sessions.get(socket.id);
        if (!session) return;
        const sock = this.io.sockets.sockets.get(socket.id);
        if (sock) sock.leave(session.roomId);
        this.sessions.delete(socket.id);
      });
    });
  }

  private handleCommand(socketId: string, msg: WsMessage): void {
    if (msg.type !== "COMMAND") return;
    switch (msg.name) {
      case CMD_CREATE_ROOM: this.handleCreateRoom(socketId, msg); break;
      case CMD_JOIN_ROOM: this.handleJoinRoom(socketId, msg); break;
      case CMD_LEAVE_ROOM: this.handleLeaveRoom(socketId, msg); break;
      case CMD_START_GAME: this.handleStartGame(socketId, msg); break;
      case CMD_CONFIRM_ROLE_SELECTION: this.handleConfirmRoleSelection(socketId, msg); break;
      case CMD_SUBMIT_ACTION: this.handleSubmitAction(socketId, msg); break;
      case CMD_REVEAL_ENVIRONMENT: this.handleRevealEnvironment(socketId, msg); break;
      case CMD_SUBMIT_VOTE: this.handleSubmitVote(socketId, msg); break;
      case CMD_ADVANCE_STAGE: this.handleAdvanceStage(socketId, msg); break;
      default: throw new Error(`Unknown command: ${msg.name}`);
    }
  }

  private handleCreateRoom(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as CreateRoomPayload;
    if (!p.ownerOpenId) throw new Error("ownerOpenId is required");
    if (!p.ruleSetCode) throw new Error("ruleSetCode is required");
    if (!p.deckTemplateCode) throw new Error("deckTemplateCode is required");

    const room = Room.create({
      requestId: msg.requestId ?? socketId,
      ownerOpenId: p.ownerOpenId,
      ruleSetCode: p.ruleSetCode,
      deckTemplateCode: p.deckTemplateCode,
    });

    this.registry.set(room.id, room);
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

    room.leaveRoom({ requestId: msg.requestId ?? socketId, roomId: p.roomId, openId: p.openId });
    this.leaveSocketRoom(socketId, p.roomId);
    this.broadcastEvents(room);
  }

  private handleStartGame(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as StartGamePayload;
    if (!p.roomId) throw new Error("roomId is required");
    if (!p.openId) throw new Error("openId is required");
    const room = this.requireRoom(p.roomId);

    room.startGame({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
      seed: p.seed ?? socketId,
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
      roleCode: p.roleCode,
    });

    this.broadcastEvents(room);
  }

  private handleSubmitAction(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as SubmitActionPayload;
    if (!p.roomId) throw new Error("roomId is required");
    if (!p.openId) throw new Error("openId is required");
    const room = this.requireRoom(p.roomId);

    room.submitAction({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
      cardInstanceId: p.cardInstanceId,
    });

    this.broadcastEvents(room);
  }

  private handleRevealEnvironment(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as { roomId: string; openId: string };
    if (!p.roomId) throw new Error("roomId is required");
    if (!p.openId) throw new Error("openId is required");
    const room = this.requireRoom(p.roomId);
    room.revealEnvironment({ requestId: msg.requestId ?? socketId, roomId: p.roomId, ownerOpenId: p.openId });
    this.broadcastEvents(room);
  }

  private handleSubmitVote(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as SubmitVotePayload;
    if (!p.roomId) throw new Error("roomId is required");
    if (!p.openId) throw new Error("openId is required");
    const room = this.requireRoom(p.roomId);

    room.submitVote({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
      voteRound: p.voteRound ?? 1,
      voteTarget: p.voteTarget ?? null,
      votePowerAtSubmit: p.votePowerAtSubmit ?? 1,
    });

    this.broadcastEvents(room);
  }

  private handleAdvanceStage(socketId: string, msg: WsMessage): void {
    const p = msg.payload as unknown as AdvanceStagePayload;
    if (!p.roomId) throw new Error("roomId is required");
    if (!p.openId) throw new Error("openId is required");
    const room = this.requireRoom(p.roomId);

    // Clients may only issue owner commands — timeout advances are server-only.
    room.advanceStage({
      requestId: msg.requestId ?? socketId,
      roomId: p.roomId,
      openId: p.openId,
      trigger: "ownerCommand",
    });

    this.broadcastEvents(room);
  }

  private broadcastEvents(room: Room): void {
    const events = [...room.events]; // copy before clearing
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

  private joinSocketRoom(socketId: string, roomId: string, openId: string): void {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) socket.join(roomId);
    this.sessions.set(socketId, { roomId, openId });
  }

  private leaveSocketRoom(socketId: string, roomId: string): void {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) socket.leave(roomId);
    this.sessions.delete(socketId);
  }

  private requireRoom(roomId: string): Room {
    const room = this.registry.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);
    return room;
  }
}
