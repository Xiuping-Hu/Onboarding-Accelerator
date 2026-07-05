import { createHash, randomBytes } from 'node:crypto';

export interface CreatedSessionToken {
  token: string;
  tokenHash: string;
}

export function createSessionToken(): CreatedSessionToken {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashSessionToken(token),
  };
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
