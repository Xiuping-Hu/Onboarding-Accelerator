import type { AuthSession } from '@/generated/prisma/client';
import type { PrismaDatabase } from './infrastructure/prisma/prismaTypes';

export interface AuthSessionRecord {
  id: string;
  userId: string;
  sessionTokenHash: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface CreateAuthSessionInput {
  userId: string;
  sessionTokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthSessionRepositoryPort {
  create(input: CreateAuthSessionInput): Promise<AuthSessionRecord>;
  findActiveByTokenHash(tokenHash: string, now: Date): Promise<AuthSessionRecord | undefined>;
  touch(id: string, at: Date): Promise<void>;
  revokeByTokenHash(tokenHash: string, at: Date): Promise<void>;
}

export class PrismaAuthSessionRepository implements AuthSessionRepositoryPort {
  constructor(private readonly db: PrismaDatabase) {}

  async create(input: CreateAuthSessionInput): Promise<AuthSessionRecord> {
    return toAuthSessionRecord(
      await this.db.authSession.create({
        data: {
          userId: input.userId,
          sessionTokenHash: input.sessionTokenHash,
          expiresAt: input.expiresAt,
          userAgent: input.userAgent,
          ipAddress: input.ipAddress,
        },
      }),
    );
  }

  async findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<AuthSessionRecord | undefined> {
    const session = await this.db.authSession.findFirst({
      where: { sessionTokenHash: tokenHash, revokedAt: null, expiresAt: { gt: now } },
    });
    return session ? toAuthSessionRecord(session) : undefined;
  }

  async touch(id: string, at: Date): Promise<void> {
    await this.db.authSession.updateMany({ where: { id }, data: { lastSeenAt: at } });
  }

  async revokeByTokenHash(tokenHash: string, at: Date): Promise<void> {
    await this.db.authSession.updateMany({
      where: { sessionTokenHash: tokenHash, revokedAt: null },
      data: { revokedAt: at },
    });
  }
}

function toAuthSessionRecord(row: AuthSession): AuthSessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    sessionTokenHash: row.sessionTokenHash,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    ...(row.revokedAt ? { revokedAt: row.revokedAt.toISOString() } : {}),
    ...(row.userAgent ? { userAgent: row.userAgent } : {}),
    ...(row.ipAddress ? { ipAddress: row.ipAddress } : {}),
  };
}
