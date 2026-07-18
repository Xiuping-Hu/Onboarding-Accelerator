import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { AuthSessionRecord, AuthSessionRepositoryPort } from './authSessionRepository';
import type { ServerConfig } from './config';
import type { LoginAuditInput, LoginAuditRepositoryPort } from './loginAuditRepository';
import {
  loginWithMicrosoftIdentity,
  MicrosoftSignInError,
  sanitizeReturnTo,
} from './microsoftAuthService';
import { hashSessionToken } from './sessionTokens';
import type { MicrosoftUserRepositoryPort, UserRecord } from './userRepository';

const tenantId = 'e0bc1e92-f544-4358-8d5f-5aabe36f1df6';

void test('Microsoft login binds a pre-provisioned user and creates the existing app session', async () => {
  const user = createUser();
  const users = new FakeMicrosoftUserRepository([user]);
  const authSessions = new FakeAuthSessionRepository();
  const loginAudit = new FakeLoginAuditRepository();

  const result = await loginWithMicrosoftIdentity(
    {
      tenantId,
      objectId: '11111111-1111-1111-1111-111111111111',
      email: user.email,
      displayName: 'Microsoft Admin',
    },
    { ipAddress: '127.0.0.1', userAgent: 'node-test' },
    {
      config: createConfig(false),
      users,
      authSessions,
      loginAudit,
    },
  );

  assert.equal(result.user.id, user.id);
  assert.equal(result.user.tenantId, tenantId);
  assert.equal(users.byId.get(user.id)?.microsoftObjectId, '11111111-1111-1111-1111-111111111111');
  assert.equal(authSessions.created.length, 1);
  assert.equal(authSessions.created[0]?.userId, user.id);
  assert.equal(authSessions.created[0]?.sessionTokenHash, hashSessionToken(result.token));
  assert.deepEqual(
    loginAudit.events.map((event) => event.eventType),
    ['login_success'],
  );
});

void test('Microsoft login rejects unknown users when automatic provisioning is disabled', async () => {
  const loginAudit = new FakeLoginAuditRepository();

  await assert.rejects(
    () =>
      loginWithMicrosoftIdentity(
        {
          tenantId,
          objectId: '22222222-2222-2222-2222-222222222222',
          email: 'unknown@taxconsulting.co.za',
          displayName: 'Unknown User',
        },
        {},
        {
          config: createConfig(false),
          users: new FakeMicrosoftUserRepository([]),
          authSessions: new FakeAuthSessionRepository(),
          loginAudit,
        },
      ),
    MicrosoftSignInError,
  );

  assert.equal(loginAudit.events[0]?.reason, 'account_not_provisioned');
});

void test('Microsoft login return paths cannot redirect to another origin', () => {
  assert.equal(sanitizeReturnTo('/admin?view=audit'), '/admin?view=audit');
  assert.equal(sanitizeReturnTo('https://attacker.example'), '/workspace');
  assert.equal(sanitizeReturnTo('//attacker.example'), '/workspace');
});

function createConfig(autoProvision: boolean): ServerConfig {
  return {
    authCookieName: 'onboarding_session',
    authMicrosoftTenantId: tenantId,
    authMicrosoftClientId: 'client-id',
    authMicrosoftClientSecret: 'client-secret',
    authMicrosoftRedirectUri: 'http://localhost:3000/api/auth/microsoft/callback',
    authMicrosoftAutoProvision: autoProvision,
    authSessionDurationMs: 60_000,
  } as ServerConfig;
}

function createUser(): UserRecord {
  const now = new Date('2026-01-01T00:00:00.000Z').toISOString();
  return {
    id: randomUUID(),
    email: 'admin@taxconsulting.co.za',
    displayName: 'Admin',
    role: 'admin',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

class FakeMicrosoftUserRepository implements MicrosoftUserRepositoryPort {
  readonly byId = new Map<string, UserRecord>();

  constructor(users: UserRecord[]) {
    for (const user of users) {
      this.byId.set(user.id, user);
    }
  }

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    return [...this.byId.values()].find((user) => user.email === email);
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    return this.byId.get(id);
  }

  async findByMicrosoftIdentity(
    microsoftTenantId: string,
    microsoftObjectId: string,
  ): Promise<UserRecord | undefined> {
    return [...this.byId.values()].find(
      (user) =>
        user.microsoftTenantId === microsoftTenantId &&
        user.microsoftObjectId === microsoftObjectId,
    );
  }

  async bindMicrosoftIdentity(input: {
    id: string;
    tenantId: string;
    objectId: string;
    displayName: string;
  }): Promise<UserRecord | undefined> {
    const user = this.byId.get(input.id);
    if (!user) return undefined;
    const bound = {
      ...user,
      displayName: input.displayName,
      microsoftTenantId: input.tenantId,
      microsoftObjectId: input.objectId,
    };
    this.byId.set(user.id, bound);
    return bound;
  }

  async createMicrosoftUser(input: {
    email: string;
    displayName: string;
    tenantId: string;
    objectId: string;
  }): Promise<UserRecord> {
    const now = new Date().toISOString();
    const user: UserRecord = {
      id: randomUUID(),
      email: input.email,
      displayName: input.displayName,
      microsoftTenantId: input.tenantId,
      microsoftObjectId: input.objectId,
      role: 'user',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(user.id, user);
    return user;
  }

  async updateLastLogin(): Promise<void> {}
}

class FakeAuthSessionRepository implements AuthSessionRepositoryPort {
  readonly created: Array<{
    userId: string;
    sessionTokenHash: string;
    expiresAt: Date;
  }> = [];

  async create(input: {
    userId: string;
    sessionTokenHash: string;
    expiresAt: Date;
  }): Promise<AuthSessionRecord> {
    this.created.push(input);
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      userId: input.userId,
      sessionTokenHash: input.sessionTokenHash,
      expiresAt: input.expiresAt.toISOString(),
      createdAt: now,
      lastSeenAt: now,
    };
  }

  async findActiveByTokenHash(): Promise<undefined> {
    return undefined;
  }

  async touch(): Promise<void> {}

  async revokeByTokenHash(): Promise<void> {}
}

class FakeLoginAuditRepository implements LoginAuditRepositoryPort {
  readonly events: LoginAuditInput[] = [];

  async record(input: LoginAuditInput): Promise<void> {
    this.events.push(input);
  }
}
