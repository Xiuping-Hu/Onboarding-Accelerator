import type { NextRequest } from 'next/server';
import { handleApiRoute } from '@/server/routeHandler';

export async function GET(request: NextRequest) {
  return handleApiRoute(request, async ({ services }) => services.logs.summarize());
}
