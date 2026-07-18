import { createHmac, timingSafeEqual } from 'node:crypto';
import * as oidc from 'openid-client';
import type { AuthenticatedUser, AuthDependencies } from './auth';
import { toAuthenticatedUser } from './auth';
import type { ServerConfig } from './config';
import type { LoginAuditRepositoryPort } from './loginAuditRepository';
import { createSessionToken } from './sessionTokens';
import {
  normalizeEmail,
  type MicrosoftUserRepositoryPort,
  type UserRecord,
} from './userRepository';

const microsoftScopes = 'openid profile email';
const microsoftLoginStateTtlMs = 10 * 60 * 1000;

export const microsoftLoginStateCookiePath = '/api/auth/microsoft/callback';
export const microsoftLoginStateMaxAgeSeconds = microsoftLoginStateTtlMs / 1000;

interface MicrosoftAuthConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  autoProvision: boolean;
}

interface MicrosoftLoginState {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  createdAt: number;
}

export interface MicrosoftIdentity {
  tenantId: string;
  objectId: string;
  email: string;
  displayName: string;
}

export interface MicrosoftLoginDependencies extends Omit<AuthDependencies, 'users'> {
  users?: MicrosoftUserRepositoryPort;
  loginAudit: LoginAuditRepositoryPort;
}

export interface MicrosoftLoginResult {
  user: AuthenticatedUser;
  token: string;
  expiresAt: Date;
}

export class MicrosoftSignInError extends Error {
  constructor(message = 'Microsoft sign-in could not be completed') {
    super(message);
    this.name = 'MicrosoftSignInError';
  }
}

const configurationPromises = new Map<string, Promise<oidc.Configuration>>();

export function getMicrosoftLoginStateCookieName(config: ServerConfig): string {
  return `${config.authCookieName}_microsoft_login`;
}

export async function createMicrosoftAuthorizationRequest(
  config: ServerConfig,
  requestedReturnTo?: string,
): Promise<{ url: URL; cookieValue: string; expiresAt: Date }> {
  const microsoft = requireMicrosoftAuthConfig(config);
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const loginState: MicrosoftLoginState = {
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    codeVerifier,
    returnTo: sanitizeReturnTo(requestedReturnTo),
    createdAt: Date.now(),
  };
  const oidcConfiguration = await getOidcConfiguration(microsoft);
  const url = oidc.buildAuthorizationUrl(oidcConfiguration, {
    redirect_uri: microsoft.redirectUri,
    scope: microsoftScopes,
    response_type: 'code',
    response_mode: 'query',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: loginState.state,
    nonce: loginState.nonce,
    prompt: 'select_account',
  });

  return {
    url,
    cookieValue: encodeLoginState(loginState, microsoft.clientSecret),
    expiresAt: new Date(loginState.createdAt + microsoftLoginStateTtlMs),
  };
}

export async function completeMicrosoftAuthorization(
  requestUrl: URL,
  loginStateCookie: string | undefined,
  config: ServerConfig,
): Promise<{ identity: MicrosoftIdentity; returnTo: string }> {
  const microsoft = requireMicrosoftAuthConfig(config);
  const loginState = decodeLoginState(loginStateCookie, microsoft.clientSecret);
  const callbackUrl = new URL(microsoft.redirectUri);
  callbackUrl.search = requestUrl.search;

  try {
    const oidcConfiguration = await getOidcConfiguration(microsoft);
    const tokens = await oidc.authorizationCodeGrant(oidcConfiguration, callbackUrl, {
      pkceCodeVerifier: loginState.codeVerifier,
      expectedState: loginState.state,
      expectedNonce: loginState.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();

    if (!claims) {
      throw new MicrosoftSignInError();
    }

    const tenantId = stringClaim(claims.tid);
    const objectId = stringClaim(claims.oid);
    const email = stringClaim(claims.preferred_username) ?? stringClaim(claims.email);
    const displayName = stringClaim(claims.name) ?? email;

    if (
      !tenantId ||
      tenantId.toLowerCase() !== microsoft.tenantId.toLowerCase() ||
      !objectId ||
      !email ||
      !displayName
    ) {
      throw new MicrosoftSignInError();
    }

    return {
      identity: {
        tenantId,
        objectId,
        email: normalizeEmail(email),
        displayName,
      },
      returnTo: loginState.returnTo,
    };
  } catch (error) {
    if (error instanceof MicrosoftSignInError) {
      throw error;
    }

    throw new MicrosoftSignInError();
  }
}

export async function loginWithMicrosoftIdentity(
  identity: MicrosoftIdentity,
  requestMetadata: { userAgent?: string; ipAddress?: string },
  dependencies: MicrosoftLoginDependencies,
): Promise<MicrosoftLoginResult> {
  if (!dependencies.users || !dependencies.authSessions) {
    throw new Error('Microsoft authentication is not configured');
  }

  const microsoft = requireMicrosoftAuthConfig(dependencies.config);
  if (identity.tenantId.toLowerCase() !== microsoft.tenantId.toLowerCase()) {
    await recordFailedLogin(identity.email, 'unexpected_tenant', requestMetadata, dependencies);
    throw new MicrosoftSignInError();
  }

  const user = await resolveMicrosoftUser(identity, microsoft.autoProvision, dependencies.users);
  if (!user) {
    await recordFailedLogin(
      identity.email,
      'account_not_provisioned',
      requestMetadata,
      dependencies,
    );
    throw new MicrosoftSignInError();
  }

  if (!user.isActive) {
    await dependencies.loginAudit.record({
      userId: user.id,
      email: user.email,
      eventType: 'login_inactive',
      success: false,
      reason: 'inactive_account',
      ...requestMetadata,
    });
    throw new MicrosoftSignInError();
  }

  const expiresAt = new Date(Date.now() + dependencies.config.authSessionDurationMs);
  const { token, tokenHash } = createSessionToken();
  await dependencies.authSessions.create({
    userId: user.id,
    sessionTokenHash: tokenHash,
    expiresAt,
    ...requestMetadata,
  });
  await dependencies.users.updateLastLogin(user.id, new Date());
  await dependencies.loginAudit.record({
    userId: user.id,
    email: user.email,
    eventType: 'login_success',
    success: true,
    ...requestMetadata,
  });

  return {
    user: toAuthenticatedUser(user),
    token,
    expiresAt,
  };
}

export function sanitizeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/workspace';
  }

  const base = new URL('https://local.invalid');
  const parsed = new URL(value, base);
  if (parsed.origin !== base.origin) {
    return '/workspace';
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

async function resolveMicrosoftUser(
  identity: MicrosoftIdentity,
  autoProvision: boolean,
  users: MicrosoftUserRepositoryPort,
): Promise<UserRecord | undefined> {
  const byIdentity = await users.findByMicrosoftIdentity(identity.tenantId, identity.objectId);
  if (byIdentity) {
    return byIdentity;
  }

  const byEmail = await users.findByEmail(identity.email);
  if (byEmail) {
    return bindExistingUser(byEmail, identity, users);
  }

  if (!autoProvision) {
    return undefined;
  }

  const created = await users.createMicrosoftUser(identity);
  if (created) {
    return created;
  }

  const concurrentlyCreated = await users.findByMicrosoftIdentity(
    identity.tenantId,
    identity.objectId,
  );
  if (concurrentlyCreated) {
    return concurrentlyCreated;
  }

  const concurrentEmailMatch = await users.findByEmail(identity.email);
  return concurrentEmailMatch ? bindExistingUser(concurrentEmailMatch, identity, users) : undefined;
}

async function bindExistingUser(
  user: UserRecord,
  identity: MicrosoftIdentity,
  users: MicrosoftUserRepositoryPort,
): Promise<UserRecord | undefined> {
  if (
    (user.microsoftTenantId && user.microsoftTenantId !== identity.tenantId) ||
    (user.microsoftObjectId && user.microsoftObjectId !== identity.objectId)
  ) {
    return undefined;
  }

  return users.bindMicrosoftIdentity({
    id: user.id,
    tenantId: identity.tenantId,
    objectId: identity.objectId,
    displayName: identity.displayName,
  });
}

async function recordFailedLogin(
  email: string,
  reason: string,
  requestMetadata: { userAgent?: string; ipAddress?: string },
  dependencies: MicrosoftLoginDependencies,
): Promise<void> {
  await dependencies.loginAudit.record({
    email,
    eventType: 'login_failure',
    success: false,
    reason,
    ...requestMetadata,
  });
}

function requireMicrosoftAuthConfig(config: ServerConfig): MicrosoftAuthConfig {
  if (
    !config.authMicrosoftTenantId ||
    !config.authMicrosoftClientId ||
    !config.authMicrosoftClientSecret ||
    !config.authMicrosoftRedirectUri
  ) {
    throw new Error('Microsoft authentication is not configured');
  }

  return {
    tenantId: config.authMicrosoftTenantId,
    clientId: config.authMicrosoftClientId,
    clientSecret: config.authMicrosoftClientSecret,
    redirectUri: config.authMicrosoftRedirectUri,
    autoProvision: config.authMicrosoftAutoProvision,
  };
}

function getOidcConfiguration(config: MicrosoftAuthConfig): Promise<oidc.Configuration> {
  const key = `${config.tenantId}:${config.clientId}`;
  let configuration = configurationPromises.get(key);

  if (!configuration) {
    configuration = oidc.discovery(
      new URL(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/v2.0`),
      config.clientId,
      config.clientSecret,
    );
    configurationPromises.set(key, configuration);
  }

  return configuration;
}

function encodeLoginState(state: MicrosoftLoginState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

function decodeLoginState(value: string | undefined, secret: string): MicrosoftLoginState {
  if (!value) {
    throw new MicrosoftSignInError();
  }

  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra || !secureEqual(signature, sign(payload, secret))) {
    throw new MicrosoftSignInError();
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
    if (!isMicrosoftLoginState(parsed)) {
      throw new MicrosoftSignInError();
    }

    const age = Date.now() - parsed.createdAt;
    if (age < 0 || age > microsoftLoginStateTtlMs) {
      throw new MicrosoftSignInError();
    }

    return parsed;
  } catch (error) {
    if (error instanceof MicrosoftSignInError) {
      throw error;
    }

    throw new MicrosoftSignInError();
  }
}

function isMicrosoftLoginState(value: unknown): value is MicrosoftLoginState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const state = value as Record<string, unknown>;
  return (
    typeof state.state === 'string' &&
    typeof state.nonce === 'string' &&
    typeof state.codeVerifier === 'string' &&
    typeof state.returnTo === 'string' &&
    typeof state.createdAt === 'number'
  );
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
