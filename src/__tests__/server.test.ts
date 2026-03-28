/// <reference types="jest" />

import * as http from "http";
import * as os from "os";
import { RoomStore, createApp } from "../server/app";

type JsonBody = Record<string, unknown>;

function makeRequest(
  server: http.Server,
  method: string,
  path: string,
  body?: JsonBody,
  headers?: http.OutgoingHttpHeaders
): Promise<{ status: number; body: JsonBody | string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const bodyStr = body ? JSON.stringify(body) : "";
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: addr.port,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
        ...headers,
      },
    };
    const request = http.request(options, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        const contentType = response.headers["content-type"] ?? "";
        resolve({
          status: response.statusCode ?? 0,
          body: raw && contentType.includes("application/json") ? (JSON.parse(raw) as JsonBody) : raw,
        });
      });
    });
    request.on("error", reject);
    if (bodyStr) request.write(bodyStr);
    request.end();
  });
}

describe("Express HTTP gateway", () => {
  let server: http.Server;
  let store: RoomStore;
  const OWNER = "owner-open-id";
  const ORIGINAL_CWD = process.cwd();
  const ORIGINAL_ADMIN_USERS = process.env.ADMIN_USERS;
  const ORIGINAL_ADMIN_AUTH_USERNAME = process.env.ADMIN_AUTH_USERNAME;
  const ORIGINAL_ADMIN_AUTH_PASSWORD = process.env.ADMIN_AUTH_PASSWORD;
  const ORIGINAL_APP_ROOT = process.env.APP_ROOT;
  const ADMIN_AUTH_HEADER = `Basic ${Buffer.from("desk-admin:secret-pass").toString("base64")}`;

  beforeEach(
    () =>
      new Promise<void>((resolve) => {
        delete process.env.ADMIN_USERS;
        process.env.ADMIN_AUTH_USERNAME = "desk-admin";
        process.env.ADMIN_AUTH_PASSWORD = "secret-pass";
        delete process.env.APP_ROOT;
        store = new Map();
        server = http.createServer(createApp(store));
        server.listen(0, "127.0.0.1", resolve);
      })
  );

  afterEach(
    () =>
      new Promise<void>((resolve) => {
        if (ORIGINAL_ADMIN_USERS === undefined) {
          delete process.env.ADMIN_USERS;
        } else {
          process.env.ADMIN_USERS = ORIGINAL_ADMIN_USERS;
        }
        if (ORIGINAL_ADMIN_AUTH_USERNAME === undefined) {
          delete process.env.ADMIN_AUTH_USERNAME;
        } else {
          process.env.ADMIN_AUTH_USERNAME = ORIGINAL_ADMIN_AUTH_USERNAME;
        }
        if (ORIGINAL_ADMIN_AUTH_PASSWORD === undefined) {
          delete process.env.ADMIN_AUTH_PASSWORD;
        } else {
          process.env.ADMIN_AUTH_PASSWORD = ORIGINAL_ADMIN_AUTH_PASSWORD;
        }
        if (ORIGINAL_APP_ROOT === undefined) {
          delete process.env.APP_ROOT;
        } else {
          process.env.APP_ROOT = ORIGINAL_APP_ROOT;
        }
        process.chdir(ORIGINAL_CWD);
        server.close(() => resolve());
      })
  );

  async function createRoom() {
    const response = await makeRequest(server, "POST", "/rooms", {
      ownerOpenId: OWNER,
      roomConfig: { playerCount: 5, roleConfig: "independent" },
      requestId: "create-room",
    });
    expect(response.status).toBe(201);
    return (response.body as { room: { roomId: string } }).room.roomId;
  }

  async function joinPlayers(roomId: string, count: number) {
    for (let index = 1; index <= count; index++) {
      const response = await makeRequest(server, "POST", `/rooms/${roomId}/players`, {
        openId: `player-${index}`,
        nickname: `Player ${index}`,
        avatar: "",
        requestId: `join-${index}`,
      });
      expect(response.status).toBe(200);
    }
  }

  async function readyAll(roomId: string) {
    const response = await makeRequest(server, "GET", `/rooms/${roomId}`);
    const players = (response.body as { room: { players: Array<{ openId: string }> } }).room.players;
    for (const player of players) {
      const readyResponse = await makeRequest(server, "POST", `/rooms/${roomId}/ready`, {
        openId: player.openId,
        ready: true,
        requestId: `ready-${player.openId}`,
      });
      expect(readyResponse.status).toBe(200);
    }
  }

  async function confirmRoles(roomId: string) {
    const response = await makeRequest(server, "GET", `/rooms/${roomId}`);
    const players = (response.body as {
      room: { players: Array<{ openId: string; candidateRoles: string[] }> };
    }).room.players;
    for (const [index, player] of players.entries()) {
      const roleId =
        index === 0
          ? player.candidateRoles.find((role) => role !== "passenger") ?? player.candidateRoles[0]
          : player.candidateRoles.find((role) => role === "passenger") ?? player.candidateRoles[0];
      const selectResponse = await makeRequest(server, "POST", `/rooms/${roomId}/role-selection`, {
        openId: player.openId,
        roleId,
        requestId: `role-${player.openId}`,
      });
      expect(selectResponse.status).toBe(200);
    }
  }

  it("creates room with owner in lobby", async () => {
    const roomId = await createRoom();
    const response = await makeRequest(server, "GET", `/rooms/${roomId}`);
    expect(response.status).toBe(200);
    const room = (response.body as { room: { playerCount: number; currentStage: string } }).room;
    expect(room.playerCount).toBe(1);
    expect(room.currentStage).toBe("lobby");
  });

  it("updates room config through owner endpoint", async () => {
    const roomId = await createRoom();
    const response = await makeRequest(server, "POST", `/rooms/${roomId}/config`, {
      openId: OWNER,
      roomConfig: { playerCount: 6, roleConfig: "faction" },
      requestId: "cfg-1",
    });
    expect(response.status).toBe(200);
    const room = (response.body as { room: { roomConfig: { playerCount: number } } }).room;
    expect(room.roomConfig.playerCount).toBe(6);
  });

  it("starts role selection after all players are ready", async () => {
    const roomId = await createRoom();
    await joinPlayers(roomId, 4);
    await readyAll(roomId);
    const response = await makeRequest(server, "GET", `/rooms/${roomId}`);
    expect((response.body as { room: { currentStage: string } }).room.currentStage).toBe("roleSelection");
  });

  it("enters bet stage after role confirmation", async () => {
    const roomId = await createRoom();
    await joinPlayers(roomId, 4);
    await readyAll(roomId);
    await confirmRoles(roomId);
    const response = await makeRequest(server, "GET", `/rooms/${roomId}`);
    const room = (response.body as { room: { gameState: string; currentStage: string; currentRound: number } }).room;
    expect(room.gameState).toBe("playing");
    expect(room.currentStage).toBe("bet");
    expect(room.currentRound).toBe(1);
  });

  it("rejects invalid action card on bet submission", async () => {
    const roomId = await createRoom();
    await joinPlayers(roomId, 4);
    await readyAll(roomId);
    await confirmRoles(roomId);
    const response = await makeRequest(server, "POST", `/rooms/${roomId}/bets`, {
      openId: OWNER,
      actionCard: "bad-card",
      requestId: "bet-bad",
    });
    expect(response.status).toBe(400);
  });

  it("advances from bet to action", async () => {
    const roomId = await createRoom();
    await joinPlayers(roomId, 4);
    await readyAll(roomId);
    await confirmRoles(roomId);

    const roomSnapshot = await makeRequest(server, "GET", `/rooms/${roomId}`);
    const players = (roomSnapshot.body as { room: { players: Array<{ openId: string }> } }).room.players;
    for (const player of players) {
      const response = await makeRequest(server, "POST", `/rooms/${roomId}/bets`, {
        openId: player.openId,
        actionCard: "listen",
        requestId: `bet-${player.openId}`,
      });
      expect(response.status).toBe(200);
    }

    const advanceResponse = await makeRequest(server, "POST", `/rooms/${roomId}/stage/advance`, {
      openId: OWNER,
      requestId: "advance-1",
    });
    expect(advanceResponse.status).toBe(200);
    const room = (advanceResponse.body as { room: { currentStage: string } }).room;
    expect(room.currentStage).toBe("action");
  });

  it("aggregates admin overview stats and markdown docs", async () => {
    process.env.ADMIN_USERS = JSON.stringify([
      { id: "ops-1", name: "运营管理员", email: "ops@example.com", avatar: "https://example.com/admin.png" },
    ]);

    const roomId = await createRoom();
    await joinPlayers(roomId, 1);

    const response = await makeRequest(server, "GET", "/api/admin/overview", undefined, {
      Authorization: ADMIN_AUTH_HEADER,
    });
    expect(response.status).toBe(200);

    const body = response.body as {
      admins: Array<{ name: string; email: string }>;
      stats: { onlineUserCount: number; activeRoomCount: number };
      users: Array<{ openId: string; roomCodes: string[] }>;
      rooms: Array<{ roomId: string; playerCount: number }>;
      apiDocsMarkdown: string;
    };

    expect(body.admins).toEqual([
      expect.objectContaining({ name: "运营管理员", email: "ops@example.com" }),
    ]);
    expect(body.stats.onlineUserCount).toBe(2);
    expect(body.stats.activeRoomCount).toBe(1);
    expect(body.rooms).toHaveLength(1);
    expect(body.rooms[0]?.roomId).toBe(roomId);
    expect(body.rooms[0]?.playerCount).toBe(2);
    expect(body.users).toHaveLength(2);
    expect(body.users.some((user) => user.openId === OWNER && user.roomCodes.length === 1)).toBe(true);
    expect(body.apiDocsMarkdown).toContain("DeskGame Backend 接入文档");
  });

  it("serves the admin spa shell", async () => {
    const redirectResponse = await makeRequest(server, "GET", "/admin", undefined, {
      Authorization: ADMIN_AUTH_HEADER,
    });
    expect(redirectResponse.status).toBe(308);

    const response = await makeRequest(server, "GET", "/admin/", undefined, {
      Authorization: ADMIN_AUTH_HEADER,
    });
    expect(response.status).toBe(200);
    expect(typeof response.body).toBe("string");
    expect(response.body).toContain("DeskGame 管理后台");
    expect(response.body).toContain("/api/admin/overview");
    expect(response.body).toContain("setInterval");
  });

  it("serves the public landing page", async () => {
    const response = await makeRequest(server, "GET", "/");
    expect(response.status).toBe(200);
    expect(typeof response.body).toBe("string");
    expect(response.body).toContain("DeskGame 已部署");
    expect(response.body).toContain("/admin/");
  });

  it("serves public index.html directly", async () => {
    const response = await makeRequest(server, "GET", "/index.html");
    expect(response.status).toBe(200);
    expect(typeof response.body).toBe("string");
    expect(response.body).toContain("DeskGame 服务入口");
  });

  it("resolves static assets from APP_ROOT when provided", async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.env.APP_ROOT = ORIGINAL_CWD;
    process.chdir(os.tmpdir());
    server = http.createServer(createApp(store));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    const response = await makeRequest(server, "GET", "/index.html");
    expect(response.status).toBe(200);
    expect(typeof response.body).toBe("string");
    expect(response.body).toContain("DeskGame 已部署");
  });

  it("rejects unauthenticated admin requests", async () => {
    const apiResponse = await makeRequest(server, "GET", "/api/admin/overview");
    expect(apiResponse.status).toBe(401);

    const pageResponse = await makeRequest(server, "GET", "/admin/");
    expect(pageResponse.status).toBe(401);
  });

  it("rejects invalid admin credentials", async () => {
    const response = await makeRequest(server, "GET", "/api/admin/overview", undefined, {
      Authorization: `Basic ${Buffer.from("desk-admin:wrong-pass").toString("base64")}`,
    });
    expect(response.status).toBe(403);
  });

  it("rate limits repeated failed admin authentication attempts", async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await makeRequest(server, "GET", "/api/admin/overview", undefined, {
        Authorization: `Basic ${Buffer.from("desk-admin:wrong-pass").toString("base64")}`,
      });
      expect(response.status).toBe(403);
    }

    const rateLimitedResponse = await makeRequest(server, "GET", "/api/admin/overview", undefined, {
      Authorization: `Basic ${Buffer.from("desk-admin:wrong-pass").toString("base64")}`,
    });
    expect(rateLimitedResponse.status).toBe(429);
  });

  // ── User API ─────────────────────────────────

  it("upserts a user via POST /users", async () => {
    const response = await makeRequest(server, "POST", "/users", {
      openId: "wx-open-001",
      nickName: "Alice",
      avatarUrl: "https://example.com/avatar.png",
      gender: 1,
      city: "Shanghai",
      province: "Shanghai",
      country: "CN",
      language: "zh_CN",
    });
    expect(response.status).toBe(200);
    const user = (response.body as { user: Record<string, unknown> }).user;
    expect(user["openId"]).toBe("wx-open-001");
    expect(user["nickName"]).toBe("Alice");
    expect(user["avatarUrl"]).toBe("https://example.com/avatar.png");
    expect(user["gender"]).toBe(1);
    expect(user["city"]).toBe("Shanghai");
  });

  it("returns 400 when openId is missing on POST /users", async () => {
    const response = await makeRequest(server, "POST", "/users", {
      nickName: "Alice",
    });
    expect(response.status).toBe(400);
  });

  it("returns 400 when nickName is missing on POST /users", async () => {
    const response = await makeRequest(server, "POST", "/users", {
      openId: "wx-open-002",
    });
    expect(response.status).toBe(400);
  });

  it("retrieves a user via GET /users/:openId", async () => {
    await makeRequest(server, "POST", "/users", {
      openId: "wx-open-003",
      nickName: "Bob",
    });

    const response = await makeRequest(server, "GET", "/users/wx-open-003");
    expect(response.status).toBe(200);
    const user = (response.body as { user: Record<string, unknown> }).user;
    expect(user["openId"]).toBe("wx-open-003");
    expect(user["nickName"]).toBe("Bob");
  });

  it("returns 404 for unknown user on GET /users/:openId", async () => {
    const response = await makeRequest(server, "GET", "/users/no-such-user");
    expect(response.status).toBe(404);
  });

  it("updates a user via PUT /users/:openId", async () => {
    await makeRequest(server, "POST", "/users", {
      openId: "wx-open-004",
      nickName: "Carol",
      city: "Beijing",
    });

    const response = await makeRequest(server, "PUT", "/users/wx-open-004", {
      nickName: "Caroline",
      city: "Shenzhen",
    });
    expect(response.status).toBe(200);
    const user = (response.body as { user: Record<string, unknown> }).user;
    expect(user["nickName"]).toBe("Caroline");
    expect(user["city"]).toBe("Shenzhen");
  });

  it("returns 404 when updating a non-existent user via PUT /users/:openId", async () => {
    const response = await makeRequest(server, "PUT", "/users/no-such-user", {
      nickName: "Ghost",
    });
    expect(response.status).toBe(404);
  });

  it("upsert overwrites nickName on second call for same openId", async () => {
    await makeRequest(server, "POST", "/users", {
      openId: "wx-open-005",
      nickName: "Dave",
    });

    const second = await makeRequest(server, "POST", "/users", {
      openId: "wx-open-005",
      nickName: "David",
      city: "Guangzhou",
    });
    expect(second.status).toBe(200);
    const user = (second.body as { user: Record<string, unknown> }).user;
    expect(user["nickName"]).toBe("David");
    expect(user["city"]).toBe("Guangzhou");
  });
});
