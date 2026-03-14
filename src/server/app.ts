// Express application factory – HTTP gateway for the DeskGame domain.
// Each route maps a JSON body to the corresponding Room aggregate command.

import express, { NextFunction, Request, Response } from "express";
import { Room, RoomSnapshot } from "../domain/aggregates/Room";
import { uuidv4 } from "../utils/uuid";

// ──────────────────────────────────────────────
// In-memory room store type
// ──────────────────────────────────────────────

export type RoomStore = Map<string, RoomSnapshot>;

// ──────────────────────────────────────────────
// App factory
// ──────────────────────────────────────────────

export function createApp(rooms: RoomStore = new Map()): express.Application {
  const app = express();
  app.use(express.json());

  // Helper: persist a Room snapshot after a command
  function persist(room: Room): void {
    rooms.set(room.id, room.snapshot());
  }

  // Helper: load a Room from the store or 404
  function loadRoom(roomId: string): Room {
    const snapshot = rooms.get(roomId);
    if (!snapshot) throw Object.assign(new Error(`Room ${roomId} not found`), { status: 404 });
    return Room.restore(snapshot);
  }

  // ── POST /rooms ──────────────────────────────
  // Body: { ownerOpenId, roleConfig, requestId? }
  app.post("/rooms", (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ownerOpenId, roleConfig, requestId = uuidv4() } = req.body as {
        ownerOpenId: string;
        roleConfig: string;
        requestId?: string;
      };
      const room = Room.create({ requestId, ownerOpenId, roleConfig: roleConfig as "independent" | "faction" });
      persist(room);
      res.status(201).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /rooms/:roomId/players ──────────────
  // Body: { openId, nickname, avatar, requestId? }
  app.post("/rooms/:roomId/players", (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, nickname, avatar, requestId = uuidv4() } = req.body as {
        openId: string;
        nickname: string;
        avatar: string;
        requestId?: string;
      };
      const room = loadRoom(roomId);
      room.joinRoom({ requestId, roomId, openId, nickname, avatar });
      persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      next(err);
    }
  });

  // ── DELETE /rooms/:roomId/players/:openId ────
  // Remove a player from the room (leave).
  app.delete("/rooms/:roomId/players/:openId", (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const openId = String(req.params["openId"]);
      const { requestId = uuidv4() } = (req.body ?? {}) as { requestId?: string };
      const room = loadRoom(roomId);
      room.leaveRoom({ requestId, roomId, openId });
      persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /rooms/:roomId/start ────────────────
  // Body: { openId, seed, requestId? }
  app.post("/rooms/:roomId/start", (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, seed, requestId = uuidv4() } = req.body as {
        openId: string;
        seed: string;
        requestId?: string;
      };
      const room = loadRoom(roomId);
      room.startGame({ requestId, roomId, openId, seed });
      persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /rooms/:roomId/actions ──────────────
  // Body: { openId, actionCard, requestId? }
  app.post("/rooms/:roomId/actions", (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, actionCard, requestId = uuidv4() } = req.body as {
        openId: string;
        actionCard: string;
        requestId?: string;
      };
      const room = loadRoom(roomId);
      room.submitAction({ requestId, roomId, openId, actionCard: actionCard as import("../domain/types").ActionCard });
      persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /rooms/:roomId/environment ──────────
  // Body: { requestId? }
  app.post("/rooms/:roomId/environment", (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { requestId = uuidv4() } = (req.body ?? {}) as { requestId?: string };
      const room = loadRoom(roomId);
      room.revealEnvironment({ requestId, roomId });
      persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /rooms/:roomId/votes ────────────────
  // Body: { openId, voteTarget, votePowerAtSubmit, requestId? }
  app.post("/rooms/:roomId/votes", (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, voteTarget, votePowerAtSubmit, requestId = uuidv4() } = req.body as {
        openId: string;
        voteTarget: string;
        votePowerAtSubmit: number;
        requestId?: string;
      };
      const room = loadRoom(roomId);
      room.submitVote({ requestId, roomId, openId, voteTarget, votePowerAtSubmit });
      persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      next(err);
    }
  });

  // ── POST /rooms/:roomId/stage/advance ────────
  // Body: { openId, timeoutFlag?, requestId? }
  app.post("/rooms/:roomId/stage/advance", (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, timeoutFlag, requestId = uuidv4() } = req.body as {
        openId: string;
        timeoutFlag?: boolean;
        requestId?: string;
      };
      const room = loadRoom(roomId);
      room.advanceStage({ requestId, roomId, openId, timeoutFlag });
      persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      next(err);
    }
  });

  // ── GET /rooms/:roomId ───────────────────────
  app.get("/rooms/:roomId", (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const snapshot = rooms.get(roomId);
      if (!snapshot) {
        res.status(404).json({ error: `Room ${roomId} not found` });
        return;
      }
      res.status(200).json({ room: snapshot });
    } catch (err) {
      next(err);
    }
  });

  // ── Global error handler ─────────────────────
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number }).status ?? 400;
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(status).json({ error: message });
  });

  return app;
}
