import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';
import type { ServerConfig } from './config';

export interface AuthenticatedUser {
  id: string;
  tenantId?: string;
}

export class AuthError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthError';
  }
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function authenticateRequest(
  request: NextRequest,
  config: ServerConfig,
): Promise<AuthenticatedUser> {
  if (config.authDisabled) {
    return {
      id: readHeader(request, 'x-user-id') ?? 'local-dev-user',
      tenantId: readHeader(request, 'x-tenant-id'),
    };
  }

  const token = getBearerToken(request);
  if (!token) {
    throw new AuthError();
  }

  if (config.apiAuthToken && token === config.apiAuthToken) {
    return {
      id: readHeader(request, 'x-user-id') ?? 'api-token-user',
      tenantId: readHeader(request, 'x-tenant-id'),
    };
  }

  if (!config.authJwksUri || !config.authIssuer || !config.authAudience) {
    throw new AuthError('Invalid authentication token');
  }

  try {
    const jwks = getJwks(config.authJwksUri);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: config.authIssuer,
      audience: config.authAudience,
    });
    const id = readClaim(payload, 'oid') ?? readClaim(payload, 'sub') ?? readClaim(payload, 'upn');
    if (!id) {
      throw new AuthError('Authentication token missing user identity');
    }

    return {
      id,
      tenantId: readClaim(payload, 'tid'),
    };
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }

    throw new AuthError('Invalid authentication token');
  }
}

function getJwks(uri: string): ReturnType<typeof createRemoteJWKSet> {
  const existing = jwksCache.get(uri);
  if (existing) {
    return existing;
  }

  const jwks = createRemoteJWKSet(new URL(uri));
  jwksCache.set(uri, jwks);
  return jwks;
}

function getBearerToken(request: NextRequest): string | undefined {
  const authorization = request.headers.get('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function readHeader(request: NextRequest, name: string): string | undefined {
  const value = request.headers.get(name)?.trim();
  return value || undefined;
}

function readClaim(payload: Record<string, unknown>, name: string): string | undefined {
  const value = payload[name];
  return typeof value === 'string' && value.trim() ? value : undefined;
}
