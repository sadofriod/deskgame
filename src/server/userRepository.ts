import { PrismaClient } from "@prisma/client";

export interface UserRecord {
  openId: string;
  unionId?: string | null;
  nickname: string;
  avatarUrl?: string | null;
  gender?: number | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  language?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertUserInput {
  openId: string;
  unionId?: string | null;
  nickname: string;
  avatarUrl?: string | null;
  gender?: number | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  language?: string | null;
}

export interface UpdateUserInput {
  unionId?: string | null;
  nickname?: string;
  avatarUrl?: string | null;
  gender?: number | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  language?: string | null;
}

export interface UserRepository {
  upsert(data: UpsertUserInput): Promise<UserRecord>;
  get(openId: string): Promise<UserRecord | undefined>;
  update(openId: string, data: UpdateUserInput): Promise<UserRecord | undefined>;
}

class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsert(data: UpsertUserInput): Promise<UserRecord> {
    const { openId, nickname, ...optionalFields } = data;
    return this.prisma.user.upsert({
      where: { openId },
      create: { openId, nickname, ...optionalFields },
      update: { nickname, ...optionalFields },
    });
  }

  async get(openId: string): Promise<UserRecord | undefined> {
    const record = await this.prisma.user.findUnique({ where: { openId } });
    return record ?? undefined;
  }

  async update(openId: string, data: UpdateUserInput): Promise<UserRecord | undefined> {
    const existing = await this.prisma.user.findUnique({ where: { openId } });
    if (!existing) return undefined;
    return this.prisma.user.update({ where: { openId }, data });
  }
}

class InMemoryUserRepository implements UserRepository {
  private readonly store = new Map<string, UserRecord>();

  async upsert(data: UpsertUserInput): Promise<UserRecord> {
    const now = new Date();
    const existing = this.store.get(data.openId);
    const record: UserRecord = {
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...data,
    };
    this.store.set(data.openId, record);
    return record;
  }

  async get(openId: string): Promise<UserRecord | undefined> {
    return this.store.get(openId);
  }

  async update(openId: string, data: UpdateUserInput): Promise<UserRecord | undefined> {
    const existing = this.store.get(openId);
    if (!existing) return undefined;
    const updated: UserRecord = { ...existing, ...data, updatedAt: new Date() };
    this.store.set(openId, updated);
    return updated;
  }
}

let prismaClient: PrismaClient | null = null;

function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    prismaClient = new PrismaClient();
  }
  return prismaClient;
}

export function createUserRepository(): UserRepository {
  if (process.env.DATABASE_URL?.trim()) {
    return new PrismaUserRepository(getPrismaClient());
  }
  return new InMemoryUserRepository();
}
