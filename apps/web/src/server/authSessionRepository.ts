import type { DatabaseClient } from './database';

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

interface AuthSessionRow {
  id: string;
  user_id: string;
  session_token_hash: string;
  expires_at: Date | string;
  created_at: Date | string;
  last_seen_at: Date | string;
  revoked_at: Date | string | null;
  user_agent: string | null;
  ip_address: string | null;
}

export class PostgresAuthSessionRepository implements AuthSessionRepositoryPort {
  constructor(private readonly db: DatabaseClient) {}

  async create(input: CreateAuthSessionInput): Promise<AuthSessionRecord> {
    const result = await this.db.query<AuthSessionRow>(
      `insert into auth_sessions
        (user_id, session_token_hash, expires_at, user_agent, ip_address)
       values ($1, $2, $3, $4, $5)
       returning id, user_id, session_token_hash, expires_at, created_at, last_seen_at, revoked_at, user_agent, ip_address`,
      [
        input.userId,
        input.sessionTokenHash,
        input.expiresAt.toISOString(),
        input.userAgent ?? null,
        input.ipAddress ?? null,
      ],
    );

    return toAuthSessionRecord(requireAuthSessionRow(result.rows[0]));
  }

  async findActiveByTokenHash(
    tokenHash: string,
    now: Date,
  ): Promise<AuthSessionRecord | undefined> {
    const result = await this.db.query<AuthSessionRow>(
      `select id, user_id, session_token_hash, expires_at, created_at, last_seen_at, revoked_at, user_agent, ip_address
       from auth_sessions
       where session_token_hash = $1
         and revoked_at is null
         and expires_at > $2
       limit 1`,
      [tokenHash, now.toISOString()],
    );

    return result.rows[0] ? toAuthSessionRecord(result.rows[0]) : undefined;
  }

  async touch(id: string, at: Date): Promise<void> {
    await this.db.query('update auth_sessions set last_seen_at = $2 where id = $1', [
      id,
      at.toISOString(),
    ]);
  }

  async revokeByTokenHash(tokenHash: string, at: Date): Promise<void> {
    await this.db.query(
      `update auth_sessions
       set revoked_at = coalesce(revoked_at, $2)
       where session_token_hash = $1`,
      [tokenHash, at.toISOString()],
    );
  }
}

function requireAuthSessionRow(row: AuthSessionRow | undefined): AuthSessionRow {
  if (!row) {
    throw new Error('Auth session write did not return a row');
  }

  return row;
}

function toAuthSessionRecord(row: AuthSessionRow): AuthSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    sessionTokenHash: row.session_token_hash,
    expiresAt: toIsoString(row.expires_at),
    createdAt: toIsoString(row.created_at),
    lastSeenAt: toIsoString(row.last_seen_at),
    ...(row.revoked_at ? { revokedAt: toIsoString(row.revoked_at) } : {}),
    ...(row.user_agent ? { userAgent: row.user_agent } : {}),
    ...(row.ip_address ? { ipAddress: row.ip_address } : {}),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
