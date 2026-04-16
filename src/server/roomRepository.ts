import { PrismaClient, Prisma } from "@prisma/client";
import type {
  GameState as PrismaGameState,
  Stage as PrismaStage,
  Role as PrismaRole,
  ActionCard as PrismaActionCard,
  EnvironmentCard as PrismaEnvironmentCard,
} from "@prisma/client";
import { Room, RoomSnapshot } from "../domain/aggregates/Room";
import {
  ActionCard,
  ActionLog,
  BetSubmission,
  EnvironmentCard,
  GameState,
  Role,
  RoomConfig,
  SettlementResult,
  Stage,
  VoteResult,
  VoteSubmission,
  WinnerResult,
} from "../domain/types";
import { uuidv4 } from "../utils/uuid";

export type RoomStore = Map<string, Room>;

export interface RoomRepository {
  list(): Promise<Room[]>;
  get(roomId: string): Promise<Room | undefined>;
  save(room: Room): Promise<void>;
}

type PrismaRoomWithRelations = Prisma.RoomGetPayload<{
  include: { players: true; rounds: true; matches: true };
}>;

function toRoomSnapshot(record: PrismaRoomWithRelations): RoomSnapshot {
  const latestMatch = record.matches
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  const rawWinnerResult = latestMatch
    ? (latestMatch.winnerResult as unknown as {
        winnerCamp: WinnerResult["winnerCamp"];
        reason: string;
        decidedAt: string;
      } | null)
    : null;

  return {
    roomId: record.roomId,
    roomCode: record.roomCode,
    ownerOpenId: record.ownerOpenId,
    gameState: record.gameState as unknown as GameState,
    playerCount: record.playerCount,
    roomConfig: record.roomConfig as unknown as RoomConfig,
    currentRound: record.currentRound,
    currentStage: record.currentStage as unknown as Stage,
    envDeck: record.envDeck as unknown as EnvironmentCard[],
    version: record.version,
    players: record.players.map((p) => ({
      openId: p.openId,
      nickname: p.nickname,
      avatar: p.avatar,
      seatNo: p.seatNo,
      candidateRoles: (p.candidateRoles as unknown as Role[]) ?? [],
      selectedRole: (p.selectedRole as unknown as Role | null) ?? null,
      hp: p.hp,
      votePower: p.votePower,
      isAlive: p.isAlive,
      selectedAction: (p.selectedAction as unknown as ActionCard | null) ?? null,
      passedBet: p.passedBet,
      canSpeak: p.canSpeak,
      canVote: p.canVote,
      voteTarget: p.voteTarget ?? null,
      isReady: p.isReady,
      joinTime: p.joinTime,
    })),
    rounds: record.rounds
      .slice()
      .sort((a, b) => a.round - b.round)
      .map((r) => {
        const rawVoteResult = r.voteResult as unknown as (VoteResult & { revoteCount?: number }) | null;
        const revoteCount = rawVoteResult?.revoteCount ?? 0;
        const voteResult: VoteResult | null = rawVoteResult
          ? {
              targetOpenId: rawVoteResult.targetOpenId,
              votes: rawVoteResult.votes,
              isTie: rawVoteResult.isTie,
              tieTargets: rawVoteResult.tieTargets,
              needRevote: rawVoteResult.needRevote,
            }
          : null;
        return {
          round: r.round,
          environmentCard: (r.environmentCard as unknown as EnvironmentCard | null) ?? null,
          betSubmissions: (r.betSubmissions as unknown as BetSubmission[]) ?? [],
          actionLogs: (r.actionLogs as unknown as ActionLog[]) ?? [],
          voteSubmissions: (r.voteSubmissions as unknown as VoteSubmission[]) ?? [],
          voteResult,
          settlementResult: (r.settlementResult as unknown as SettlementResult | null) ?? null,
          revoteCount,
        };
      }),
    winnerResult: rawWinnerResult
      ? {
          winnerCamp: rawWinnerResult.winnerCamp,
          reason: rawWinnerResult.reason,
          decidedAt: new Date(rawWinnerResult.decidedAt),
        }
      : null,
  };
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
    const records = await this.prisma.room.findMany({
      include: { players: true, rounds: true, matches: true },
    });
    return records.map((record) => Room.restore(toRoomSnapshot(record)));
  }

  async get(roomId: string): Promise<Room | undefined> {
    const record = await this.prisma.room.findUnique({
      where: { roomId },
      include: { players: true, rounds: true, matches: true },
    });
    return record ? Room.restore(toRoomSnapshot(record)) : undefined;
  }

  async save(room: Room): Promise<void> {
    const s = room.snapshot();

    await this.prisma.$transaction(async (tx) => {
      // Upsert Room row
      await tx.room.upsert({
        where: { roomId: s.roomId },
        create: {
          roomId: s.roomId,
          roomCode: s.roomCode,
          ownerOpenId: s.ownerOpenId,
          gameState: s.gameState as unknown as PrismaGameState,
          playerCount: s.playerCount,
          roomConfig: s.roomConfig as unknown as Prisma.InputJsonValue,
          currentRound: s.currentRound,
          currentStage: s.currentStage as unknown as PrismaStage,
          envDeck: s.envDeck as unknown as Prisma.InputJsonValue,
          version: s.version,
        },
        update: {
          roomCode: s.roomCode,
          ownerOpenId: s.ownerOpenId,
          gameState: s.gameState as unknown as PrismaGameState,
          playerCount: s.playerCount,
          roomConfig: s.roomConfig as unknown as Prisma.InputJsonValue,
          currentRound: s.currentRound,
          currentStage: s.currentStage as unknown as PrismaStage,
          envDeck: s.envDeck as unknown as Prisma.InputJsonValue,
          version: s.version,
        },
      });

      // Delete + recreate players
      await tx.player.deleteMany({ where: { roomId: s.roomId } });
      if (s.players.length > 0) {
        await tx.player.createMany({
          data: s.players.map((p) => ({
            roomId: s.roomId,
            openId: p.openId,
            nickname: p.nickname,
            avatar: p.avatar,
            seatNo: p.seatNo,
            candidateRoles: p.candidateRoles as unknown as Prisma.InputJsonValue,
            selectedRole: (p.selectedRole as unknown as PrismaRole | null) ?? null,
            hp: p.hp,
            votePower: p.votePower,
            isAlive: p.isAlive,
            selectedAction: (p.selectedAction as unknown as PrismaActionCard | null) ?? null,
            passedBet: p.passedBet,
            canSpeak: p.canSpeak,
            canVote: p.canVote,
            voteTarget: p.voteTarget,
            isReady: p.isReady,
            joinTime: p.joinTime,
          })),
        });
      }

      // Delete + recreate rounds
      await tx.round.deleteMany({ where: { roomId: s.roomId } });
      if (s.rounds.length > 0) {
        await tx.round.createMany({
          data: s.rounds.map((r) => ({
            roomId: s.roomId,
            round: r.round,
            environmentCard: (r.environmentCard as unknown as PrismaEnvironmentCard | null) ?? null,
            betSubmissions: r.betSubmissions as unknown as Prisma.InputJsonValue,
            actionLogs: r.actionLogs as unknown as Prisma.InputJsonValue,
            voteSubmissions: r.voteSubmissions as unknown as Prisma.InputJsonValue,
            // Embed revoteCount inside voteResult JSON so it survives restarts
            voteResult: (r.voteResult
              ? { ...r.voteResult, revoteCount: r.revoteCount }
              : { revoteCount: r.revoteCount }) as unknown as Prisma.InputJsonValue,
            settlementResult: (r.settlementResult ?? null) as unknown as Prisma.InputJsonValue,
          })),
        });
      }

      // Upsert Match when game has a winner
      if (s.winnerResult) {
        const existingMatch = await tx.match.findFirst({
          where: { roomId: s.roomId },
          orderBy: { createdAt: "desc" },
        });
        const matchId = existingMatch?.matchId ?? uuidv4();
        await tx.match.upsert({
          where: { matchId },
          create: {
            matchId,
            roomId: s.roomId,
            rounds: s.rounds as unknown as Prisma.InputJsonValue,
            winnerResult: s.winnerResult as unknown as Prisma.InputJsonValue,
          },
          update: {
            rounds: s.rounds as unknown as Prisma.InputJsonValue,
            winnerResult: s.winnerResult as unknown as Prisma.InputJsonValue,
          },
        });
      }
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
