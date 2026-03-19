/// <reference types="jest" />

import * as http from "http";
import { RoomStore, createApp } from "../server/app";

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
    const request = http.request(options, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        resolve({
          status: response.statusCode ?? 0,
          body: raw ? (JSON.parse(raw) as JsonBody) : {},
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

  beforeEach(
    () =>
      new Promise<void>((resolve) => {
        store = new Map();
        server = http.createServer(createApp(store));
        server.listen(0, "127.0.0.1", resolve);
      })
  );

  afterEach(
    () =>
      new Promise<void>((resolve) => {
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
});
