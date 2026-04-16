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
        if (ORIGINAL_ADMIN_USERS === undefined) delete process.env.ADMIN_USERS;
        else process.env.ADMIN_USERS = ORIGINAL_ADMIN_USERS;
        if (ORIGINAL_ADMIN_AUTH_USERNAME === undefined) delete process.env.ADMIN_AUTH_USERNAME;
        else process.env.ADMIN_AUTH_USERNAME = ORIGINAL_ADMIN_AUTH_USERNAME;
        if (ORIGINAL_ADMIN_AUTH_PASSWORD === undefined) delete process.env.ADMIN_AUTH_PASSWORD;
        else process.env.ADMIN_AUTH_PASSWORD = ORIGINAL_ADMIN_AUTH_PASSWORD;
        if (ORIGINAL_APP_ROOT === undefined) delete process.env.APP_ROOT;
        else process.env.APP_ROOT = ORIGINAL_APP_ROOT;
        process.chdir(ORIGINAL_CWD);
        server.close(() => resolve());
      })
  );

  // ── Room helpers ──────────────────────────────

  async function createRoom() {
    const response = await makeRequest(server, "POST", "/rooms", {
      ownerOpenId: OWNER,
      ruleSetCode: "classic_v1",
      deckTemplateCode: "classic_pool_v1",
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

  async function startGame(roomId: string) {
    const response = await makeRequest(server, "POST", `/rooms/${roomId}/start`, {
      openId: OWNER,
      seed: "test-seed",
      requestId: "start-game",
    });
    expect(response.status).toBe(200);
    return response;
  }

  async function confirmRoles(roomId: string) {
    const response = await makeRequest(server, "GET", `/rooms/${roomId}`);
    const matchPlayers = (response.body as {
      room: { match: { players: Array<{ openId: string; roleOptions: string[] }> } };
    }).room.match.players;
    for (const [index, player] of matchPlayers.entries()) {
      const roleCode = player.roleOptions[0]!;
      const selectResponse = await makeRequest(server, "POST", `/rooms/${roomId}/role-selection`, {
        openId: player.openId,
        roleCode,
        requestId: `role-${index}`,
      });
      expect(selectResponse.status).toBe(200);
    }
    // All roles confirmed → advance to bet
    const advRes = await makeRequest(server, "POST", `/rooms/${roomId}/stage/advance`, {
      openId: OWNER,
      requestId: "prep-to-bet",
    });
    expect(advRes.status).toBe(200);
  }

  // ── Room API tests ────────────────────────────

  it("creates room with owner in preparation stage", async () => {
    const roomId = await createRoom();
    const response = await makeRequest(server, "GET", `/rooms/${roomId}`);
    expect(response.status).toBe(200);
    const room = (response.body as { room: { playerCount: number; currentStage: string } }).room;
    expect(room.playerCount).toBe(1);
    expect(room.currentStage).toBe("preparation");
  });

  it("returns 400 when ownerOpenId is missing on POST /rooms", async () => {
    const response = await makeRequest(server, "POST", "/rooms", {
      ruleSetCode: "classic_v1",
      deckTemplateCode: "classic_pool_v1",
    });
    expect(response.status).toBe(400);
  });

  it("returns 400 when ruleSetCode is missing on POST /rooms", async () => {
    const response = await makeRequest(server, "POST", "/rooms", {
      ownerOpenId: OWNER,
      deckTemplateCode: "classic_pool_v1",
    });
    expect(response.status).toBe(400);
  });

  it("player can join and leave a room", async () => {
    const roomId = await createRoom();
    const joinRes = await makeRequest(server, "POST", `/rooms/${roomId}/players`, {
      openId: "new-player",
      nickname: "New",
      avatar: "",
      requestId: "join-1",
    });
    expect(joinRes.status).toBe(200);
    expect((joinRes.body as { room: { playerCount: number } }).room.playerCount).toBe(2);

    const leaveRes = await makeRequest(server, "DELETE", `/rooms/${roomId}/players/new-player`);
    expect(leaveRes.status).toBe(200);
    expect((leaveRes.body as { room: { playerCount: number } }).room.playerCount).toBe(1);
  });

  it("startGame transitions to preparation stage", async () => {
    const roomId = await createRoom();
    await joinPlayers(roomId, 4); // owner + 4 = 5 players
    const response = await startGame(roomId);
    const room = (response.body as { room: { gameState: string; currentStage: string } }).room;
    expect(room.gameState).toBe("start");
    expect(room.currentStage).toBe("preparation");
  });

  it("startGame rejects fewer than 5 players", async () => {
    const roomId = await createRoom();
    await joinPlayers(roomId, 2); // owner + 2 = 3 players
    const response = await makeRequest(server, "POST", `/rooms/${roomId}/start`, {
      openId: OWNER,
      seed: "s",
      requestId: "sg-bad",
    });
    expect(response.status).toBe(400);
  });

  it("enters bet stage after role confirmation", async () => {
    const roomId = await createRoom();
    await joinPlayers(roomId, 4);
    await startGame(roomId);
    await confirmRoles(roomId);
    const response = await makeRequest(server, "GET", `/rooms/${roomId}`);
    const room = (response.body as { room: { gameState: string; currentStage: string } }).room;
    expect(room.gameState).toBe("start");
    expect(room.currentStage).toBe("bet");
  });

  it("rejects role selection with invalid roleCode", async () => {
    const roomId = await createRoom();
    await joinPlayers(roomId, 4);
    await startGame(roomId);
    const response = await makeRequest(server, "POST", `/rooms/${roomId}/role-selection`, {
      openId: OWNER,
      roleCode: "totally_fake_role",
      requestId: "bad-role",
    });
    expect(response.status).toBe(400);
  });

  it("advances from bet to environment", async () => {
    const roomId = await createRoom();
    await joinPlayers(roomId, 4);
    await startGame(roomId);
    await confirmRoles(roomId);

    // Now in bet stage – advance to environment
    const advanceResponse = await makeRequest(server, "POST", `/rooms/${roomId}/stage/advance`, {
      openId: OWNER,
      requestId: "advance-1",
    });
    expect(advanceResponse.status).toBe(200);
    const room = (advanceResponse.body as { room: { currentStage: string } }).room;
    expect(room.currentStage).toBe("environment");
  });

  it("rejects action submission with unknown card", async () => {
    const roomId = await createRoom();
    await joinPlayers(roomId, 4);
    await startGame(roomId);
    await confirmRoles(roomId);

    const response = await makeRequest(server, "POST", `/rooms/${roomId}/actions`, {
      openId: OWNER,
      cardInstanceId: "nonexistent-card-id",
      requestId: "act-bad",
    });
    expect(response.status).toBe(400);
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
      nickname: "Alice",
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
    expect(user["nickname"]).toBe("Alice");
    expect(user["avatarUrl"]).toBe("https://example.com/avatar.png");
    expect(user["gender"]).toBe(1);
    expect(user["city"]).toBe("Shanghai");
  });

  it("returns 400 when openId is missing on POST /users", async () => {
    const response = await makeRequest(server, "POST", "/users", {
      nickname: "Alice",
    });
    expect(response.status).toBe(400);
  });

  it("returns 400 when nickname is missing on POST /users", async () => {
    const response = await makeRequest(server, "POST", "/users", {
      openId: "wx-open-002",
    });
    expect(response.status).toBe(400);
  });

  it("retrieves a user via GET /users/:openId", async () => {
    await makeRequest(server, "POST", "/users", {
      openId: "wx-open-003",
      nickname: "Bob",
    });

    const response = await makeRequest(server, "GET", "/users/wx-open-003");
    expect(response.status).toBe(200);
    const user = (response.body as { user: Record<string, unknown> }).user;
    expect(user["openId"]).toBe("wx-open-003");
    expect(user["nickname"]).toBe("Bob");
  });

  it("returns 404 for unknown user on GET /users/:openId", async () => {
    const response = await makeRequest(server, "GET", "/users/no-such-user");
    expect(response.status).toBe(404);
  });

  it("updates a user via PUT /users/:openId", async () => {
    await makeRequest(server, "POST", "/users", {
      openId: "wx-open-004",
      nickname: "Carol",
      city: "Beijing",
    });

    const response = await makeRequest(server, "PUT", "/users/wx-open-004", {
      nickname: "Caroline",
      city: "Shenzhen",
    });
    expect(response.status).toBe(200);
    const user = (response.body as { user: Record<string, unknown> }).user;
    expect(user["nickname"]).toBe("Caroline");
    expect(user["city"]).toBe("Shenzhen");
  });

  it("returns 404 when updating a non-existent user via PUT /users/:openId", async () => {
    const response = await makeRequest(server, "PUT", "/users/no-such-user", {
      nickname: "Ghost",
    });
    expect(response.status).toBe(404);
  });

  it("upsert overwrites nickname on second call for same openId", async () => {
    await makeRequest(server, "POST", "/users", {
      openId: "wx-open-005",
      nickname: "Dave",
    });

    const second = await makeRequest(server, "POST", "/users", {
      openId: "wx-open-005",
      nickname: "David",
      city: "Guangzhou",
    });
    expect(second.status).toBe(200);
    const user = (second.body as { user: Record<string, unknown> }).user;
    expect(user["nickname"]).toBe("David");
    expect(user["city"]).toBe("Guangzhou");
  });
});
