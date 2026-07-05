import type { NextRequest, NextResponse } from 'next/server';
import type { ServerConfig } from './config';
import { hashSessionToken } from './sessionTokens';
import type { AuthSessionRepositoryPort } from './authSessionRepository';
import type { UserRecord, UserRepositoryPort } from './userRepository';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  displayName?: string;
  role?: string;
  tenantId?: string;
}

export interface AuthDependencies {
  config: ServerConfig;
  authSessions?: AuthSessionRepositoryPort;
  users?: UserRepositoryPort;
}

type CookieReader = {
  get(name: string): { value: string } | undefined;
};

export class AuthError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthError';
  }
}

export async function authenticateRequest(
  request: NextRequest,
  dependencies: AuthDependencies,
): Promise<AuthenticatedUser> {
  if (dependencies.config.authDisabled) {
    return getLocalDevelopmentUser(request.headers);
  }

  return authenticateSessionToken(
    request.cookies.get(dependencies.config.authCookieName)?.value,
    dependencies,
  );
}

export async function getCurrentUserFromCookies(
  cookies: CookieReader,
  dependencies: AuthDependencies,
): Promise<AuthenticatedUser> {
  if (dependencies.config.authDisabled) {
    return { id: 'local-dev-user' };
  }

  return authenticateSessionToken(
    cookies.get(dependencies.config.authCookieName)?.value,
    dependencies,
  );
}

export function setAuthCookie(
  response: NextResponse,
  config: ServerConfig,
  token: string,
  expiresAt: Date,
): void {
  response.cookies.set({
    name: config.authCookieName,
    value: token,
    httpOnly: true,
    secure: config.authSecureCookie,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearAuthCookie(response: NextResponse, config: ServerConfig): void {
  response.cookies.set({
    name: config.authCookieName,
    value: '',
    httpOnly: true,
    secure: config.authSecureCookie,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  });
}

export function toAuthenticatedUser(user: UserRecord): AuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
}

async function authenticateSessionToken(
  token: string | undefined,
  dependencies: AuthDependencies,
): Promise<AuthenticatedUser> {
  if (!token) {
    throw new AuthError();
  }

  if (!dependencies.authSessions || !dependencies.users) {
    throw new AuthError('Authentication is not configured');
  }

  const now = new Date();
  const tokenHash = hashSessionToken(token);
  const session = await dependencies.authSessions.findActiveByTokenHash(tokenHash, now);

  if (!session) {
    throw new AuthError();
  }

  const user = await dependencies.users.findById(session.userId);
  if (!user || !user.isActive) {
    await dependencies.authSessions.revokeByTokenHash(tokenHash, now);
    throw new AuthError();
  }

  await dependencies.authSessions.touch(session.id, now);
  return toAuthenticatedUser(user);
}

function getLocalDevelopmentUser(headers: Headers): AuthenticatedUser {
  return {
    id: readHeader(headers, 'x-user-id') ?? 'local-dev-user',
    tenantId: readHeader(headers, 'x-tenant-id'),
  };
}

function readHeader(headers: Headers, name: string): string | undefined {
  const value = headers.get(name)?.trim();
  return value || undefined;
}
