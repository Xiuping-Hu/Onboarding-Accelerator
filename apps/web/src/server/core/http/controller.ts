import type { NextRequest } from 'next/server';
import type { AuthenticatedUser } from '../../auth';
import type { HttpResult } from './httpResult';

export interface ControllerContext {
  request: NextRequest;
  params: Record<string, string>;
  requestId: string;
  user?: AuthenticatedUser;
}

export type Controller = (context: ControllerContext) => Promise<HttpResult> | HttpResult;

export function requireControllerUser(context: ControllerContext): AuthenticatedUser {
  if (!context.user) {
    throw new Error('Authenticated route did not provide a user');
  }
  return context.user;
}
