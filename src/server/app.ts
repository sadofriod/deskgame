// Express application factory – HTTP gateway for the DeskGame domain.
// Each route maps a JSON body to the corresponding Room aggregate command.

import express, { NextFunction, Request, Response } from "express";
import { Room } from "../domain/aggregates/Room";
import { ActionCard } from "../domain/types";
import { RoleConfig } from "../domain/services/DealService";
import { uuidv4 } from "../utils/uuid";

// ──────────────────────────────────────────────
// In-memory room store type
// Stores Room instances directly so that all in-memory state (including
// idempotency request tracking) is preserved across HTTP calls.
// ──────────────────────────────────────────────

export type RoomStore = Map<string, Room>;

// ──────────────────────────────────────────────
// Validation helpers
// ──────────────────────────────────────────────

const VALID_ROLE_CONFIGS: ReadonlySet<string> = new Set<RoleConfig>(["independent", "faction"]);
const VALID_ACTION_CARDS: ReadonlySet<string> = new Set(Object.values(ActionCard));

function validateRoleConfig(value: unknown): RoleConfig {
  if (typeof value !== "string" || !VALID_ROLE_CONFIGS.has(value)) {
    throw Object.assign(
      new Error(`Invalid roleConfig "${value}". Must be one of: ${[...VALID_ROLE_CONFIGS].join(", ")}`),
      { status: 400 }
    );
  }
  return value as RoleConfig;
}

function validateActionCard(value: unknown): ActionCard {
  if (typeof value !== "string" || !VALID_ACTION_CARDS.has(value)) {
    throw Object.assign(
      new Error(`Invalid actionCard "${value}". Must be one of: ${[...VALID_ACTION_CARDS].join(", ")}`),
      { status: 400 }
    );
  }
  return value as ActionCard;
}

// ──────────────────────────────────────────────
// App factory
// ──────────────────────────────────────────────

/**
 * Tags an error as a domain/client error (HTTP 400) if it has no explicit
 * HTTP status assigned. Mutates the error in-place. All throws from Room
 * aggregate methods represent invalid commands (client errors), so untagged
 * errors from route handlers are treated as 400. Errors that already carry an
 * explicit status (e.g. 404) are left unchanged.
 */
function asDomainError(err: unknown): void {
  if (err != null && typeof (err as { status?: number }).status === "undefined") {
    Object.assign(err as object, { status: 400 });
  }
}

export function createApp(rooms: RoomStore = new Map()): express.Application {
  const app = express();
  app.use(express.json());

  // Helper: persist a Room instance after a command
  function persist(room: Room): void {
    rooms.set(room.id, room);
  }

  // Helper: load a Room from the store or 404
  function loadRoom(roomId: string): Room {
    const room = rooms.get(roomId);
    if (!room) throw Object.assign(new Error(`Room ${roomId} not found`), { status: 404 });
    return room;
  }

  // ── POST /rooms ──────────────────────────────
  // Body: { ownerOpenId, roleConfig, requestId? }
  app.post("/rooms", (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ownerOpenId, roleConfig: rawRoleConfig, requestId = uuidv4() } = req.body as {
        ownerOpenId: string;
        roleConfig: unknown;
        requestId?: string;
      };
      const roleConfig = validateRoleConfig(rawRoleConfig);
      const room = Room.create({ requestId, ownerOpenId, roleConfig });
      persist(room);
      res.status(201).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
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
      asDomainError(err); next(err);
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
      asDomainError(err); next(err);
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
      asDomainError(err); next(err);
    }
  });

  // ── POST /rooms/:roomId/actions ──────────────
  // Body: { openId, actionCard, requestId? }
  app.post("/rooms/:roomId/actions", (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, actionCard: rawActionCard, requestId = uuidv4() } = req.body as {
        openId: string;
        actionCard: unknown;
        requestId?: string;
      };
      const actionCard = validateActionCard(rawActionCard);
      const room = loadRoom(roomId);
      room.submitAction({ requestId, roomId, openId, actionCard });
      persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
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
      asDomainError(err); next(err);
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
      asDomainError(err); next(err);
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
      asDomainError(err); next(err);
    }
  });

  // ── GET /rooms/:roomId ───────────────────────
  app.get("/rooms/:roomId", (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const room = rooms.get(roomId);
      if (!room) {
        res.status(404).json({ error: `Room ${roomId} not found` });
        return;
      }
      res.status(200).json({ room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  // ── Global error handler ─────────────────────
  // Domain/validation errors carry an explicit `status` (4xx).
  // Any other unhandled error is treated as a server fault (500).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const explicitStatus = (err as { status?: number }).status;
    const status =
      explicitStatus !== undefined &&
      Number.isInteger(explicitStatus) &&
      explicitStatus >= 400 &&
      explicitStatus < 600
        ? explicitStatus
        : 500;
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(status).json({ error: message });
  });

  return app;
}

