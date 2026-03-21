import { Prisma, PrismaClient } from "@prisma/client";
import { Room, RoomPersistenceState } from "../domain/aggregates/Room";

export type RoomStore = Map<string, Room>;

export interface RoomRepository {
  list(): Promise<Room[]>;
  get(roomId: string): Promise<Room | undefined>;
  save(room: Room): Promise<void>;
}

type PersistedRoomRecord = {
  snapshot: RoomPersistenceState["snapshot"];
  processedRequests: string[];
};

function serializeRoom(room: Room): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(room.toPersistenceState())) as Prisma.InputJsonValue;
}

function deserializeRoom(snapshot: Prisma.JsonValue): Room {
  const record = snapshot as unknown as PersistedRoomRecord;
  return Room.restorePersistenceState({
    snapshot: {
      ...record.snapshot,
      players: record.snapshot.players.map((player) => ({
        ...player,
        joinTime: new Date(player.joinTime),
      })),
    },
    processedRequests: [...record.processedRequests],
  });
}

class InMemoryRoomRepository implements RoomRepository {
  constructor(private readonly rooms: RoomStore) {}

  async list(): Promise<Room[]> {
    return [...this.rooms.values()];
  }

  async get(roomId: string): Promise<Room | undefined> {
    return this.rooms.get(roomId);
  }

  async save(room: Room): Promise<void> {
    this.rooms.set(room.id, room);
  }
}

class PrismaRoomRepository implements RoomRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<Room[]> {
    const records = await this.prisma.persistedRoom.findMany();
    return records.map((record) => deserializeRoom(record.snapshot));
  }

  async get(roomId: string): Promise<Room | undefined> {
    const record = await this.prisma.persistedRoom.findUnique({ where: { roomId } });
    return record ? deserializeRoom(record.snapshot) : undefined;
  }

  async save(room: Room): Promise<void> {
    const state = room.toPersistenceState();
    const snapshot = serializeRoom(room);
    await this.prisma.persistedRoom.upsert({
      where: { roomId: state.snapshot.roomId },
      create: {
        roomId: state.snapshot.roomId,
        roomCode: state.snapshot.roomCode,
        ownerOpenId: state.snapshot.ownerOpenId,
        snapshot,
      },
      update: {
        roomCode: state.snapshot.roomCode,
        ownerOpenId: state.snapshot.ownerOpenId,
        snapshot,
      },
    });
  }
}

let prismaClient: PrismaClient | null = null;

function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    prismaClient = new PrismaClient();
  }
  return prismaClient;
}

export function createRoomRepository(rooms: RoomStore = new Map()): RoomRepository {
  if (process.env.DATABASE_URL?.trim()) {
    return new PrismaRoomRepository(getPrismaClient());
  }
  return new InMemoryRoomRepository(rooms);
}
