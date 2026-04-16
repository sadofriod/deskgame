import { Room, RoomSnapshot } from "../domain/aggregates/Room";

export type RoomStore = Map<string, Room>;

export interface RoomRepository {
  list(): Promise<RoomSnapshot[]>;
  get(roomId: string): Promise<Room | null>;
  save(room: Room): Promise<void>;
}

// ── In-memory implementation ──────────────────────────────────────────────────

export class InMemoryRoomRepository implements RoomRepository {
  private store: RoomStore;

  constructor(store: RoomStore) {
    this.store = store;
  }

  async list(): Promise<RoomSnapshot[]> {
    return [...this.store.values()].map((r) => r.snapshot());
  }

  async get(roomId: string): Promise<Room | null> {
    return this.store.get(roomId) ?? null;
  }

  async save(room: Room): Promise<void> {
    this.store.set(room.id, room);
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createRoomRepository(store?: RoomStore): RoomRepository {
  return new InMemoryRoomRepository(store ?? new Map());
}
