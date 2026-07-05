import type { AuthenticatedUser, AuthDependencies } from './auth';
import { toAuthenticatedUser } from './auth';
import type { LoginAuditRepositoryPort } from './loginAuditRepository';
import { createSessionToken } from './sessionTokens';
import { normalizeEmail } from './userRepository';
import { hashPassword, verifyPassword } from './password';

export interface LoginWithPasswordInput {
  email: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface LoginWithPasswordResult {
  user: AuthenticatedUser;
  token: string;
  expiresAt: Date;
}

export interface AccountAuthDependencies extends AuthDependencies {
  loginAudit: LoginAuditRepositoryPort;
}

export class LoginFailedError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'LoginFailedError';
  }
}

let dummyPasswordHash: Promise<string> | undefined;

export async function loginWithPassword(
  input: LoginWithPasswordInput,
  dependencies: AccountAuthDependencies,
): Promise<LoginWithPasswordResult> {
  if (!dependencies.users || !dependencies.authSessions) {
    throw new Error('Password authentication is not configured');
  }

  const email = normalizeEmail(input.email);
  const user = await dependencies.users.findByEmail(email);
  const passwordHash = user?.passwordHash ?? (await getDummyPasswordHash());
  const passwordMatches = await verifyPassword(input.password, passwordHash);

  if (!user || !passwordMatches) {
    await dependencies.loginAudit.record({
      email,
      eventType: 'login_failure',
      success: false,
      reason: 'invalid_credentials',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    throw new LoginFailedError();
  }

  if (!user.isActive) {
    await dependencies.loginAudit.record({
      userId: user.id,
      email: user.email,
      eventType: 'login_inactive',
      success: false,
      reason: 'inactive_account',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
    throw new LoginFailedError();
  }

  const expiresAt = new Date(Date.now() + dependencies.config.authSessionDurationMs);
  const { token, tokenHash } = createSessionToken();
  await dependencies.authSessions.create({
    userId: user.id,
    sessionTokenHash: tokenHash,
    expiresAt,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
  await dependencies.users.updateLastLogin(user.id, new Date());
  await dependencies.loginAudit.record({
    userId: user.id,
    email: user.email,
    eventType: 'login_success',
    success: true,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return {
    user: toAuthenticatedUser(user),
    token,
    expiresAt,
  };
}

async function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= hashPassword('not-the-submitted-password');
  return dummyPasswordHash;
}
