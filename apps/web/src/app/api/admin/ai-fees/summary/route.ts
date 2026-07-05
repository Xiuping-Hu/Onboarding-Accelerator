import type { NextRequest } from 'next/server';
import { handleAdminApiRoute, parseActivityQuery } from '../../../../../server/adminApi';

export async function GET(request: NextRequest): Promise<Response> {
  return handleAdminApiRoute(request, async ({ request: apiRequest, services }) =>
    services.aiFees.summarize(parseActivityQuery(apiRequest)),
  );
}
