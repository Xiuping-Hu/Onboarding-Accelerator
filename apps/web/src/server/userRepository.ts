import type { DatabaseClient } from './database';

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  passwordHash: string;
  role: string;
  isActive?: boolean;
}

export interface UserRepositoryPort {
  findByEmail(email: string): Promise<UserRecord | undefined>;
  findById(id: string): Promise<UserRecord | undefined>;
  updateLastLogin(id: string, at: Date): Promise<void>;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
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
      `select id, email, display_name, password_hash, role, is_active, last_login_at, created_at, updated_at
       from users
       where lower(email) = $1
       limit 1`,
      [normalizeEmail(email)],
    );

    return result.rows[0] ? toUserRecord(result.rows[0]) : undefined;
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    const result = await this.db.query<UserRow>(
      `select id, email, display_name, password_hash, role, is_active, last_login_at, created_at, updated_at
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
       returning id, email, display_name, password_hash, role, is_active, last_login_at, created_at, updated_at`,
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
    passwordHash: row.password_hash,
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
