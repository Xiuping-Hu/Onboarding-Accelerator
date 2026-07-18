import type { User } from '@/generated/prisma/client';
import type { PrismaDatabase } from './infrastructure/prisma/prismaTypes';
import { mapPrismaError } from './infrastructure/prisma/prismaErrorMapper';

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash?: string;
  microsoftTenantId?: string;
  microsoftObjectId?: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  passwordHash?: string;
  role: string;
  isActive?: boolean;
}

export interface UserRepositoryPort {
  findByEmail(email: string): Promise<UserRecord | undefined>;
  findById(id: string): Promise<UserRecord | undefined>;
  updateLastLogin(id: string, at: Date): Promise<void>;
}

export interface MicrosoftUserRepositoryPort extends UserRepositoryPort {
  findByMicrosoftIdentity(tenantId: string, objectId: string): Promise<UserRecord | undefined>;
  bindMicrosoftIdentity(input: {
    id: string;
    tenantId: string;
    objectId: string;
    displayName: string;
  }): Promise<UserRecord | undefined>;
  createMicrosoftUser(input: {
    email: string;
    displayName: string;
    tenantId: string;
    objectId: string;
  }): Promise<UserRecord | undefined>;
}

export class PrismaUserRepository implements MicrosoftUserRepositoryPort {
  constructor(private readonly db: PrismaDatabase) {}

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const user = await this.db.user.findUnique({ where: { email: normalizeEmail(email) } });
    return user ? toUserRecord(user) : undefined;
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    const user = await this.db.user.findUnique({ where: { id } });
    return user ? toUserRecord(user) : undefined;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    try {
      return toUserRecord(
        await this.db.user.create({
          data: {
            email: normalizeEmail(input.email),
            displayName: input.displayName.trim(),
            passwordHash: input.passwordHash,
            role: input.role.trim() || 'user',
            isActive: input.isActive ?? true,
          },
        }),
      );
    } catch (error) {
      mapPrismaError(error);
    }
  }

  async findByMicrosoftIdentity(
    tenantId: string,
    objectId: string,
  ): Promise<UserRecord | undefined> {
    const user = await this.db.user.findFirst({
      where: { microsoftTenantId: tenantId, microsoftObjectId: objectId },
    });
    return user ? toUserRecord(user) : undefined;
  }

  async bindMicrosoftIdentity(input: {
    id: string;
    tenantId: string;
    objectId: string;
    displayName: string;
  }): Promise<UserRecord | undefined> {
    const result = await this.db.user.updateMany({
      where: {
        id: input.id,
        OR: [
          { microsoftTenantId: null, microsoftObjectId: null },
          { microsoftTenantId: input.tenantId, microsoftObjectId: input.objectId },
        ],
      },
      data: {
        microsoftTenantId: input.tenantId,
        microsoftObjectId: input.objectId,
        displayName: input.displayName.trim(),
        updatedAt: new Date(),
      },
    });
    return result.count === 1 ? this.findById(input.id) : undefined;
  }

  async createMicrosoftUser(input: {
    email: string;
    displayName: string;
    tenantId: string;
    objectId: string;
  }): Promise<UserRecord | undefined> {
    try {
      const user = await this.db.user.create({
        data: {
          email: normalizeEmail(input.email),
          displayName: input.displayName.trim(),
          passwordHash: null,
          microsoftTenantId: input.tenantId,
          microsoftObjectId: input.objectId,
          role: 'user',
          isActive: true,
        },
      });
      return toUserRecord(user);
    } catch {
      return undefined;
    }
  }

  async updateLastLogin(id: string, at: Date): Promise<void> {
    await this.db.user.updateMany({
      where: { id },
      data: { lastLoginAt: at, updatedAt: new Date() },
    });
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toUserRecord(row: User): UserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    ...(row.passwordHash ? { passwordHash: row.passwordHash } : {}),
    ...(row.microsoftTenantId ? { microsoftTenantId: row.microsoftTenantId } : {}),
    ...(row.microsoftObjectId ? { microsoftObjectId: row.microsoftObjectId } : {}),
    role: row.role,
    isActive: row.isActive,
    ...(row.lastLoginAt ? { lastLoginAt: row.lastLoginAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
