import type { PrismaDatabase } from './infrastructure/prisma/prismaTypes';

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

export class PrismaLoginAuditRepository implements LoginAuditRepositoryPort {
  constructor(private readonly db: PrismaDatabase) {}

  async record(input: LoginAuditInput): Promise<void> {
    await this.db.loginAuditEvent.create({
      data: {
        userId: input.userId,
        email: input.email,
        eventType: input.eventType,
        success: input.success,
        reason: input.reason,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }
}

export class NoopLoginAuditRepository implements LoginAuditRepositoryPort {
  async record(): Promise<void> {}
}
