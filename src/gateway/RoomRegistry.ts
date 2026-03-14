// In-memory Room registry – maps roomId -> Room aggregate.
// Can be swapped for a Redis-backed implementation in multi-instance deployments.

import { Room, RoomSnapshot } from "../domain/aggregates/Room";

export class RoomRegistry {
  private rooms = new Map<string, Room>();

  /** Store or overwrite a room. */
  set(roomId: string, room: Room): void {
    this.rooms.set(roomId, room);
  }

  /** Retrieve a room by id. Returns undefined if not found. */
  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /** Remove a room from the registry. */
  delete(roomId: string): void {
    this.rooms.delete(roomId);
  }

  /** Check whether a room exists. */
  has(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  /** All registered room ids. */
  roomIds(): string[] {
    return [...this.rooms.keys()];
  }

  /** Total number of managed rooms. */
  size(): number {
    return this.rooms.size;
  }

  /** Retrieve a room snapshot by id. Returns undefined if not found. */
  getSnapshot(roomId: string): RoomSnapshot | undefined {
    return this.rooms.get(roomId)?.snapshot();
  }
}
