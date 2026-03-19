// Express application factory – HTTP gateway for the DeskGame domain.
// Each route maps a JSON body to the corresponding Room aggregate command.

import fs from "fs";
import path from "path";
import express, { NextFunction, Request, Response } from "express";
import { Room, RoomSnapshot } from "../domain/aggregates/Room";
import { ActionCard, Role, RoleConfig, RoomConfig } from "../domain/types";
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
const VALID_ROLES: ReadonlySet<string> = new Set(Object.values(Role));

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

function validateRoomConfig(value: unknown): RoomConfig {
  if (!value || typeof value !== "object") {
    throw Object.assign(new Error("roomConfig is required"), { status: 400 });
  }
  const roomConfig = value as { playerCount?: unknown; roleConfig?: unknown };
  if (typeof roomConfig.playerCount !== "number" || roomConfig.playerCount < 5 || roomConfig.playerCount > 10) {
    throw Object.assign(new Error("playerCount must be a number between 5 and 10"), { status: 400 });
  }
  return {
    playerCount: roomConfig.playerCount,
    roleConfig: validateRoleConfig(roomConfig.roleConfig),
  };
}

function validateRole(value: unknown): Role {
  if (typeof value !== "string" || !VALID_ROLES.has(value)) {
    throw Object.assign(new Error(`Invalid roleId "${value}"`), { status: 400 });
  }
  return value as Role;
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

type AdminUser = {
  id: string;
  name: string;
  email: string;
  avatar: string;
};

type AdminOverviewUser = {
  openId: string;
  nickname: string;
  avatar: string;
  isReady: boolean;
  isAlive: boolean;
  roomIds: string[];
  roomCodes: string[];
  lastJoinTime: string;
};

type AdminOverviewRoom = {
  roomId: string;
  roomCode: string;
  ownerOpenId: string;
  gameState: string;
  currentStage: string;
  playerCount: number;
  configuredPlayerCount: number;
  players: Array<{
    openId: string;
    nickname: string;
    avatar: string;
    isReady: boolean;
    isAlive: boolean;
    joinTime: string;
  }>;
};

function resolveRepoPath(...segments: string[]): string {
  return path.resolve(__dirname, "..", "..", ...segments);
}

function resolveAdminUsers(): AdminUser[] {
  const raw = process.env.ADMIN_USERS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<AdminUser> | Array<Partial<AdminUser>>;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const normalized = list
        .map((item, index) => ({
          id: typeof item.id === "string" && item.id.trim() ? item.id : `admin-${index + 1}`,
          name: typeof item.name === "string" && item.name.trim() ? item.name : `管理员 ${index + 1}`,
          email: typeof item.email === "string" && item.email.trim() ? item.email : "",
          avatar: typeof item.avatar === "string" && item.avatar.trim() ? item.avatar : "",
        }))
        .filter((item) => item.email || item.name);
      if (normalized.length > 0) {
        return normalized;
      }
    } catch {
      // Ignore malformed ADMIN_USERS and fall through to single-admin envs.
    }
  }

  const name = process.env.ADMIN_NAME ?? "默认管理员";
  const email = process.env.ADMIN_EMAIL ?? "";
  const avatar = process.env.ADMIN_AVATAR ?? "";
  return [{ id: process.env.ADMIN_ID ?? "admin-1", name, email, avatar }];
}

function loadApiDocsMarkdown(): string {
  try {
    return fs.readFileSync(resolveRepoPath("docs", "接入文档.md"), "utf8");
  } catch {
    return "# API 文档暂不可用\n\n未能读取 docs/接入文档.md。";
  }
}

function buildAdminOverview(rooms: RoomStore) {
  const snapshots = [...rooms.values()].map((room) => room.snapshot());
  const activeRooms = snapshots
    .filter((room) => room.playerCount > 0 && room.gameState !== "ended")
    .sort((left, right) => right.playerCount - left.playerCount || left.roomCode.localeCompare(right.roomCode));

  const users = new Map<string, Omit<AdminOverviewUser, "lastJoinTime"> & { lastJoinTime: Date }>();

  for (const room of activeRooms) {
    for (const player of room.players) {
      const existing = users.get(player.openId);
      if (!existing) {
        users.set(player.openId, {
          openId: player.openId,
          nickname: player.nickname,
          avatar: player.avatar,
          isReady: player.isReady,
          isAlive: player.isAlive,
          roomIds: [room.roomId],
          roomCodes: [room.roomCode],
          lastJoinTime: player.joinTime,
        });
        continue;
      }

      if (!existing.roomIds.includes(room.roomId)) existing.roomIds.push(room.roomId);
      if (!existing.roomCodes.includes(room.roomCode)) existing.roomCodes.push(room.roomCode);
      existing.isReady = existing.isReady || player.isReady;
      existing.isAlive = existing.isAlive || player.isAlive;
      if (player.joinTime > existing.lastJoinTime) {
        existing.lastJoinTime = player.joinTime;
      }
    }
  }

  return {
    admins: resolveAdminUsers(),
    stats: {
      onlineUserCount: users.size,
      activeRoomCount: activeRooms.length,
    },
    users: [...users.values()]
      .sort((left, right) => right.lastJoinTime.getTime() - left.lastJoinTime.getTime())
      .map((user) => ({
        ...user,
        roomIds: [...user.roomIds],
        roomCodes: [...user.roomCodes],
        lastJoinTime: user.lastJoinTime.toISOString(),
      })),
    rooms: activeRooms.map((room: RoomSnapshot): AdminOverviewRoom => ({
      roomId: room.roomId,
      roomCode: room.roomCode,
      ownerOpenId: room.ownerOpenId,
      gameState: room.gameState,
      currentStage: room.currentStage,
      playerCount: room.playerCount,
      configuredPlayerCount: room.roomConfig.playerCount,
      players: room.players
        .map((player) => ({
          openId: player.openId,
          nickname: player.nickname,
          avatar: player.avatar,
          isReady: player.isReady,
          isAlive: player.isAlive,
          joinTime: player.joinTime.toISOString(),
        }))
        .sort((left, right) => left.joinTime.localeCompare(right.joinTime)),
    })),
    apiDocsMarkdown: loadApiDocsMarkdown(),
    generatedAt: new Date().toISOString(),
  };
}

export function createApp(rooms: RoomStore = new Map()): express.Application {
  const app = express();
  app.use(express.json());
  app.use(express.static(resolveRepoPath("public"), { redirect: false }));

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

  app.get("/admin", (_req: Request, res: Response) => {
    res.sendFile(resolveRepoPath("public", "admin", "index.html"));
  });

  app.use("/admin/vendor/react", express.static(resolveRepoPath("node_modules", "react", "umd")));
  app.use("/admin/vendor/react-dom", express.static(resolveRepoPath("node_modules", "react-dom", "umd")));
  app.use("/admin/vendor/mui", express.static(resolveRepoPath("node_modules", "@mui", "material", "umd")));
  app.use("/admin/vendor/marked", express.static(resolveRepoPath("node_modules", "marked", "lib")));
  app.use("/admin/vendor/dompurify", express.static(resolveRepoPath("node_modules", "dompurify", "dist")));

  const handleAdminOverview = (_req: Request, res: Response) => {
    res.status(200).json(buildAdminOverview(rooms));
  };
  app.get("/admin/api/overview", handleAdminOverview);
  app.get("/api/admin/overview", handleAdminOverview);

  // ── POST /rooms ──────────────────────────────
  app.post("/rooms", (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ownerOpenId, roomConfig: rawRoomConfig, requestId = uuidv4() } = req.body as {
        ownerOpenId: string;
        roomConfig: unknown;
        requestId?: string;
      };
      const roomConfig = validateRoomConfig(rawRoomConfig);
      const room = Room.create({ requestId, ownerOpenId, roomConfig });
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

  app.post("/rooms/:roomId/config", (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, roomConfig: rawRoomConfig, requestId = uuidv4() } = req.body as {
        openId: string;
        roomConfig: unknown;
        requestId?: string;
      };
      const roomConfig = validateRoomConfig(rawRoomConfig);
      const room = loadRoom(roomId);
      room.updateRoomConfig({ requestId, roomId, openId, roomConfig });
      persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  app.post("/rooms/:roomId/ready", (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, ready, requestId = uuidv4() } = req.body as {
        openId: string;
        ready: boolean;
        requestId?: string;
      };
      const room = loadRoom(roomId);
      room.setReady({ requestId, roomId, openId, ready });
      persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  app.post("/rooms/:roomId/role-selection", (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, roleId: rawRoleId, requestId = uuidv4() } = req.body as {
        openId: string;
        roleId: unknown;
        requestId?: string;
      };
      const roleId = validateRole(rawRoleId);
      const room = loadRoom(roomId);
      room.confirmRoleSelection({ requestId, roomId, openId, roleId });
      persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  app.post("/rooms/:roomId/bets", (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, actionCard: rawActionCard, passedBet, requestId = uuidv4() } = req.body as {
        openId: string;
        actionCard?: unknown;
        passedBet?: boolean;
        requestId?: string;
      };
      const actionCard = rawActionCard === undefined ? undefined : validateActionCard(rawActionCard);
      const room = loadRoom(roomId);
      room.submitBet({ requestId, roomId, openId, selectedAction: actionCard, passedBet });
      persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  app.post("/rooms/:roomId/votes", (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, voteTarget, requestId = uuidv4() } = req.body as {
        openId: string;
        voteTarget: string;
        requestId?: string;
      };
      const room = loadRoom(roomId);
      room.submitVote({ requestId, roomId, openId, voteTarget });
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
