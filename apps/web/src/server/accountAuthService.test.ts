import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { loginWithPassword, LoginFailedError } from './accountAuthService';
import type { AuthSessionRepositoryPort, CreateAuthSessionInput } from './authSessionRepository';
import type { ServerConfig } from './config';
import type { LoginAuditInput, LoginAuditRepositoryPort } from './loginAuditRepository';
import { hashPassword, verifyPassword } from './password';
import { hashSessionToken } from './sessionTokens';
import type { UserRecord, UserRepositoryPort } from './userRepository';

void test('password hashing verifies matching passwords and rejects mismatches', async () => {
  const passwordHash = await hashPassword('correct horse battery staple', 4);

  assert.equal(await verifyPassword('correct horse battery staple', passwordHash), true);
  assert.equal(await verifyPassword('wrong password', passwordHash), false);
  assert.notEqual(passwordHash, 'correct horse battery staple');
});

void test('loginWithPassword creates a hashed browser session for active users', async () => {
  const user = await createUser({ password: 'welcome-password' });
  const dependencies = createDependencies([user]);

  const result = await loginWithPassword(
    {
      email: ' ADMIN@EXAMPLE.COM ',
      password: 'welcome-password',
      ipAddress: '127.0.0.1',
      userAgent: 'node-test',
    },
    dependencies,
  );

  assert.equal(result.user.id, user.id);
  assert.equal(result.user.email, user.email);
  assert.equal(dependencies.authSessions.created.length, 1);
  assert.equal(dependencies.authSessions.created[0]?.userId, user.id);
  assert.notEqual(dependencies.authSessions.created[0]?.sessionTokenHash, result.token);
  assert.equal(
    dependencies.authSessions.created[0]?.sessionTokenHash,
    hashSessionToken(result.token),
  );
  assert.deepEqual(
    dependencies.loginAudit.events.map((event) => event.eventType),
    ['login_success'],
  );
  assert.deepEqual(dependencies.users.lastLoginUserIds, [user.id]);
});

void test('loginWithPassword rejects invalid credentials with a generic audit event', async () => {
  const user = await createUser({ password: 'welcome-password' });
  const dependencies = createDependencies([user]);

  await assert.rejects(
    () =>
      loginWithPassword(
        {
          email: user.email,
          password: 'not-right',
        },
        dependencies,
      ),
    LoginFailedError,
  );

  assert.equal(dependencies.authSessions.created.length, 0);
  assert.deepEqual(dependencies.loginAudit.events, [
    {
      email: user.email,
      eventType: 'login_failure',
      success: false,
      reason: 'invalid_credentials',
      ipAddress: undefined,
      userAgent: undefined,
    },
  ]);
});

void test('loginWithPassword rejects inactive accounts without creating sessions', async () => {
  const user = await createUser({ password: 'welcome-password', isActive: false });
  const dependencies = createDependencies([user]);

  await assert.rejects(
    () =>
      loginWithPassword(
        {
          email: user.email,
          password: 'welcome-password',
        },
        dependencies,
      ),
    LoginFailedError,
  );

  assert.equal(dependencies.authSessions.created.length, 0);
  assert.equal(dependencies.loginAudit.events[0]?.eventType, 'login_inactive');
  assert.equal(dependencies.loginAudit.events[0]?.reason, 'inactive_account');
});

function createDependencies(users: UserRecord[]) {
  const usersRepository = new FakeUserRepository(users);
  const authSessions = new FakeAuthSessionRepository();
  const loginAudit = new FakeLoginAuditRepository();

  return {
    config: {
      authSessionDurationMs: 60_000,
    } as ServerConfig,
    users: usersRepository,
    authSessions,
    loginAudit,
  };
}

async function createUser(input: { password: string; isActive?: boolean }): Promise<UserRecord> {
  const now = new Date('2026-01-01T00:00:00.000Z').toISOString();

  return {
    id: randomUUID(),
    email: 'admin@example.com',
    displayName: 'Admin',
    passwordHash: await hashPassword(input.password, 4),
    role: 'admin',
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };
}

class FakeUserRepository implements UserRepositoryPort {
  readonly lastLoginUserIds: string[] = [];
  private readonly usersByEmail: Map<string, UserRecord>;
  private readonly usersById: Map<string, UserRecord>;

  constructor(users: UserRecord[]) {
    this.usersByEmail = new Map(users.map((user) => [user.email, user]));
    this.usersById = new Map(users.map((user) => [user.id, user]));
  }

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    return this.usersByEmail.get(email);
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    return this.usersById.get(id);
  }

  async updateLastLogin(id: string): Promise<void> {
    this.lastLoginUserIds.push(id);
  }
}

class FakeAuthSessionRepository implements AuthSessionRepositoryPort {
  readonly created: CreateAuthSessionInput[] = [];

  async create(input: CreateAuthSessionInput) {
    this.created.push(input);
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      userId: input.userId,
      sessionTokenHash: input.sessionTokenHash,
      expiresAt: input.expiresAt.toISOString(),
      createdAt: now,
      lastSeenAt: now,
      ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
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
