import type { AuthenticatedUser } from '../../auth';
import type { AuthSessionRepositoryPort } from '../../authSessionRepository';
import type { ServerConfig } from '../../config';
import type { LoginAuditRepositoryPort } from '../../loginAuditRepository';
import {
  completeMicrosoftAuthorization,
  createMicrosoftAuthorizationRequest,
  getMicrosoftLoginStateCookieName,
  loginWithMicrosoftIdentity,
  microsoftLoginStateCookiePath,
  microsoftLoginStateMaxAgeSeconds,
  sanitizeReturnTo,
} from '../../microsoftAuthService';
import { hashSessionToken } from '../../sessionTokens';
import type { MicrosoftUserRepositoryPort } from '../../userRepository';

export interface AuthRequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export class AuthService {
  constructor(
    private readonly config: ServerConfig,
    private readonly authSessions: AuthSessionRepositoryPort | undefined,
    private readonly users: MicrosoftUserRepositoryPort | undefined,
    private readonly loginAudit: LoginAuditRepositoryPort,
  ) {}

  get authCookieName(): string {
    return this.config.authCookieName;
  }

  currentUser(user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  async logout(
    token: string | undefined,
    user: AuthenticatedUser | undefined,
    metadata: AuthRequestMetadata,
  ): Promise<void> {
    if (token && this.authSessions) {
      await this.authSessions.revokeByTokenHash(hashSessionToken(token), new Date());
    }
    await this.loginAudit.record({
      userId: user?.id,
      email: user?.email,
      eventType: 'logout',
      success: true,
      ...metadata,
    });
  }

  async startMicrosoft(returnTo?: string) {
    const safeReturnTo = sanitizeReturnTo(returnTo);
    if (this.config.authDisabled) {
      return { location: safeReturnTo };
    }
    const authorization = await createMicrosoftAuthorizationRequest(this.config, safeReturnTo);
    return {
      location: authorization.url.toString(),
      stateCookie: {
        name: getMicrosoftLoginStateCookieName(this.config),
        value: authorization.cookieValue,
        httpOnly: true as const,
        secure: this.config.authSecureCookie,
        sameSite: 'lax' as const,
        path: microsoftLoginStateCookiePath,
        expires: authorization.expiresAt,
        maxAge: microsoftLoginStateMaxAgeSeconds,
      },
    };
  }

  async completeMicrosoft(
    requestUrl: URL,
    stateCookie: string | undefined,
    metadata: AuthRequestMetadata,
  ) {
    const stateCookieName = getMicrosoftLoginStateCookieName(this.config);
    const clearStateCookie = {
      name: stateCookieName,
      value: '',
      httpOnly: true as const,
      secure: this.config.authSecureCookie,
      sameSite: 'lax' as const,
      path: microsoftLoginStateCookiePath,
      expires: new Date(0),
      maxAge: 0,
    };

    try {
      const authorization = await completeMicrosoftAuthorization(
        requestUrl,
        stateCookie,
        this.config,
      );
      const login = await loginWithMicrosoftIdentity(authorization.identity, metadata, {
        config: this.config,
        authSessions: this.authSessions,
        users: this.users,
        loginAudit: this.loginAudit,
      });
      return {
        ok: true as const,
        location: authorization.returnTo,
        cookies: [
          {
            name: this.config.authCookieName,
            value: login.token,
            httpOnly: true as const,
            secure: this.config.authSecureCookie,
            sameSite: 'lax' as const,
            path: '/',
            expires: login.expiresAt,
          },
          clearStateCookie,
        ],
      };
    } catch {
      return {
        ok: false as const,
        location: '/login?error=microsoft_sign_in_failed',
        cookies: [clearStateCookie],
      };
    }
  }

  clearAuthCookie() {
    return {
      name: this.config.authCookieName,
      value: '',
      httpOnly: true as const,
      secure: this.config.authSecureCookie,
      sameSite: 'lax' as const,
      path: '/',
      expires: new Date(0),
      maxAge: 0,
    };
  }

  microsoftStateCookieName(): string {
    return getMicrosoftLoginStateCookieName(this.config);
  }
}
