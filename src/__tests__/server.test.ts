// Tests for the Express HTTP gateway (src/server/app.ts).
// Covers the full request/response contract for each route.

import { RoomStore, createApp } from "../server/app";
import * as http from "http";

type JsonBody = Record<string, unknown>;

function makeRequest(
  server: http.Server,
  method: string,
  path: string,
  body?: JsonBody
): Promise<{ status: number; body: JsonBody }> {
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
      },
    };
    const httpReq = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString()) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: {} });
        }
      });
    });
    httpReq.on("error", reject);
    if (bodyStr) httpReq.write(bodyStr);
    httpReq.end();
  });
}

// ──────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────

describe("Express HTTP gateway", () => {
  let server: http.Server;
  let store: RoomStore;
  const OWNER = "owner-open-id";
  const SEED = "test-seed-42";

  beforeEach(() => {
    // Fresh in-memory store per test
    store = new Map();
    server = http.createServer(createApp(store));
    server.listen(0); // random available port
  });

  afterEach((done) => {
    server.close(done);
  });

  // Helper – creates a room and returns roomId
  async function createRoom(): Promise<string> {
    const res = await makeRequest(server, "POST", "/rooms", {
      ownerOpenId: OWNER,
      roleConfig: "independent",
      requestId: "req-create",
    });
    expect(res.status).toBe(201);
    return (res.body as { room: { roomId: string } }).room.roomId;
  }

  // Helper – joins `count` extra players
  async function joinPlayers(roomId: string, count: number, startIdx = 0): Promise<void> {
    for (let i = 0; i < count; i++) {
      const idx = startIdx + i;
      const res = await makeRequest(server, "POST", `/rooms/${roomId}/players`, {
        openId: `player-${idx}`,
        nickname: `Player ${idx}`,
        avatar: "",
        requestId: `req-join-${idx}`,
      });
      expect(res.status).toBe(200);
    }
  }

  // ── POST /rooms ──────────────────────────────
  describe("POST /rooms", () => {
    it("creates a room and returns 201 with snapshot", async () => {
      const res = await makeRequest(server, "POST", "/rooms", {
        ownerOpenId: OWNER,
        roleConfig: "independent",
        requestId: "req-1",
      });
      expect(res.status).toBe(201);
      const body = res.body as { room: { ownerOpenId: string; gameState: string } };
      expect(body.room.ownerOpenId).toBe(OWNER);
      expect(body.room.gameState).toBe("wait");
    });

    it("returns 400 when ownerOpenId is missing", async () => {
      const res = await makeRequest(server, "POST", "/rooms", {
        roleConfig: "independent",
        requestId: "req-2",
      });
      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toMatch(/ownerOpenId/);
    });
  });

  // ── GET /rooms/:roomId ───────────────────────
  describe("GET /rooms/:roomId", () => {
    it("returns the room snapshot", async () => {
      const roomId = await createRoom();
      const res = await makeRequest(server, "GET", `/rooms/${roomId}`);
      expect(res.status).toBe(200);
      expect((res.body as { room: { roomId: string } }).room.roomId).toBe(roomId);
    });

    it("returns 404 for unknown room", async () => {
      const res = await makeRequest(server, "GET", "/rooms/does-not-exist");
      expect(res.status).toBe(404);
    });
  });

  // ── POST /rooms/:roomId/players ──────────────
  describe("POST /rooms/:roomId/players", () => {
    it("adds a player to the room", async () => {
      const roomId = await createRoom();
      const res = await makeRequest(server, "POST", `/rooms/${roomId}/players`, {
        openId: "p1",
        nickname: "Alice",
        avatar: "",
        requestId: "req-join-1",
      });
      expect(res.status).toBe(200);
      const body = res.body as { room: { playerCount: number } };
      expect(body.room.playerCount).toBe(1);
    });

    it("returns 400 for duplicate player", async () => {
      const roomId = await createRoom();
      await makeRequest(server, "POST", `/rooms/${roomId}/players`, {
        openId: "p1",
        nickname: "Alice",
        avatar: "",
        requestId: "req-join-1",
      });
      const res = await makeRequest(server, "POST", `/rooms/${roomId}/players`, {
        openId: "p1",
        nickname: "Alice",
        avatar: "",
        requestId: "req-join-2",
      });
      expect(res.status).toBe(400);
    });

    it("returns 404 for unknown room", async () => {
      const res = await makeRequest(server, "POST", "/rooms/no-room/players", {
        openId: "p1",
        nickname: "Alice",
        avatar: "",
      });
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /rooms/:roomId/players/:openId ────
  describe("DELETE /rooms/:roomId/players/:openId", () => {
    it("removes a player from the room", async () => {
      const roomId = await createRoom();
      await joinPlayers(roomId, 1, 0);
      const res = await makeRequest(server, "DELETE", `/rooms/${roomId}/players/player-0`);
      expect(res.status).toBe(200);
      const body = res.body as { room: { playerCount: number } };
      expect(body.room.playerCount).toBe(0);
    });
  });

  // ── POST /rooms/:roomId/start ────────────────
  describe("POST /rooms/:roomId/start", () => {
    it("starts the game with 5 players", async () => {
      const roomId = await createRoom();
      // Owner joins first
      await makeRequest(server, "POST", `/rooms/${roomId}/players`, {
        openId: OWNER,
        nickname: "Owner",
        avatar: "",
        requestId: "req-owner-join",
      });
      await joinPlayers(roomId, 4, 1);

      const res = await makeRequest(server, "POST", `/rooms/${roomId}/start`, {
        openId: OWNER,
        seed: SEED,
        requestId: "req-start",
      });
      expect(res.status).toBe(200);
      const body = res.body as { room: { gameState: string } };
      expect(body.room.gameState).toBe("start");
    });

    it("returns 400 when non-owner tries to start", async () => {
      const roomId = await createRoom();
      await makeRequest(server, "POST", `/rooms/${roomId}/players`, {
        openId: OWNER,
        nickname: "Owner",
        avatar: "",
        requestId: "req-owner-join",
      });
      await joinPlayers(roomId, 4, 1);

      const res = await makeRequest(server, "POST", `/rooms/${roomId}/start`, {
        openId: "player-1",
        seed: SEED,
        requestId: "req-start",
      });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /rooms/:roomId/actions ──────────────
  describe("POST /rooms/:roomId/actions", () => {
    it("returns 400 when not in action stage", async () => {
      const roomId = await createRoom();
      // Owner joins
      await makeRequest(server, "POST", `/rooms/${roomId}/players`, {
        openId: OWNER,
        nickname: "Owner",
        avatar: "",
        requestId: "req-owner-join",
      });
      await joinPlayers(roomId, 4, 1);
      await makeRequest(server, "POST", `/rooms/${roomId}/start`, {
        openId: OWNER,
        seed: SEED,
        requestId: "req-start",
      });
      // Still in 'night' stage; submitting action should fail
      const res = await makeRequest(server, "POST", `/rooms/${roomId}/actions`, {
        openId: OWNER,
        actionCard: "listen",
        requestId: "req-action",
      });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /rooms/:roomId/stage/advance ────────
  describe("POST /rooms/:roomId/stage/advance", () => {
    it("advances stage from night to action", async () => {
      const roomId = await createRoom();
      await makeRequest(server, "POST", `/rooms/${roomId}/players`, {
        openId: OWNER,
        nickname: "Owner",
        avatar: "",
        requestId: "req-owner-join",
      });
      await joinPlayers(roomId, 4, 1);
      await makeRequest(server, "POST", `/rooms/${roomId}/start`, {
        openId: OWNER,
        seed: SEED,
        requestId: "req-start",
      });

      const res = await makeRequest(server, "POST", `/rooms/${roomId}/stage/advance`, {
        openId: OWNER,
        requestId: "req-advance",
      });
      expect(res.status).toBe(200);
      const body = res.body as { room: { currentStage: string } };
      expect(body.room.currentStage).toBe("action");
    });
  });
});
