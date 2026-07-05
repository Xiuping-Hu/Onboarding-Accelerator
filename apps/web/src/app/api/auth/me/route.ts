import type { CurrentUserResponse } from '@onboarding/shared';
import { handleApiRoute } from '../../../../server/routeHandler';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest): Promise<Response> {
  return handleApiRoute(
    request,
    async ({ user }): Promise<CurrentUserResponse> => ({
      user,
    }),
  );
}
