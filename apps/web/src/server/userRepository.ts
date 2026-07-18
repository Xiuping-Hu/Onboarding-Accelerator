import type { DatabaseClient } from './database';

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

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string | null;
  microsoft_tenant_id: string | null;
  microsoft_object_id: string | null;
  role: string;
  is_active: boolean;
  last_login_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export class PostgresUserRepository implements UserRepositoryPort {
  constructor(private readonly db: DatabaseClient) {}

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const result = await this.db.query<UserRow>(
      `select id, email, display_name, password_hash, microsoft_tenant_id, microsoft_object_id,
              role, is_active, last_login_at, created_at, updated_at
       from users
       where lower(email) = $1
       limit 1`,
      [normalizeEmail(email)],
    );

    return result.rows[0] ? toUserRecord(result.rows[0]) : undefined;
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    const result = await this.db.query<UserRow>(
      `select id, email, display_name, password_hash, microsoft_tenant_id, microsoft_object_id,
              role, is_active, last_login_at, created_at, updated_at
       from users
       where id = $1
       limit 1`,
      [id],
    );

    return result.rows[0] ? toUserRecord(result.rows[0]) : undefined;
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const result = await this.db.query<UserRow>(
      `insert into users (email, display_name, password_hash, role, is_active)
       values ($1, $2, $3, $4, $5)
       returning id, email, display_name, password_hash, microsoft_tenant_id, microsoft_object_id,
                 role, is_active, last_login_at, created_at, updated_at`,
      [
        normalizeEmail(input.email),
        input.displayName.trim(),
        input.passwordHash,
        input.role.trim() || 'user',
        input.isActive ?? true,
      ],
    );

    return toUserRecord(requireUserRow(result.rows[0]));
  }

  async findByMicrosoftIdentity(
    tenantId: string,
    objectId: string,
  ): Promise<UserRecord | undefined> {
    const result = await this.db.query<UserRow>(
      `select id, email, display_name, password_hash, microsoft_tenant_id, microsoft_object_id,
              role, is_active, last_login_at, created_at, updated_at
       from users
       where microsoft_tenant_id = $1
         and microsoft_object_id = $2
       limit 1`,
      [tenantId, objectId],
    );

    return result.rows[0] ? toUserRecord(result.rows[0]) : undefined;
  }

  async bindMicrosoftIdentity(input: {
    id: string;
    tenantId: string;
    objectId: string;
    displayName: string;
  }): Promise<UserRecord | undefined> {
    const result = await this.db.query<UserRow>(
      `update users
       set microsoft_tenant_id = $2,
           microsoft_object_id = $3,
           display_name = $4,
           updated_at = now()
       where id = $1
         and (
           (microsoft_tenant_id is null and microsoft_object_id is null)
           or (microsoft_tenant_id = $2 and microsoft_object_id = $3)
         )
       returning id, email, display_name, password_hash, microsoft_tenant_id, microsoft_object_id,
                 role, is_active, last_login_at, created_at, updated_at`,
      [input.id, input.tenantId, input.objectId, input.displayName.trim()],
    );

    return result.rows[0] ? toUserRecord(result.rows[0]) : undefined;
  }

  async createMicrosoftUser(input: {
    email: string;
    displayName: string;
    tenantId: string;
    objectId: string;
  }): Promise<UserRecord | undefined> {
    const result = await this.db.query<UserRow>(
      `insert into users
        (email, display_name, password_hash, microsoft_tenant_id, microsoft_object_id, role, is_active)
       values ($1, $2, null, $3, $4, 'user', true)
       on conflict do nothing
       returning id, email, display_name, password_hash, microsoft_tenant_id, microsoft_object_id,
                 role, is_active, last_login_at, created_at, updated_at`,
      [normalizeEmail(input.email), input.displayName.trim(), input.tenantId, input.objectId],
    );

    return result.rows[0] ? toUserRecord(result.rows[0]) : undefined;
  }

  async updateLastLogin(id: string, at: Date): Promise<void> {
    await this.db.query(
      `update users
       set last_login_at = $2,
           updated_at = now()
       where id = $1`,
      [id, at.toISOString()],
    );
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function requireUserRow(row: UserRow | undefined): UserRow {
  if (!row) {
    throw new Error('User write did not return a row');
  }

  return row;
}

function toUserRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    ...(row.password_hash ? { passwordHash: row.password_hash } : {}),
    ...(row.microsoft_tenant_id ? { microsoftTenantId: row.microsoft_tenant_id } : {}),
    ...(row.microsoft_object_id ? { microsoftObjectId: row.microsoft_object_id } : {}),
    role: row.role,
    isActive: row.is_active,
    ...(row.last_login_at ? { lastLoginAt: toIsoString(row.last_login_at) } : {}),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
