import type { DatabaseClient } from './database';

export type LoginAuditEventType = 'login_success' | 'login_failure' | 'login_inactive' | 'logout';

export interface LoginAuditInput {
  userId?: string;
  email?: string;
  eventType: LoginAuditEventType;
  success: boolean;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface LoginAuditRepositoryPort {
  record(input: LoginAuditInput): Promise<void>;
}

export class PostgresLoginAuditRepository implements LoginAuditRepositoryPort {
  constructor(private readonly db: DatabaseClient) {}

  async record(input: LoginAuditInput): Promise<void> {
    await this.db.query(
      `insert into login_audit_events
        (user_id, email, event_type, success, reason, ip_address, user_agent)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.userId ?? null,
        input.email ?? null,
        input.eventType,
        input.success,
        input.reason ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
      ],
    );
  }
}

export class NoopLoginAuditRepository implements LoginAuditRepositoryPort {
  async record(): Promise<void> {}
}
