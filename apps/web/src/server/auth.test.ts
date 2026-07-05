import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { AuthError, authenticateRequest } from './auth';
import type { AuthSessionRecord, AuthSessionRepositoryPort } from './authSessionRepository';
import type { ServerConfig } from './config';
import { createSessionToken } from './sessionTokens';
import type { UserRecord, UserRepositoryPort } from './userRepository';

void test('authenticateRequest resolves a user from a valid session cookie', async () => {
  const { token, tokenHash } = createSessionToken();
  const user = createUser({ isActive: true });
  const authSessions = new FakeAuthSessionRepository(user.id, tokenHash);
  const request = new NextRequest('http://localhost/api/sessions', {
    headers: { cookie: `onboarding_session=${token}` },
  });

  const authenticated = await authenticateRequest(request, {
    config: createConfig(),
    users: new FakeUserRepository(user),
    authSessions,
  });

  assert.equal(authenticated.id, user.id);
  assert.equal(authenticated.email, user.email);
  assert.equal(authSessions.touchedSessionIds.length, 1);
});

void test('authenticateRequest rejects missing session cookies', async () => {
  await assert.rejects(
    () =>
      authenticateRequest(new NextRequest('http://localhost/api/sessions'), {
        config: createConfig(),
        users: new FakeUserRepository(createUser({ isActive: true })),
        authSessions: new FakeAuthSessionRepository(randomUUID(), 'missing'),
      }),
    AuthError,
  );
});

void test('authenticateRequest revokes sessions for inactive users', async () => {
  const { token, tokenHash } = createSessionToken();
  const user = createUser({ isActive: false });
  const authSessions = new FakeAuthSessionRepository(user.id, tokenHash);
  const request = new NextRequest('http://localhost/api/sessions', {
    headers: { cookie: `onboarding_session=${token}` },
  });

  await assert.rejects(
    () =>
      authenticateRequest(request, {
        config: createConfig(),
        users: new FakeUserRepository(user),
        authSessions,
      }),
    AuthError,
  );

  assert.deepEqual(authSessions.revokedTokenHashes, [tokenHash]);
});

function createConfig(): ServerConfig {
  return {
    authCookieName: 'onboarding_session',
    authDisabled: false,
  } as ServerConfig;
}

function createUser(input: { isActive: boolean }): UserRecord {
  const now = new Date('2026-01-01T00:00:00.000Z').toISOString();

  return {
    id: randomUUID(),
    email: 'admin@example.com',
    displayName: 'Admin',
    passwordHash: 'hash',
    role: 'admin',
    isActive: input.isActive,
    createdAt: now,
    updatedAt: now,
  };
}

class FakeUserRepository implements UserRepositoryPort {
  constructor(private readonly user: UserRecord) {}

  async findByEmail(): Promise<UserRecord | undefined> {
    return this.user;
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    return id === this.user.id ? this.user : undefined;
  }

  async updateLastLogin(): Promise<void> {}
}

class FakeAuthSessionRepository implements AuthSessionRepositoryPort {
  readonly revokedTokenHashes: string[] = [];
  readonly touchedSessionIds: string[] = [];

  constructor(
    private readonly userId: string,
    private readonly tokenHash: string,
  ) {}

  async create(): Promise<AuthSessionRecord> {
    throw new Error('Not implemented for this test');
  }

  async findActiveByTokenHash(tokenHash: string): Promise<AuthSessionRecord | undefined> {
    if (tokenHash !== this.tokenHash) {
      return undefined;
    }

    const now = new Date();
    return {
      id: randomUUID(),
      userId: this.userId,
      sessionTokenHash: tokenHash,
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
    };
  }

  async touch(id: string): Promise<void> {
    this.touchedSessionIds.push(id);
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    this.revokedTokenHashes.push(tokenHash);
  }
}
