import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { LoginResponse } from '@onboarding/shared';
import { AuthError, authenticateRequest } from '../../../../server/auth';
import { getServerServices } from '../../../../server/services';

const loginSchema = z.object({
  token: z.string().optional(),
  userId: z.string().trim().min(1).max(120).optional(),
  tenantId: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['user', 'admin']).optional(),
});

export async function POST(request: NextRequest): Promise<Response> {
  const services = getServerServices();

  try {
    const payload = loginSchema.parse(await request.json());
    const headers = new Headers(request.headers);

    if (payload.token) {
      headers.set('authorization', `Bearer ${payload.token}`);
    }
    if (payload.userId) {
      headers.set('x-user-id', payload.userId);
    }
    if (payload.tenantId) {
      headers.set('x-tenant-id', payload.tenantId);
    }
    if (payload.role) {
      headers.set('x-user-role', payload.role);
    }

    const user = await authenticateRequest({ headers } as NextRequest, services.config);
    const response: LoginResponse = {
      user,
      ...(payload.token ? { authToken: payload.token } : {}),
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid login request' }, { status: 400 });
    }

    throw error;
  }
}
