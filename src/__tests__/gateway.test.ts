// Tests for gateway/RoomRegistry and gateway/RoomGateway

import { createServer } from "http";
import { Room } from "../domain/aggregates/Room";
import { GameState, Stage } from "../domain/types";
import { RoomRegistry } from "../gateway/RoomRegistry";
import { RoomGateway } from "../gateway/RoomGateway";
import { WsMessage } from "../gateway/types";
import { io as connectClient, Socket } from "socket.io-client";

// ──────────────────────────────────────────────
// RoomRegistry tests
// ──────────────────────────────────────────────

describe("RoomRegistry", () => {
  it("stores and retrieves a room", () => {
    const registry = new RoomRegistry();
    const room = Room.create({ requestId: "r1", ownerOpenId: "owner1", roleConfig: "independent" });
    registry.set(room.id, room);
    expect(registry.get(room.id)).toBe(room);
  });

  it("returns undefined for unknown roomId", () => {
    const registry = new RoomRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("has() reflects presence correctly", () => {
    const registry = new RoomRegistry();
    const room = Room.create({ requestId: "r2", ownerOpenId: "owner2", roleConfig: "independent" });
    expect(registry.has(room.id)).toBe(false);
    registry.set(room.id, room);
    expect(registry.has(room.id)).toBe(true);
  });

  it("delete() removes a room", () => {
    const registry = new RoomRegistry();
    const room = Room.create({ requestId: "r3", ownerOpenId: "owner3", roleConfig: "independent" });
    registry.set(room.id, room);
    registry.delete(room.id);
    expect(registry.has(room.id)).toBe(false);
  });

  it("size() tracks count accurately", () => {
    const registry = new RoomRegistry();
    expect(registry.size()).toBe(0);
    const r1 = Room.create({ requestId: "r4a", ownerOpenId: "o1", roleConfig: "independent" });
    const r2 = Room.create({ requestId: "r4b", ownerOpenId: "o2", roleConfig: "independent" });
    registry.set(r1.id, r1);
    registry.set(r2.id, r2);
    expect(registry.size()).toBe(2);
    registry.delete(r1.id);
    expect(registry.size()).toBe(1);
  });

  it("roomIds() returns all registered ids", () => {
    const registry = new RoomRegistry();
    const r1 = Room.create({ requestId: "r5a", ownerOpenId: "o1", roleConfig: "independent" });
    const r2 = Room.create({ requestId: "r5b", ownerOpenId: "o2", roleConfig: "independent" });
    registry.set(r1.id, r1);
    registry.set(r2.id, r2);
    const ids = registry.roomIds();
    expect(ids).toContain(r1.id);
    expect(ids).toContain(r2.id);
  });

  it("getSnapshot() returns undefined for unknown room", () => {
    const registry = new RoomRegistry();
    expect(registry.getSnapshot("missing")).toBeUndefined();
  });

  it("getSnapshot() returns a valid snapshot for an existing room", () => {
    const registry = new RoomRegistry();
    const room = Room.create({ requestId: "r6", ownerOpenId: "snap-owner", roleConfig: "independent" });
    registry.set(room.id, room);
    const snap = registry.getSnapshot(room.id);
    expect(snap).toBeDefined();
    expect(snap!.ownerOpenId).toBe("snap-owner");
    expect(snap!.gameState).toBe(GameState.wait);
  });
});

// ──────────────────────────────────────────────
// RoomGateway integration tests
// ──────────────────────────────────────────────

/** Helper: create an http server + RoomGateway and connect a client. */
function createGateway(): {
  gateway: RoomGateway;
  client: () => Socket;
  cleanup: () => Promise<void>;
  port: number;
} {
  const httpServer = createServer();
  const registry = new RoomRegistry();
  const gateway = new RoomGateway(httpServer, { registry });

  let port = 0;
  httpServer.listen(0);
  const addr = httpServer.address();
  if (addr && typeof addr === "object") {
    port = addr.port;
  }

  const clients: Socket[] = [];
  const client = () => {
    const s = connectClient(`http://localhost:${port}`, { autoConnect: false });
    clients.push(s);
    return s;
  };

  const cleanup = async () => {
    for (const s of clients) {
      if (s.connected) s.disconnect();
    }
    await gateway.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  };

  return { gateway, client, cleanup, port };
}

/** Wait for the next occurrence of a named socket event. */
function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, (data: T) => resolve(data));
  });
}

describe("RoomGateway", () => {
  it("instantiates with a custom registry", () => {
    const { gateway, cleanup } = createGateway();
    expect(gateway.rooms).toBeInstanceOf(RoomRegistry);
    return cleanup();
  });

  it("responds with RoomCreated event when CreateRoom command is sent", async () => {
    const { client, cleanup } = createGateway();
    const socket = client();

    await new Promise<void>((resolve) => socket.on("connect", resolve).connect());

    const eventPromise = waitForEvent<WsMessage>(socket, "event");
    socket.emit("command", {
      type: "COMMAND",
      name: "CreateRoom",
      requestId: "req-create-1",
      payload: { ownerOpenId: "owner-ws", roleConfig: "independent" },
    } as WsMessage);

    const msg = await eventPromise;
    expect(msg.type).toBe("EVENT");
    expect(msg.name).toBe("RoomCreated");
    expect(msg.payload).toMatchObject({ ownerOpenId: "owner-ws", gameState: GameState.wait });

    await cleanup();
  });

  it("creates a room in the registry after CreateRoom", async () => {
    const { gateway, client, cleanup } = createGateway();
    const socket = client();
    await new Promise<void>((resolve) => socket.on("connect", resolve).connect());

    const eventPromise = waitForEvent<WsMessage>(socket, "event");
    socket.emit("command", {
      type: "COMMAND",
      name: "CreateRoom",
      requestId: "req-create-2",
      payload: { ownerOpenId: "owner-reg", roleConfig: "independent" },
    } as WsMessage);

    const msg = await eventPromise;
    const roomId = (msg.payload as Record<string, unknown>).roomId as string;
    expect(gateway.rooms.has(roomId)).toBe(true);

    await cleanup();
  });

  it("broadcasts PlayerJoinedRoom after JoinRoom command", async () => {
    const { gateway, client, cleanup } = createGateway();

    // First client creates the room
    const owner = client();
    await new Promise<void>((resolve) => owner.on("connect", resolve).connect());

    const createPromise = waitForEvent<WsMessage>(owner, "event");
    owner.emit("command", {
      type: "COMMAND",
      name: "CreateRoom",
      requestId: "req-c3",
      payload: { ownerOpenId: "owner-join", roleConfig: "independent" },
    } as WsMessage);
    const createMsg = await createPromise;
    const roomId = (createMsg.payload as Record<string, unknown>).roomId as string;

    // Second client joins the room
    const joiner = client();
    await new Promise<void>((resolve) => joiner.on("connect", resolve).connect());

    const joinEventPromise = waitForEvent<WsMessage>(owner, "event");
    joiner.emit("command", {
      type: "COMMAND",
      name: "JoinRoom",
      requestId: "req-j1",
      payload: { roomId, openId: "player-1", nickname: "Alice", avatar: "" },
    } as WsMessage);

    const joinMsg = await joinEventPromise;
    expect(joinMsg.name).toBe("PlayerJoinedRoom");
    expect((joinMsg.payload as Record<string, unknown>).playerCount).toBe(1);

    await cleanup();
  });

  it("returns an error for an unknown command", async () => {
    const { client, cleanup } = createGateway();
    const socket = client();
    await new Promise<void>((resolve) => socket.on("connect", resolve).connect());

    const errorPromise = waitForEvent<WsMessage>(socket, "error");
    socket.emit("command", {
      type: "COMMAND",
      name: "UnknownCommand",
      requestId: "req-unknown",
      payload: {},
    } as WsMessage);

    const errMsg = await errorPromise;
    expect(errMsg.type).toBe("ERROR");
    expect((errMsg.payload as Record<string, unknown>).code).toBe("COMMAND_ERROR");

    await cleanup();
  });

  it("returns an error for JoinRoom with unknown roomId", async () => {
    const { client, cleanup } = createGateway();
    const socket = client();
    await new Promise<void>((resolve) => socket.on("connect", resolve).connect());

    const errorPromise = waitForEvent<WsMessage>(socket, "error");
    socket.emit("command", {
      type: "COMMAND",
      name: "JoinRoom",
      requestId: "req-bad-room",
      payload: { roomId: "nonexistent-room", openId: "p1", nickname: "P1", avatar: "" },
    } as WsMessage);

    const errMsg = await errorPromise;
    expect(errMsg.type).toBe("ERROR");
    expect(String((errMsg.payload as Record<string, unknown>).message)).toContain("not found");

    await cleanup();
  });

  it("owner receives StageAdvanced event after AdvanceStage command", async () => {
    const { client, cleanup } = createGateway();

    const ownerSocket = client();
    await new Promise<void>((resolve) => ownerSocket.on("connect", resolve).connect());

    // Step 1: Create room – owner socket is subscribed to the room channel
    const createEvt = waitForEvent<WsMessage>(ownerSocket, "event");
    ownerSocket.emit("command", {
      type: "COMMAND",
      name: "CreateRoom",
      requestId: "adv-create",
      payload: { ownerOpenId: "adv-owner", roleConfig: "independent" },
    } as WsMessage);
    const createMsg = await createEvt;
    const roomId = (createMsg.payload as Record<string, unknown>).roomId as string;

    // Step 2: Owner joins as a player
    const joinEvt1 = waitForEvent<WsMessage>(ownerSocket, "event");
    ownerSocket.emit("command", {
      type: "COMMAND",
      name: "JoinRoom",
      requestId: "adv-join-0",
      payload: { roomId, openId: "adv-owner", nickname: "Owner", avatar: "" },
    } as WsMessage);
    await joinEvt1;

    // Step 3: Four more players join (separate sockets to avoid duplicate-openId errors)
    for (let i = 1; i <= 4; i++) {
      const s = client();
      await new Promise<void>((resolve) => s.on("connect", resolve).connect());
      const evt = waitForEvent<WsMessage>(ownerSocket, "event");
      s.emit("command", {
        type: "COMMAND",
        name: "JoinRoom",
        requestId: `adv-join-${i}`,
        payload: { roomId, openId: `adv-p${i}`, nickname: `P${i}`, avatar: "" },
      } as WsMessage);
      await evt;
    }

    // Step 4: Start game
    const startEvt = waitForEvent<WsMessage>(ownerSocket, "event");
    ownerSocket.emit("command", {
      type: "COMMAND",
      name: "StartGame",
      requestId: "adv-start",
      payload: { roomId, openId: "adv-owner", seed: "adv-seed" },
    } as WsMessage);
    await startEvt;

    // Step 5: Advance stage and wait for StageAdvanced event
    const stageEvt = new Promise<WsMessage>((resolve) => {
      ownerSocket.on("event", (msg: WsMessage) => {
        if (msg.name === "StageAdvanced") resolve(msg);
      });
    });
    ownerSocket.emit("command", {
      type: "COMMAND",
      name: "AdvanceStage",
      requestId: "adv-advance-1",
      payload: { roomId, openId: "adv-owner" },
    } as WsMessage);

    const advMsg = await stageEvt;
    expect(advMsg.name).toBe("StageAdvanced");
    expect((advMsg.payload as Record<string, unknown>).currentStage).toBe(Stage.action);

    await cleanup();
  }, 15000);
});
