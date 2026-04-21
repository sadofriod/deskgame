// Express application factory – HTTP gateway for the DeskGame domain.
// Each route maps a JSON body to the corresponding Room aggregate command.

import fs from "fs";
import path from "path";
import { timingSafeEqual } from "crypto";
import express, { NextFunction, Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Room, RoomSnapshot } from "../domain/aggregates/Room";
import { GameState } from "../domain/types";
import { createRoomRepository, RoomRepository, RoomStore } from "./roomRepository";
import { createUserRepository, UserRepository } from "./userRepository";
import { uuidv4 } from "../utils/uuid";

export type { RoomStore } from "./roomRepository";

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

type AdminCredentials = {
  username: string;
  password: string;
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

type InternalAdminOverviewUser = Omit<AdminOverviewUser, "lastJoinTime"> & {
  lastJoinTime: Date;
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

const resolvedRepoPathCache = new Map<string, string>();

function resolveRepoPath(...segments: string[]): string {
  const appRoot = process.env.APP_ROOT?.trim();
  const cacheKey = JSON.stringify([appRoot ?? "", process.cwd(), segments]);
  const cachedPath = resolvedRepoPathCache.get(cacheKey);
  if (cachedPath) {
    return cachedPath;
  }

  const candidates = [
    appRoot ? path.resolve(appRoot, ...segments) : null,
    path.resolve(process.cwd(), ...segments),
    path.resolve(__dirname, "..", "..", ...segments),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const resolvedPath = candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[candidates.length - 1];
  resolvedRepoPathCache.set(cacheKey, resolvedPath);
  return resolvedPath;
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

const API_DOCS_MARKDOWN = loadApiDocsMarkdown();

function resolveAdminCredentials(): AdminCredentials | null {
  const username = process.env.ADMIN_AUTH_USERNAME?.trim();
  const password = process.env.ADMIN_AUTH_PASSWORD?.trim();
  if (!username || !password) {
    return null;
  }
  return { username, password };
}

function parseBasicAuthHeader(headerValue: string | undefined): AdminCredentials | null {
  if (!headerValue || !headerValue.startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = Buffer.from(headerValue.slice("Basic ".length), "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex <= 0) {
      return null;
    }
    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function constantTimeStringEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveAdminAuthKey(req: Request): string {
  const clientAddress = req.ip || req.socket.remoteAddress;
  if (clientAddress) {
    return ipKeyGenerator(clientAddress);
  }

  const userAgent = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "no-user-agent";
  return `unidentified:${req.method}:${req.path}:${userAgent}`;
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const configuredCredentials = resolveAdminCredentials();
  if (!configuredCredentials) {
    res.status(503).json({ error: "Admin authentication is not configured" });
    return;
  }

  const providedCredentials = parseBasicAuthHeader(
    typeof req.headers.authorization === "string" ? req.headers.authorization : undefined
  );
  if (!providedCredentials) {
    res.setHeader("WWW-Authenticate", 'Basic realm="DeskGame Admin"');
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }

  const usernameMatches = constantTimeStringEquals(providedCredentials.username, configuredCredentials.username);
  const passwordMatches = constantTimeStringEquals(providedCredentials.password, configuredCredentials.password);
  if (!usernameMatches || !passwordMatches) {
    res.status(403).json({ error: "Invalid admin credentials" });
    return;
  }

  next();
}

async function buildAdminOverview(roomRepository: RoomRepository) {
  const snapshots = await roomRepository.list();
  const activeRooms = snapshots
    .filter((room) => room.playerCount > 0 && room.gameState !== GameState.end)
    .sort((left, right) => right.playerCount - left.playerCount || left.roomId.localeCompare(right.roomId));

  const users = new Map<string, InternalAdminOverviewUser>();

  for (const room of activeRooms) {
    // Build a lookup of match-level alive state (if game is running)
    const matchAliveMap = new Map<string, boolean>();
    if (room.match) {
      for (const mp of room.match.players) {
        matchAliveMap.set(mp.openId, mp.isAlive);
      }
    }

    for (const player of room.roomPlayers) {
      const isAlive = matchAliveMap.has(player.openId)
        ? (matchAliveMap.get(player.openId) ?? true)
        : true;
      const existing = users.get(player.openId);
      if (!existing) {
        users.set(player.openId, {
          openId: player.openId,
          nickname: player.nickname,
          avatar: player.avatar,
          isReady: player.isReady,
          isAlive,
          roomIds: [room.roomId],
          roomCodes: [room.roomId],
          lastJoinTime: player.joinedAt ?? new Date(),
        });
        continue;
      }

      if (!existing.roomIds.includes(room.roomId)) existing.roomIds.push(room.roomId);
      if (!existing.roomCodes.includes(room.roomId)) existing.roomCodes.push(room.roomId);
      existing.isReady = existing.isReady || player.isReady;
      existing.isAlive = existing.isAlive || isAlive;
      const joinedAt = player.joinedAt ?? new Date();
      if (joinedAt.getTime() > existing.lastJoinTime.getTime()) {
        existing.lastJoinTime = joinedAt;
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
        lastJoinTime: user.lastJoinTime.toISOString(),
      })),
    rooms: activeRooms.map((room: RoomSnapshot): AdminOverviewRoom => {
      const matchAliveMap = new Map<string, boolean>();
      if (room.match) {
        for (const mp of room.match.players) {
          matchAliveMap.set(mp.openId, mp.isAlive);
        }
      }
      return {
        roomId: room.roomId,
        roomCode: room.roomId,
        ownerOpenId: room.ownerOpenId,
        gameState: room.gameState,
        currentStage: room.currentStage,
        playerCount: room.playerCount,
        configuredPlayerCount: room.playerCount,
        players: room.roomPlayers.map((player) => ({
          openId: player.openId,
          nickname: player.nickname,
          avatar: player.avatar,
          isReady: player.isReady,
          isAlive: matchAliveMap.has(player.openId)
            ? (matchAliveMap.get(player.openId) ?? true)
            : true,
          joinTime: (player.joinedAt ?? new Date()).toISOString(),
        })),
      };
    }),
    apiDocsMarkdown: API_DOCS_MARKDOWN,
    generatedAt: new Date().toISOString(),
  };
}

export function createApp(rooms: RoomStore = new Map()): express.Application {
  const app = express();
  const roomRepository = createRoomRepository(rooms);
  const userRepository = createUserRepository();
  app.use(express.json());
  const publicPageRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: resolveAdminAuthKey,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({ error: "Too many landing page requests" });
    },
  });
  const adminAuthRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: resolveAdminAuthKey,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({ error: "Too many admin authentication attempts" });
    },
  });

  // Helper: persist a Room instance after a command
  async function persist(room: Room): Promise<void> {
    await roomRepository.save(room);
  }

  // Helper: load a Room from the store or 404
  async function loadRoom(roomId: string): Promise<Room> {
    const room = await roomRepository.get(roomId);
    if (!room) throw Object.assign(new Error(`Room ${roomId} not found`), { status: 404 });
    return room;
  }

  const publicIndexPath = resolveRepoPath("public", "index.html");

  app.get("/", publicPageRateLimit, (_req: Request, res: Response) => {
    res.sendFile(publicIndexPath);
  });

  app.get("/index.html", publicPageRateLimit, (_req: Request, res: Response) => {
    res.sendFile(publicIndexPath);
  });

  app.get(/^\/admin$/, adminAuthRateLimit, requireAdminAuth, (_req: Request, res: Response) => {
    res.redirect(308, "/admin/");
  });

  app.get("/admin/api/overview", adminAuthRateLimit, requireAdminAuth, async (_req: Request, res: Response) => {
    res.status(200).json(await buildAdminOverview(roomRepository));
  });

  app.get("/api/admin/overview", adminAuthRateLimit, requireAdminAuth, async (_req: Request, res: Response) => {
    res.status(200).json(await buildAdminOverview(roomRepository));
  });

  app.use(
    "/admin",
    adminAuthRateLimit,
    requireAdminAuth,
    express.static(resolveRepoPath("public", "admin"), { redirect: false })
  );

  // ── POST /rooms ──────────────────────────────
  app.post("/rooms", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ownerOpenId, ruleSetCode, deckTemplateCode, requestId = uuidv4() } = req.body as {
        ownerOpenId: string;
        ruleSetCode: string;
        deckTemplateCode: string;
        requestId?: string;
      };
      if (!ownerOpenId) throw Object.assign(new Error("ownerOpenId is required"), { status: 400 });
      if (!ruleSetCode) throw Object.assign(new Error("ruleSetCode is required"), { status: 400 });
      if (!deckTemplateCode) throw Object.assign(new Error("deckTemplateCode is required"), { status: 400 });
      const room = Room.create({ requestId, ownerOpenId, ruleSetCode, deckTemplateCode });
      await persist(room);
      res.status(201).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  // ── POST /rooms/:roomId/players ──────────────
  // Body: { openId, nickname, avatar, requestId? }
  app.post("/rooms/:roomId/players", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, nickname, avatar, requestId = uuidv4() } = req.body as {
        openId: string;
        nickname: string;
        avatar: string;
        requestId?: string;
      };
      const room = await loadRoom(roomId);
      room.joinRoom({ requestId, roomId, openId, nickname, avatar });
      await persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  // ── DELETE /rooms/:roomId/players/:openId ────
  // Remove a player from the room (leave).
  app.delete("/rooms/:roomId/players/:openId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const openId = String(req.params["openId"]);
      const { requestId = uuidv4() } = (req.body ?? {}) as { requestId?: string };
      const room = await loadRoom(roomId);
      room.leaveRoom({ requestId, roomId, openId });
      await persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  // ── POST /rooms/:roomId/start ─────────────────
  app.post("/rooms/:roomId/start", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, seed = uuidv4(), requestId = uuidv4() } = req.body as {
        openId: string;
        seed?: string;
        requestId?: string;
      };
      const room = await loadRoom(roomId);
      room.startGame({ requestId, roomId, openId, seed });
      await persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  app.post("/rooms/:roomId/role-selection", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, roleCode, requestId = uuidv4() } = req.body as {
        openId: string;
        roleCode: string;
        requestId?: string;
      };
      const room = await loadRoom(roomId);
      room.confirmRoleSelection({ requestId, roomId, openId, roleCode });
      await persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  // ── POST /rooms/:roomId/actions ───────────────
  app.post("/rooms/:roomId/actions", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, cardInstanceId, targetOpenId, requestId = uuidv4() } = req.body as {
        openId: string;
        cardInstanceId: string;
        targetOpenId?: string;
        requestId?: string;
      };
      const room = await loadRoom(roomId);
      room.submitAction({ requestId, roomId, openId, cardInstanceId, targetOpenId });
      await persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  // ── POST /rooms/:roomId/environment/reveal ────
  app.post("/rooms/:roomId/environment/reveal", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, requestId = uuidv4() } = (req.body ?? {}) as { openId?: string; requestId?: string };
      const room = await loadRoom(roomId);
      room.revealEnvironment({ requestId, roomId, ownerOpenId: openId });
      await persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  app.post("/rooms/:roomId/votes", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, voteRound, voteTarget, votePowerAtSubmit, requestId = uuidv4() } = req.body as {
        openId: string;
        voteRound: number;
        voteTarget: string | null;
        votePowerAtSubmit: number;
        requestId?: string;
      };
      const room = await loadRoom(roomId);
      room.submitVote({ requestId, roomId, openId, voteRound, voteTarget: voteTarget ?? null, votePowerAtSubmit: votePowerAtSubmit ?? 1 });
      await persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  // ── POST /rooms/:roomId/stage/advance ────────
  // trigger is always "ownerCommand" from the HTTP API; timeout advances are server-only.
  app.post("/rooms/:roomId/stage/advance", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const { openId, requestId = uuidv4() } = req.body as {
        openId?: string;
        requestId?: string;
      };
      const room = await loadRoom(roomId);
      room.advanceStage({ requestId, roomId, openId, trigger: "ownerCommand" });
      await persist(room);
      res.status(200).json({ events: room.events, room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  // ── GET /rooms/:roomId ───────────────────────
  app.get("/rooms/:roomId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = String(req.params["roomId"]);
      const room = await roomRepository.get(roomId);
      if (!room) {
        res.status(404).json({ error: `Room ${roomId} not found` });
        return;
      }
      res.status(200).json({ room: room.snapshot() });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  // ── POST /users ──────────────────────────────
  // Body: { openId, nickname, unionId?, avatarUrl?, gender?, city?, province?, country?, language? }
  app.post("/users", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        openId,
        nickname,
        unionId,
        avatarUrl,
        gender,
        city,
        province,
        country,
        language,
      } = req.body as {
        openId?: unknown;
        nickname?: unknown;
        unionId?: unknown;
        avatarUrl?: unknown;
        gender?: unknown;
        city?: unknown;
        province?: unknown;
        country?: unknown;
        language?: unknown;
      };

      if (typeof openId !== "string" || !openId.trim()) {
        throw Object.assign(new Error("openId is required"), { status: 400 });
      }
      if (typeof nickname !== "string" || !nickname.trim()) {
        throw Object.assign(new Error("nickname is required"), { status: 400 });
      }

      const user = await userRepository.upsert({
        openId: openId.trim(),
        nickname: nickname.trim(),
        unionId: typeof unionId === "string" ? unionId : null,
        avatarUrl: typeof avatarUrl === "string" ? avatarUrl : null,
        gender: typeof gender === "number" ? gender : null,
        city: typeof city === "string" ? city : null,
        province: typeof province === "string" ? province : null,
        country: typeof country === "string" ? country : null,
        language: typeof language === "string" ? language : null,
      });

      res.status(200).json({ user });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  // ── GET /users/:openId ───────────────────────
  app.get("/users/:openId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const openId = String(req.params["openId"]);
      const user = await userRepository.get(openId);
      if (!user) {
        res.status(404).json({ error: `User ${openId} not found` });
        return;
      }
      res.status(200).json({ user });
    } catch (err) {
      asDomainError(err); next(err);
    }
  });

  // ── PUT /users/:openId ───────────────────────
  // Body: { nickname?, unionId?, avatarUrl?, gender?, city?, province?, country?, language? }
  app.put("/users/:openId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const openId = String(req.params["openId"]);
      const {
        nickname,
        unionId,
        avatarUrl,
        gender,
        city,
        province,
        country,
        language,
      } = req.body as {
        nickname?: unknown;
        unionId?: unknown;
        avatarUrl?: unknown;
        gender?: unknown;
        city?: unknown;
        province?: unknown;
        country?: unknown;
        language?: unknown;
      };

      const updateData: Record<string, unknown> = {};
      if (typeof nickname === "string" && nickname.trim()) updateData["nickname"] = nickname.trim();
      if ("unionId" in req.body) updateData["unionId"] = typeof unionId === "string" ? unionId : null;
      if ("avatarUrl" in req.body) updateData["avatarUrl"] = typeof avatarUrl === "string" ? avatarUrl : null;
      if ("gender" in req.body) updateData["gender"] = typeof gender === "number" ? gender : null;
      if ("city" in req.body) updateData["city"] = typeof city === "string" ? city : null;
      if ("province" in req.body) updateData["province"] = typeof province === "string" ? province : null;
      if ("country" in req.body) updateData["country"] = typeof country === "string" ? country : null;
      if ("language" in req.body) updateData["language"] = typeof language === "string" ? language : null;

      const user = await userRepository.update(openId, updateData);
      if (!user) {
        res.status(404).json({ error: `User ${openId} not found` });
        return;
      }
      res.status(200).json({ user });
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
