import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { ServerConfig } from './config.js';

export interface AuthenticatedUser {
  id: string;
  tenantId?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

export function createAuthMiddleware(config: ServerConfig) {
  const jwks =
    config.authJwksUri && config.authIssuer && config.authAudience
      ? createRemoteJWKSet(new URL(config.authJwksUri))
      : undefined;

  return async (request: Request, response: Response, next: NextFunction) => {
    if (request.path === '/health' || request.path === '/ready') {
      next();
      return;
    }

    if (config.authDisabled) {
      request.user = {
        id: readHeader(request, 'x-user-id') ?? 'local-dev-user',
        tenantId: readHeader(request, 'x-tenant-id'),
      };
      next();
      return;
    }

    const token = getBearerToken(request);
    if (!token) {
      response.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (config.apiAuthToken && token === config.apiAuthToken) {
      request.user = {
        id: readHeader(request, 'x-user-id') ?? 'api-token-user',
        tenantId: readHeader(request, 'x-tenant-id'),
      };
      next();
      return;
    }

    if (!jwks || !config.authIssuer || !config.authAudience) {
      response.status(401).json({ error: 'Invalid authentication token' });
      return;
    }

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.authIssuer,
        audience: config.authAudience,
      });
      const id =
        readClaim(payload, 'oid') ?? readClaim(payload, 'sub') ?? readClaim(payload, 'upn');
      if (!id) {
        response.status(401).json({ error: 'Authentication token missing user identity' });
        return;
      }

      request.user = {
        id,
        tenantId: readClaim(payload, 'tid'),
      };
      next();
    } catch {
      response.status(401).json({ error: 'Invalid authentication token' });
    }
  };
}

export function requireUser(request: Request): AuthenticatedUser {
  if (!request.user) {
    throw new Error('Authenticated user was not attached to request');
  }

  return request.user;
}

function getBearerToken(request: Request): string | undefined {
  const authorization = request.header('authorization');
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function readHeader(request: Request, name: string): string | undefined {
  const value = request.header(name)?.trim();
  return value || undefined;
}

function readClaim(payload: Record<string, unknown>, name: string): string | undefined {
  const value = payload[name];
  return typeof value === 'string' && value.trim() ? value : undefined;
}
